import { escapeHtml } from './escape-html'

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
  return text
    .split(/\n\n+/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join('')
}
