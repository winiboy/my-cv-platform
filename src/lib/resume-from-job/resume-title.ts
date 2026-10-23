/**
 * The longest title of a CV created from a job application, in UTF-16 code
 * units - the unit of an input's `maxLength`, so the form shows exactly what
 * the route keeps.
 *
 * Equal to `AI_TEXT_LIMITS.SHORT_LABEL`, the limit the route cuts the title to
 * (asserted by a test). Kept here rather than imported because that module
 * pulls in `next/server`, and the form is a client component. A job title can
 * be up to 255 characters, so the pre-filled title is cut to this length.
 */
export const RESUME_TITLE_MAX_LENGTH = 200

/**
 * `text` cut to `RESUME_TITLE_MAX_LENGTH` code units, never leaving half of a
 * surrogate pair at the end.
 */
export function cutResumeTitle(text: string): string {
  if (text.length <= RESUME_TITLE_MAX_LENGTH) return text
  const cut = text.slice(0, RESUME_TITLE_MAX_LENGTH)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}
