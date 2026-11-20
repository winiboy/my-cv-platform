import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import { TEMPLATE_OPTIONS } from '@/components/dashboard/template-picker'

/**
 * `common.json -> resumes.templates` is the only source of template names and
 * descriptions. The template picker throws on a missing entry rather than
 * falling back to English, so every locale must carry every offered template.
 */

const LOCALES = { fr, en, de, it: it_ } as const

describe('resumes.templates locale parity', () => {
  for (const [locale, dict] of Object.entries(LOCALES)) {
    for (const { id } of TEMPLATE_OPTIONS) {
      it(`${locale} names and describes ${id}`, () => {
        const templates = dict.resumes.templates as Record<string, unknown>

        expect(typeof templates[id]).toBe('string')
        expect((templates[id] as string).trim()).not.toBe('')
        expect(typeof templates[`${id}Desc`]).toBe('string')
        expect((templates[`${id}Desc`] as string).trim()).not.toBe('')
      })
    }
  }

  it('does not show the English name for Professional in another locale', () => {
    expect(fr.resumes.templates.professional).not.toBe(en.resumes.templates.professional)
    expect(de.resumes.templates.professional).not.toBe(en.resumes.templates.professional)
    expect(it_.resumes.templates.professional).not.toBe(en.resumes.templates.professional)
  })

  it('names the vocational template after the Swiss qualification of each language', () => {
    expect(fr.resumes.templates.swissVocational).toBe('Formation professionnelle (CFC)')
    expect(en.resumes.templates.swissVocational).toBe('Vocational training (VET)')
    expect(de.resumes.templates.swissVocational).toBe('Berufslehre (EFZ)')
    expect(it_.resumes.templates.swissVocational).toBe('Formazione professionale (AFC)')
  })

  it('names the commerce template as the swiss-cv-templates PRD does', () => {
    expect(fr.resumes.templates.swissCommerce).toBe('Commerce & administration')
    expect(en.resumes.templates.swissCommerce).toBe('Business & administration')
    expect(de.resumes.templates.swissCommerce).toBe('Kaufmännisch & Verwaltung')
    expect(it_.resumes.templates.swissCommerce).toBe('Commercio e amministrazione')
  })
})
