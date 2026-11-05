/**
 * A PDF page's text in the form two PDFs of the same document are compared in:
 * every whitespace character removed, everything else kept in order.
 *
 * Whitespace is not compared because it is not reliably the document's. pdf.js
 * returns a page's text as items, and `readPdf` joins them with a space; how a
 * line splits into items depends on how the PDF positions its glyphs, not on
 * what it says. A letter-spaced heading comes back as one item per glyph in one
 * PDF ("S u m m a r y") and as whole words in another ("Summary"), although
 * both print the same thing.
 *
 * Every other character is kept, in its order, so a character added, removed,
 * changed or moved still changes the result, and so do two swapped words
 * ("VisualBaseline" against "BaselineVisual"). What it cannot see is a word
 * boundary that moves without any other character changing ("ab cd" against
 * "a bcd"). The comparison is per page, so text that moves to another page is
 * still a difference.
 *
 * Kept apart from `pdf.ts` so it stays a pure function with no PDF reader
 * behind it, and so the unit suite can test it.
 */
export function comparablePageText(text: string): string {
  return text.replace(/\s+/g, '')
}
