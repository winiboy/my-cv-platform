import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * The cover letter card's "Download PDF" button produces a real, valid PDF.
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The export is entirely client-side: `cover-letter-card.tsx` dynamically
 * imports `html2pdf.js`, which rasterises the letter with html2canvas and
 * wraps the bitmap in a jsPDF document. There is no API route to assert
 * against and no server artefact to inspect - the bytes only exist once a real
 * engine has laid the letter out, painted it to a canvas, and handed the file
 * to the browser's download machinery. A unit test can reach none of that.
 *
 * WHY IT EXISTS AT ALL
 *
 * The export runs through a dependency chain the application does not control
 * (html2pdf.js -> html2canvas + jsPDF). That chain has to be upgraded whenever
 * an advisory lands against it, and every such upgrade can silently change the
 * generated document instead of breaking a build. Nothing else in the suite
 * would notice a PDF that became one page shorter, a different size, or empty.
 *
 * WHAT IS ASSERTED
 *
 * The downloaded bytes are a PDF, are not truncated, and carry the cover
 * letter's own 816x1056 px geometry - which Part 3 US-008 deliberately left
 * out of the resumes' move to A4, so a page that silently became A4 is a
 * regression, not an improvement.
 *
 * On top of that, the page must stay quiet: no dialog, no uncaught error, no
 * script-level console error. The export swallows its own failures into `console.error` and
 * an `alert()`, which is why the oklch regression this test now guards looked
 * like a flaky download for weeks rather than a total, every-user outage. The
 * structural assertions above could not have caught it - there were no bytes at
 * all - and they equally could not catch a render that resolved every colour to
 * black. The quiet-page assertions are the half that fails loudly.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter PDF export')

/**
 * jsPDF writes the MediaBox in points. For `unit: 'px'` it converts at 96/72,
 * so the component's `format: [816, 1056]` becomes 1088 x 1408 pt. These are
 * the numbers the current export actually produces, measured rather than
 * derived, so a change in either the format or the unit fails here.
 */
const EXPECTED_MEDIA_BOX = { width: 1088, height: 1408 }

const LETTER_TITLE = 'E2E PDF Export'

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * The letter both tests export. Shared rather than duplicated: the second test
 * forces a failure on the same document the first one exports successfully, so
 * the two outcomes differ only by the injected colour and nothing else.
 */
async function insertTestLetter(userId: string): Promise<void> {
  const { error: insertError } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: LETTER_TITLE,
      recipient_name: 'Mr. Charles Babbage',
      recipient_title: 'Head of Engineering',
      company_name: 'Analytical Engines SA',
      company_address: '12 Rue du Calcul\n1003 Lausanne\nSwitzerland',
      greeting: 'Dear Mr. Babbage,',
      // Both tags are here so the rasterised page can be checked for surviving
      // inline formatting: the sanitizer, the markup builder and html2canvas
      // each get a chance to drop it, and a plain-text letter would look
      // perfectly correct without it.
      opening_paragraph:
        'I am writing to apply for the <strong>Senior Software Engineer</strong> position, ' +
        'and I am <em>particularly</em> drawn to your work.',
      // Long enough to overflow one page, so the multi-page slicing path is
      // exercised too: a single-page letter would pass even if slicing broke.
      body_paragraphs: Array.from(
        { length: 8 },
        (_, i) =>
          `Paragraph ${i + 1}: I have spent the last several years building and shipping ` +
          `production software, and I own the document export pipeline end to end.`
      ),
      closing_paragraph: 'Thank you for your time and consideration.',
      sign_off: 'Sincerely,',
      sender_name: 'Ada Lovelace',
      job_title: 'Senior Software Engineer',
      // `template` is left to its column default: the cover_letters schema
      // constrains it to 'modern', so naming a value here would only couple
      // this fixture to a constraint the export does not depend on.
    })
  expect(insertError, insertError?.message).toBeNull()
}

/**
 * Opens the kebab on the test letter's card and returns its "Download PDF" item.
 *
 * The card is addressed by its title, then the kebab inside that card, so a
 * second cover letter in the list could never make this click ambiguous.
 * `div.relative` is the card's own root: filtering plain `div` by text and
 * taking the innermost match lands on the wrapper around the heading, which
 * does not contain the menu button. The kebab toggle carries an icon and no
 * label, so it is addressed by position within the card rather than by an
 * accessible name it lacks.
 */
async function openDownloadPdf(page: Page): Promise<Locator> {
  const card = page
    .locator('div.relative')
    .filter({ has: page.getByRole('heading', { level: 3, name: LETTER_TITLE }) })
    .last()
  await expect(card.getByRole('heading', { name: LETTER_TITLE })).toBeVisible()

  await card.locator('button').first().click()

  const downloadButton = page.getByRole('button', { name: /Download PDF/i })
  await expect(downloadButton).toBeVisible()
  return downloadButton
}

test('the cover letter card exports a valid PDF at the cover letter page size', async ({
  page,
  authedUser,
}) => {
  // No `test.setTimeout` override. An earlier draft raised this to 120s on the
  // assumption that rasterising a multi-page letter at scale 2 would dwarf
  // everything else in the suite; measured against the fixed export it is 1.8s
  // end to end, fixtures included, which is the suite's own average. The
  // config's 90s is already fifty times the real cost, and a per-test blank
  // cheque in a `workers: 1, retries: 0` suite buys nothing but a slower way to
  // discover a hang.

  // The export's only failure channel is `console.error` plus an `alert()` that
  // Playwright auto-dismisses, so a thrown export used to be indistinguishable
  // from a slow one: the oklch regression presented as a download that simply
  // never arrived. These are assertions, not diagnostics - a future export that
  // fails silently has to fail this test, and fail it with the reason.
  //
  // Their window starts here, which is already after the login form and the
  // post-login redirect: the `authedUser` fixture runs `loginAs` before this
  // body (`e2e/fixtures/auth.ts:160-171`), so both of those navigations have
  // happened. Nothing is weakened by that - `consoleErrors` is cleared at the
  // click anyway, because loading this dashboard logs a handful of unrelated
  // 403/404 subresource failures and asserting on them would be asserting on
  // someone else's bug. From the click onward the count must be zero.
  const consoleErrors: string[] = []
  const reportedFailures: string[] = []

  // Resolved by the first dialog or uncaught error, so the export's own failure
  // report can be raced against the download instead of waited out.
  let signalFailure: (reason: string) => void = () => {}
  const failureReported = new Promise<string>((resolve) => {
    signalFailure = resolve
  })
  const reportFailure = (reason: string) => {
    reportedFailures.push(reason)
    signalFailure(reason)
  }

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => reportFailure(`pageerror ${e.name}: ${e.message}`))
  page.on('dialog', (d) => {
    reportFailure(`dialog: ${d.message()}`)
    void d.dismiss()
  })

  await insertTestLetter(authedUser.id)

  await page.goto('/en/dashboard/cover-letters')

  const downloadButton = await openDownloadPdf(page)

  // A raise, not a formality. Playwright's own fixtures push `actionTimeout`
  // into the context default - `playwright/lib/index.js:356` sets
  // `_defaultContextTimeout = actionTimeout || 0`, applied at
  // `playwright-core/lib/coreBundle.js:59239` - and `TimeoutSettings._timeout`
  // (`:57509-57519`) falls through explicit, then page default, then that
  // context default, and only then to 30s. So a bare `waitForEvent` here would
  // get the config's 15s, and stating 30s doubles it. Against a measured 1.8s
  // for the whole test - fixtures and PDF parsing included - that is headroom
  // for a loaded machine rather than the inflated ceiling the broken export
  // needed to fail through.
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
  // Everything logged on the way here belongs to page load, not to the export.
  // From this line on, anything logged is the export's.
  consoleErrors.length = 0
  await downloadButton.click()

  // The export's alert() fires within a second of a thrown render, so waiting on
  // the download alone would burn the full timeout on a failure the page has
  // already reported. Racing the two names the reason immediately.
  const outcome = await Promise.race([
    downloadPromise.then(
      () => 'download' as const,
      () => 'no download within the timeout' as const
    ),
    failureReported.then((reason) => `the export reported: ${reason}` as const),
  ])
  expect(outcome, `consoleErrors: ${JSON.stringify(consoleErrors, null, 2)}`).toBe('download')

  const download = await downloadPromise

  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  const pdf = Buffer.concat(chunks)

  // Attached rather than discarded. The failure this test was written for
  // produced no bytes at all, but the next one need not: a colour fix that
  // resolved everything to black, or a render that came back blank, would
  // satisfy every structural assertion below. None of them can see the page.
  // The document itself is the only evidence that can, so it travels with the
  // result instead of being thrown away on the happy path.
  await test.info().attach('cover-letter.pdf', { body: pdf, contentType: 'application/pdf' })

  expect(download.suggestedFilename()).toBe('E2E_PDF_Export.pdf')

  // A PDF, and a complete one. Asserting only the header would pass for a
  // file that the export aborted halfway through writing.
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  const text = pdf.toString('latin1')
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true)

  const mediaBoxes = [
    ...text.matchAll(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g),
  ].map((m) => ({ width: Number(m[3]), height: Number(m[4]) }))

  expect(mediaBoxes.length).toBeGreaterThanOrEqual(2)
  for (const box of mediaBoxes) {
    expect(box).toEqual(EXPECTED_MEDIA_BOX)
  }

  // The letter is rasterised into the page, so a PDF that rendered nothing
  // would still have the right page size. The embedded JPEGs are what carry
  // the content, and an empty render does not produce hundreds of kilobytes.
  expect(text).toContain('/DCTDecode')
  expect(pdf.length).toBeGreaterThan(50_000)

  // A download can arrive *and* the page can still have complained - a partly
  // failed render, a missing asset, a second export attempt. Nothing about the
  // bytes above would notice, so the page's own error channels are asserted
  // clean rather than merely raced against.
  expect(reportedFailures, 'the export must not raise a dialog or an uncaught error').toEqual([])

  // Subresource-load failures are excluded, and only those. Two of them arrive
  // here on the browser's own idle schedule and belong to neither the export nor
  // this test: the dashboard's `<Link>` prefetches answer 404 for
  // `/en/dashboard/goals` and `/en/dashboard/settings`, and the browser Sentry
  // SDK's envelope POSTs are rejected 403 by the real ingest host from a local
  // run. Both are pre-existing and both are someone else's bug to fix; pinning
  // this test to them would only make it flaky.
  //
  // Nothing is lost by the exclusion. The export reports its own failures by
  // calling `console.error` and `alert`, which are a script error and a dialog -
  // exactly what is still asserted at zero here and directly above.
  const scriptErrors = consoleErrors.filter((m) => !m.startsWith('Failed to load resource'))
  expect(
    scriptErrors,
    `the export must not log a console error. everything logged after the click: ${JSON.stringify(consoleErrors, null, 2)}`
  ).toEqual([])
})

/**
 * A colour html2canvas cannot parse, injected with `!important` so it beats the
 * fallback stylesheet `onclone` installs. This is the original outage
 * reproduced, not a synthetic error. `parseBackgroundColor` reads the *cloned*
 * document's `html` and `body` (`html2canvas.esm.js:7757, :7798-7805`), and this
 * rule reaches that clone in two steps: `createStyleClone` rebuilds the `<style>`
 * element's text from `sheet.cssRules` (`:5280-5281, :5303-5325`) - necessary,
 * because its `cloneNode(false)` copies no child text node - and `toIFrame` then
 * adopts the whole cloned tree into the iframe document (`:5266`), where that
 * text is parsed as CSS again. `cssText` serialisation preserves `!important`
 * and `oklch()`, so the parser throws `Attempting to parse an unsupported color
 * function "oklch"`. html2canvas rejects, which is the exact path that leaks.
 */
const UNPARSEABLE_COLOR_CSS = 'html, body { background-color: oklch(0.7 0.1 200) !important; }'

test('a failed export leaves no html2pdf overlay blocking the dashboard', async ({
  page,
  authedUser,
}) => {
  // Same reasoning as the test above: no override. This one is faster still -
  // 1.6s measured - because the render aborts instead of completing.

  // `html2pdf.js` appends a `position: fixed`, viewport-covering
  // `.html2pdf__overlay` to `document.body` before it rasterises
  // (src/worker.js:105-125) and removes it only in `toCanvas_post` (:152),
  // which a rejected `html2canvas()` never reaches. Its `opacity: 0` hides it
  // but does not stop pointer events, so the failure this whole change exists
  // to handle used to end with the dashboard unclickable and every retry
  // stacking another one.
  //
  // The mount is counted by observer rather than read after the fact: the
  // component now removes the overlay in its `finally`, so by the time this
  // test could look, it is gone either way. Without the counter, a future
  // html2pdf that stopped creating the overlay at all would make the
  // zero-overlays assertion below pass vacuously.
  await page.addInitScript(() => {
    const target = window as unknown as { __html2pdfOverlaysMounted?: number }
    target.__html2pdfOverlaysMounted = 0
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('html2pdf__overlay')) {
            target.__html2pdfOverlaysMounted = (target.__html2pdfOverlaysMounted ?? 0) + 1
          }
        }
      }
    }).observe(document, { childList: true, subtree: true })
  })

  // The export's only user-visible failure channel. Dismissed immediately,
  // because `alert()` blocks the page and the cleanup runs after it returns.
  const dialogs: string[] = []
  let signalDialog: () => void = () => {}
  const dialogShown = new Promise<void>((resolve) => {
    signalDialog = resolve
  })
  page.on('dialog', (d) => {
    dialogs.push(d.message())
    signalDialog()
    void d.dismiss()
  })

  await insertTestLetter(authedUser.id)

  await page.goto('/en/dashboard/cover-letters')
  await page.addStyleTag({ content: UNPARSEABLE_COLOR_CSS })

  const downloadButton = await openDownloadPdf(page)
  await downloadButton.click()

  await dialogShown
  expect(dialogs, 'a failed export must tell the user').toHaveLength(1)

  // The `finally` runs as `alert()` returns, so this is settled by now; it is
  // polled rather than read once so the assertion reports the leak instead of
  // a scheduling race.
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          mounted:
            (window as unknown as { __html2pdfOverlaysMounted?: number })
              .__html2pdfOverlaysMounted ?? 0,
          overlays: document.querySelectorAll('.html2pdf__overlay').length,
          containers: document.querySelectorAll('.html2pdf__container').length,
        })),
      { timeout: 15_000 }
    )
    .toEqual({ mounted: 1, overlays: 0, containers: 0 })

  // The count is the mechanism; this is the symptom. An overlay still mounted
  // sits above the card at `zIndex: 1000`, so Playwright's own hit-target check
  // fails this click with "intercepts pointer events" - which is precisely what
  // the user hit. A passing click is the proof that the dashboard is usable
  // again, not merely that one selector matched nothing.
  const reopened = await openDownloadPdf(page)
  await expect(reopened).toBeVisible()
})
