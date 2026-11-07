import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import {
  DEFAULT_SIGN_OFF_OPTION,
  SIGN_OFF_OPTION_KEYS,
  localizedSignOffOptions,
  signOffOptionsFor,
} from './cover-letter-sign-off'
import { COVER_LETTER_WORDING } from './cover-letter-language'

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
  const DEFAULT = 'Meilleures salutations'

  it('offers the language default first, then the list, when the stored sign-off is one of its options', () => {
    expect(signOffOptionsFor(localized, 'Bien à vous,', DEFAULT)).toEqual([DEFAULT_SIGN_OFF_OPTION, ...localized])
  })

  it('offers the language default once, selected, when the stored sign-off is empty', () => {
    expect(DEFAULT_SIGN_OFF_OPTION).toBe('')
    const options = signOffOptionsFor(localized, '', DEFAULT)
    expect(options).toEqual(['', 'Cordialement,', 'Bien à vous,'])
    expect(options.filter((option) => option === '')).toHaveLength(1)
  })

  it('keeps a stored sign-off the list does not offer after the default, so it stays selected', () => {
    expect(signOffOptionsFor(localized, 'Sincerely,', DEFAULT)).toEqual([
      '',
      'Sincerely,',
      'Cordialement,',
      'Bien à vous,',
    ])
  })

  it('leaves out the option that is the default with a trailing comma (fr)', () => {
    expect(signOffOptionsFor(['Cordialement,', 'Meilleures salutations,'], '', 'Meilleures salutations')).toEqual([
      '',
      'Cordialement,',
    ])
  })

  it('leaves out the option that is the default spelt with "ß" (de)', () => {
    expect(signOffOptionsFor(['Beste Grüße', 'Freundliche Grüße'], '', 'Freundliche Grüsse')).toEqual([
      '',
      'Beste Grüße',
    ])
  })

  it('keeps a stored legacy value equal to a left-out option, shown as written', () => {
    expect(signOffOptionsFor(['Beste Grüße', 'Freundliche Grüße'], 'Freundliche Grüße', 'Freundliche Grüsse')).toEqual([
      '',
      'Freundliche Grüße',
      'Beste Grüße',
    ])
  })

  for (const [locale, dict] of Object.entries(LOCALES)) {
    it(`${locale} offers its default once on a fresh letter`, () => {
      const defaultSignOff = COVER_LETTER_WORDING[locale as keyof typeof LOCALES].defaultSignOff
      const options = signOffOptionsFor(optionsOf(dict), '', defaultSignOff)
      expect(options[0]).toBe('')
      expect(options).toHaveLength(SIGN_OFF_OPTION_KEYS.length)
      const key = (option: string) => option.replace(/,$/, '').toLowerCase().replace(/ß/g, 'ss')
      expect(options.slice(1).map(key)).not.toContain(key(defaultSignOff))
    })
  }

  it('does not mutate the localized list', () => {
    const input = [...localized]
    signOffOptionsFor(input, 'Sincerely,', DEFAULT)
    expect(input).toEqual(localized)
  })
})
