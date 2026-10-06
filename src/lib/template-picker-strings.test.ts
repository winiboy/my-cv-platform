import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import type { Locale } from '@/lib/i18n'
import { TemplatePicker, TemplateThumbnailPage, TEMPLATE_OPTIONS } from '@/components/dashboard/template-picker'
import { templatePickerStrings } from '@/lib/template-picker-strings'

/**
 * The Job Search page hands its template picker a subset of `common` rather
 * than the whole dictionary. These tests hold that subset to one property:
 * the picker and every thumbnail render exactly as they do with the whole
 * dictionary, in every locale.
 */

const DICTS: Record<Locale, Record<string, unknown>> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]

const EXPECTED_LABELS: Record<Locale, string> = {
  fr: 'Choisir un modèle',
  en: 'Choose Template',
  de: 'Vorlage wählen',
  it: 'Scegli modello',
}

describe('templatePickerStrings', () => {
  for (const locale of LOCALES) {
    it(`carries the ${locale} group label`, () => {
      expect(templatePickerStrings(DICTS[locale]).label).toBe(EXPECTED_LABELS[locale])
    })

    for (const { id } of TEMPLATE_OPTIONS) {
      it(`draws the ${id} thumbnail in ${locale} exactly as the whole dictionary does`, () => {
        const { dict } = templatePickerStrings(DICTS[locale])
        const render = (source: Record<string, unknown>) =>
          renderToStaticMarkup(createElement(TemplateThumbnailPage, { templateId: id, locale, dict: source }))

        expect(render(dict)).toBe(render(DICTS[locale]))
      })
    }

    it(`renders the ${locale} picker exactly as the whole dictionary does`, () => {
      const { dict } = templatePickerStrings(DICTS[locale])
      const render = (source: Record<string, unknown>) =>
        renderToStaticMarkup(
          createElement(TemplatePicker, {
            value: 'professional',
            onChange: () => {},
            labelledBy: 'picker-label',
            locale,
            dict: source,
          })
        )

      expect(render(dict)).toBe(render(DICTS[locale]))
    })
  }

  // Control: the comparison above does see a key the templates need going
  // missing, so its passing is not a comparison that can never fail.
  it('would see the difference if the section headings were left out', () => {
    const { dict } = templatePickerStrings(fr)
    const withoutEditor = Object.fromEntries(
      Object.entries(dict.resumes as Record<string, unknown>).filter(([key]) => key !== 'editor')
    )
    const render = (source: Record<string, unknown>) =>
      renderToStaticMarkup(createElement(TemplateThumbnailPage, { templateId: 'classic', locale: 'fr', dict: source }))

    expect(render({ resumes: withoutEditor })).not.toBe(render(fr))
  })

  it('keeps only the resumes entries the picker and the templates read', () => {
    const { dict } = templatePickerStrings(fr)

    expect(Object.keys(dict)).toEqual(['resumes'])
    expect(Object.keys(dict.resumes as Record<string, unknown>).sort()).toEqual(['editor', 'template', 'templates'])
    expect(JSON.stringify(dict).length).toBeLessThan(JSON.stringify(fr).length / 2)
  })

  it('throws instead of falling back to another language when the label is missing', () => {
    const resumes = en.resumes as Record<string, unknown>
    const withoutLabel = { ...en, resumes: { ...resumes, new: { ...(resumes.new as Record<string, unknown>), templateLabel: '' } } }

    expect(() => templatePickerStrings(withoutLabel)).toThrow(/templateLabel/)
    expect(() => templatePickerStrings({})).toThrow(/templateLabel/)
  })
})
