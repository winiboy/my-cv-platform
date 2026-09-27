import { describe, expect, it } from 'vitest'
import {
  HTML2CANVAS_COLOR_FALLBACK_CSS,
  applyHtml2canvasColorFallback,
} from './html2canvas-color-fallback'

/**
 * WHY THERE IS NO DOM HERE
 *
 * `vitest.config.mts` runs `environment: 'node'`, and no DOM implementation is
 * installed - neither jsdom nor happy-dom is a dependency of this repository.
 * Adding one is a toolchain change and not part of this fix, so the four
 * document members this function touches (`createElement`, `dataset`,
 * `textContent`, `head.appendChild`) are supplied by the double below instead.
 *
 * Nothing is given up by that. What matters about `applyHtml2canvasColorFallback`
 * is *what* it installs and *where*: the CSS text and its significance are the
 * contract html2canvas consumes, and a real CSSOM would only re-serialise the
 * same string. The one claim a DOM could add - that a browser accepts these
 * declarations and that they beat the theme while losing to the letter's inline
 * styles - is a cascade claim that only a real engine can settle, and
 * `e2e/cover-letter-pdf-export.spec.ts` settles it against Chromium.
 */

interface FakeElement {
  tagName: string
  dataset: Record<string, string>
  textContent: string
}

function fakeDocument() {
  const appended: FakeElement[] = []

  const document = {
    createElement(tagName: string): FakeElement {
      return { tagName, dataset: {}, textContent: '' }
    },
    head: {
      appendChild(node: FakeElement): FakeElement {
        appended.push(node)
        return node
      },
    },
  }

  return { document: document as unknown as Document, appended }
}

/**
 * The declarations, by selector, with comments stripped first: the stylesheet's
 * own comments mention several of the property names it declares, so matching
 * against the raw text would pass on prose alone.
 */
function declarationsBySelector(css: string): Map<string, string[]> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = new Map<string, string[]>()

  for (const [, selector, body] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    blocks.set(
      selector.trim().replace(/\s+/g, ' '),
      body
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean)
    )
  }

  return blocks
}

function propertiesOf(declarations: string[]): string[] {
  return declarations.map((declaration) => declaration.split(':')[0].trim())
}

describe('applyHtml2canvasColorFallback', () => {
  it('appends one tagged style element carrying the override stylesheet to head', () => {
    const { document, appended } = fakeDocument()

    applyHtml2canvasColorFallback(document)

    expect(appended).toHaveLength(1)
    expect(appended[0].tagName).toBe('style')
    expect(appended[0].textContent).toBe(HTML2CANVAS_COLOR_FALLBACK_CSS)
    // The marker is how a leaked override would be recognised in a page or a
    // trace, so it is part of the contract rather than a debugging aid.
    expect(appended[0].dataset).toEqual({ html2canvasColorFallback: '' })
  })

  it('installs a fresh element per call, so two renders cannot share one node', () => {
    const first = fakeDocument()
    const second = fakeDocument()

    applyHtml2canvasColorFallback(first.document)
    applyHtml2canvasColorFallback(second.document)

    expect(first.appended[0]).not.toBe(second.appended[0])
  })
})

describe('HTML2CANVAS_COLOR_FALLBACK_CSS', () => {
  const blocks = declarationsBySelector(HTML2CANVAS_COLOR_FALLBACK_CSS)

  it('targets only the document root and the universal selector', () => {
    expect([...blocks.keys()]).toEqual(['html, body', '*, ::before, ::after'])
  })

  it('resets the two properties html2canvas parses off the cloned document', () => {
    // `parseBackgroundColor` reads the *clone's* html and body unconditionally,
    // and `color` inherits down to the render target, so both have to be sRGB
    // before html2canvas looks at either.
    expect(propertiesOf(blocks.get('html, body') ?? []).sort()).toEqual([
      'background-color',
      'color',
    ])
  })

  it("declares exactly the properties recorded as html2canvas's colour set", () => {
    // A regression pin, not a proof of coverage: the expected list is written
    // here by hand from a reading of html2canvas 1.4.1, so it can catch this
    // sheet drifting away from that reading and can never catch the reading
    // being wrong. An eighth colour-parsed property would pass this test. Only
    // the module doc and its line citations establish the set itself.
    //
    // `border-color` stands for the four longhands html2canvas actually reads:
    // the shorthand sets all of them, and writing them out separately would not
    // change what the cascade produces.
    expect(propertiesOf(blocks.get('*, ::before, ::after') ?? []).sort()).toEqual([
      '-webkit-text-stroke-color',
      'background-color',
      'background-image',
      'border-color',
      'box-shadow',
      'text-decoration-color',
      'text-shadow',
    ])
  })

  it("declares nothing !important, so the letter's own inline colours still win", () => {
    // Load-bearing, not stylistic: `!important` here would repaint the letter
    // itself - the one thing in the clone whose colours are intended.
    expect(HTML2CANVAS_COLOR_FALLBACK_CSS).not.toMatch(/!\s*important/i)
  })

  it('contains no colour function html2canvas cannot parse', () => {
    // The override existing is not enough; it has to be expressible in the
    // parser's own vocabulary, or it aborts the render exactly like the theme
    // did. `rgb`/`rgba`/`hsl`/`hsla` are all 1.4.1 understands.
    const unsupported = [
      ...HTML2CANVAS_COLOR_FALLBACK_CSS.matchAll(
        /\b(oklch|oklab|lch|lab|hwb|color|color-mix|light-dark)\s*\(/gi
      ),
    ].map((match) => match[1])

    expect(unsupported).toEqual([])
  })
})
