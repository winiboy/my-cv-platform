/**
 * What a page that does not otherwise load the `common` dictionary must hand a
 * `TemplatePicker`: the visible label of the group and the part of `common`
 * the picker and the five templates read.
 */
export interface TemplatePickerStrings {
  /** Visible label of the picker group (`common.json -> resumes.new.templateLabel`). */
  label: string
  /** A `common`-shaped dictionary holding only the keys listed in `PICKER_RESUME_KEYS`. */
  dict: Record<string, unknown>
}

/**
 * The `common.json -> resumes` entries the picker and the thumbnails read:
 * `templates` for the option names and descriptions, and `editor`, `template`
 * and `levels` for what the five templates draw (section headings, "present"
 * in date ranges, language levels).
 *
 * A template that starts reading another `resumes` key must have it added
 * here; the equivalence test beside this module renders every template in
 * every locale with this subset and with the whole dictionary, and fails when
 * the two differ.
 */
const PICKER_RESUME_KEYS = ['templates', 'editor', 'template', 'levels'] as const

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

/**
 * Select, on the server, the strings a `TemplatePicker` needs from a locale's
 * `common` dictionary, so a client surface receives about a fifth of the
 * dictionary instead of all of it.
 *
 * A missing label is a translation defect, so it throws rather than letting a
 * surface fall back to another language.
 */
export function templatePickerStrings(common: Record<string, unknown>): TemplatePickerStrings {
  const resumes = asRecord(common.resumes)
  const label = asRecord(resumes?.new)?.templateLabel

  if (!resumes || typeof label !== 'string' || label === '') {
    throw new Error('Missing translation common.json resumes.new.templateLabel')
  }

  const picked: Record<string, unknown> = {}
  for (const key of PICKER_RESUME_KEYS) {
    if (key in resumes) picked[key] = resumes[key]
  }

  return { label, dict: { resumes: picked } }
}
