import { describe, expect, it } from 'vitest'
import { defaultLocale, getTranslations, locales, toLocale } from './i18n'

describe('toLocale', () => {
  it.each(locales)('returns %s unchanged', (locale) => {
    expect(toLocale(locale)).toBe(locale)
  })

  it.each([
    ['es', 'an unsupported language'],
    ['FR', 'a supported locale in the wrong case'],
    ['fr-CH', 'a regional tag rather than a bare locale'],
    ['', 'an empty segment'],
    ['__proto__', 'a prototype key that must not be treated as a locale'],
    ['constructor', 'an object key that must not be treated as a locale'],
  ])('falls back to the default locale for %s (%s)', (input) => {
    expect(toLocale(input)).toBe(defaultLocale)
  })

  // The point of the fallback: every page narrows its `[locale]` segment with
  // this before indexing the translation tables, so the result must always be a
  // key those tables actually have.
  it.each(['es', 'FR', '', '__proto__'])(
    'returns a locale that getTranslations can resolve, for input %s',
    (input) => {
      expect(getTranslations(toLocale(input), 'common')).toBeDefined()
    }
  )
})
