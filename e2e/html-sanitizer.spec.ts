import { test, expect, type Page } from '@playwright/test'
import { sanitizeHtml, htmlToPlainText } from '../src/lib/html-utils'

/**
 * `sanitizeHtml` and `htmlToPlainText` must not execute untrusted markup.
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The defect is that parsing rich text through a div owned by the live
 * document makes `<img src=x onerror=...>` fetch its image and run the handler
 * before the tag allowlist ever sees it. Only a real browser loads images and
 * dispatches that event; a DOM emulator would report "nothing ran" whether or
 * not the code is safe.
 *
 * No app server or database is involved: each test runs on about:blank with
 * the two functions injected as source. They are self-contained (they touch
 * only DOM globals), so their transpiled `toString()` form runs unchanged.
 *
 * WHAT IS PROVEN
 *
 * A control first shows that the harness does detect execution, so a zero
 * count afterwards means something. The output expectations were recorded
 * from the pre-fix implementation in Chromium and pin that the inert parse
 * changed nothing else - including a leading <style>, which a whole-document
 * parser would hoist into <head> and silently drop.
 */

declare global {
  interface Window {
    __fired: number
    sanitizeHtml: (html: string) => string
    htmlToPlainText: (html: string) => string
    parseInLiveDocument: (html: string) => void
    settleImageErrors: () => Promise<void>
  }
}

const PAYLOADS = [
  '<img src=x onerror="window.__fired++">',
  '<p>hi<img src=x onerror="window.__fired++"></p>',
]

async function loadHarness(page: Page): Promise<void> {
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({
    content: `
      window.__fired = 0;
      // Injected as source, so both functions must stay self-contained: an
      // imported helper would be undefined here and the injected code would break.
      window.sanitizeHtml = ${sanitizeHtml.toString()};
      window.htmlToPlainText = ${htmlToPlainText.toString()};
      window.parseInLiveDocument = function (html) {
        document.createElement('div').innerHTML = html;
      };
      // A sentinel image attached after the code under test. Its error event
      // is queued behind any error that code triggered, so awaiting it is a
      // deterministic point at which those handlers would already have run.
      window.settleImageErrors = function () {
        return new Promise(function (resolve) {
          var img = document.createElement('img');
          img.onerror = function () { img.remove(); resolve(); };
          img.src = 'x';
          document.body.appendChild(img);
        });
      };
    `,
  })
}

test.describe('html sanitizer does not execute untrusted markup', () => {
  test.beforeEach(async ({ page }) => {
    await loadHarness(page)
  })

  test('control: parsing in the live document runs the handler', async ({ page }) => {
    const fired = await page.evaluate(async (payloads) => {
      payloads.forEach((payload) => window.parseInLiveDocument(payload))
      await window.settleImageErrors()
      return window.__fired
    }, PAYLOADS)

    expect(fired).toBe(PAYLOADS.length)
  })

  for (const payload of PAYLOADS) {
    test(`sanitizeHtml does not run the handler: ${payload}`, async ({ page }) => {
      const { fired, output } = await page.evaluate(async (html) => {
        const result = window.sanitizeHtml(html)
        await window.settleImageErrors()
        return { fired: window.__fired, output: result }
      }, payload)

      expect(fired).toBe(0)
      expect(output).not.toContain('<img')
      expect(output).not.toContain('onerror')
    })

    test(`htmlToPlainText does not run the handler: ${payload}`, async ({ page }) => {
      const { fired, output } = await page.evaluate(async (html) => {
        const result = window.htmlToPlainText(html)
        await window.settleImageErrors()
        return { fired: window.__fired, output: result }
      }, payload)

      expect(fired).toBe(0)
      expect(output).not.toContain('<img')
      expect(output).not.toContain('onerror')
    })
  }
})

test.describe('html sanitizer output is unchanged', () => {
  test.beforeEach(async ({ page }) => {
    await loadHarness(page)
  })

  const SANITIZE_CASES: ReadonlyArray<readonly [string, string]> = [
    ['', ''],
    ['plain text', 'plain text'],
    ['<b>bold</b> <i>italic</i> <u>under</u>', '<strong>bold</strong> <em>italic</em> <u>under</u>'],
    [
      '<span style="font-family: Arial; font-size: 14px; color: red; text-align: center">x</span>',
      '<span style="font-family: Arial;font-size: 14px;text-align: center;">x</span>',
    ],
    ['<font face="Georgia">serif</font>', '<span style="font-family: Georgia;">serif</span>'],
    [
      '<font face="Georgia" style="font-family: Arial">x</font>',
      '<span style="font-family: Arial;">x</span>',
    ],
    ['<p style="color: red">no allowed style</p>', '<p>no allowed style</p>'],
    [
      '<p class="c" id="i" onclick="alert(1)" data-x="y">attrs</p>',
      '<p>attrs</p>',
    ],
    ['<script>alert(1)</script>after', 'alert(1)after'],
    ['<a href="javascript:alert(1)">link <b>text</b></a>', 'link text'],
    [
      '<ul><li>one</li><li>two</li></ul><ol><li>a</li></ol>',
      '<ul><li>one</li><li>two</li></ul><ol><li>a</li></ol>',
    ],
    ['<div style="text-align: right">line<br>next</div>', '<div style="text-align: right;">line<br>next</div>'],
    ['<style>p{color:red}</style><p>after style</p>', 'p{color:red}<p>after style</p>'],
    ['<p>1 &lt; 2 &amp; 3</p>', '<p>1 &lt; 2 &amp; 3</p>'],
    // Intended change: the inert document has scripting disabled, so noscript content parses as markup (was escaped text; both inert)
    ['<noscript><b>ns</b></noscript>', 'ns'],
  ]

  for (const [input, expected] of SANITIZE_CASES) {
    test(`sanitizeHtml(${JSON.stringify(input)})`, async ({ page }) => {
      const output = await page.evaluate((html) => window.sanitizeHtml(html), input)
      expect(output).toBe(expected)
    })
  }

  const PLAIN_TEXT_CASES: ReadonlyArray<readonly [string, string]> = [
    ['', ''],
    ['already plain\ntext  ', 'already plain\ntext  '],
    ['line<br>next', 'line\nnext'],
    ['<p>first</p><p>second</p>', 'first\n\nsecond'],
    ['<ul><li>one</li><li>two</li></ul>', '• one\n• two'],
    ['<ol><li>a</li><li>b</li></ol>', '1. a\n2. b'],
    ['<p>a</p><p></p><p></p><p>b</p>', 'a\n\nb'],
    ['<style>p{color:red}</style><p>after style</p>', 'p{color:red}after style'],
    // Intended change: the inert document has scripting disabled, so noscript content parses as markup (was escaped text; both inert)
    ['<noscript><b>ns</b></noscript>', 'ns'],
  ]

  for (const [input, expected] of PLAIN_TEXT_CASES) {
    test(`htmlToPlainText(${JSON.stringify(input)})`, async ({ page }) => {
      const output = await page.evaluate((html) => window.htmlToPlainText(html), input)
      expect(output).toBe(expected)
    })
  }
})
