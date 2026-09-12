import { test, expect } from './fixtures/auth'
import {
  FIXTURE_EDUCATION,
  FIXTURE_EXPERIENCE,
  FIXTURE_LANGUAGES,
  seedFixtureResume,
} from './fixtures/resume'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'
import {
  DEFAULT_RESUME_LAYOUT,
  mapEditorOrderToClassic,
  type EditorMainId,
} from '../src/lib/layout-settings'

/**
 * US-005: the classic DOCX takes its section order, its section visibility and
 * its typography scaling from the shared layout model.
 *
 * WHY THIS FILE EXISTS ALONGSIDE THE PROFESSIONAL AND MODERN SPECS
 *
 * Classic is single-column, and its vocabulary is neither the editor's nor
 * Modern's. `mapEditorOrderToClassic` collapses languages and certifications
 * into one `languagesAndCerts` section and APPENDS it whenever the editor order
 * did not produce it, so the document always ends with that pair regardless of
 * what the account chose. Neither of the other two specs can cover that: the
 * professional generator renders the editor vocabulary unchanged, and Modern
 * has no combined section at all. What is asserted here is that the Classic
 * DOCX applies the shared Classic rule to the ACCOUNT's own list.
 *
 * WHY THE ASSERTIONS ARE ON THE ARTIFACT
 *
 * Every assertion below unzips the generated `.docx` and reads
 * `word/document.xml`. A 200 proves the route ran, which was never in doubt. A
 * document built from `DEFAULT_RESUME_LAYOUT` would answer 200 and fail every
 * ordering, visibility and scaling assertion in this file.
 *
 * WHY IT CANNOT BE SHOWN RED AGAINST UNMODIFIED CODE
 *
 * US-005 forbids Classic's output changing, so there is no defect for this
 * spec to catch: it is green at the commit that introduces it. Each assertion
 * group was therefore shown to DISCRIMINATE by mutating `docx-classic.ts` one
 * property at a time and confirming the group fails — the mutations and their
 * output are recorded in the story evidence.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED
 *
 * The Classic DOCX renders no skills section and no projects section, while
 * `classic-template.tsx` renders both. That is a fidelity finding recorded
 * against this story (F-1), not behaviour to pin: asserting it here would
 * enshrine the gap the parity story has to close.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E classic DOCX layout spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * The reverse of the default main order, one section hidden, and a typography
 * scale no default produces.
 *
 * `education` is the hidden one, and it is also the id the reversed order puts
 * FIRST. That is deliberate: a generator that ignored `hiddenMainSections`
 * would render education at the very top, which is the loudest possible way
 * for the visibility assertion to fail, and the two sections that remain still
 * carry an ordering assertion between them.
 */
const ACCOUNT_LAYOUT: {
  mainContentOrder: EditorMainId[]
  hiddenMainSections: EditorMainId[]
  fontScale: number
} = {
  mainContentOrder: ['education', 'experience', 'summary'],
  hiddenMainSections: ['education'],
  fontScale: 1.25,
}

/**
 * One string per section, chosen because it appears in that section and
 * nowhere else in the document.
 *
 * Content rather than section headings: headings are translated, and pinning a
 * heading would make this a test of the dictionary as well as of the order.
 */
const MARKERS = {
  experience: FIXTURE_EXPERIENCE[0].company,
  /** A single word, so no run boundary can split it. Unique to the summary. */
  summary: 'multi-tenant',
  /** Opens the combined languages + certifications section. */
  languages: FIXTURE_LANGUAGES[0].language,
} as const

/** Unique to the education section, which the seeded layout hides. */
const HIDDEN_EDUCATION_MARKER = FIXTURE_EDUCATION[0].school

/**
 * The CV-title size in half-points, at the seeded scale and at the default.
 *
 * `docx-classic.ts` sizes the title at 36px and converts with `pxToHalfPoints`,
 * which is `Math.round(px * 1.5)`. At the seeded scale of 1.25 that is
 * round(36 * 1.25 * 1.5) = 68; at a scale of 1 it is round(36 * 1.5) = 54. The
 * full set of font sizes this template emits at the seeded scale is
 * {68, 30, 26, 23}, so 54 cannot arise from any other size — its ABSENCE is
 * what fails if scaling stops being read from the model.
 */
const SCALED_TITLE_HALF_POINTS = 68
const UNSCALED_TITLE_HALF_POINTS = 54

/**
 * Matches a font-size element carrying `halfPoints`, and nothing else.
 *
 * Scoped to the `w:sz` ELEMENT deliberately. Table and paragraph borders carry
 * `w:sz` as an ATTRIBUTE (`<w:top w:val="single" w:sz="8" …>`), and Classic
 * draws two of them, so a looser pattern would match a border width and make
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

test('the classic DOCX takes section order, visibility and type scale from the account', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic')
  await seedPersistedLayout(resume.id, ACCOUNT_LAYOUT)

  const response = await page.request.get(`/api/resumes/${resume.id}/download-docx?locale=en`)
  expect(response.ok()).toBe(true)

  const { xml, text } = await openDocx(await response.body())

  // The document really rendered before anything is read from its ordering.
  expect(text).toContain(FIXTURE_EXPERIENCE[0].company)

  // --- Section order ---
  //
  // Classic is single-column, so document order IS section order — there is no
  // table row splitting the body into columns as there is in Modern.
  //
  // The seeded editor order `['education', 'experience', 'summary']` maps to
  // `['education', 'experience', 'summary', 'languagesAndCerts']`, and
  // education is hidden, leaving experience, then summary, then the combined
  // section. The default order would put summary FIRST and experience second,
  // so this pair is the discriminator.
  const experience = positionOf(text, MARKERS.experience, 'the experience section')
  const summary = positionOf(text, MARKERS.summary, 'the summary section')
  const languages = positionOf(text, MARKERS.languages, 'the languages section')

  expect(experience).toBeLessThan(summary)

  // The combined section is APPENDED by the mapping rather than ordered by the
  // account — the seeded list never mentions languages or certifications, and
  // it still comes last. A generator that took the editor list literally would
  // omit the section entirely and fail `positionOf` above.
  expect(summary).toBeLessThan(languages)

  // --- Section visibility ---
  expect(text).not.toContain(HIDDEN_EDUCATION_MARKER)

  // --- Typography scaling ---
  expect(xml).toMatch(fontSizePattern(SCALED_TITLE_HALF_POINTS))
  expect(xml).not.toMatch(fontSizePattern(UNSCALED_TITLE_HALF_POINTS))
})

test('the seeded layout really is non-default, in every property this file asserts', () => {
  /**
   * A guard on the test above rather than on the application.
   *
   * Every assertion in that test distinguishes "read from the model" from "fell
   * back to a default" purely by the two differing. Should
   * `DEFAULT_RESUME_LAYOUT` ever drift toward the values seeded here, those
   * assertions would keep passing while proving nothing at all. This fails
   * first, and names which property stopped being a discriminator.
   *
   * The order comparison is made AFTER the Classic mapping, because that is the
   * vocabulary the document is written in: two different editor orders can map
   * to the same Classic order, and it is the mapped pair that has to differ.
   */
  const seeded = mapEditorOrderToClassic(ACCOUNT_LAYOUT.mainContentOrder)
  const defaults = mapEditorOrderToClassic(DEFAULT_RESUME_LAYOUT.mainContentOrder)

  expect(seeded).not.toEqual(defaults)
  expect(ACCOUNT_LAYOUT.hiddenMainSections).not.toEqual([
    ...DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  ])
  expect(ACCOUNT_LAYOUT.fontScale).not.toEqual(DEFAULT_RESUME_LAYOUT.fontScale)

  // The hidden section must really be in the mapped order, or the visibility
  // assertion would be satisfied by a section the template never renders.
  expect(seeded).toContain('education')

  // The two sections the ordering assertion compares must both survive hiding.
  const visible = seeded.filter(
    (id) => !(ACCOUNT_LAYOUT.hiddenMainSections as string[]).includes(id),
  )
  expect(visible).toEqual(['experience', 'summary', 'languagesAndCerts'])
})
