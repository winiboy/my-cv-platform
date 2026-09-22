import { escapeHtml } from './escape-html'

/**
 * Conversion between the cover letter's canonical plain-text representation and
 * the HTML held by the contentEditable editor in the cover letter generator.
 *
 * Canonical model (shared with the DOCX export):
 * - `\n\n` separates two paragraphs
 * - a single `\n` is a line break *inside* one paragraph
 *
 * The editor renders with `white-space: pre-line`, so a lone `\n` stays a real
 * text-node newline and `Element.textContent` reads it back unchanged. Emitting
 * `<br>` instead would break that round trip, because `textContent` drops
 * element-level breaks.
 */

/**
 * Splits the canonical plain text into its paragraphs, dropping blank ones.
 *
 * Newlines inside a paragraph are left alone — they are the line breaks the
 * model preserves.
 */
export function splitPlainTextIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

/**
 * Joins paragraph texts read out of the editor back into the canonical form.
 *
 * `fallbackText` is used when the editor holds no `<p>` at all — the shape a
 * browser produces for content typed straight into an empty contentEditable.
 * That branch is a lossy last resort, not a supported path: the browser wraps
 * later typed blocks in `<div>`, and `textContent` joins them with nothing at
 * all, so `Alpha<div>Beta</div>` reads back as `AlphaBeta` and the paragraph
 * boundary is gone. It stays acceptable only because it is transient — the
 * editor mounts only once `generatedCoverLetter` is truthy, so its content
 * always starts as `<p>` elements, and only an edit that erases every one of
 * them (select-all, delete, retype) can reach this branch at all.
 */
export function joinEditorParagraphs(
  paragraphTexts: readonly string[],
  fallbackText: string
): string {
  if (paragraphTexts.length === 0) return fallbackText

  return paragraphTexts.filter((text) => text.trim().length > 0).join('\n\n')
}

/**
 * Converts plain cover-letter text into the paragraph markup rendered by the
 * contentEditable editor.
 *
 * Paragraphs are separated by one or more blank lines; whitespace-only
 * paragraphs are dropped and each remaining paragraph is trimmed. The text is
 * escaped before it is wrapped because it comes from AI output and user edits,
 * both untrusted, and the result is assigned to `innerHTML`. Only the `<p>`
 * wrappers added here are ever real markup.
 *
 * Returns an empty string when there is no non-blank paragraph.
 */
export function plainTextToEditorHtml(text: string): string {
  return splitPlainTextIntoParagraphs(text)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('')
}

/**
 * Reads the editor's current DOM back into the canonical plain text.
 *
 * Kept deliberately thin: it only crosses the DOM boundary and delegates every
 * decision to {@link joinEditorParagraphs}, which the unit suite covers — that
 * suite runs in a Node environment with no DOM.
 */
export function editorHtmlToPlainText(root: HTMLElement): string {
  const paragraphTexts = Array.from(root.querySelectorAll('p'), (p) => p.textContent ?? '')

  return joinEditorParagraphs(paragraphTexts, root.textContent ?? '')
}
