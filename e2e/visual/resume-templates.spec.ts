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
 *     ancestor, which lands them on or past the document's 816px edge
 *     (`minimal`'s overlap it by 3px and are excluded by the strict containment
 *     described on `countObservableControls`); an element screenshot clips
 *     there. The two observed `creative` sliders use the same rule off the
 *     one-third-width left column of a `grid-cols-3` body, which is why they
 *     land inside it.
 *   - 8 in `professional` are gated on `setSidebarWidth` /
 *     `setSidebarTopMargin` / `setMainContentTopMargin`, which the preview
 *     wrapper never passes at any value of `showControls`, so they never
 *     render on this route.
 *   - 4 in `modern`: three are `opacity-0` until hover, one renders only
 *     during background removal.
 *
 * The remaining 7 of the 33 - everything left once the 26 template sites are
 * accounted for - are page chrome outside `[data-testid=resume-document]`, and
 * no element screenshot of the document can see them.
 *
 * Two is asserted rather than hoped for. Both observed sliders carry
 * `print:hidden`, so neither appears in `creative-print.png` - which means
 * removing them, relocating them outside the 816px box, or ceasing to pass
 * their setter props would leave that baseline byte-identical, every test
 * green, and the reach of `print:hidden` silently at 0 of 26.
 * `expectPrintHiddenStaysObserved` counts them under screen media before the
 * print capture and requires exactly two - not at least two, because a number
 * that drifts upward unnoticed makes the accounting above wrong just as surely.
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
 * How many in-template editing controls are drawn inside each template's
 * document under SCREEN media - which is to say how many `print:hidden` still
 * has to hide from the print capture. The measured reach, per the header.
 *
 * WHAT THE COUNT REACHES, EXACTLY. `countObservableControls` selects
 * `input[type="range"]`, and those exist in three templates only: classic 5,
 * minimal 5, creative 4 - one per `print:hidden` site in each, 14 of the 26.
 * `professional` contains no `<input>` at all (its 8 sites are drag-arrow
 * `<span>`s) and `modern`'s 4 are three `<div>`s and a `<button>`. So:
 *
 *   - `classic: 0` and `minimal: 0` are MEASURED. Their sliders render - fewer
 *     than five each, since the description slider sits in both mutually
 *     exclusive branches of an `achievements?.length ? ... : description ? ...`
 *     ternary and this fixture takes the first - and every one that renders is
 *     excluded on geometry alone. If one ever relocated inside the box the
 *     count would move and this file would go red, which is the drift worth
 *     catching: it would make the "2 of 26" wrong.
 *   - `professional: 0` and `modern: 0` are STRUCTURAL. The selector matches
 *     nothing in either template, so these cannot move whatever their twelve
 *     sites (professional 8, modern 4) do. They are here so the `Record` stays
 *     exhaustive, not as coverage. Making `professional`'s setters render
 *     would put its resize handles inside the document and this count would
 *     still read zero.
 *
 * A full `Record` rather than a `Partial`: a sixth template then has to be given
 * a value here, instead of silently getting no assertion at all.
 */
const OBSERVABLE_CONTROLS: Record<ResumeTemplate, number> = {
  professional: 0,
  modern: 0,
  classic: 0,
  minimal: 0,
  creative: 2,
}

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

/**
 * Count the in-template editing controls an element screenshot of the document
 * can actually see.
 *
 * "Can see" is mostly a geometric question, not a DOM one. Each of the fourteen
 * range inputs in scope - twelve of which actually render, per the note on
 * OBSERVABLE_CONTROLS - sits in a wrapper that is `position: absolute;
 * left: 100%; margin-left: 48px` off some ancestor, and whether that lands
 * inside or outside the document's 816px box depends entirely on how wide that
 * ancestor is. An element screenshot clips to
 * the element's own box, so a control outside it is not in the image no matter
 * how present it is in the DOM - which is precisely why twelve of the 26 sites
 * (classic 5, minimal 5, creative 2) are unreachable on geometry alone.
 *
 * Geometry alone would be a false floor, though. `getBoundingClientRect` still
 * reports a full-size box for something `visibility: hidden` or `opacity: 0`;
 * only `display: none` collapses it. Either state is one in which deleting
 * `print:hidden` produces no pixel diff at all, while a geometry-only count
 * still reports two - coverage claimed and not held. Hence `checkVisibility`.
 *
 * That shape is not invented: `modern` renders `print:hidden opacity-0
 * group-hover:opacity-100` at three of its four sites. Those particular sites
 * are outside this selector (they are not range inputs), so they were never at
 * risk of being miscounted - but they are the in-house pattern that Milestone C
 * Part 2 could plausibly unify `creative`'s sliders onto, which is the case
 * that would matter. Mutation 3 in the doc demonstrates it on `creative`.
 *
 * Two things are NOT covered, and both have live instances rather than being
 * hypotheticals held at arm's length.
 *
 * Clipping by an intermediate `overflow: hidden` ancestor is invisible here - a
 * hit-test would not catch it either, since the clipped control's centre still
 * lands on the document's own painted area. `creative`'s header
 * (`creative-template.tsx:53`) is `overflow-hidden` and clips the two header
 * sliders whose containing blocks sit inside it; they escape being miscounted
 * only because they also land 21px outside the box and are rejected on geometry
 * first.
 *
 * A control straddling the document's edge counts as zero rather than as a
 * half, because the containment below is strict. `minimal` straddles: its
 * `p-16` puts each rendered slider's input 3px INSIDE the document's right edge
 * under screen media (measured - input left 1173 against a right edge of 1176),
 * so all four are partly drawn and all four count as nothing. `classic`'s `p-12`
 * lands its wrappers exactly flush and its inputs 13px clear, so it does not.
 *
 * Both are benign today, because those sliders are `print:hidden` and the screen
 * capture runs with the controls off. But 3px is a coincidence, not a design.
 * Move either case inward and this count starts reporting a control that is
 * never painted, or discarding one that is.
 *
 * `input[type="range"]` identifies the controls rather than the `print:hidden`
 * class deliberately. Selecting on the class would make deleting `print:hidden`
 * fail HERE, before `toHaveScreenshot` ever runs, and the pixel diff is the far
 * better failure for that case: it shows the chrome baked into the document.
 * This assertion answers the other question - is there still anything for
 * `print:hidden` to hide where the capture can see it.
 */
async function countObservableControls(document: Locator): Promise<number> {
  return document.evaluate((root) => {
    const box = root.getBoundingClientRect()
    return Array.from(root.querySelectorAll('input[type="range"]')).filter((control) => {
      const rect = control.getBoundingClientRect()
      const insideTheCapture =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.left >= box.left &&
        rect.right <= box.right &&
        rect.top >= box.top &&
        rect.bottom <= box.bottom
      if (!insideTheCapture) return false

      return control.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
        contentVisibilityAuto: true,
      })
    }).length
  })
}

/**
 * Fail if the print baseline has stopped observing `print:hidden`.
 *
 * This is the one decay mode the baseline itself cannot report. The observed
 * controls carry `print:hidden`, so they are absent from `{template}-print.png`
 * by construction; if they stop rendering, move out of the box, or lose the
 * setter props that gate them, the committed PNG stays byte-identical and the
 * suite stays green while covering nothing. Milestone C Part 2 changes layout
 * state ownership across exactly these components, so this is not hypothetical.
 *
 * Called under SCREEN media, before `emulateMedia`. Under print the controls
 * are `display: none` and have no box at all - that is the utility working, and
 * asserting on it there would measure zero every time.
 *
 * Exact equality rather than a floor, because the number is a documented figure
 * and both directions of drift matter. Fewer means the baseline has stopped
 * guarding the utility; more means `docs/engineering/visual-regression.md`'s
 * account of what is and is not reachable has gone stale. The geometry is
 * deterministic, so equality is not brittle here.
 *
 * `expect.poll` rather than a bare assertion because the preview wrapper applies
 * saved layout settings after mount, which moves type sizes and therefore the
 * geometry this depends on; the same reason `toHaveScreenshot` re-captures. Note
 * what that does and does not buy: polling stops at the first matching sample,
 * so it waits only for a count to REACH its expected value. The zeros match on
 * that first sample and get no settle guarantee from it.
 */
async function expectPrintHiddenStaysObserved(
  document: Locator,
  template: ResumeTemplate,
  expected: number
): Promise<void> {
  await expect
    .poll(() => countObservableControls(document), {
      message:
        `The ${template} print baseline observes \`print:hidden\` only through ` +
        `controls that are actually drawn INSIDE the document's 816px box, and ` +
        `${expected} were measured there. That count has changed. Fewer means ` +
        `this baseline has stopped guarding the utility while staying ` +
        `byte-identical and green; more means the "2 of 26" accounting in ` +
        `docs/engineering/visual-regression.md is now wrong. Either way: ` +
        `re-measure, then update OBSERVABLE_CONTROLS and that document together. ` +
        `Do not delete this assertion to get a green run.`,
    })
    .toBe(expected)
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

    await expectPrintHiddenStaysObserved(document, template, OBSERVABLE_CONTROLS[template])

    await page.emulateMedia({ media: 'print' })

    // Re-measure under print, not before it: see the note on the guard.
    await expectFitsWithoutStitching(page, document, template, 'print')

    await expect(document).toHaveScreenshot(`${template}-print.png`)
  })
}
