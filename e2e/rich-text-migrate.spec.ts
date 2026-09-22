import { test, expect, type Page } from '@playwright/test'
import { migrateTextToHtml } from '../src/lib/html-utils'

/**
 * `migrateTextToHtml` must not turn stored plain text into executable markup,
 * and must not corrupt the tagless HTML the editor itself saves.
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The defect is that text with an unterminated tag such as
 * `<img src=x onerror=...//` is classified as plain text (it has no complete
 * `<...>`), wrapped in `<p>...</p>` without escaping, and the `>` of `</p>`
 * completes the img tag. Only a real browser loads the image and dispatches
 * the error event, so only a real browser can show whether the handler runs.
 * The fix decodes entities through a textarea; whether that parse is inert is
 * also something only a real browser can answer.
 *
 * No app server or database is involved: each test runs on about:blank with
 * the function injected as source. It is self-contained (its helpers are
 * defined inside the function body), so its transpiled `toString()` form runs
 * unchanged. `sanitizeHtml` is deliberately not injected: the output of
 * `migrateTextToHtml` must be inert on its own.
 *
 * WHAT IS PROVEN
 *
 * Controls first show that the harness does detect execution, so a zero count
 * afterwards means something. The legacy cases pin that bullets, numbering,
 * paragraphs and line breaks render exactly as before. The escaping cases pin
 * that text renders as the text it encodes, and that an editor save/load
 * round trip is stable instead of adding a layer of entities each time.
 */

declare global {
  interface Window {
    __fired: number
    migrateTextToHtml: (text: string) => string
    renderInLiveDocument: (html: string) => HTMLDivElement
    serializeAsTaglessSave: (text: string) => string
    settleImageErrors: () => Promise<void>
  }
}

const PAYLOAD = '<img src=x onerror="window.__fired++"//'
const COMPLETE_TAG = '<img src=x onerror="window.__fired++">'

const PAYLOAD_INPUTS: ReadonlyArray<readonly [string, string, string]> = [
  ['paragraph', PAYLOAD, PAYLOAD],
  ['bullet list', `• ${PAYLOAD}\n- second`, PAYLOAD],
  ['numbered list', `1. ${PAYLOAD}\n2) second`, PAYLOAD],
  ['entity-encoded complete tag', '&lt;img src=x onerror="window.__fired++"&gt;', COMPLETE_TAG],
]

async function loadHarness(page: Page): Promise<void> {
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({
    content: `
      window.__fired = 0;
      // Injected as source, so the function must stay self-contained: a
      // module-level helper would be undefined here and the code would break.
      window.migrateTextToHtml = ${migrateTextToHtml.toString()};
      // Mirrors the real sinks (editor.innerHTML, dangerouslySetInnerHTML):
      // markup assigned to an editable element owned by the live document.
      window.renderInLiveDocument = function (html) {
        var el = document.createElement('div');
        el.contentEditable = 'true';
        el.innerHTML = html;
        document.body.appendChild(el);
        return el;
      };
      // What the editor stores after a single typed line with no Enter:
      // editor.innerHTML of a lone text node, i.e. tagless, entity-encoded.
      window.serializeAsTaglessSave = function (text) {
        var el = document.createElement('div');
        el.contentEditable = 'true';
        el.appendChild(document.createTextNode(text));
        document.body.appendChild(el);
        var saved = el.innerHTML;
        el.remove();
        return saved;
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

test.describe('migrateTextToHtml does not execute untrusted text', () => {
  test.beforeEach(async ({ page }) => {
    await loadHarness(page)
  })

  test('control: the pre-fix output shape runs the handler in the live document', async ({ page }) => {
    const fired = await page.evaluate(async (payload) => {
      window.renderInLiveDocument(`<p>${payload}</p>`)
      await window.settleImageErrors()
      return window.__fired
    }, PAYLOAD)

    expect(fired).toBe(1)
  })

  test('control: markup assigned to a textarea creates no element and runs nothing', async ({ page }) => {
    const result = await page.evaluate(async (markup) => {
      const textarea = document.createElement('textarea')
      textarea.innerHTML = markup
      document.body.appendChild(textarea)
      await window.settleImageErrors()
      return {
        fired: window.__fired,
        elementCount: textarea.childElementCount,
        value: textarea.value,
      }
    }, `${COMPLETE_TAG}${PAYLOAD}`)

    expect(result.fired).toBe(0)
    expect(result.elementCount).toBe(0)
    expect(result.value).toBe(`${COMPLETE_TAG}${PAYLOAD}`)
  })

  for (const [label, input, literal] of PAYLOAD_INPUTS) {
    test(`${label}: payload is rendered as literal text, handler does not run`, async ({ page }) => {
      const result = await page.evaluate(async (text) => {
        const el = window.renderInLiveDocument(window.migrateTextToHtml(text))
        await window.settleImageErrors()
        return {
          fired: window.__fired,
          hasImg: el.querySelector('img') !== null,
          firstBlockText: (el.querySelector('li, p') as HTMLElement).textContent,
        }
      }, input)

      expect(result.fired).toBe(0)
      expect(result.hasImg).toBe(false)
      expect(result.firstBlockText).toBe(literal)
    })
  }
})

test.describe('migrateTextToHtml legacy output is unchanged', () => {
  test.beforeEach(async ({ page }) => {
    await loadHarness(page)
  })

  const LEGACY_CASES: ReadonlyArray<readonly [string, string]> = [
    ['', ''],
    ['Line one\nLine two', '<p>Line one<br>Line two</p>'],
    ['• one\n- two\n* three', '<ul><li>one</li><li>two</li><li>three</li></ul>'],
    ['1. first\n2) second', '<ol><li>first</li><li>second</li></ol>'],
    [
      'Intro line\n\n• a\n• b\n\n1. x\n2. y\n\nClosing\nline',
      '<p>Intro line</p><ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol><p>Closing<br>line</p>',
    ],
    // Already-HTML input is returned untouched; callers sanitize it.
    ['<p>already <strong>html</strong></p>', '<p>already <strong>html</strong></p>'],
    // Accepted deviation: the decode normalizes CRLF to LF, so this splits
    // into two paragraphs where it used to emit `<p>a\r<br>\r<br>b</p>`.
    ['a\r\n\r\nb', '<p>a</p><p>b</p>'],
  ]

  for (const [input, expected] of LEGACY_CASES) {
    test(`migrateTextToHtml(${JSON.stringify(input)})`, async ({ page }) => {
      const output = await page.evaluate((text) => window.migrateTextToHtml(text), input)
      expect(output).toBe(expected)
    })
  }
})

test.describe('migrateTextToHtml plain text is escaped', () => {
  test.beforeEach(async ({ page }) => {
    await loadHarness(page)
  })

  test('raw ampersand renders as "R&D" and serializes as R&amp;D', async ({ page }) => {
    const result = await page.evaluate((text) => {
      const html = window.migrateTextToHtml(text)
      const el = window.renderInLiveDocument(html)
      return { html, serialized: el.innerHTML, rendered: el.textContent }
    }, 'Led R&D team')

    expect(result.html).toBe('<p>Led R&amp;D team</p>')
    expect(result.serialized).toBe('<p>Led R&amp;D team</p>')
    expect(result.rendered).toBe('Led R&D team')
  })

  test('quotes and a lone < render as literal text', async ({ page }) => {
    const input = `a < b and "quoted" 'single'`
    const result = await page.evaluate((text) => {
      const html = window.migrateTextToHtml(text)
      return { html, rendered: window.renderInLiveDocument(html).textContent }
    }, input)

    expect(result.html).toBe('<p>a &lt; b and &quot;quoted&quot; &#39;single&#39;</p>')
    expect(result.rendered).toBe(input)
  })

  test('entity-encoded tagless input renders as the text it encodes', async ({ page }) => {
    const result = await page.evaluate((text) => {
      const html = window.migrateTextToHtml(text)
      return { html, rendered: window.renderInLiveDocument(html).textContent }
    }, 'R&amp;D &lt; 5 &quot;q&quot;')

    expect(result.html).toBe('<p>R&amp;D &lt; 5 &quot;q&quot;</p>')
    expect(result.rendered).toBe('R&D < 5 "q"')
  })

  test('a bullet whose space is an encoded nbsp is still a list', async ({ page }) => {
    const output = await page.evaluate(
      (text) => window.migrateTextToHtml(text),
      '-&nbsp;item',
    )
    expect(output).toBe('<ul><li>item</li></ul>')
  })

  test('entity-encoded bullets are still detected as a list', async ({ page }) => {
    const output = await page.evaluate(
      (text) => window.migrateTextToHtml(text),
      '&bull; one\n&bull; R&amp;D',
    )
    expect(output).toBe('<ul><li>one</li><li>R&amp;D</li></ul>')
  })

  for (const initial of ['R&D lead < 5% "q"', 'R&amp;D lead &lt; 5%']) {
    test(`editor save/load round trip is stable: ${JSON.stringify(initial)}`, async ({ page }) => {
      const cycles = await page.evaluate((start) => {
        const out: Array<{ saved: string; rendered: string }> = []
        let stored = start
        for (let i = 0; i < 4; i++) {
          const rendered = window.renderInLiveDocument(window.migrateTextToHtml(stored))
            .textContent as string
          stored = window.serializeAsTaglessSave(rendered)
          out.push({ saved: stored, rendered })
        }
        return out
      }, initial)

      const [first] = cycles
      for (const cycle of cycles) {
        expect(cycle.rendered).toBe(first.rendered)
        expect(cycle.saved).toBe(first.saved)
      }
      expect(first.rendered).not.toContain('&amp;')
      expect(first.saved).not.toContain('&amp;amp;')
    })
  }
})
