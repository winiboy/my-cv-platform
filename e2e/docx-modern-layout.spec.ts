import { test, expect } from './fixtures/auth'
import {
  FIXTURE_CERTIFICATIONS,
  FIXTURE_CONTACT,
  FIXTURE_EDUCATION,
  FIXTURE_EXPERIENCE,
  FIXTURE_LANGUAGES,
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
import {
  DEFAULT_RESUME_LAYOUT,
  mapEditorOrderToModern,
  type EditorMainId,
  type EditorSidebarId,
} from '../src/lib/layout-settings'

/**
 * US-004: the modern DOCX takes its section order, its section visibility and
 * its typography scaling from the shared layout model.
 *
 * WHY THIS FILE EXISTS ALONGSIDE `docx-professional-layout.spec.ts`
 *
 * Modern is the one template whose section vocabulary is not the editor's.
 * `mapEditorOrderToModern` rewrites the editor's lists into Modern's — moving
 * education from the main column into the sidebar, dropping keyAchievements,
 * and pinning contact and education to the front of the sidebar. The
 * professional spec cannot cover any of that, because professional renders the
 * editor's vocabulary unchanged. What is asserted here is therefore not a
 * second copy of that file's assertions: it is that the DOCX applies the SAME
 * mapping the Live Preview applies, to the account's own lists.
 *
 * WHY THE ASSERTIONS ARE ON THE ARTIFACT
 *
 * Every assertion below unzips the generated `.docx` and reads
 * `word/document.xml`. A 200 proves the route ran, which was never in doubt.
 * A document built from `DEFAULT_RESUME_LAYOUT` would answer 200 and fail
 * every ordering and scaling assertion in this file.
 *
 * WHAT MAKES THESE ABLE TO FAIL
 *
 * The seeded sidebar order is the exact REVERSE of the default, so a generator
 * that emitted its own default order produces precisely the opposite sequence
 * to the one asserted. The seeded main order is likewise reversed, and Modern
 * maps it to `['experience', 'summary']` — the reverse of Modern's own
 * default. The seeded type scale is one no default produces — the note on
 * `SCALED_NAME_HALF_POINTS` works that arithmetic through.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E modern DOCX layout spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * The reverse of the default order in both columns, one sidebar section
 * hidden, and a typography scale no default produces.
 *
 * `languages` is the hidden one rather than `skills` so that two shared
 * sidebar sections remain visible and the order between them stays assertable.
 * Hiding a section that carried an ordering assertion would have traded one
 * piece of evidence for another instead of adding one.
 */
const ACCOUNT_LAYOUT: {
  sidebarOrder: EditorSidebarId[]
  mainContentOrder: EditorMainId[]
  hiddenSidebarSections: EditorSidebarId[]
  hiddenMainSections: EditorMainId[]
  fontScale: number
} = {
  sidebarOrder: ['training', 'languages', 'skills', 'keyAchievements'],
  mainContentOrder: ['education', 'experience', 'summary'],
  hiddenSidebarSections: ['languages'],
  hiddenMainSections: [],
  fontScale: 1.25,
}

/**
 * One string per section, chosen because it appears in that section and
 * nowhere else in the document.
 *
 * Content rather than section headings: headings are translated, and pinning a
 * heading would make this a test of the dictionary as well as of the order.
 *
 * `PostgreSQL` rather than `TypeScript` for skills: Modern renders the
 * projects section's `technologies` list, and `TypeScript` appears in both.
 */
const SIDEBAR_MARKERS = {
  contact: FIXTURE_CONTACT.email,
  education: FIXTURE_EDUCATION[0].school,
  training: FIXTURE_CERTIFICATIONS[0].name,
  skills: FIXTURE_SKILLS[0].items[3],
} as const

const MAIN_MARKERS = {
  experience: FIXTURE_EXPERIENCE[0].company,
  /** A single word, so no run boundary can split it. Unique to the summary. */
  summary: 'multi-tenant',
} as const

/** Unique to the languages section, which the seeded layout hides. */
const HIDDEN_LANGUAGES_MARKER = FIXTURE_LANGUAGES[0].language

/**
 * The candidate-name size in half-points, at the seeded scale and at the
 * default.
 *
 * `docx-modern.ts` sizes the name at 36px and converts with `pxToHalfPoints`,
 * which is `Math.round(px * 1.5)`. At the seeded scale of 1.25 that is
 * round(36 * 1.25 * 1.5) = 68; at the default scale of 1 it is
 * round(36 * 1.5) = 54. No other size in this template produces 54 at the
 * seeded scale — the full set is {68, 34, 30, 26, 24, 23, 21, 19} — so its
 * ABSENCE is what fails if scaling stops being read from the model.
 */
const SCALED_NAME_HALF_POINTS = 68
const UNSCALED_NAME_HALF_POINTS = 54

/**
 * Matches a font-size element carrying `halfPoints`, and nothing else.
 *
 * Scoped to the `w:sz` ELEMENT deliberately. Table and paragraph borders carry
 * `w:sz` as an ATTRIBUTE (`<w:top w:val="single" w:sz="4" …>`), and a looser
 * pattern would match those and make the negative assertion below fail for a
 * reason that has nothing to do with typography. `w:szCs` — the complex-script
 * twin `docx` emits alongside — is matched too, and carries the same value.
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

test('the modern DOCX takes section order, visibility and type scale from the account', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'modern')
  await seedPersistedLayout(resume.id, ACCOUNT_LAYOUT)

  const response = await page.request.get(`/api/resumes/${resume.id}/download-docx?locale=en`)
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
  //
  // Expected Modern sidebar for the seeded editor order
  // `['training', 'languages', 'skills', 'keyAchievements']`:
  //   contact, education, training, [languages hidden], skills
  // `contact` and `education` are pinned to the front by the mapping and are
  // not in the editor's sidebar list at all; `keyAchievements` has no Modern
  // sidebar section and is dropped. Both are properties of the mapping rather
  // than of the order, and both are asserted here because a generator that
  // took the editor list literally would fail them.
  const contact = positionOf(text, SIDEBAR_MARKERS.contact, 'the contact section')
  const education = positionOf(text, SIDEBAR_MARKERS.education, 'the education section')
  const training = positionOf(text, SIDEBAR_MARKERS.training, 'the training section')
  const skills = positionOf(text, SIDEBAR_MARKERS.skills, 'the skills section')

  expect(contact).toBeLessThan(education)
  expect(education).toBeLessThan(training)
  // The discriminator: the default sidebar puts skills BEFORE training.
  expect(training).toBeLessThan(skills)

  // --- Section order, main content ---
  //
  // The seeded main order is `['education', 'experience', 'summary']`. Modern
  // drops `education` (it renders in the sidebar) leaving
  // `['experience', 'summary']` — the reverse of Modern's own default.
  const experience = positionOf(text, MAIN_MARKERS.experience, 'the experience section')
  const summary = positionOf(text, MAIN_MARKERS.summary, 'the summary section')

  expect(experience).toBeLessThan(summary)

  // --- Section visibility ---
  expect(text).not.toContain(HIDDEN_LANGUAGES_MARKER)

  // --- Typography scaling ---
  expect(xml).toMatch(fontSizePattern(SCALED_NAME_HALF_POINTS))
  expect(xml).not.toMatch(fontSizePattern(UNSCALED_NAME_HALF_POINTS))
})

test('the seeded layout really is non-default, in every property this file asserts', () => {
  /**
   * A guard on the test above rather than on the application.
   *
   * Every assertion in that test distinguishes "read from the model" from
   * "fell back to a default" purely by the two differing. Should
   * `DEFAULT_RESUME_LAYOUT` ever drift toward the values seeded here, those
   * assertions would keep passing while proving nothing at all. This fails
   * first, and names which property stopped being a discriminator.
   *
   * The order comparisons are made AFTER the Modern mapping, because that is
   * the vocabulary the document is written in: two different editor orders can
   * map to the same Modern order, and it is the mapped pair that has to differ.
   */
  const seeded = mapEditorOrderToModern(
    ACCOUNT_LAYOUT.sidebarOrder,
    ACCOUNT_LAYOUT.mainContentOrder,
    ACCOUNT_LAYOUT.hiddenSidebarSections,
    ACCOUNT_LAYOUT.hiddenMainSections,
  )
  const defaults = mapEditorOrderToModern(
    DEFAULT_RESUME_LAYOUT.sidebarOrder,
    DEFAULT_RESUME_LAYOUT.mainContentOrder,
    DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
    DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  )

  expect(seeded.modernSidebarOrder).not.toEqual(defaults.modernSidebarOrder)
  expect(seeded.modernMainOrder).not.toEqual(defaults.modernMainOrder)
  expect(seeded.hiddenModernSidebar).not.toEqual(defaults.hiddenModernSidebar)
  expect(ACCOUNT_LAYOUT.fontScale).not.toEqual(DEFAULT_RESUME_LAYOUT.fontScale)

  // The main fallback inside `docx-modern.ts` must not be what produces the
  // asserted order: if the seeded main order mapped to nothing, the generator
  // would legitimately fall back to Modern's default and the ordering
  // assertion above would be testing the fallback instead of the account.
  expect(seeded.modernMainOrder.length).toBeGreaterThan(0)
})
