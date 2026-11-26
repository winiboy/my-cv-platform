import { test, expect } from './fixtures/auth'
import {
  FIXTURE_CONTACT,
  FIXTURE_EDUCATION,
  FIXTURE_EXPERIENCE,
  seedFixtureResume,
} from './fixtures/resume'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { APIRequestContext } from '@playwright/test'
import JSZip from 'jszip'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * The DOCX is generated from the ACCOUNT'S layout, not from the browser's.
 *
 * WHY THE ASSERTIONS ARE ON THE DOCUMENT AND NOT ON THE RESPONSE
 *
 * A 200 and a `Content-Type` of ...wordprocessingml.document prove that the
 * route ran, which was never the thing in doubt. The claim under test is about
 * what came OUT of it, so every assertion below unzips the artifact and reads
 * `word/document.xml`. A route that answered 200 with a document built from
 * defaults would pass a status check and fails every test here.
 *
 * WHY THE SETTINGS ARE WRITTEN THROUGH A SERVICE-ROLE CLIENT
 *
 * "Saved on a different device" has to mean the value reached the account
 * without this browser's involvement. Writing the column directly is the only
 * way to be sure of that: a value put there by driving this browser's UI would
 * also be sitting in this browser's localStorage, and the export could then
 * pass by reading the cache — precisely the behaviour US-001 removes.
 *
 * WHAT MAKES THESE ABLE TO FAIL
 *
 * The layout seeded below differs from `DEFAULT_RESUME_LAYOUT` in both of the
 * asserted properties. Before US-001 the route read layout from query
 * parameters, and a request that carried none — which is exactly the request
 * the button now makes — resolved everything from those defaults. So on the
 * previous implementation the email and the education section are present,
 * and both assertions fail.
 *
 * The template is swissCommerce, the default. A Swiss template draws its own
 * typeface, so the two properties asserted are ones every Swiss template
 * honours: a hidden section and a hidden contact detail.
 *
 * That verification does not cover every test here, and the two kinds are
 * worth telling apart. `an unsupported image type is dropped` and `a photo
 * that is not a string at all is dropped` pass on both implementations: the
 * generator already refused an SVG and already refused a non-string, so those
 * two are regression guards over behaviour `boundedPhoto` inherited, not
 * evidence that it works. The size bound is what `boundedPhoto` adds, and the
 * oversized case is what evidences it.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E DOCX export layout spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * A layout that no default would produce, in two independently observable
 * properties: one contact detail, one whole section.
 *
 * `hiddenContactFields` decides whether a single contact line is written, and
 * `hiddenMainSections` whether a whole section is built at all. Asserting both
 * means a route that honoured only one of the two lists cannot pass.
 */
const ACCOUNT_LAYOUT = {
  hiddenContactFields: ['email'],
  hiddenMainSections: ['education'],
}

/**
 * A conflicting cache, in the shape the browser really stores.
 *
 * Present so the two sources genuinely disagree. Without it the test would also
 * pass under "whichever store answers first", which is not the rule, and it
 * would not evidence that the browser's copy no longer reaches the export.
 */
const STALE_BROWSER_CACHE = {
  hiddenContactFields: [] as string[],
  hiddenMainSections: [] as string[],
}

function layoutCacheKey(resumeId: string): string {
  return `resume_slider_settings_${resumeId}`
}

async function seedPersistedLayout(resumeId: string, value: unknown): Promise<void> {
  const { error } = await admin()
    .from('resumes')
    .update({ layout_settings: value })
    .eq('id', resumeId)
  if (error) throw new Error(`Could not seed persisted layout settings: ${error.message}`)
}

/**
 * The generated document, opened.
 *
 * Returns both the raw part and its text: the text is what a section's or a
 * contact line's presence is read from. Text is joined with
 * newlines rather than concatenated so that two adjacent runs cannot
 * accidentally spell a word neither of them contains.
 */
interface OpenedDocx {
  xml: string
  text: string
  /** Every embedded image part, `word/media/…` (the folder entry itself excluded). */
  media: string[]
  /** Image parts the document body references — where a photo is drawn. */
  bodyImages: string[]
  /** Every drawing in the document body, with the image part it draws and that part's bytes. */
  bodyDrawings: Array<{ at: number; drawing: string; part: string; bytes: Buffer }>
  /** Image parts a page header references, with their bytes. */
  headerImages: Array<{ part: string; bytes: Buffer }>
}

/**
 * The image relationships of one part, id to zip path.
 *
 * Read off `word/_rels/<part>.rels` rather than off `word/media/`, because the
 * folder only says an image is stored, not who draws it. Targets are resolved
 * against `word/`, where every source part read here lives.
 */
async function imageRelationships(zip: JSZip, relsPath: string): Promise<Map<string, string>> {
  const rels = zip.file(relsPath)
  if (rels === null) return new Map()
  const xml = await rels.async('string')
  return new Map(
    (xml.match(/<Relationship\b[^>]*>/g) ?? [])
      .filter((relationship) => /\bType="[^"]*\/image"/.test(relationship))
      .map((relationship) => {
        const id = /\bId="([^"]+)"/.exec(relationship)?.[1]
        const target = /\bTarget="([^"]+)"/.exec(relationship)?.[1]
        if (id === undefined || target === undefined) throw new Error(`An image relationship without an id or target: ${relationship}`)
        return [id, `word/${target.replace(/^\.?\//, '')}`] as const
      }),
  )
}

/** The image parts one part's relationships point at, as zip paths. */
async function imageTargets(zip: JSZip, relsPath: string): Promise<string[]> {
  return [...(await imageRelationships(zip, relsPath)).values()]
}

async function partBytes(zip: JSZip, part: string, referrer: string): Promise<Buffer> {
  const file = zip.file(part)
  if (file === null) throw new Error(`${referrer} references ${part}, which the package lacks`)
  return file.async('nodebuffer')
}

async function openDocx(buffer: Buffer): Promise<OpenedDocx> {
  const zip = await JSZip.loadAsync(buffer)

  const documentPart = zip.file('word/document.xml')
  if (documentPart === null) {
    throw new Error(
      `The artifact is not a Word document: word/document.xml is missing. ` +
        `Parts present: ${Object.keys(zip.files).join(', ')}`,
    )
  }

  const xml = await documentPart.async('string')
  const text = (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [])
    .map((run) => run.replace(/<[^>]+>/g, ''))
    .join('\n')

  // Embedded images live here. JSZip lists the folder as an entry of its own,
  // which is not an image.
  const media = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.startsWith('word/media/'))
    .map((entry) => entry.name)

  const bodyRelationships = await imageRelationships(zip, 'word/_rels/document.xml.rels')
  const bodyImages = [...bodyRelationships.values()]
  const bodyDrawings = await Promise.all(
    [...xml.matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)].map(async (match) => {
      const id = /<a:blip\b[^>]*\sr:embed="([^"]+)"/.exec(match[0])?.[1]
      const part = id === undefined ? undefined : bodyRelationships.get(id)
      if (part === undefined) throw new Error(`A body drawing without an image relationship: ${match[0].slice(0, 300)}`)
      return { at: match.index, drawing: match[0], part, bytes: await partBytes(zip, part, 'The body') }
    }),
  )

  const headerRels = Object.keys(zip.files).filter((name) =>
    /^word\/_rels\/header\d*\.xml\.rels$/.test(name),
  )
  const headerImages = await Promise.all(
    [...new Set((await Promise.all(headerRels.map((rels) => imageTargets(zip, rels)))).flat())].map(
      async (part) => ({ part, bytes: await partBytes(zip, part, 'A header') }),
    ),
  )

  return { xml, text, media, bodyImages, bodyDrawings, headerImages }
}

/** The request the download button now makes: the resume, and a language. */
function exportUrl(resumeId: string): string {
  return `/api/resumes/${resumeId}/download-docx?locale=en`
}

async function fetchDocx(request: APIRequestContext, resumeId: string): Promise<Buffer> {
  const response = await request.get(exportUrl(resumeId))
  if (!response.ok()) {
    throw new Error(`The export request failed with ${response.status()}`)
  }
  return await response.body()
}

test('a DOCX is generated from layout settings saved on another device', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')

  // Control: before the account holds a layout, the email and education are
  // drawn, so their absence below is read from a document that could hold them.
  const before = await openDocx(await fetchDocx(page.request, resume.id))
  expect(before.text).toContain(FIXTURE_CONTACT.email)
  expect(before.text).toContain(FIXTURE_EDUCATION[0].school)

  // Another device saved these. This browser has never seen them: the context
  // is fresh, it has never opened this resume, and nothing has written
  // `resume_slider_settings_${id}` into its localStorage.
  await seedPersistedLayout(resume.id, ACCOUNT_LAYOUT)

  // The request the button now makes, from that context's session. It carries
  // no layout, so there is nothing for a browser-held copy to travel in even
  // if one existed — which is the property under test.
  const { text } = await openDocx(await fetchDocx(page.request, resume.id))

  // The document really rendered: an experience the fixture defines is in it.
  // Asserted first, so the absence below is read from a document that has
  // content rather than from one that failed to build.
  expect(text).toContain(FIXTURE_EXPERIENCE[0].company)

  // The account hid the email and education, so neither reaches the document.
  expect(text).not.toContain(FIXTURE_CONTACT.email)
  for (const entry of FIXTURE_EDUCATION) {
    expect(text).not.toContain(entry.school)
  }
})

test('the download button sends no layout in the URL, and its document matches the account', async ({
  page,
  authedUser,
}) => {
  /**
   * The client half of the story, evidenced through the real control.
   *
   * The test above proves what the ROUTE does with a request carrying no
   * layout. This proves the BUTTON is what makes such a request — the
   * fourteen parameters are gone from the surface that used to assemble them,
   * not merely ignored by the server. The assertion on the URL's parameter
   * list is what fails on the previous implementation.
   *
   * WHY THE DOCUMENT IS FETCHED AGAIN RATHER THAN READ OFF THE CLICK
   *
   * The page consumes its own response as a blob, and Playwright cannot then
   * hand back the body — `response.body()` returns zero bytes and JSZip
   * reports a corrupted archive. So the URL is taken from the click and
   * requested again here. That keeps the claim exact: the assertion below is
   * about the document THIS URL produces, and the URL is the button's own,
   * captured rather than reconstructed. Exact about the REQUEST, that is —
   * the method and URL are the button's own. What it reads is a second read:
   * the mount's layout write-back could in principle land between the click
   * and the re-fetch, so the row this request sees is not provably the row
   * the click's request saw. It does not weaken the assertions, because the
   * two asserted properties are ones the account already holds and adoption
   * therefore cannot change — but the document below is this request's, not
   * a copy of the click's.
   */
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')
  await seedPersistedLayout(resume.id, ACCOUNT_LAYOUT)

  // This browser holds a DIFFERENT answer for both asserted properties, seeded
  // before any page script runs. The account holds them too, so adoption cannot
  // promote these over it — they are here to conflict, and to lose.
  await page.context().addInitScript(
    ([key, blob]) => {
      window.localStorage.setItem(key as string, blob as string)
    },
    [layoutCacheKey(resume.id), JSON.stringify(STALE_BROWSER_CACHE)] as const,
  )

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()

  const exportRequest = page.waitForRequest((request) =>
    request.url().includes(`/api/resumes/${resume.id}/download-docx`),
  )

  await page.getByRole('button', { name: 'Download Word' }).click()

  const requested = new URL((await exportRequest).url())

  // `locale` and nothing else. Any layout property here would be a second
  // authority in front of the account's, and this is the assertion that fails
  // on the previous implementation — it sent thirteen more.
  expect([...requested.searchParams.keys()].sort()).toEqual(['locale'])

  // The button's own URL, requested again, produces the account's document.
  const response = await page.request.get(requested.pathname + requested.search)
  expect(response.ok()).toBe(true)

  const { text } = await openDocx(await response.body())
  expect(text).toContain(FIXTURE_EXPERIENCE[0].company)

  // The browser's conflicting copy, seeded above and still in this context's
  // localStorage, shows both; it reached nothing.
  expect(text).not.toContain(FIXTURE_CONTACT.email)

  for (const entry of FIXTURE_EDUCATION) {
    expect(text).not.toContain(entry.school)
  }
})

test('an unauthenticated export is refused before anything it sent is examined', async ({
  request,
}) => {
  /**
   * The input surface the removed parameters took with them.
   *
   * `sidebarOrder`, `mainContentOrder`, `hiddenSidebarSections` and
   * `hiddenMainSections` were each `JSON.parse`d at the top of the route,
   * ABOVE the auth check. A caller who was not logged in could therefore send
   * malformed JSON and get a 500 out of the throw, which the outer catch
   * turned into "Failed to generate Word document" — work, and an error class,
   * that an unauthenticated request should never have been able to reach.
   *
   * The parameters are gone, so the string below is now simply ignored and the
   * request is refused on identity alone. `request` rather than `page.request`:
   * this fixture carries no cookies, and no `authedUser` is destructured, so no
   * user is created for this test at all.
   *
   * On the previous implementation this returns 500 and the test fails.
   */
  const response = await request.get(
    `/api/resumes/00000000-0000-0000-0000-000000000000/download-docx` +
      `?locale=en&sidebarOrder=%7Bnot-json&hiddenMainSections=%5B`,
  )

  expect(response.status()).toBe(401)
})

/**
 * The photo — the one thing still travelling in the request body, and therefore
 * the one piece of client input that still reaches document generation.
 *
 * `swissCommerce`, the default, draws the photo in its header band and stores
 * no other image, so every image in the document is the photo.
 *
 * The accepted case is here as well as the rejected ones on purpose: a bound
 * that rejects everything would pass the two negative tests on its own, and
 * would have silently removed a working feature. The positive case is what
 * makes the negatives mean "rejected" rather than "never worked".
 */
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const PHOTO_CASES: Array<{ name: string; photoBase64: unknown; embedded: boolean }> = [
  {
    name: 'a supported image is embedded',
    photoBase64: `data:image/png;base64,${ONE_PIXEL_PNG}`,
    embedded: true,
  },
  {
    name: 'a photo beyond the size bound is dropped',
    // Past MAX_PHOTO_BASE64_LENGTH, and past anything localStorage could hold.
    photoBase64: `data:image/png;base64,${'A'.repeat(9 * 1024 * 1024)}`,
    embedded: false,
  },
  {
    name: 'an unsupported image type is dropped',
    photoBase64: 'data:image/svg+xml;base64,PHN2Zy8+',
    embedded: false,
  },
  {
    name: 'a photo that is not a string at all is dropped',
    photoBase64: { not: 'a string' },
    embedded: false,
  },
]

for (const photoCase of PHOTO_CASES) {
  test(`photo bounds: ${photoCase.name}`, async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')

    const response = await page.request.post(exportUrl(resume.id), {
      data: { photoBase64: photoCase.photoBase64 },
      headers: { 'Content-Type': 'application/json' },
    })

    // Every case still produces a document. A bound that turned a bad photo
    // into a failed export would be a regression in its own right.
    expect(response.ok()).toBe(true)

    const { text, media, bodyImages, bodyDrawings, headerImages } = await openDocx(await response.body())
    expect(text).toContain(FIXTURE_EXPERIENCE[0].company)

    // Every stored image is the body's, and every body image is drawn.
    expect([...media].sort()).toEqual([...bodyImages].sort())
    expect(headerImages, 'no page header draws an image').toEqual([])
    expect([...new Set(bodyDrawings.map((drawing) => drawing.part))].sort(), 'every body image is drawn').toEqual(
      [...bodyImages].sort(),
    )

    if (photoCase.embedded) {
      // The photo, and nothing else.
      expect(bodyDrawings).toHaveLength(1)
      expect(bodyImages).toHaveLength(1)
    } else {
      // Dropped: no drawing and no stored image at all.
      expect(bodyDrawings).toEqual([])
      expect(media).toEqual([])
    }
  })
}
