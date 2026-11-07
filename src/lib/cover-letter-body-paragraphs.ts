import type { CoverLetter } from '@/types/database'

/**
 * The body paragraphs a letter prints: the stored JSON array's strings, in
 * order. `body_paragraphs` is a JSON column the editor writes directly, so a
 * malformed row (not an array, or an item that is not a string) prints what it
 * can rather than failing the export. The one filter the letter's parts, the
 * PDF renderer's sanitizing step and the PDF guard share, so all of them see
 * the same paragraphs.
 *
 * A module of its own, importing nothing at runtime: the Swiss letter's
 * description, the PDF markup builder and the field limits all need it, and
 * the builder imports the description, so living in either of them would make
 * an import cycle.
 */
export function coverLetterBodyParagraphs(bodyParagraphs: CoverLetter['body_paragraphs']): string[] {
  if (!Array.isArray(bodyParagraphs)) return []
  return bodyParagraphs.filter((paragraph): paragraph is string => typeof paragraph === 'string')
}
