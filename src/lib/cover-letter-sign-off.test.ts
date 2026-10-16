import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import {
  SIGN_OFF_OPTION_KEYS,
  localizedSignOffOptions,
  signOffOptionsFor,
} from './cover-letter-sign-off'

const LOCALES = { en, fr, de, it: it_ } as const

function optionsOf(dict: typeof en): string[] {
  return localizedSignOffOptions(dict.coverLetters.editor.signature.signOffOptions)
}

describe('cover-letter sign-off options', () => {
  it('keeps the English options and their order exactly as before', () => {
    expect(optionsOf(en)).toEqual([
      'Sincerely,',
      'Best regards,',
      'Kind regards,',
      'Yours faithfully,',
      'Respectfully,',
      'With appreciation,',
    ])
  })

  for (const [locale, dict] of Object.entries(LOCALES)) {
    it(`${locale} offers one distinct label per option key`, () => {
      const options = optionsOf(dict)
      expect(options).toHaveLength(SIGN_OFF_OPTION_KEYS.length)
      expect(new Set(options).size).toBe(options.length)
    })
  }

  it('offers French sign-offs in French', () => {
    expect(optionsOf(fr)).toContain('Cordialement,')
    expect(optionsOf(fr)).toContain('Bien à vous,')
    expect(optionsOf(fr)).not.toContain('Sincerely,')
  })

  it('skips a missing or empty label instead of rendering a blank option', () => {
    expect(localizedSignOffOptions({ sincerely: 'A', bestRegards: '', kindRegards: 3 })).toEqual(['A'])
  })
})

describe('signOffOptionsFor', () => {
  const localized = ['Cordialement,', 'Bien à vous,']

  it('leaves the list unchanged when the stored sign-off is one of its options', () => {
    expect(signOffOptionsFor(localized, 'Bien à vous,')).toEqual(localized)
  })

  it('prepends a stored sign-off the list does not offer, so it stays selected', () => {
    expect(signOffOptionsFor(localized, 'Sincerely,')).toEqual([
      'Sincerely,',
      'Cordialement,',
      'Bien à vous,',
    ])
  })

  it('does not mutate the localized list', () => {
    const input = [...localized]
    signOffOptionsFor(input, 'Sincerely,')
    expect(input).toEqual(localized)
  })
})
