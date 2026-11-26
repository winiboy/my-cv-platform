import { test, expect, loginAs } from './fixtures/auth'
import { FIXTURE_CONTACT, FIXTURE_EXPERIENCE, FIXTURE_LANGUAGES, seedFixtureResume } from './fixtures/resume'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * US-002 — the editor and the preview share one layout-state owner.
 *
 * WHAT NEEDS A BROWSER AND WHY
 *
 * Three of this story's acceptance criteria are about behaviour that only
 * exists once the page is running, and the story says so explicitly:
 *
 *   AC-3, that editing a layout control updates the Live Preview with no extra
 *   synchronisation code. The only honest evidence is a control being moved and
 *   the rendered document changing — a unit test would be asserting that a
 *   function returns what it was written to return.
 *
 *   AC-4, that save, draft recovery and the unsaved-changes indicator are
 *   unchanged, "evidenced by browser interaction rather than by inspection".
 *   These three are the surface's own state and were deliberately left where
 *   they are; what has to be shown is that moving the LAYOUT state out did not
 *   disturb them. Reading the diff cannot show that, because the risk is
 *   ordering — two mount effects became three, and the draft load no longer
 *   shares an effect with the layout load.
 *
 *   AC-1, that one owner feeds both surfaces. `resume-layout-ownership.test.ts`
 *   asserts the structure; this asserts what the structure is for, by making a
 *   change on one surface and reading it back on the other.
 *
 * WHAT IS NOT RE-PROVEN HERE
 *
 * Store precedence, adoption and the malformed-value fallbacks. Those are
 * US-003 and US-004's contract and are already covered by
 * `layout-persistence.spec.ts` — which this story leaves passing unchanged,
 * against the same surfaces, and which is therefore also the regression
 * evidence that the loader still behaves.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E layout state owner spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * `swissCommerce` throughout, and the one layout control every template offers:
 * the Edit Sidebar panel's visibility toggle, which writes
 * `hiddenSidebarSections` through the shared owner. Hiding the `languages` row
 * removes every fixture language from the document, and nothing else in the
 * fixture names one. (This spec drove the classic template's title-size slider
 * until swiss-templates-only-page-fidelity US-001 removed that template.)
 */
const HIDDEN = ['languages']
const LANGUAGES_ROW_LABEL = 'Languages'
const A_LANGUAGE = FIXTURE_LANGUAGES[FIXTURE_LANGUAGES.length - 1].language

function resumeDocument(page: Page) {
  return page.getByTestId('resume-document')
}

/** Whether the rendered document draws the languages section. */
async function languagesDrawn(page: Page): Promise<boolean> {
  const rendered = resumeDocument(page)
  await expect(rendered).toContainText(FIXTURE_EXPERIENCE[0].company)
  return ((await rendered.textContent()) ?? '').includes(A_LANGUAGE)
}

/**
 * Hide the languages section with the panel's own toggle, so the same events a
 * user's click produces drive React state, the localStorage cache and the
 * account write.
 */
async function hideLanguages(page: Page): Promise<void> {
  const row = page.locator('[draggable]').filter({ hasText: LANGUAGES_ROW_LABEL })
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: 'Hide section' }).click()
  await expect(row.getByRole('button', { name: 'Show section' })).toBeVisible()
}

async function persistedHiddenSidebar(resumeId: string): Promise<unknown> {
  const { data, error } = await admin()
    .from('resumes')
    .select('layout_settings')
    .eq('id', resumeId)
    .single()
  if (error) throw new Error(`Could not read persisted layout settings: ${error.message}`)
  const settings = (data?.layout_settings as Record<string, unknown> | null) ?? null
  return settings?.hiddenSidebarSections ?? null
}

/** The contact name as the ACCOUNT holds it, past the browser and past RLS. */
async function savedContactName(resumeId: string): Promise<string | null> {
  const { data, error } = await admin()
    .from('resumes')
    .select('contact')
    .eq('id', resumeId)
    .single()
  if (error) throw new Error(`Could not read the saved contact: ${error.message}`)
  const contact = (data?.contact as Record<string, unknown> | null) ?? null
  return typeof contact?.name === 'string' ? contact.name : null
}

const unsavedIndicator = (page: Page) => page.getByText('Unsaved changes')
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save' })
const nameField = (page: Page) => page.locator('#name')

/**
 * Long enough for the debounced draft write to have landed in localStorage.
 * `updateResume` debounces it by 500ms; this is that window with room for a
 * loaded machine, and it is waited out before any reload that has to find it.
 */
const DRAFT_DEBOUNCE_SETTLE_MS = 1_500

test('AC-3: a layout control in the editor moves the Live Preview', async ({
  page,
  authedUser,
}) => {
  /**
   * The claim is "with no additional synchronisation code", and what makes that
   * observable is that the document changes DURING the interaction — no reload,
   * no save, no navigation. If the control and the rendered document were fed by
   * two copies of the state, this is where they would part company.
   */
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')

  await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=editSidebar`)
  await expect(resumeDocument(page)).toBeVisible()
  expect(await languagesDrawn(page)).toBe(true)

  await hideLanguages(page)

  // The rendered document, not the toggle's own state: the toggle agreeing
  // with itself would prove nothing.
  await expect.poll(() => languagesDrawn(page)).toBe(false)

  /**
   * And it reaches the account. Asserting the column pins the answer to what it
   * is today — persisted — so that a future refactor cannot quietly stop
   * writing it, and so that the record of what this story preserved is
   * executable rather than a claim in a comment.
   */
  await expect.poll(() => persistedHiddenSidebar(resume.id), { timeout: 15_000 }).toEqual(HIDDEN)
})

test('AC-1: the preview shows what the editor set, without being told', async ({
  page,
  browser,
  authedUser,
}) => {
  /**
   * ONE OWNER, OBSERVED FROM OUTSIDE.
   *
   * The second context is what makes this about the OWNER rather than about
   * localStorage: it has its own storage and its own session, so the only route
   * from the editor's edit to the preview's render is the model the shared owner
   * persisted and the shared owner resolved. Two surfaces holding their own
   * authoritative copies could still pass a same-browser check by both reading
   * the same cache.
   */
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')

  await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=editSidebar`)
  await expect(resumeDocument(page)).toBeVisible()
  await hideLanguages(page)
  await expect.poll(() => persistedHiddenSidebar(resume.id), { timeout: 15_000 }).toEqual(HIDDEN)

  // Same browser, other surface.
  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(resumeDocument(page)).toBeVisible()
  await expect.poll(() => languagesDrawn(page)).toBe(false)

  // A browser that has never seen this resume.
  const secondContext = await browser.newContext()
  try {
    const secondPage = await secondContext.newPage()
    await loginAs(secondPage, authedUser)
    await secondPage.goto(`/en/dashboard/resumes/${resume.id}/preview`)
    await expect(resumeDocument(secondPage)).toBeVisible()
    await expect.poll(() => languagesDrawn(secondPage)).toBe(false)
  } finally {
    await secondContext.close()
  }
})

test('AC-4: save still writes the account and clears the indicator', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')
  const edited = `${FIXTURE_CONTACT.name} Edited`

  await page.goto(`/en/dashboard/resumes/${resume.id}/edit`)
  await expect(nameField(page)).toHaveValue(FIXTURE_CONTACT.name)

  // Nothing has been touched, so nothing claims to be unsaved.
  await expect(unsavedIndicator(page)).toHaveCount(0)

  await nameField(page).fill(edited)
  await expect(unsavedIndicator(page)).toBeVisible()

  await saveButton(page).click()

  // The indicator goes, `Last saved` arrives, and the row really changed. The
  // last of the three is the one a passing UI cannot fake.
  await expect(unsavedIndicator(page)).toHaveCount(0)
  await expect(page.getByText('Last saved')).toBeVisible()
  await expect.poll(() => savedContactName(resume.id), { timeout: 15_000 }).toBe(edited)
})

test('AC-4: an unsaved edit is recovered from the draft on reload', async ({
  page,
  authedUser,
}) => {
  /**
   * The riskiest of the three to have disturbed.
   *
   * Draft recovery runs in the editor's mount effect, which US-002 SPLIT — the
   * layout load moved into the shared owner's own effect. If that split changed
   * which effect wins, or left the draft load reading state the layout load used
   * to have set, this is where it shows: the reload must come back holding the
   * edit, and must still say so.
   */
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')
  const edited = `${FIXTURE_CONTACT.name} Recovered`

  await page.goto(`/en/dashboard/resumes/${resume.id}/edit`)
  await expect(nameField(page)).toHaveValue(FIXTURE_CONTACT.name)

  await nameField(page).fill(edited)
  await expect(unsavedIndicator(page)).toBeVisible()

  // The draft write is debounced; a reload before it lands would prove nothing.
  await page.waitForTimeout(DRAFT_DEBOUNCE_SETTLE_MS)

  await page.reload()

  await expect(nameField(page)).toHaveValue(edited)
  await expect(unsavedIndicator(page)).toBeVisible()

  // Recovered, not saved. The account still holds the original, which is what
  // makes the warning honest.
  expect(await savedContactName(resume.id)).toBe(FIXTURE_CONTACT.name)
})

test('AC-4: the preview still warns that it is showing an unsaved draft', async ({
  page,
  authedUser,
}) => {
  /**
   * The other surface's half of the same behaviour. The preview reads the same
   * draft blob and renders it in place of the saved row; that reading also moved
   * out of the effect it used to share with the layout load.
   */
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce')

  /**
   * The CV NAME, which swissCommerce draws under the name in its header band, so
   * the draft's change is visible in the rendered document.
   */
  const cvNameField = page.locator('#cvName')
  const originalTitle = await (async () => {
    const { data, error } = await admin()
      .from('resumes')
      .select('title')
      .eq('id', resume.id)
      .single()
    if (error) throw new Error(`Could not read the seeded title: ${error.message}`)
    return data?.title as string
  })()
  const edited = `${originalTitle} Drafted`

  await page.goto(`/en/dashboard/resumes/${resume.id}/edit`)
  await expect(cvNameField).toHaveValue(originalTitle)
  await cvNameField.fill(edited)
  await page.waitForTimeout(DRAFT_DEBOUNCE_SETTLE_MS)

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(resumeDocument(page)).toBeVisible()

  await expect(page.getByText('Preview with unsaved changes')).toBeVisible()
  // The banner is about THIS document: the draft's content is what is rendered.
  await expect(resumeDocument(page)).toContainText(edited)

  // Rendered from the draft, not saved: the account still holds the original.
  const { data } = await admin().from('resumes').select('title').eq('id', resume.id).single()
  expect(data?.title).toBe(originalTitle)
})
