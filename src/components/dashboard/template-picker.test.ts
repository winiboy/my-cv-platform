import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import type { Locale } from '@/lib/i18n'
import { swissItHeading } from '@/lib/swiss-it-template'
import { RESUME_TEMPLATES } from '@/lib/resume-templates'
import type { ResumeTemplate } from '@/types/database'
import {
  TEMPLATE_OPTIONS,
  TemplatePicker,
  TemplateThumbnailPage,
  templateIdForKey,
} from '@/components/dashboard/template-picker'

/**
 * The shared template picker, rendered with `react-dom/server` in node.
 *
 * Rendering in node is part of the subject: the page that hosts the picker is
 * server-rendered, and a template that reached for `document` would fail here
 * exactly as it would fail the server render.
 */

const DICTS: Record<Locale, Record<string, unknown>> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]
/** The ten Swiss templates, in the order they were built and are offered. */
const EXPECTED_ORDER: ResumeTemplate[] = ['swissVocational', 'swissCommerce', 'swissTrades', 'swissHealth', 'swissFinance', 'swissEngineering', 'swissIt', 'swissExecutive', 'swissAcademic', 'swissFirstJob']

const EXPECTED_NAMES: Record<Locale, string[]> = {
  fr: ['Formation professionnelle (CFC)', 'Commerce & administration', 'Métiers techniques & manuels', 'Santé & social', 'Banque, finance & assurance', 'Ingénierie & technique', 'Informatique & IT', 'Cadre & direction', 'Académique & recherche', 'Premier emploi'],
  en: ['Vocational training (VET)', 'Business & administration', 'Technical & skilled trades', 'Health & social care', 'Banking, finance & insurance', 'Engineering', 'IT & software', 'Executive & management', 'Academic & research', 'First job'],
  de: ['Berufslehre (EFZ)', 'Kaufmännisch & Verwaltung', 'Technische & handwerkliche Berufe', 'Gesundheit & Soziales', 'Bank, Finanzen & Versicherung', 'Ingenieurwesen & Technik', 'Informatik & IT', 'Kader & Geschäftsleitung', 'Akademisch & Forschung', 'Erste Stelle'],
  it: ['Formazione professionale (AFC)', 'Commercio e amministrazione', 'Mestieri tecnici e manuali', 'Sanità e sociale', 'Banca, finanza e assicurazioni', 'Ingegneria e tecnica', 'Informatica e IT', 'Quadri e direzione', 'Accademico e ricerca', 'Primo impiego'],
}

interface RenderedRadio {
  template: string | undefined
  checked: string | undefined
  tabIndex: string | undefined
  labelledBy: string | undefined
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

function decode(text: string): string {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function renderPicker(locale: Locale, value: ResumeTemplate, disabled = false): string {
  return renderToStaticMarkup(
    createElement(TemplatePicker, {
      value,
      onChange: () => {},
      disabled,
      labelledBy: 'picker-label',
      locale,
      dict: DICTS[locale],
    })
  )
}

function radios(html: string): RenderedRadio[] {
  return [...html.matchAll(/<div[^>]*\srole="radio"[^>]*>/g)].map(([tag]) => ({
    template: attribute(tag, 'data-template'),
    checked: attribute(tag, 'aria-checked'),
    tabIndex: attribute(tag, 'tabindex'),
    labelledBy: attribute(tag, 'aria-labelledby'),
  }))
}

function textOfId(html: string, id: string): string | undefined {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`<span id="${escaped}"[^>]*>([^<]*)</span>`).exec(html)
  return match ? decode(match[1]) : undefined
}

function thumbnailTags(html: string): string[] {
  return [...html.matchAll(/<div[^>]*data-testid="template-thumbnail"[^>]*>/g)].map(([tag]) => tag)
}

/**
 * The editing affordances a template draws only when given a setter or
 * callback: resize handles, sliders, the photo upload, editable areas.
 *
 * Content links are not in this list: a template may draw its email as a
 * `mailto:` link whatever props it receives; inside the picker they are
 * neutralised by the `inert` window, which the e2e proves in a browser.
 */
const EDIT_AFFORDANCES = [
  /<button[\s>]/,
  /<input[\s>]/,
  /<select[\s>]/,
  /<textarea[\s>]/,
  /\stabindex="(?!-)[^"]*"/,
  /contenteditable="(?!false)[^"]*"/,
  /\srole="button"/,
  /cursor-(ew|ns)-resize/,
]

describe('TemplatePicker', () => {
  for (const locale of LOCALES) {
    it(`renders the offered templates in order with their ${locale} names`, () => {
      const html = renderPicker(locale, 'swissCommerce')
      const rendered = radios(html)

      expect(rendered.map((radio) => radio.template)).toEqual(EXPECTED_ORDER)
      expect(rendered.map((radio) => textOfId(html, radio.labelledBy ?? ''))).toEqual(EXPECTED_NAMES[locale])
    })
  }

  it('is a radio group labelled by the element the caller names', () => {
    const html = renderPicker('en', 'swissCommerce')

    expect(html).toMatch(/^<div role="radiogroup" aria-labelledby="picker-label"/)
  })

  it('declares the offered template ids in order', () => {
    expect(TEMPLATE_OPTIONS.map((option) => option.id)).toEqual(EXPECTED_ORDER)
  })

  it('offers exactly the ten templates the schema accepts (migration 012), in their list order', () => {
    expect(TEMPLATE_OPTIONS.map((option) => option.id)).toEqual([...RESUME_TEMPLATES])
    expect(radios(renderPicker('fr', 'swissCommerce')).map((radio) => radio.template)).toEqual(EXPECTED_ORDER)
  })

  for (const value of EXPECTED_ORDER) {
    it(`checks only "${value}" when the caller selects it, and makes it the one tab stop`, () => {
      const rendered = radios(renderPicker('fr', value))

      expect(rendered.filter((radio) => radio.checked === 'true').map((radio) => radio.template)).toEqual([value])
      expect(rendered.filter((radio) => radio.checked === 'false')).toHaveLength(EXPECTED_ORDER.length - 1)
      expect(rendered.filter((radio) => radio.tabIndex === '0').map((radio) => radio.template)).toEqual([value])
    })
  }

  it('takes every option out of the tab order and marks it disabled while disabled', () => {
    const html = renderPicker('en', 'swissFinance', true)
    const tags = [...html.matchAll(/<div[^>]*\srole="radio"[^>]*>/g)].map(([tag]) => tag)

    expect(tags).toHaveLength(EXPECTED_ORDER.length)
    for (const tag of tags) {
      expect(attribute(tag, 'tabindex')).toBe('-1')
      expect(attribute(tag, 'aria-disabled')).toBe('true')
    }
  })

  it('wraps every thumbnail in a window hidden from assistive technology and inert', () => {
    const tags = thumbnailTags(renderPicker('en', 'swissCommerce'))

    expect(tags.map((tag) => attribute(tag, 'data-template'))).toEqual(EXPECTED_ORDER)
    for (const tag of tags) {
      expect(attribute(tag, 'aria-hidden')).toBe('true')
      expect(tag).toMatch(/\sinert=""/)
      expect(tag).toMatch(/pointer-events-none/)
    }
  })

  it('throws instead of showing another language when a template name is missing', () => {
    const resumes = en.resumes as Record<string, unknown>
    const templates = { ...(resumes.templates as Record<string, string>) }
    delete templates.swissTrades
    const dict = { ...en, resumes: { ...resumes, templates } }

    expect(() =>
      renderToStaticMarkup(
        createElement(TemplatePicker, {
          value: 'swissCommerce',
          onChange: () => {},
          labelledBy: 'picker-label',
          locale: 'en',
          dict,
        })
      )
    ).toThrow(/swissTrades/)
  })
})

describe('TemplateThumbnailPage', () => {
  // Control: the patterns do detect an affordance as React renders it, so their
  // absence below is not a pattern that can never match. No template draws one:
  // `ResumePreview`, which the thumbnails use, accepts no setter at all
  // (swiss-cv-templates FR-13).
  it('would detect a slider or a resize handle in the rendered markup', () => {
    const slider = renderToStaticMarkup(createElement('input', { type: 'range' }))
    const handle = renderToStaticMarkup(createElement('div', { className: 'cursor-ew-resize' }))

    expect(EDIT_AFFORDANCES.some((pattern) => pattern.test(slider))).toBe(true)
    expect(EDIT_AFFORDANCES.some((pattern) => pattern.test(handle))).toBe(true)
  })

  for (const locale of LOCALES) {
    for (const template of EXPECTED_ORDER) {
      it(`renders ${template} in node in ${locale} with no editing affordance and localized headings`, () => {
        const html = renderToStaticMarkup(
          createElement(TemplateThumbnailPage, { templateId: template, locale, dict: DICTS[locale] })
        )

        expect(html).toContain('data-testid="resume-document"')
        // The sample's first employer: drawn by every template.
        expect(html).toContain('Northwind Systems')
        for (const pattern of EDIT_AFFORDANCES) {
          expect(html).not.toMatch(pattern)
        }

        const resumes = DICTS[locale].resumes as { editor: { sections: Record<string, string> } }
        // swissIt draws its headings as the mockup does, "// label" in lower case.
        const education = resumes.editor.sections.education
        expect(decode(html)).toContain(template === 'swissIt' ? swissItHeading(education, locale) : education)
      })
    }
  }
})

describe('templateIdForKey', () => {
  it('moves forward with ArrowRight and ArrowDown, wrapping from the last option', () => {
    expect(templateIdForKey('swissVocational', 'ArrowDown')).toBe('swissCommerce')
    expect(templateIdForKey('swissVocational', 'ArrowRight')).toBe('swissCommerce')
    expect(templateIdForKey('swissCommerce', 'ArrowRight')).toBe('swissTrades')
    expect(templateIdForKey('swissTrades', 'ArrowRight')).toBe('swissHealth')
    expect(templateIdForKey('swissHealth', 'ArrowRight')).toBe('swissFinance')
    expect(templateIdForKey('swissFinance', 'ArrowRight')).toBe('swissEngineering')
    expect(templateIdForKey('swissEngineering', 'ArrowRight')).toBe('swissIt')
    expect(templateIdForKey('swissIt', 'ArrowRight')).toBe('swissExecutive')
    expect(templateIdForKey('swissExecutive', 'ArrowRight')).toBe('swissAcademic')
    expect(templateIdForKey('swissAcademic', 'ArrowRight')).toBe('swissFirstJob')
    expect(templateIdForKey('swissFirstJob', 'ArrowRight')).toBe('swissVocational')
  })

  it('moves back with ArrowLeft and ArrowUp, wrapping from the first option', () => {
    expect(templateIdForKey('swissVocational', 'ArrowUp')).toBe('swissFirstJob')
    expect(templateIdForKey('swissFirstJob', 'ArrowLeft')).toBe('swissAcademic')
    expect(templateIdForKey('swissAcademic', 'ArrowLeft')).toBe('swissExecutive')
    expect(templateIdForKey('swissExecutive', 'ArrowLeft')).toBe('swissIt')
    expect(templateIdForKey('swissIt', 'ArrowLeft')).toBe('swissEngineering')
    expect(templateIdForKey('swissEngineering', 'ArrowLeft')).toBe('swissFinance')
    expect(templateIdForKey('swissFinance', 'ArrowLeft')).toBe('swissHealth')
    expect(templateIdForKey('swissHealth', 'ArrowLeft')).toBe('swissTrades')
    expect(templateIdForKey('swissTrades', 'ArrowLeft')).toBe('swissCommerce')
    expect(templateIdForKey('swissCommerce', 'ArrowLeft')).toBe('swissVocational')
    expect(templateIdForKey('swissVocational', 'ArrowLeft')).toBe('swissFirstJob')
  })

  it('jumps to the ends with Home and End', () => {
    expect(templateIdForKey('swissHealth', 'Home')).toBe('swissVocational')
    expect(templateIdForKey('swissHealth', 'End')).toBe('swissFirstJob')
  })

  it('ignores keys that do not move the selection', () => {
    expect(templateIdForKey('swissHealth', 'Tab')).toBeNull()
    expect(templateIdForKey('swissHealth', 'a')).toBeNull()
  })
})
