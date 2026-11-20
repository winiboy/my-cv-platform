import { test, expect, type TestUser } from '../fixtures/auth'
import { seedFixtureResume } from '../fixtures/resume'
import type { Page, Locator } from '@playwright/test'
import type { BuiltResumeTemplate, ResumeTemplate } from '../../src/types/database'

/**
 * Visual baselines for the five resume templates, on screen and in print.
 *
 * WHY THIS EXISTS
 *
 * Milestone C unifies resume rendering across the Editor, Live Preview,
 * Preview, PDF and DOCX. That work edits shared layout code underneath five
 * templates at once, and the failure mode is not a crash - it is a template
 * that still renders, still passes typecheck, and is subtly wrong. Nothing in
 * the unit, integration or E2E suites can see that. These baselines can.
 *
 * WHY PRINT IS CAPTURED SEPARATELY
 *
 * PDF in this product is `window.print()` over these same React templates -
 * there is no PDF rendering library in the resume path. The print stylesheet
 * therefore IS the PDF: `print:hidden`, `print:shadow-none`, the
 * `@media print` block in globals.css and the rest decide what a user's downloaded document
 * looks like. A screen-only baseline cannot see any of it, so a regression
 * confined to a `print:` utility would ship green.
 *
 * WHAT IT GUARDS, AND WHAT IT DOES NOT
 *
 * Each test renders the real preview route - the same server component, the
 * same wrapper, the same layout-settings resolution a user gets - and compares
 * the rendered document against a committed PNG. The print tests do the same
 * with the print stylesheet applied via `emulateMedia`. It does NOT guard the
 * DOCX export, which draws from a separate generator and needs its own
 * evidence; nor does it guard page-breaking, headers/footers or `@page`
 * margins, which the print PREVIEW applies but a screenshot does not.
 *
 * ONE MEDIUM PER TEST
 *
 * Screen and print are separate tests rather than two captures in one test,
 * for two reasons. Playwright stops a test at its first failed assertion, so
 * a combined test would hide the print result whenever screen failed - and it
 * is exactly the asymmetry between the two that carries the information
 * ("layout moved everywhere" vs "only the print stylesheet moved"). The extra
 * cost is a whole extra fixture per template: another created user, another
 * real form login (`fixtures/auth.ts` signs in through the page rather than
 * injecting a cookie) and another seeded resume, so a full run does ten of each
 * rather than five. What it is not is an extra build, and the production build
 * is what dominates this suite's runtime.
 *
 * DETERMINISM
 *
 * Four things are pinned, because a baseline that varies is a baseline that
 * gets a loose threshold, and a loose threshold hides real regressions:
 *
 *   1. Content - the fixture in `fixtures/resume.ts` never changes between
 *      runs.
 *   2. Fonts - the test waits on `document.fonts.ready`, otherwise the first
 *      capture can land mid-swap and differ from every later one.
 *   3. Controls - none. The Preview page renders the stored layout read-only
 *      and passes no setter to any template (swiss-cv-templates FR-13), so no
 *      slider, resize handle or upload control is drawn in the document.
 *      `expectNoEditingControls` asserts that under screen media before every
 *      capture, so the screen and print baselines show the document alone.
 *   4. Animations - disabled by the config.
 *
 * Playwright additionally re-captures until two consecutive screenshots agree,
 * which absorbs the wrapper's post-mount settle without needing a fixed wait.
 *
 * PLATFORM
 *
 * Snapshots are per-platform by design: font rasterisation differs between
 * Windows and Linux, so a Windows baseline will never match a Linux run. The
 * committed set is whichever platforms have been captured; see
 * `docs/engineering/visual-regression.md` before adding CI to the list.
 */

const TEMPLATES: BuiltResumeTemplate[] = [
  'professional',
  'modern',
  'classic',
  'minimal',
  'creative',
  'swissVocational',
  'swissCommerce',
]

/**
 * Seed a resume, open its preview, and return the document element ready to
 * capture: fonts settled, still under the default screen media.
 */
async function openPreviewDocument(
  page: Page,
  user: TestUser,
  template: ResumeTemplate
): Promise<Locator> {
  const resume = await seedFixtureResume(user.id, template)

  const response = await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  expect(response?.status()).toBe(200)

  // This suite guards the templates' rendering. The page-break overlay is drawn
  // over the document on screen but is not part of it, so it is hidden here.
  await page.addStyleTag({
    content: '[data-testid="page-break-indicators"] { display: none !important; }',
  })

  const document = page.getByTestId('resume-document')
  await expect(document).toBeVisible()

  // Without this the first capture can happen while a webfont is still
  // swapping, producing a baseline that no later run reproduces.
  await page.evaluate(() => window.document.fonts.ready)

  return document
}

/**
 * Guard against a silently truncated baseline.
 *
 * An element taller than the viewport is captured by scrolling and stitching,
 * and that produced cut-off images here on the first run: the bottom of each
 * document was replaced by blank page background, mid-word. Those baselines
 * would have passed forever while guarding only the top of each template -
 * green, and worthless.
 *
 * The viewport is now taller and wider than any template, and this assertion
 * fails loudly if content ever grows past it, rather than letting the capture
 * quietly lose the overflow.
 *
 * Both axes are checked. Height is the one that actually bit, but stitching is
 * not height-specific: an element wider than the viewport is captured the same
 * way. Every template currently pins `width: 816px` inline against a 1280px
 * viewport, so the width assertion has nothing to catch today - which is the
 * point. If that pinning is ever relaxed, the check is already in place rather
 * than being added after a second cropped baseline.
 *
 * This MUST be called after the medium is set, never before. The print
 * stylesheet used to change padding, so the print document was not the height
 * of the screen document, and a future print rule could do so again; checking a screen measurement and then capturing in print
 * would be checking the wrong number, and a print-only overflow would be
 * truncated exactly as the original bug was.
 */
async function expectFitsWithoutStitching(
  page: Page,
  document: Locator,
  template: ResumeTemplate,
  media: 'screen' | 'print'
): Promise<void> {
  const box = await document.boundingBox()
  const viewport = page.viewportSize()
  if (!box || !viewport) {
    throw new Error(
      `Could not measure the ${template} document under ${media} media to check for truncation`
    )
  }
  expect(
    box.height,
    `The ${template} document is ${Math.ceil(box.height)}px tall under ${media} media but the ` +
      `viewport is ${viewport.height}px. A taller-than-viewport element is captured by ` +
      `stitching, which truncated every baseline on this suite's first run. Raise the ` +
      `viewport height in playwright.visual.config.ts rather than accepting a cropped capture.`
  ).toBeLessThanOrEqual(viewport.height)
  expect(
    box.width,
    `The ${template} document is ${Math.ceil(box.width)}px wide under ${media} media but the ` +
      `viewport is ${viewport.width}px. Stitching crops horizontally too. Raise the viewport ` +
      `width in playwright.visual.config.ts rather than accepting a cropped capture.`
  ).toBeLessThanOrEqual(viewport.width)
}

/**
 * Fail if any in-template editing control is drawn in the document on the
 * Preview route: a range input, a button (native or `role="button"`), a file
 * input or a resize handle.
 *
 * The Preview passes no layout setter to any template (FR-13), and the photo
 * upload is the Editor's alone, so the count is zero for every template.
 * Checked under SCREEN media, where a `print:hidden` control would still have a
 * box; under print it would be `display: none` and invisible to the check.
 */
async function expectNoEditingControls(page: Page, document: Locator): Promise<void> {
  await expect(page.getByTestId('controls-toggle')).toHaveCount(0)
  await expect(document.locator('input[type="range"]')).toHaveCount(0)
  await expect(document.locator('input, button, select, textarea, [role="button"]')).toHaveCount(0)
  await expect(document.locator('.cursor-ew-resize, .cursor-ns-resize')).toHaveCount(0)
}

for (const template of TEMPLATES) {
  test(`the ${template} template renders as approved`, async ({ page, authedUser }) => {
    const document = await openPreviewDocument(page, authedUser, template)

    await expectNoEditingControls(page, document)

    await expectFitsWithoutStitching(page, document, template, 'screen')

    await expect(document).toHaveScreenshot(`${template}.png`)
  })

  test(`the ${template} template prints as approved`, async ({ page, authedUser }) => {
    const document = await openPreviewDocument(page, authedUser, template)

    await expectNoEditingControls(page, document)

    await page.emulateMedia({ media: 'print' })

    // Re-measure under print, not before it: see the note on the guard.
    await expectFitsWithoutStitching(page, document, template, 'print')

    await expect(document).toHaveScreenshot(`${template}-print.png`)
  })
}
