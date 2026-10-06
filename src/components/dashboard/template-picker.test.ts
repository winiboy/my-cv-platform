import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import type { Locale } from '@/lib/i18n'
import { TEMPLATE_SAMPLE_RESUME } from '@/lib/template-sample-resume'
import { ResumePreview } from '@/components/dashboard/resume-preview'
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
const EXPECTED_ORDER: ResumeTemplate[] = ['modern', 'classic', 'minimal', 'creative', 'professional']

const EXPECTED_NAMES: Record<Locale, string[]> = {
  fr: ['Moderne', 'Classique', 'Minimaliste', 'Créatif', 'Professionnel'],
  en: ['Modern', 'Classic', 'Minimal', 'Creative', 'Professional'],
  de: ['Modern', 'Klassisch', 'Minimal', 'Kreativ', 'Professionell'],
  it: ['Moderno', 'Classico', 'Minimale', 'Creativo', 'Professionale'],
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
 * Content links are not in this list. Professional, for one, draws its email
 * as a `mailto:` link whatever props it receives; inside the picker they are
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
    it(`renders the five templates in order with their ${locale} names`, () => {
      const html = renderPicker(locale, 'modern')
      const rendered = radios(html)

      expect(rendered.map((radio) => radio.template)).toEqual(EXPECTED_ORDER)
      expect(rendered.map((radio) => textOfId(html, radio.labelledBy ?? ''))).toEqual(EXPECTED_NAMES[locale])
    })
  }

  it('is a radio group labelled by the element the caller names', () => {
    const html = renderPicker('en', 'modern')

    expect(html).toMatch(/^<div role="radiogroup" aria-labelledby="picker-label"/)
  })

  it('declares the five canonical template ids in order', () => {
    expect(TEMPLATE_OPTIONS.map((option) => option.id)).toEqual(EXPECTED_ORDER)
  })

  for (const value of EXPECTED_ORDER) {
    it(`checks only "${value}" when the caller selects it, and makes it the one tab stop`, () => {
      const rendered = radios(renderPicker('fr', value))

      expect(rendered.filter((radio) => radio.checked === 'true').map((radio) => radio.template)).toEqual([value])
      expect(rendered.filter((radio) => radio.checked === 'false')).toHaveLength(4)
      expect(rendered.filter((radio) => radio.tabIndex === '0').map((radio) => radio.template)).toEqual([value])
    })
  }

  it('takes every option out of the tab order and marks it disabled while disabled', () => {
    const html = renderPicker('en', 'classic', true)
    const tags = [...html.matchAll(/<div[^>]*\srole="radio"[^>]*>/g)].map(([tag]) => tag)

    expect(tags).toHaveLength(5)
    for (const tag of tags) {
      expect(attribute(tag, 'tabindex')).toBe('-1')
      expect(attribute(tag, 'aria-disabled')).toBe('true')
    }
  })

  it('wraps every thumbnail in a window hidden from assistive technology and inert', () => {
    const tags = thumbnailTags(renderPicker('en', 'modern'))

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
    delete templates.professional
    const dict = { ...en, resumes: { ...resumes, templates } }

    expect(() =>
      renderToStaticMarkup(
        createElement(TemplatePicker, {
          value: 'modern',
          onChange: () => {},
          labelledBy: 'picker-label',
          locale: 'en',
          dict,
        })
      )
    ).toThrow(/professional/)
  })
})

describe('TemplateThumbnailPage', () => {
  // Control: the patterns do detect an affordance when a setter is passed, so
  // their absence below is not a pattern that can never match.
  it('would detect the resize handle a setter makes a template draw', () => {
    const html = renderToStaticMarkup(
      createElement(ResumePreview, {
        resume: { ...TEMPLATE_SAMPLE_RESUME, template: 'professional' },
        locale: 'en',
        dict: en,
        setSidebarWidth: () => {},
      })
    )

    expect(EDIT_AFFORDANCES.some((pattern) => pattern.test(html))).toBe(true)
  })

  for (const locale of LOCALES) {
    for (const template of EXPECTED_ORDER) {
      it(`renders ${template} in node in ${locale} with no editing affordance and localized headings`, () => {
        const html = renderToStaticMarkup(
          createElement(TemplateThumbnailPage, { templateId: template, locale, dict: DICTS[locale] })
        )

        expect(html).toContain('data-testid="resume-document"')
        // The sample's first employer: drawn by every template, unlike the
        // contact name, which classic, minimal and creative do not draw.
        expect(html).toContain('Northwind Systems')
        for (const pattern of EDIT_AFFORDANCES) {
          expect(html).not.toMatch(pattern)
        }

        const resumes = DICTS[locale].resumes as { editor: { sections: Record<string, string> } }
        expect(decode(html)).toContain(resumes.editor.sections.education)
      })
    }
  }
})

describe('templateIdForKey', () => {
  it('moves forward with ArrowRight and ArrowDown, wrapping from the last option', () => {
    expect(templateIdForKey('modern', 'ArrowRight')).toBe('classic')
    expect(templateIdForKey('creative', 'ArrowDown')).toBe('professional')
    expect(templateIdForKey('professional', 'ArrowRight')).toBe('modern')
  })

  it('moves back with ArrowLeft and ArrowUp, wrapping from the first option', () => {
    expect(templateIdForKey('classic', 'ArrowLeft')).toBe('modern')
    expect(templateIdForKey('modern', 'ArrowUp')).toBe('professional')
  })

  it('jumps to the ends with Home and End', () => {
    expect(templateIdForKey('minimal', 'Home')).toBe('modern')
    expect(templateIdForKey('minimal', 'End')).toBe('professional')
  })

  it('ignores keys that do not move the selection', () => {
    expect(templateIdForKey('minimal', 'Tab')).toBeNull()
    expect(templateIdForKey('minimal', 'a')).toBeNull()
  })
})
