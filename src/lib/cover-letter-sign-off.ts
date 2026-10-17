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
 * The options the select renders for a letter whose stored sign-off is `stored`.
 *
 * A stored sign-off is user content: it may be from another language (letters
 * created with the English default, or written by the AI in the letter's
 * language) or from an older option list. A `<select>` whose value matches no
 * option displays its first option instead, so the stored value is prepended
 * when absent — otherwise the editor would show one sign-off while the letter
 * keeps another.
 */
export function signOffOptionsFor(localized: readonly string[], stored: string): string[] {
  return localized.includes(stored) ? [...localized] : [stored, ...localized]
}
