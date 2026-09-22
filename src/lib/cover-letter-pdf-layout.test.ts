import { jsPDF } from 'jspdf'
import { describe, expect, it } from 'vitest'
import { renderCoverLetterPdf } from './cover-letter-pdf-layout'

/**
 * These tests assert on a real generated PDF rather than on an intermediate
 * value: the layout is only correct if the bytes jsPDF emits carry the right
 * text on the right lines.
 *
 * jsPDF writes uncompressed content streams by default, so each rendered line
 * appears literally as `x y Td (text) Tj`. PDF user space is bottom-up, which
 * is why the baselines below count down from the top margin.
 *
 * Fixture text deliberately avoids `(`, `)` and `\`, which a PDF literal
 * string escapes.
 */

/** Layout constants the module is contracted to use, in points. */
const MARGIN = 72
const PAGE_HEIGHT = 792
const LINE_HEIGHT = 20
const PARAGRAPH_SPACING = 12
/** Baseline of the first line on any page, in bottom-up PDF user space. */
const TOP_BASELINE = PAGE_HEIGHT - MARGIN

interface RenderedLine {
  readonly text: string
  readonly x: number
  /** Bottom-up PDF user-space baseline. */
  readonly y: number
}

/** Renders `text` and returns the show-text operations, grouped by page. */
function renderToPages(text: string): RenderedLine[][] {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })

  renderCoverLetterPdf(doc, text)

  const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1')

  // One content stream per page, in page order.
  return [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(([, stream]) =>
    [...stream.matchAll(/([\d.]+)\s+([\d.]+)\s+Td\s*\n\((.*?)\)\s*Tj/g)].map(([, x, y, body]) => ({
      text: body,
      x: Number(x),
      y: Number(y),
    }))
  )
}

/** Renders `text` and returns every rendered line across every page. */
function renderToLines(text: string): RenderedLine[] {
  return renderToPages(text).flat()
}

/** Renders `text` and returns just the strings that end up on the page. */
function renderToText(text: string): string[] {
  return renderToLines(text).map((line) => line.text)
}

describe('renderCoverLetterPdf', () => {
  describe('line breaks inside a paragraph', () => {
    it('renders a lone newline as a separate line, in order', () => {
      // Regression: the export used to collapse `\n` to a space, so the
      // signature printed on one line in the PDF while the editor and the
      // DOCX export both showed two.
      expect(renderToText('Kind regards,\nJane Doe')).toEqual(['Kind regards,', 'Jane Doe'])
    })

    it('spaces those two lines as one paragraph, not two', () => {
      const [first, second] = renderToLines('Kind regards,\nJane Doe')

      expect(first.y - second.y).toBe(LINE_HEIGHT)
    })

    it('breaks on a lone newline that follows a segment which itself wraps', () => {
      const lines = renderToText(
        'This first line is deliberately long enough that it must wrap across more than one rendered line before the break.\nJane Doe'
      )

      expect(lines).toHaveLength(3)
      expect(lines[2]).toBe('Jane Doe')
      expect(lines.slice(0, 2).join(' ')).toBe(
        'This first line is deliberately long enough that it must wrap across more than one rendered line before the break.'
      )
    })

    it('leaves text without a newline on a single line', () => {
      expect(renderToText('Kind regards, Jane Doe')).toEqual(['Kind regards, Jane Doe'])
    })
  })

  describe('paragraphs', () => {
    it('starts a new paragraph on a blank line', () => {
      const [first, second] = renderToLines('First paragraph.\n\nSecond paragraph.')

      expect([first.text, second.text]).toEqual(['First paragraph.', 'Second paragraph.'])
      expect(first.y - second.y).toBe(LINE_HEIGHT + PARAGRAPH_SPACING)
    })

    it('treats a run of blank lines as one separator', () => {
      const [first, second] = renderToLines('First paragraph.\n\n\n\nSecond paragraph.')

      expect(first.y - second.y).toBe(LINE_HEIGHT + PARAGRAPH_SPACING)
    })

    it('drops a whitespace-only paragraph', () => {
      const lines = renderToLines('First paragraph.\n\n   \n\nSecond paragraph.')

      expect(lines.map((line) => line.text)).toEqual(['First paragraph.', 'Second paragraph.'])
      expect(lines[0].y - lines[1].y).toBe(LINE_HEIGHT + PARAGRAPH_SPACING)
    })

    it('trims surrounding whitespace from a paragraph', () => {
      expect(renderToText('  Dear Hiring Manager,  ')).toEqual(['Dear Hiring Manager,'])
    })

    it('renders no text for empty input', () => {
      expect(renderToText('')).toEqual([])
    })

    it('renders no text for whitespace-only input', () => {
      expect(renderToText('   \n\n  \n\n ')).toEqual([])
    })
  })

  describe('wrapping and pagination', () => {
    it('wraps a paragraph that exceeds the content width', () => {
      const paragraph =
        'I am writing to express my interest in the position advertised on your careers page, where my background in building resilient web platforms for distributed teams would let me contribute from the first week onward.'

      const lines = renderToLines(paragraph)

      expect(lines.length).toBeGreaterThan(1)
      expect(lines.map((line) => line.text).join(' ')).toBe(paragraph)
      // Wrapped lines belong to one paragraph, so none of them carries the
      // extra paragraph gap.
      for (let i = 1; i < lines.length; i += 1) {
        expect(lines[i - 1].y - lines[i].y).toBe(LINE_HEIGHT)
      }
    })

    it('continues on a new page once the bottom margin is reached', () => {
      const letter = Array.from({ length: 25 }, (_, index) => `Paragraph ${index}.`).join('\n\n')

      const pages = renderToPages(letter)

      expect(pages).toHaveLength(2)
      expect(pages.flat()).toHaveLength(25)
      expect(pages[1][0].y).toBe(TOP_BASELINE)
    })
  })

  describe('page geometry', () => {
    it('starts at the top-left of the text area', () => {
      const [first] = renderToLines('Dear Hiring Manager,')

      expect(first.x).toBe(MARGIN)
      expect(first.y).toBe(TOP_BASELINE)
    })
  })

  describe('a whole letter', () => {
    it('renders every line of the canonical form in order', () => {
      const letter =
        'Dear Hiring Manager,\nAcme GmbH\n\nI am applying for the role.\n\nSincerely,\nAda'

      expect(renderToText(letter)).toEqual([
        'Dear Hiring Manager,',
        'Acme GmbH',
        'I am applying for the role.',
        'Sincerely,',
        'Ada',
      ])
    })
  })
})
