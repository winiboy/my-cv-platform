import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Resume } from '@/types/database'
import en from '@/locales/en/common.json'
import { ProfessionalTemplate } from '@/components/dashboard/resume-templates/professional-template'
import { DEFAULT_RESUME_LAYOUT } from '@/lib/layout-settings'

/**
 * Part 3 US-013, print band half.
 *
 * `globals.css` paints the band on `body:has(.professional-template)` and
 * cannot read the layout model, so the user's colour reaches it as a custom
 * property this template declares. The property must be declared on `body` -
 * a custom property inherits downward only, and `body` is this component's
 * ancestor - and it must be declared in the SERVER render, because the print
 * capture screenshots a page whose effects may not have run.
 *
 * What the band then looks like on paper is browser evidence, not this file's
 * subject; what is asserted here is that the colour leaves the template, in a
 * form a stylesheet can take, and only when it is one this template reads.
 */

const PROPERTY = '--professional-print-sidebar-color'

interface ProfessionalProps {
  resume: Resume
  locale: 'en'
  dict: unknown
  sidebarColor?: string
}

function buildResume(): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Engineering',
    template: 'professional',
    contact: { name: 'Ada Lovelace', email: 'ada@example.test' },
    summary: 'Engineer.',
    experience: [
      { company: 'Acme', position: 'Engineer', startDate: '2020-01', endDate: '2023-01', visible: true },
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

function render(sidebarColor?: string): string {
  return renderToString(
    createElement(ProfessionalTemplate as ComponentType<ProfessionalProps>, {
      resume: buildResume(),
      locale: 'en',
      dict: en,
      sidebarColor,
    })
  )
}

describe("US-013: the print band takes the user's sidebar colour", () => {
  it('declares the colour on body, where the print rule can read it', () => {
    const html = render('hsl(12.5, 40.5%, 22%)')

    expect(html).toContain(`body:has(.professional-template){${PROPERTY}:hsl(12.5, 40.5%, 22%)}`)
  })

  it('accepts a hex colour', () => {
    const html = render('#1F3A5F')

    expect(html).toContain(`${PROPERTY}:#1F3A5F`)
  })

  /**
   * With no colour chosen the template already composes one from the shared
   * layout defaults, so the band follows that rather than the literal in
   * `globals.css` - the two must not be able to disagree.
   */
  it('declares the shared default when the caller passes no colour', () => {
    const { sidebarHue, sidebarSaturation, sidebarBrightness } = DEFAULT_RESUME_LAYOUT
    const html = render(undefined)

    expect(html).toContain(`${PROPERTY}:hsl(${sidebarHue}, ${sidebarSaturation}%, ${sidebarBrightness}%)`)
  })

  /**
   * A style element's text is not escaped the way React escapes a style
   * object, and `sidebarColor` is user-controlled, so a value this template
   * does not recognise must not be written into a stylesheet at all. The
   * property then stays unset and the fallback in `globals.css` applies.
   */
  it.each([
    ['a keyword', 'rebeccapurple'],
    ['a function this template does not read', 'oklch(0.25 0.05 240)'],
    ['a declaration terminator', 'hsl(240, 85%, 35%); position: fixed'],
    ['a closing brace', 'red}body{display:none'],
    ['a comment opener', 'red/*'],
  ])('writes nothing for %s', (_label, sidebarColor) => {
    const html = render(sidebarColor)

    expect(html).not.toContain(PROPERTY)
  })
})
