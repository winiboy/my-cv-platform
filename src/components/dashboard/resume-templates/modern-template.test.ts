import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Resume } from '@/types/database'
import en from '@/locales/en/common.json'
import { ModernTemplate } from '@/components/dashboard/resume-templates/modern-template'
import { mapEditorOrderToModern, parseLayoutModel, type ModernMainId } from '@/lib/layout-settings'

/**
 * Part 3 US-010 and US-013, on the surface each defect was found on: the
 * Preview, server-rendered to a string.
 *
 * Rendering is the subject rather than a convenience. Both fixes live in
 * values the component computes and writes into inline styles and into the
 * order it draws, so the HTML it produces is the direct evidence; neither
 * `deriveAccentColor` nor the main-order fallback is exported, and exporting
 * them to test them would move the contract off the rendered output.
 */

const SUMMARY = 'Summary the main column must draw.'
const POSITION = 'Staff Engineer'

interface ModernProps {
  resume: Resume
  locale: 'en'
  dict: unknown
  sidebarColor?: string
  sidebarWidth?: number
  mainContentOrder?: readonly ModernMainId[]
}

function buildResume(): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Engineering',
    template: 'modern',
    contact: { name: 'Ada Lovelace', email: 'ada@example.test' },
    summary: SUMMARY,
    experience: [
      { company: 'Acme', position: POSITION, startDate: '2020-01', endDate: '2023-01', visible: true },
    ],
    education: [{ school: 'EPFL', degree: 'MSc', field: 'CS', endDate: '2014-06', visible: true }],
    skills: [],
    languages: [],
    certifications: [],
    projects: [],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  } as unknown as Resume
}

function render(props: Omit<ModernProps, 'resume' | 'locale' | 'dict'>): string {
  return renderToString(
    createElement(ModernTemplate as ComponentType<ModernProps>, {
      resume: buildResume(),
      locale: 'en',
      dict: en,
      ...props,
    })
  )
}

/** `DEFAULT_ACCENT_COLOR` in modern-template.tsx: the gold an unusable colour falls back to. */
const GOLD = '#D4A843'

describe('US-013: the accent the Modern Preview derives from the stored colour', () => {
  /**
   * The defect, as the layout model can actually produce it. `NUMERIC_RANGES`
   * constrains hue to [0, 360] and the two percentages to [0, 100] and admits
   * a decimal in each, `sidebarColorFrom` composes them into this string, and
   * the pattern that read it matched integers only - so the accent fell back
   * to gold while docx-modern.ts derived it from the same three numbers.
   *
   * The expected triple is the derivation both surfaces apply: saturation
   * +20 capped at 100, brightness +25 capped at 65, hue unchanged.
   */
  it('derives the accent from a colour whose components are not integers', () => {
    const html = render({ sidebarColor: 'hsl(217.5, 40.5%, 20.5%)' })

    expect(html).toContain('hsl(217.5, 60.5%, 45.5%)')
    expect(html).not.toContain(GOLD)
  })

  it('caps the derived saturation and brightness as the generator does', () => {
    const html = render({ sidebarColor: 'hsl(12.25, 92.5%, 48.75%)' })

    expect(html).toContain('hsl(12.25, 100%, 65%)')
  })

  it('still derives the accent from an integer colour', () => {
    const html = render({ sidebarColor: 'hsl(240, 85%, 35%)' })

    expect(html).toContain('hsl(240, 100%, 60%)')
    expect(html).not.toContain(GOLD)
  })

  /**
   * The fallback is not collateral of the fix: a caller that passes nothing,
   * and one that passes a colour in a syntax this template does not read,
   * both still get the gold. The model admits no negative component, so a
   * signed value did not come from it and takes the fallback too.
   */
  it.each([
    ['no colour at all', undefined],
    ['a keyword', 'rebeccapurple'],
    ['a hex literal', '#123456'],
    ['a negative hue', 'hsl(-30, 40%, 20%)'],
    ['a percentage without its sign', 'hsl(217.5, 40.5, 20.5)'],
  ])('falls back to the default accent for %s', (_label, sidebarColor) => {
    const html = render({ sidebarColor })

    expect(html).toContain(GOLD)
  })
})

describe('US-010: a Modern main order that maps to nothing', () => {
  /**
   * The reachable input, walked through the two steps that produce it rather
   * than asserted as a bare empty array: `['education']` is a valid stored
   * main order - the editor's main column owns education - and it survives
   * `parseLayoutModel`, then loses its only member to `mapEditorOrderToModern`
   * because Modern draws education in the sidebar.
   */
  it('reaches the template as an empty order', () => {
    const model = parseLayoutModel({ mainContentOrder: ['education'] })
    expect(model.mainContentOrder).toEqual(['education'])

    const { modernMainOrder } = mapEditorOrderToModern([], model.mainContentOrder!, [], [])
    expect(modernMainOrder).toEqual([])
  })

  it('draws the default sections rather than an empty main column', () => {
    const { modernMainOrder } = mapEditorOrderToModern([], ['education'], [], [])
    const html = render({ mainContentOrder: modernMainOrder })

    expect(html).toContain(SUMMARY)
    expect(html).toContain(POSITION)
  })

  /** Hiding every main section is a choice the editor can express, and it still empties the column. */
  it('does not resurrect sections the user hid', () => {
    const html = renderToString(
      createElement(ModernTemplate as ComponentType<ModernProps & { hiddenMainSections: readonly ModernMainId[] }>, {
        resume: buildResume(),
        locale: 'en',
        dict: en,
        mainContentOrder: [],
        hiddenMainSections: ['summary', 'experience'],
      })
    )

    expect(html).not.toContain(SUMMARY)
    expect(html).not.toContain(POSITION)
  })
})

describe('modern-print-sidebar-full-page US-001: the print band takes the sidebar colour and width', () => {
  /**
   * `globals.css` paints the band on `html:has(.modern-template)` and cannot
   * read the layout model, so the colour and width reach it as custom
   * properties this template declares on `html`, in the server render. What
   * the band looks like on paper is the e2e suite's subject
   * (`e2e/modern-print-sidebar-full-page.spec.ts`); asserted here is that the
   * values leave the template in a form a stylesheet can take, and only then.
   */
  const declaration = (color: string, widthPx: number) =>
    `html:has(.modern-template){--modern-print-sidebar-color:${color};--modern-print-sidebar-width:${widthPx}px}`

  it('marks the document as Modern, which the print rule is gated on', () => {
    expect(render({})).toMatch(/data-testid="resume-document" class="modern-template /)
  })

  it('declares the stored colour and the sidebar width as px of the 794px page', () => {
    const html = render({ sidebarColor: 'hsl(150, 60%, 28%)', sidebarWidth: 42 })

    expect(html).toContain(declaration('hsl(150, 60%, 28%)', 333.48))
  })

  it('accepts decimal components and a decimal width', () => {
    const html = render({ sidebarColor: 'hsl(217.5, 40.5%, 20.5%)', sidebarWidth: 30 })

    expect(html).toContain(declaration('hsl(217.5, 40.5%, 20.5%)', 238.2))
  })

  it('follows the colour and width the template itself falls back to', () => {
    const html = render({})

    expect(html).toContain(declaration('#333333', 277.9))
  })

  /**
   * The barrier, not a convenience: a style element's text is not escaped as a
   * style object is, so a value that could close the declaration or the rule
   * must not be written at all.
   */
  it.each([
    ['a declaration break-out', 'red;}body{display:none'],
    ['a keyword', 'rebeccapurple'],
    ['a function this template is not given', 'rgb(1, 2, 3)'],
    ['a negative hue', 'hsl(-30, 40%, 20%)'],
  ])('declares nothing for %s', (_label, sidebarColor) => {
    const html = render({ sidebarColor })

    expect(html).not.toContain('--modern-print-sidebar')
  })

  it.each([
    ['a negative width', -5],
    ['a width past the page', 120],
    ['a width that is not a number', Number.NaN],
  ])('declares nothing for %s', (_label, sidebarWidth) => {
    const html = render({ sidebarColor: 'hsl(150, 60%, 28%)', sidebarWidth })

    expect(html).not.toContain('--modern-print-sidebar')
  })
})
