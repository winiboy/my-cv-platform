/**
 * The words a resume template draws that are not resume content and not a
 * section heading: the "present" end of a date range and Modern's contact
 * labels.
 *
 * The Preview templates (and therefore PDF, which prints them) and the Word
 * generators read them here, from the locale's `common` dictionary, so the
 * three outputs cannot spell the same word differently.
 *
 * A missing entry is a translation defect, so it throws instead of falling back
 * to another language; `resume-template-strings.test.ts` checks every locale.
 */

/** The `common.json -> resumes.editor` keys Modern labels its contact entries with. */
export const CONTACT_LABEL_KEYS = ['phone', 'email', 'website', 'linkedin', 'github', 'location'] as const

export type ContactLabelKey = (typeof CONTACT_LABEL_KEYS)[number]

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function translation(dict: unknown, path: readonly string[]): string {
  let value: unknown = dict
  for (const key of path) value = asRecord(value)?.[key]
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Missing translation common.json ${path.join('.')}`)
  }
  return value
}

/** The end of a date range for a current role or an open entry (`resumes.template.present`). */
export function presentLabel(dict: unknown): string {
  return translation(dict, ['resumes', 'template', 'present'])
}

/** A Modern contact entry's label (`resumes.editor.<key>`), before the uppercase transform both outputs apply. */
export function contactLabel(dict: unknown, key: ContactLabelKey): string {
  return translation(dict, ['resumes', 'editor', key])
}
