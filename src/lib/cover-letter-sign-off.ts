/**
 * Sign-off choices offered by the cover-letter editor.
 *
 * The labels live in `common.json -> coverLetters.editor.signature.signOffOptions`
 * under these keys; this list fixes their order in the select.
 */
export const SIGN_OFF_OPTION_KEYS = [
  'sincerely',
  'bestRegards',
  'kindRegards',
  'yoursFaithfully',
  'respectfully',
  'withAppreciation',
] as const

export type SignOffOptionKey = (typeof SIGN_OFF_OPTION_KEYS)[number]

/** The localized sign-off labels, in `SIGN_OFF_OPTION_KEYS` order, skipping any that are missing. */
export function localizedSignOffOptions(optionsDict: Record<string, unknown>): string[] {
  return SIGN_OFF_OPTION_KEYS.map((key) => optionsDict[key]).filter(
    (value): value is string => typeof value === 'string' && value !== '',
  )
}

/**
 * The option value of the language default: an empty sign-off, which the
 * letter prints as its language's default (`COVER_LETTER_WORDING`).
 */
export const DEFAULT_SIGN_OFF_OPTION = ''

/**
 * A sign-off reduced to what tells two closings apart: no trailing comma, no
 * case, and Swiss "ss" for "ß", so "Freundliche Grüße" is "Freundliche Grüsse".
 */
function closingKey(signOff: string): string {
  return signOff.trim().replace(/,$/, '').trim().toLocaleLowerCase().replace(/ß/g, 'ss')
}

/**
 * The options the select renders for a letter whose stored sign-off is
 * `stored`, in a letter whose language prints `defaultSignOff` for an empty one.
 *
 * The language default comes first, always, so it can be picked again after
 * another sign-off. A localized option that is the same closing as the
 * default (`closingKey`) is left out, so the list never offers it twice.
 *
 * A stored sign-off is user content: it may be from another language (letters
 * created with the English default, or written by the AI in the letter's
 * language) or from an older option list. A `<select>` whose value matches no
 * option displays its first option instead, so the stored value is added
 * after the default when absent — otherwise the editor would show one
 * sign-off while the letter keeps another.
 */
export function signOffOptionsFor(
  localized: readonly string[],
  stored: string,
  defaultSignOff: string,
): string[] {
  const defaultKey = closingKey(defaultSignOff)
  const offered = localized.filter((option) => closingKey(option) !== defaultKey)
  const kept = stored === DEFAULT_SIGN_OFF_OPTION || offered.includes(stored) ? [] : [stored]
  return [DEFAULT_SIGN_OFF_OPTION, ...kept, ...offered]
}
