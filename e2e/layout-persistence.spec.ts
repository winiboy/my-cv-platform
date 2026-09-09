import { test, expect, loginAs, type TestUser } from './fixtures/auth'
import { FIXTURE_EDUCATION, FIXTURE_EXPERIENCE, seedFixtureResume } from './fixtures/resume'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { BrowserContext, Page } from '@playwright/test'
import type { ResumeTemplate } from '../src/types/database'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * Layout settings follow the account, not the browser.
 *
 * WHY THIS NEEDS TWO BROWSER CONTEXTS
 *
 * The claim under test is that a choice made on one device shows up on
 * another. Nothing short of a second browser context can evidence it: a reload
 * in the same context reads the same localStorage, so it would pass identically
 * against the old browser-only behaviour and prove nothing. A second context
 * has its own storage and its own session, which is as close to a second device
 * as this harness gets.
 *
 * WHAT EACH HALF ESTABLISHES
 *
 *   1. The value reaches the account. Asserted against the database column
 *      itself, past the browser, so a value that merely stayed in localStorage
 *      cannot pass.
 *   2. The value comes back on a browser that has never seen it, and comes back
 *      RENDERED — the assertion is on the computed style of the heading, not on
 *      a slider's own value, because it is the document that has to be the same
 *      on the second device.
 *   3. The account beats the browser. The second context is given a DIFFERENT
 *      value in localStorage before it loads, so the two sources genuinely
 *      conflict and the test can only pass if the persisted one wins. Without
 *      this seeding the test would also pass under "whichever store answers
 *      first", which is not the rule.
 *
 * The DIRECTION of the conflict is the point. A cache that wins would show 24px
 * here — the value this browser has and the account does not.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E layout persistence spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * The classic template's title-size slider: min 16, max 48, step 2, and the
 * heading it controls carries the value as an inline font-size.
 *
 * `classic` rather than `modern` because its slider is rendered by the template
 * itself from a setter the preview wrapper actually passes, so driving it goes
 * through the same state the wrapper persists.
 */
const TITLE_SIZE_DEFAULT = 24
const TITLE_SIZE_CHOSEN = 42
/** What the second browser has cached, and must lose with. */
const TITLE_SIZE_STALE_CACHE = 18

function layoutCacheKey(resumeId: string): string {
  return `resume_slider_settings_${resumeId}`
}

/** The heading whose size the slider controls. */
function titleHeading(page: Page) {
  return page.getByTestId('resume-document').locator('h1').first()
}

async function titleFontSizePx(page: Page): Promise<number> {
  const value = await titleHeading(page).evaluate(
    (element) => window.getComputedStyle(element).fontSize,
  )
  return Number.parseFloat(value)
}

/**
 * Read the persisted column directly, past RLS and past the browser.
 *
 * Service-role here is deliberate and is the only place it appears: the point
 * is to observe what the ACCOUNT holds, independently of whether any browser
 * can see it.
 */
async function persistedTitleFontSize(resumeId: string): Promise<number | null> {
  const { data, error } = await admin()
    .from('resumes')
    .select('layout_settings')
    .eq('id', resumeId)
    .single()
  if (error) throw new Error(`Could not read persisted layout settings: ${error.message}`)
  const settings = data?.layout_settings as { titleFontSize?: unknown } | null
  return typeof settings?.titleFontSize === 'number' ? settings.titleFontSize : null
}

/**
 * Move the slider by keyboard rather than by setting its value.
 *
 * A range input driven through the keyboard emits the same input events a user
 * produces, so React state, the localStorage cache and the account write are
 * all exercised by the same path a real drag takes.
 */
async function setTitleSize(page: Page, from: number, to: number): Promise<void> {
  const slider = page.getByTestId('resume-document').locator('input[type="range"]').first()
  await slider.focus()
  const step = Number(await slider.getAttribute('step'))
  const presses = Math.round((to - from) / step)
  for (let i = 0; i < Math.abs(presses); i++) {
    await page.keyboard.press(presses > 0 ? 'ArrowRight' : 'ArrowLeft')
  }
  await expect(slider).toHaveValue(String(to))
}

/**
 * Give a browser a cached title size before any page script runs, so the
 * wrapper reads it on mount exactly as it would read a value this browser had
 * written itself.
 */
async function seedLayoutCache(
  context: BrowserContext,
  resumeId: string,
  titleFontSize: number,
): Promise<void> {
  await context.addInitScript(
    ([key, size]) => {
      window.localStorage.setItem(key as string, JSON.stringify({ titleFontSize: size }))
    },
    [layoutCacheKey(resumeId), titleFontSize] as const,
  )
}

/** A second browser: its own storage, its own session, the same account. */
async function openSecondSession(
  context: BrowserContext,
  user: TestUser,
  resumeId: string,
  cachedTitleSize: number,
): Promise<Page> {
  await seedLayoutCache(context, resumeId, cachedTitleSize)
  const page = await context.newPage()
  await loginAs(page, user)
  return page
}

test('layout settings saved in one session are present in another', async ({
  page,
  browser,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic')

  // A resume nobody has customized starts with nothing persisted. If this were
  // already non-null the test below could pass without the first session
  // having written anything.
  expect(await persistedTitleFontSize(resume.id)).toBeNull()

  // --- First session: make a choice ---
  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  expect(await titleFontSizePx(page)).toBe(TITLE_SIZE_DEFAULT)

  await setTitleSize(page, TITLE_SIZE_DEFAULT, TITLE_SIZE_CHOSEN)
  await expect.poll(() => titleFontSizePx(page)).toBe(TITLE_SIZE_CHOSEN)

  // It reached the account, not just this browser. Polled because the write is
  // debounced; the assertion is on the column, so a value that only ever
  // reached localStorage fails here.
  await expect
    .poll(() => persistedTitleFontSize(resume.id), { timeout: 15_000 })
    .toBe(TITLE_SIZE_CHOSEN)

  // --- Second session: a different browser, holding a conflicting cache ---
  const secondContext = await browser.newContext()
  try {
    const secondPage = await openSecondSession(
      secondContext,
      authedUser,
      resume.id,
      TITLE_SIZE_STALE_CACHE,
    )

    await secondPage.goto(`/en/dashboard/resumes/${resume.id}/preview`)
    await expect(secondPage.getByTestId('resume-document')).toBeVisible()

    // The cache says 18, the account says 42, and the account wins.
    await expect.poll(() => titleFontSizePx(secondPage)).toBe(TITLE_SIZE_CHOSEN)
  } finally {
    await secondContext.close()
  }
})

test('a property the account has never persisted keeps its local value', async ({
  page,
  authedUser,
}) => {
  /**
   * The qualification on the precedence rule, end to end.
   *
   * This is the state migration 007 leaves a resume in when it backfills the
   * four properties the old `custom_sections` blob could hold: the account has
   * SOME layout settings and not others. An unqualified "persisted wins" would
   * resolve every unpersisted property from defaults and wipe out a real
   * customization the user can see on screen — the failure US-004 exists to
   * prevent, and the one this asserts cannot happen.
   */
  const resume = await seedFixtureResume(authedUser.id, 'classic')

  // The account has persisted something — but not the title size.
  const { error } = await admin()
    .from('resumes')
    .update({ layout_settings: { hiddenMainSections: ['education'] } })
    .eq('id', resume.id)
  if (error) throw new Error(`Could not seed partial layout settings: ${error.message}`)

  // This browser holds a title size the account does not. One context is
  // enough here: the question is which store wins, not which device.
  await seedLayoutCache(page.context(), resume.id, TITLE_SIZE_CHOSEN)

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()

  // Not persisted, so the browser's value is adopted rather than reset to 24.
  await expect.poll(() => titleFontSizePx(page)).toBe(TITLE_SIZE_CHOSEN)
})

/** Rendered, not merely mounted: the heading carries the resolved size. */
async function expectDefaultTitleSize(page: Page): Promise<void> {
  expect(await titleFontSizePx(page)).toBe(TITLE_SIZE_DEFAULT)
}

/**
 * The section the legacy blob hides is absent, and the rest of the document is
 * really there.
 *
 * This is what makes the wrapped case depend on the legacy read path rather
 * than merely on the page rendering: delete `extractLayoutSettings` from
 * `resolveResumeLayout` and the education entries come back.
 */
async function expectLegacyHiddenEducation(page: Page): Promise<void> {
  const rendered = page.getByTestId('resume-document')
  // Asserted first, so the absences below are read from a document that has
  // finished rendering rather than from one that has not started.
  await expect(rendered).toContainText(FIXTURE_EXPERIENCE[0].company)
  for (const entry of FIXTURE_EDUCATION) {
    await expect(rendered).not.toContainText(entry.school)
  }
}

/**
 * The three shapes `custom_sections` can be in on a row written before
 * migration 007. None of them may make a resume unopenable — that is a named
 * FAIL condition for this milestone, and the cheapest place it could break is
 * the loader that now reads two persisted stores instead of one.
 *
 * The wrapped shape is the only one that CARRIES layout settings, so it is the
 * only one able to evidence the legacy read path — and it is seeded on
 * `professional` rather than `classic` because `resume-preview.tsx` hands
 * `hiddenMainSections` only to the templates that honour it. Classic ignores
 * section visibility altogether, so the same assertion made there could only
 * ever be about the title size, which every shape produces identically.
 */
const LEGACY_CUSTOM_SECTIONS: Array<{
  name: string
  template: ResumeTemplate
  value: unknown
  assert: (page: Page) => Promise<void>
}> = [
  { name: 'null', template: 'classic', value: null, assert: expectDefaultTitleSize },
  {
    name: 'a bare array',
    template: 'classic',
    value: [{ title: 'Awards', content: 'Employee of the year' }],
    assert: expectDefaultTitleSize,
  },
  {
    name: 'the wrapped object that carried layout settings',
    template: 'professional',
    value: {
      items: [{ title: 'Awards', content: 'Employee of the year' }],
      layoutSettings: { hiddenMainSections: ['education'] },
    },
    assert: expectLegacyHiddenEducation,
  },
]

for (const shape of LEGACY_CUSTOM_SECTIONS) {
  test(`a resume whose custom_sections is ${shape.name} still opens`, async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, shape.template)
    const { error } = await admin()
      .from('resumes')
      .update({ custom_sections: shape.value })
      .eq('id', resume.id)
    if (error) throw new Error(`Could not seed the legacy shape: ${error.message}`)

    await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
    await expect(page.getByTestId('resume-document')).toBeVisible()
    await shape.assert(page)
  })
}

test('a malformed persisted value renders defaults instead of failing', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic')

  // Shaped like an object so the column's CHECK accepts it, and useless in
  // every other respect: this is what a corrupted or hand-edited row looks
  // like, and it must not be able to break a resume.
  const { error } = await admin()
    .from('resumes')
    .update({
      layout_settings: {
        titleFontSize: 'enormous',
        fontScale: null,
        sidebarOrder: 'not a list',
        unknownKey: { nested: true },
      },
    })
    .eq('id', resume.id)
  if (error) throw new Error(`Could not seed a malformed layout value: ${error.message}`)

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  expect(await titleFontSizePx(page)).toBe(TITLE_SIZE_DEFAULT)
})
