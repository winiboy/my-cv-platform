import { test, expect, type TestUser } from '../fixtures/auth'
import { seedFixtureResume } from '../fixtures/resume'
import type { Page, Locator } from '@playwright/test'
import type { ResumeTemplate } from '../../src/types/database'

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
 * therefore IS the PDF: `print:p-8`, `print:p-5`, `print:shadow-none`,
 * `print:bg-white` and the rest decide what a user's downloaded document
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
 * cost is one navigation per template, not one build: the production build
 * that dominates this suite's runtime happens once per run.
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
 *   3. Controls - the preview ships editing controls rendered INSIDE the
 *      template (sliders, drag chevrons). On SCREEN they are toggled off: they
 *      are chrome rather than document, and a slider thumb is a moving target.
 *      In PRINT they are deliberately left ON - see below.
 *   4. Animations - disabled by the config.
 *
 * WHY THE PRINT CAPTURE LEAVES THE CONTROLS ON
 *
 * `showControls` defaults to `true` (`resume-preview-page-client.tsx`), so the
 * user who hits Download PDF prints with the controls on, and `print:hidden`
 * is the only thing keeping sliders and drag chevrons out of their document.
 *
 * It is also the largest class of print utility in this codebase - 33 sites in
 * `src`, 28 of them across the five templates, the preview wrapper and the
 * preview page - and turning the controls off does not neutralise it, it
 * removes the elements from the DOM entirely: the templates render them as
 * `{setSectionDescFontSize && (...)}` and the wrapper passes
 * `showControls ? setSectionDescFontSize : undefined`. Captured with the
 * controls off, deleting `print:hidden` anywhere would leave both baselines
 * byte-identical while every subsequent PDF shipped with UI chrome baked in.
 *
 * Capturing print with the controls on costs nothing in determinism, because
 * `print:hidden` is precisely what removes the nondeterministic slider thumbs
 * under print media. The capture is stable BECAUSE the utility works, and goes
 * red the moment it stops.
 *
 * HOW MUCH OF `print:hidden` THIS ACTUALLY OBSERVES: 2 of the 26 template
 * sites. Measured, not assumed - `print:hidden` was stripped from all five
 * templates at once, and only `creative` went red.
 *
 * The other 24 cannot reach an element screenshot of the document:
 *
 *   - 12 (classic 5, minimal 5, creative 2) are
 *     `position: absolute; left: 100%; margin-left: 48px` off a full-width
 *     ancestor, which puts them past the document's 816px box; an element
 *     screenshot clips there. The two observed `creative` sliders use the same
 *     rule off a half-width column, which is why they land inside it.
 *   - 8 in `professional` are gated on `setSidebarWidth` /
 *     `setSidebarTopMargin` / `setMainContentTopMargin`, which the preview
 *     wrapper never passes at any value of `showControls`, so they never
 *     render on this route.
 *   - 4 in `modern`: three are `opacity-0` until hover, one renders only
 *     during background removal.
 *
 * The remaining 7 of the 33 in `src` are page chrome outside
 * `[data-testid=resume-document]` and no element screenshot can see them.
 *
 * That is a real limit, written down rather than rounded up.
 * See `docs/engineering/visual-regression.md`.
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

const TEMPLATES: ResumeTemplate[] = [
  'professional',
  'modern',
  'classic',
  'minimal',
  'creative',
]

/**
 * What to do with the in-template editing controls before capturing.
 *
 * `'off'` unchecks the toggle, which removes the controls from the DOM.
 * `'as-shipped'` leaves the page in its default state, which is controls ON -
 * the state a user is in when they print. See the note above on why the print
 * capture needs the second and the screen capture needs the first.
 */
type ControlsState = 'off' | 'as-shipped'

/**
 * Seed a resume, open its preview, and return the document element ready to
 * capture: fonts settled, still under the default screen media.
 */
async function openPreviewDocument(
  page: Page,
  user: TestUser,
  template: ResumeTemplate,
  controls: ControlsState
): Promise<Locator> {
  const resume = await seedFixtureResume(user.id, template)

  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)

  if (controls === 'off') {
    // `force` because the checkbox is `sr-only` - visually hidden but the real
    // control behind the label.
    await page.getByTestId('controls-toggle').uncheck({ force: true })
  } else {
    // Do not assume the default; assert it. If `showControls` ever stops
    // defaulting to `true`, the print baselines would silently stop covering
    // `print:hidden` and nothing else would notice.
    await expect(page.getByTestId('controls-toggle')).toBeChecked()
  }

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
 * stylesheet changes padding, so the print document is not the height of the
 * screen document; checking a screen measurement and then capturing in print
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

for (const template of TEMPLATES) {
  test(`the ${template} template renders as approved`, async ({ page, authedUser }) => {
    const document = await openPreviewDocument(page, authedUser, template, 'off')

    await expectFitsWithoutStitching(page, document, template, 'screen')

    await expect(document).toHaveScreenshot(`${template}.png`)
  })

  test(`the ${template} template prints as approved`, async ({ page, authedUser }) => {
    // Controls on, as a user printing from the preview has them. This is what
    // puts `print:hidden` under observation - see the header for exactly how
    // much of it this reaches.
    const document = await openPreviewDocument(page, authedUser, template, 'as-shipped')

    await page.emulateMedia({ media: 'print' })

    // Re-measure under print, not before it: see the note on the guard.
    await expectFitsWithoutStitching(page, document, template, 'print')

    await expect(document).toHaveScreenshot(`${template}-print.png`)
  })
}
