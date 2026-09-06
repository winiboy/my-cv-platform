import { test, expect } from '../fixtures/auth'
import { seedFixtureResume } from '../fixtures/resume'
import type { ResumeTemplate } from '../../src/types/database'

/**
 * Visual baselines for the five resume templates.
 *
 * WHY THIS EXISTS
 *
 * Milestone C unifies resume rendering across the Editor, Live Preview,
 * Preview, PDF and DOCX. That work edits shared layout code underneath five
 * templates at once, and the failure mode is not a crash - it is a template
 * that still renders, still passes typecheck, and is subtly wrong. Nothing in
 * the unit, integration or E2E suites can see that. These baselines can.
 *
 * WHAT IT GUARDS, AND WHAT IT DOES NOT
 *
 * Each test renders the real preview route - the same server component, the
 * same wrapper, the same layout-settings resolution a user gets - and compares
 * the rendered document against a committed PNG. It does NOT guard the PDF or
 * DOCX exports, which draw from separate generators and need their own
 * evidence.
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
 *      template (sliders, colour pickers). They are toggled off, both because
 *      they are chrome rather than document, and because a slider thumb is a
 *      moving target.
 *   4. Animations - disabled by the config, so a transition mid-flight cannot
 *      decide the diff.
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

for (const template of TEMPLATES) {
  test(`the ${template} template renders as approved`, async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, template)

    await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)

    // Turn the in-template editing controls off. `force` because the checkbox
    // is `sr-only` - visually hidden but the real control behind the label.
    await page.getByTestId('controls-toggle').uncheck({ force: true })

    const document = page.getByTestId('resume-document')
    await expect(document).toBeVisible()

    // Without this the first capture can happen while a webfont is still
    // swapping, producing a baseline that no later run reproduces.
    await page.evaluate(() => window.document.fonts.ready)

    // Guard against a silently truncated baseline.
    //
    // An element taller than the viewport is captured by scrolling and
    // stitching, and that produced cut-off images here on the first run: the
    // bottom of each document was replaced by blank page background, mid-word.
    // Those baselines would have passed forever while guarding only the top of
    // each template - green, and worthless.
    //
    // The viewport is now taller than any template, and this assertion fails
    // loudly if content ever grows past it, rather than letting the capture
    // quietly lose the overflow.
    const box = await document.boundingBox()
    const viewport = page.viewportSize()
    if (!box || !viewport) {
      throw new Error(`Could not measure the ${template} document to check for truncation`)
    }
    expect(
      box.height,
      `The ${template} document is ${Math.ceil(box.height)}px tall but the viewport is ` +
        `${viewport.height}px. A taller-than-viewport element is captured by stitching, ` +
        `which truncated every baseline on this suite's first run. Raise the viewport ` +
        `height in playwright.visual.config.ts rather than accepting a cropped capture.`
    ).toBeLessThanOrEqual(viewport.height)

    await expect(document).toHaveScreenshot(`${template}.png`)
  })
}
