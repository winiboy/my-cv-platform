/**
 * Paragraph alignment in the rich-text editor, as in Word: left, center,
 * right or justify, applied to the paragraph(s) under the cursor or selection.
 *
 * The alignment is not stored anywhere of its own. The browser's `justify*`
 * editing commands write it as `text-align` on the paragraph's block element
 * (`<p>`, `<div>`, `<li>`), and the field's HTML carries it to the previews,
 * the PDF and the Word file (cover-letter-alignment-and-job-banner, FR-1/FR-2).
 * The values here are the only ones `sanitizeRichHtml` keeps.
 */

export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const

export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number]

export type JustifyCommand = 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'justifyFull'

/** The `document.execCommand` / `queryCommandState` command for each alignment. */
export const ALIGNMENT_COMMANDS: Readonly<Record<TextAlignment, JustifyCommand>> = {
  left: 'justifyLeft',
  center: 'justifyCenter',
  right: 'justifyRight',
  justify: 'justifyFull',
}

/**
 * The alignment of the paragraph holding the cursor, read through the
 * browser's command state; a paragraph with no alignment of its own reports
 * left. For a selection whose paragraphs disagree, what the commands report
 * depends on the browser and platform (Chromium may report the alignment of
 * the selection's start); left is the fallback only when no command reports
 * true.
 */
export function resolveActiveAlignment(isCommandActive: (command: JustifyCommand) => boolean): TextAlignment {
  return TEXT_ALIGNMENTS.find((alignment) => isCommandActive(ALIGNMENT_COMMANDS[alignment])) ?? 'left'
}
