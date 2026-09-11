import { test, expect } from './fixtures/auth'
import {
  FIXTURE_CERTIFICATIONS,
  FIXTURE_EDUCATION,
  FIXTURE_EXPERIENCE,
  FIXTURE_LANGUAGES,
  FIXTURE_PROJECTS,
  FIXTURE_SKILLS,
  seedFixtureResume,
} from './fixtures/resume'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'
import { DEFAULT_RESUME_LAYOUT } from '../src/lib/layout-settings'

/**
 * US-003: the professional DOCX takes its section order, its section
 * visibility and its typography scaling from the shared layout model.
 *
 * WHY THIS FILE EXISTS ALONGSIDE `docx-export-layout.spec.ts`
 *
 * That file proves the ROUTE stopped reading layout out of the URL. It covers
 * professional for exactly one structural property — `hiddenMainSections` —
 * and says nothing about section ORDER or about typography SCALING, which are
 * the other two halves of this story's first acceptance criterion. The three
 * are asserted together here so a generator that honoured visibility while
 * hardcoding order cannot pass.
 *
 * WHY THE ASSERTIONS ARE ON THE ARTIFACT
 *
 * Every assertion below unzips the generated `.docx` and reads
 * `word/document.xml`. A 200 proves the route ran, which was never in doubt.
 * A document built from `DEFAULT_RESUME_LAYOUT` would answer 200 and fail
 * every test in this file.
 *
 * WHAT MAKES THESE ABLE TO FAIL
 *
 * The seeded layout differs from `DEFAULT_RESUME_LAYOUT` in all four asserted
 * properties, and the order is the exact REVERSE of the default in both
 * columns — so a generator that ignored the model and emitted its own default
 * order produces precisely the opposite sequence to the one asserted. Verified
 * by hardcoding `sidebarOrder`/`mainContentOrder` to the defaults inside
 * `docx-professional.ts` and running this file: the ordering assertions go red.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E professional DOCX layout spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * The reverse of the default order in both columns, one sidebar section
 * hidden, and a typography scale no default produces.
 *
 * Reverse rather than merely different: it makes the assertion maximally
 * sensitive. Any generator-side default — the shared one, or a per-generator
 * copy of it — yields the opposite sequence.
 */
const ACCOUNT_LAYOUT = {
  sidebarOrder: ['training', 'languages', 'skills', 'keyAchievements'],
  mainContentOrder: ['education', 'experience', 'summary'],
  hiddenSidebarSections: ['skills'],
  hiddenMainSections: [] as string[],
  fontScale: 1.25,
}

/**
 * One string per section, chosen because it appears in that section and
 * nowhere else in the document.
 *
 * Content rather than section headings: headings are translated, and pinning
 * a heading would make this a test of the dictionary as well as of the order.
 * These are proper nouns from the fixture, identical in every locale.
 */
const SIDEBAR_MARKERS = {
  training: FIXTURE_CERTIFICATIONS[0].name,
  languages: FIXTURE_LANGUAGES[0].language,
  keyAchievements: FIXTURE_PROJECTS[0].name,
} as const

const MAIN_MARKERS = {
  education: FIXTURE_EDUCATION[0].school,
  experience: FIXTURE_EXPERIENCE[0].company,
} as const

/** Unique to the skills section, which the seeded layout hides. */
const HIDDEN_SKILLS_MARKER = FIXTURE_SKILLS[0].items[3]

/**
 * The candidate-name size in half-points, at the seeded scale and at the
 * default.
 *
 * `docx-professional.ts` sizes the name at 22px and converts with
 * `pxToHalfPoints`, which is `Math.round(px * 1.5)`. At the seeded scale of
 * 1.25 that is round(22 * 1.25 * 1.5) = 41; at the default scale of 1 it is
 * round(22 * 1.5) = 33. 33 is not produced by any other size in this template
 * at the seeded scale, so its ABSENCE is what fails if scaling stops being
 * read from the model.
 */
const SCALED_NAME_HALF_POINTS = 41
const UNSCALED_NAME_HALF_POINTS = 33

/**
 * Matches a font-size element carrying `halfPoints`, and nothing else.
 *
 * Scoped to `w:sz` deliberately. A bare search for `w:val="33"` would also hit
 * any other element that happens to carry the same number, which would make
 * the negative assertion below fail for a reason that has nothing to do with
 * typography. `w:szCs` — the complex-script twin `docx` emits alongside — is
 * matched too, and carries the same value.
 */
function fontSizePattern(halfPoints: number): RegExp {
  return new RegExp(`<w:sz(?:Cs)?[^>]*w:val="${halfPoints}"`)
}

async function seedPersistedLayout(resumeId: string, value: unknown): Promise<void> {
  const { error } = await admin()
    .from('resumes')
    .update({ layout_settings: value })
    .eq('id', resumeId)
  if (error) throw new Error(`Could not seed persisted layout settings: ${error.message}`)
}

async function openDocx(buffer: Buffer): Promise<{ xml: string; text: string }> {
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

  return { xml, text }
}

/**
 * Where `marker` first appears in the document's text, failing loudly if it
 * does not appear at all.
 *
 * A missing marker would otherwise come back as -1 and quietly satisfy a
 * "comes before" comparison against a marker that is present.
 */
function positionOf(text: string, marker: string, label: string): number {
  const index = text.indexOf(marker)
  expect(index, `${label} is missing from the generated document`).toBeGreaterThanOrEqual(0)
  return index
}

test('the professional DOCX takes section order, visibility and type scale from the account', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional')
  await seedPersistedLayout(resume.id, ACCOUNT_LAYOUT)

  const response = await page.request.get(
    `/api/resumes/${resume.id}/download-docx?locale=en`,
  )
  expect(response.ok()).toBe(true)

  const { xml, text } = await openDocx(await response.body())

  // The document really rendered before anything is read from its ordering.
  expect(text).toContain(FIXTURE_EXPERIENCE[0].company)

  // --- Section order, sidebar ---
  //
  // The sidebar and the main column are two cells of one table row, and OOXML
  // serialises the row cell by cell, so every sidebar paragraph precedes every
  // main paragraph in `word/document.xml`. Each column is therefore checked
  // against itself.
  const training = positionOf(text, SIDEBAR_MARKERS.training, 'the training section')
  const languages = positionOf(text, SIDEBAR_MARKERS.languages, 'the languages section')
  const achievements = positionOf(
    text,
    SIDEBAR_MARKERS.keyAchievements,
    'the key achievements section',
  )

  expect(training).toBeLessThan(languages)
  expect(languages).toBeLessThan(achievements)

  // --- Section order, main content ---
  const education = positionOf(text, MAIN_MARKERS.education, 'the education section')
  const experience = positionOf(text, MAIN_MARKERS.experience, 'the experience section')

  expect(education).toBeLessThan(experience)

  // --- Section visibility ---
  //
  // The account hides the sidebar's skills section, so nothing from it reaches
  // the document. This is the sidebar counterpart of the `hiddenMainSections`
  // case in `docx-export-layout.spec.ts`.
  expect(text).not.toContain(HIDDEN_SKILLS_MARKER)

  // --- Typography scaling ---
  expect(xml).toMatch(fontSizePattern(SCALED_NAME_HALF_POINTS))
  expect(xml).not.toMatch(fontSizePattern(UNSCALED_NAME_HALF_POINTS))
})

test('the seeded layout really is non-default, in every property this file asserts', () => {
  /**
   * A guard on the test above rather than on the application.
   *
   * Every assertion in this file distinguishes "read from the model" from
   * "fell back to a default" purely by the two differing. Should
   * `DEFAULT_RESUME_LAYOUT` ever drift toward the values seeded here, those
   * assertions would keep passing while proving nothing at all. This fails
   * first, and names which property stopped being a discriminator.
   */
  expect(ACCOUNT_LAYOUT.sidebarOrder).not.toEqual([...DEFAULT_RESUME_LAYOUT.sidebarOrder])
  expect(ACCOUNT_LAYOUT.mainContentOrder).not.toEqual([
    ...DEFAULT_RESUME_LAYOUT.mainContentOrder,
  ])
  expect(ACCOUNT_LAYOUT.hiddenSidebarSections).not.toEqual([
    ...DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  ])
  expect(ACCOUNT_LAYOUT.fontScale).not.toEqual(DEFAULT_RESUME_LAYOUT.fontScale)
})
