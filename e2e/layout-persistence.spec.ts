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
async function persistedLayout(resumeId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin()
    .from('resumes')
    .select('layout_settings')
    .eq('id', resumeId)
    .single()
  if (error) throw new Error(`Could not read persisted layout settings: ${error.message}`)
  return (data?.layout_settings as Record<string, unknown> | null) ?? null
}

async function persistedTitleFontSize(resumeId: string): Promise<number | null> {
  const settings = await persistedLayout(resumeId)
  return typeof settings?.titleFontSize === 'number' ? settings.titleFontSize : null
}

/** Write the column as the account, past the browser. */
async function seedPersistedLayout(resumeId: string, value: unknown): Promise<void> {
  const { error } = await admin()
    .from('resumes')
    .update({ layout_settings: value })
    .eq('id', resumeId)
  if (error) throw new Error(`Could not seed persisted layout settings: ${error.message}`)
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
  await seedLayoutCacheValue(context, resumeId, { titleFontSize })
}

/** The same, for a blob carrying more than one property. */
async function seedLayoutCacheValue(
  context: BrowserContext,
  resumeId: string,
  value: Record<string, unknown>,
): Promise<void> {
  await context.addInitScript(
    ([key, blob]) => {
      window.localStorage.setItem(key as string, blob as string)
    },
    [layoutCacheKey(resumeId), JSON.stringify(value)] as const,
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

/**
 * US-004 — existing local customization survives the move.
 *
 * WHY THESE ASSERT THE COLUMN AND NOT THE SCREEN
 *
 * Everything below would pass on the screen alone without any migration at all:
 * the browser that holds the local settings renders them either way, because
 * `resolveResumeLayout` adopts a cached value for a property the account does
 * not hold. What is under test is whether that value REACHED the account, so
 * the assertions are on `resumes.layout_settings` read through a service-role
 * client. A value that only ever stayed in localStorage cannot pass one.
 *
 * WHY ALL FOUR STATES ARE HERE AND NOT ONLY THE MIGRATING ONE
 *
 * Adoption writes on load, which makes the cases where it must NOT write as
 * load-bearing as the case where it must. Three of the four are absences: no
 * write for a resume with nothing local, no write when the account already
 * holds the property, and no defaults invented for the properties nobody set.
 * An absence needs a settle window to be evidence, hence the wait below.
 *
 * The fifth case is the one the whole per-property design exists for: a row
 * migration 007 BACKFILLED, whose column is non-null but carries only the four
 * properties the legacy blob could hold. Answering "has this resume got
 * persisted settings?" per resume would adopt nothing there and lose the other
 * fifteen. That test fails if anyone reaches for the simpler rule.
 */

/** What the account claims to hold, as a sorted key list. */
async function persistedKeys(resumeId: string): Promise<string[] | null> {
  const settings = await persistedLayout(resumeId)
  return settings === null ? null : Object.keys(settings).sort()
}

/**
 * Long enough for a write issued on mount to have landed.
 *
 * Adoption is issued synchronously from the load effect with no debounce, so by
 * the time the document has rendered the request is already out; this window is
 * for the round trip to the local stack, not for a timer in the application.
 * A fixed wait is the honest tool for asserting that something did NOT happen —
 * polling can only ever confirm that it has not happened YET.
 */
const ADOPTION_SETTLE_MS = 3_000

/** The four properties migration 007's backfill can carry, and no others. */
const BACKFILLED_LAYOUT = {
  sidebarOrder: ['training', 'skills', 'languages', 'keyAchievements'],
  mainContentOrder: ['experience', 'summary', 'education'],
  hiddenSidebarSections: [] as string[],
  hiddenMainSections: ['education'],
}

test('a resume with neither local nor persisted settings gains none', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic')

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  expect(await titleFontSizePx(page)).toBe(TITLE_SIZE_DEFAULT)

  await page.waitForTimeout(ADOPTION_SETTLE_MS)

  // Still NULL. Merely looking at a resume must not make it claim nineteen
  // deliberate values it never had — that would pin it against every future
  // change to the documented defaults.
  expect(await persistedLayout(resume.id)).toBeNull()
})

test('a resume with only persisted settings is not overwritten by defaults', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic')
  await seedPersistedLayout(resume.id, { titleFontSize: 30 })

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  expect(await titleFontSizePx(page)).toBe(30)

  await page.waitForTimeout(ADOPTION_SETTLE_MS)

  expect(await persistedLayout(resume.id)).toEqual({ titleFontSize: 30 })
})

test('a resume with only local settings adopts them into the account', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic')
  expect(await persistedLayout(resume.id)).toBeNull()

  // This browser holds a real customization the account has never heard of —
  // the state every existing user is in the moment persistence ships.
  await seedLayoutCache(page.context(), resume.id, TITLE_SIZE_CHOSEN)

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  expect(await titleFontSizePx(page)).toBe(TITLE_SIZE_CHOSEN)

  // THE MIGRATION. Merely loading the resume moved it onto the account.
  await expect
    .poll(() => persistedTitleFontSize(resume.id), { timeout: 15_000 })
    .toBe(TITLE_SIZE_CHOSEN)

  // And it moved ONLY that. The other eighteen properties are still nobody's
  // choice, so they stay absent rather than being written as though they were.
  expect(await persistedKeys(resume.id)).toEqual(['titleFontSize'])
})

test('the editor adopts local settings too, not only the preview', async ({
  page,
  authedUser,
}) => {
  /**
   * The second call site.
   *
   * Every other test here loads `/preview`, so without this one the editor's
   * adoption is covered only through the shared planner's unit tests — and the
   * editor is the surface that differs, because it resolves its stores from the
   * server prop while holding a separate `resume` state a draft blob can
   * replace. A user who customized their resume and never opens the preview
   * must be migrated just the same.
   */
  const resume = await seedFixtureResume(authedUser.id, 'classic')
  expect(await persistedLayout(resume.id)).toBeNull()

  await seedLayoutCache(page.context(), resume.id, TITLE_SIZE_CHOSEN)

  await page.goto(`/en/dashboard/resumes/${resume.id}/edit`)
  // The editor renders the same live document, so the browser's value being on
  // screen here means the same thing it means on the preview.
  await expect(page.getByTestId('resume-document')).toBeVisible()
  await expect.poll(() => titleFontSizePx(page)).toBe(TITLE_SIZE_CHOSEN)

  await expect
    .poll(() => persistedTitleFontSize(resume.id), { timeout: 15_000 })
    .toBe(TITLE_SIZE_CHOSEN)
  expect(await persistedKeys(resume.id)).toEqual(['titleFontSize'])
})

test('a local value does not displace one the account already holds', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic')
  await seedPersistedLayout(resume.id, { titleFontSize: 30 })

  // The conflict is genuine: two stores, the same property, different values.
  await seedLayoutCache(page.context(), resume.id, TITLE_SIZE_CHOSEN)

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()

  // The account wins on screen...
  await expect.poll(() => titleFontSizePx(page)).toBe(30)

  await page.waitForTimeout(ADOPTION_SETTLE_MS)

  // ...and in the store. The local 42 is not promoted over it, and nothing
  // else is written either.
  expect(await persistedLayout(resume.id)).toEqual({ titleFontSize: 30 })
})

test('a backfilled resume adopts the properties the backfill could not carry', async ({
  page,
  authedUser,
}) => {
  /**
   * The case the per-property grain exists for.
   *
   * The column is NON-NULL, so "does this resume have persisted settings?"
   * answers yes — and answering it per resume would adopt nothing, leaving the
   * user's typography to resolve from defaults on their next device. Per
   * property, the four backfilled values win and the fifteen absent ones take
   * the browser's.
   */
  const resume = await seedFixtureResume(authedUser.id, 'classic')
  await seedPersistedLayout(resume.id, BACKFILLED_LAYOUT)

  await seedLayoutCacheValue(page.context(), resume.id, {
    titleFontSize: TITLE_SIZE_CHOSEN,
    fontScale: 1.2,
    // The account holds this one. It must lose, exactly as in the test above.
    sidebarOrder: ['skills', 'languages', 'training', 'keyAchievements'],
  })

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  expect(await titleFontSizePx(page)).toBe(TITLE_SIZE_CHOSEN)

  await expect
    .poll(() => persistedTitleFontSize(resume.id), { timeout: 15_000 })
    .toBe(TITLE_SIZE_CHOSEN)

  // The backfilled four survive untouched, the two the browser really chose
  // are adopted, and nothing else is invented.
  expect(await persistedLayout(resume.id)).toEqual({
    ...BACKFILLED_LAYOUT,
    titleFontSize: TITLE_SIZE_CHOSEN,
    fontScale: 1.2,
  })
})

test('the migration runs once and cannot re-promote a stale cache', async ({
  page,
  authedUser,
}) => {
  /**
   * IDEMPOTENCE, stated as the failure it prevents.
   *
   * A second run is not merely wasteful. After the first load both surfaces
   * re-cache the RESOLVED model, so this browser's blob now carries all
   * nineteen properties — and if that counted as nineteen local values to
   * adopt, a change made on another device afterwards would be overwritten by
   * this browser's stale copy on its next load. So the account is changed
   * between the two loads, and the second load must leave it alone.
   */
  const resume = await seedFixtureResume(authedUser.id, 'classic')
  await seedLayoutCache(page.context(), resume.id, TITLE_SIZE_CHOSEN)

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  await expect
    .poll(() => persistedTitleFontSize(resume.id), { timeout: 15_000 })
    .toBe(TITLE_SIZE_CHOSEN)

  // Somebody else's device changes the same property.
  await seedPersistedLayout(resume.id, { titleFontSize: 30 })

  // The same browser loads again, its cache now holding the full resolved
  // model from the first load — including titleFontSize 42.
  await page.reload()
  await expect(page.getByTestId('resume-document')).toBeVisible()
  await expect.poll(() => titleFontSizePx(page)).toBe(30)

  await page.waitForTimeout(ADOPTION_SETTLE_MS)

  expect(await persistedLayout(resume.id)).toEqual({ titleFontSize: 30 })
})
