import type { jsPDF } from 'jspdf'
import { splitPlainTextIntoParagraphs } from '@/lib/cover-letter-editor-html'

/**
 * Page layout for the cover letter PDF export.
 *
 * Lives outside the React component so it can be exercised against a real
 * generated document: the component owns the dynamic `import('jspdf')`, the
 * document instance, the filename and `doc.save()`, while every decision that
 * affects the rendered page is made here.
 *
 * Canonical text model, split by the same `splitPlainTextIntoParagraphs` the
 * editor uses:
 * - `\n\n` separates two paragraphs
 * - a single `\n` is a line break *inside* one paragraph
 *
 * The DOCX export follows the same convention but does not share this code: it
 * still splits the text itself in `cover-letter-generator-client.tsx`.
 *
 * jsPDF's `splitTextToSize` already honours a lone `\n` as a hard break, and
 * keeps doing so when the segment before it also wraps, so the intra-paragraph
 * newline is handed to it untouched rather than pre-split here.
 */

/** US Letter portrait, in points — the format the caller must construct. */
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
/** 1 inch margins. */
const MARGIN = 72
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
const LINE_HEIGHT = 20
/** Extra space inserted after each paragraph. */
const PARAGRAPH_SPACING = 12

/**
 * Writes `text` into `doc` as a laid-out cover letter, adding pages as needed.
 *
 * The document must have been created as `{ unit: 'pt', format: 'letter',
 * orientation: 'portrait' }` — the measurements above are absolute points for
 * that page size. Any content already in `doc` is left alone but overlapped,
 * because the letter always starts at the top margin of the current page.
 */
export function renderCoverLetterPdf(doc: jsPDF, text: string): void {
  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(31, 41, 55) // text-gray-800

  let currentY = MARGIN

  for (const paragraph of splitPlainTextIntoParagraphs(text)) {
    // `splitTextToSize` is typed as `any` by jsPDF; it returns one entry per
    // rendered line, breaking both on width and on the paragraph's own `\n`.
    const lines: string[] = doc.splitTextToSize(paragraph, CONTENT_WIDTH)

    for (const line of lines) {
      if (currentY + LINE_HEIGHT > PAGE_HEIGHT - MARGIN) {
        doc.addPage()
        currentY = MARGIN
      }

      doc.text(line, MARGIN, currentY)
      currentY += LINE_HEIGHT
    }

    currentY += PARAGRAPH_SPACING
  }
}
