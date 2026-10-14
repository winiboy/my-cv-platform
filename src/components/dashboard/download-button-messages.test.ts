import { describe, expect, it } from 'vitest'
import de from '@/locales/de/common.json'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import it_ from '@/locales/it/common.json'

/**
 * The PDF button's copy is passed from `resumes.*` without an English fallback,
 * so every locale must hold every key, and none may hold another's text.
 */
const LOCALES = { fr, en, de, it: it_ } as const
const KEYS = ['generatingPDF', 'pdfDownloadError', 'pdfPhotoTooLarge', 'pdfPhotoUnsupported'] as const

describe('PDF download button copy', () => {
  for (const [locale, dict] of Object.entries(LOCALES)) {
    it(`exists in ${locale}`, () => {
      for (const key of KEYS) {
        const value: string = dict.resumes[key]
        expect(value.trim().length, `${locale} resumes.${key}`).toBeGreaterThan(0)
      }
    })
  }

  it('is translated, not copied, in each locale', () => {
    for (const key of KEYS) {
      const values = Object.values(LOCALES).map((dict) => dict.resumes[key])
      expect(new Set(values).size, `resumes.${key}`).toBe(values.length)
    }
  })
})
