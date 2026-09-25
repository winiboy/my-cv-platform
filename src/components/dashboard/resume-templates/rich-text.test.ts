import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Resume, ResumeTemplate } from '@/types/database'
import en from '@/locales/en/common.json'
import { ClassicTemplate } from '@/components/dashboard/resume-templates/classic-template'
import { CreativeTemplate } from '@/components/dashboard/resume-templates/creative-template'
import { MinimalTemplate } from '@/components/dashboard/resume-templates/minimal-template'
import { ModernTemplate } from '@/components/dashboard/resume-templates/modern-template'
import { ProfessionalTemplate } from '@/components/dashboard/resume-templates/professional-template'

/**
 * Part 3 US-016: every template's Preview reads the rich text the editor saved.
 *
 * These render on the server, where `SanitizedHtml` deliberately emits an empty
 * `.formatted-content` wrapper and fills it in after hydration (see
 * `sanitized-html.test.ts`). That is exactly the discriminator these tests
 * need: a field routed through the sanitiser leaves a wrapper and no text,
 * while a field printed as a plain string leaves React-escaped markup
 * (`&lt;p&gt;`) in the HTML - which is the defect, literal markup on screen.
 */

const HTML_SKILLS = '<p><strong>TypeScript</strong>, React, PostgreSQL</p>'
const HTML_DESCRIPTION = '<p>Built a <em>renderer</em> shared by three formats.</p>'
const PLAIN_ITEMS = ['Kubernetes', 'Terraform']

interface TemplateProps {
  resume: Resume
  locale: 'en'
  dict: unknown
}

const TEMPLATES: Record<ResumeTemplate, ComponentType<never>> = {
  classic: ClassicTemplate as ComponentType<never>,
  creative: CreativeTemplate as ComponentType<never>,
  minimal: MinimalTemplate as ComponentType<never>,
  modern: ModernTemplate as ComponentType<never>,
  professional: ProfessionalTemplate as ComponentType<never>,
}

const TEMPLATE_IDS = Object.keys(TEMPLATES) as ResumeTemplate[]

/** Templates that render a project description at all. Professional has no projects section. */
const RENDERS_PROJECT_DESCRIPTION: readonly ResumeTemplate[] = ['classic', 'creative', 'minimal', 'modern']

/** Templates that render an education description at all. */
const RENDERS_EDUCATION_DESCRIPTION: readonly ResumeTemplate[] = ['classic']

function buildResume(overrides: Partial<Record<string, unknown>>): Resume {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Rich text',
    template: 'classic',
    contact: { fullName: 'Ada Lovelace', email: 'ada@example.test' },
    summary: 'Engineer.',
    experience: [
      {
        company: 'Acme',
        position: 'Engineer',
        startDate: '2020-01',
        endDate: '2023-01',
        description: 'Plain description.',
        visible: true,
      },
    ],
    education: [
      { school: 'EPFL', degree: 'MSc', field: 'CS', startDate: '2012-09', endDate: '2014-06', visible: true },
    ],
    skills: [],
    languages: [],
    certifications: [],
    projects: [{ name: 'Openscribe', description: 'Plain project.', visible: true }],
    custom_sections: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  } as unknown as Resume
}

function render(template: ResumeTemplate, resume: Resume): string {
  const props: TemplateProps = { resume, locale: 'en', dict: en }
  return renderToString(createElement(TEMPLATES[template] as ComponentType<TemplateProps>, props))
}

/** Number of sanitiser wrappers in the server HTML. Each is empty until hydration. */
function formattedWrappers(html: string): number {
  return html.split('class="formatted-content"').length - 1
}

describe('rich text in the Preview', () => {
  /**
   * The control for every `&lt;p&gt;` assertion below: printing stored HTML as a
   * plain string - what classic, minimal and creative did before this story -
   * escapes it into the markup the user sees on screen. Without this, a passing
   * assertion could mean the field simply was not rendered.
   */
  it('printing stored HTML as a string escapes it into visible markup', () => {
    expect(renderToString(createElement('div', null, HTML_DESCRIPTION))).toContain('&lt;p&gt;')
  })

  describe.each(TEMPLATE_IDS)('%s', (template) => {
    it('renders a category saved as skillsHtml through the sanitiser', () => {
      const html = render(
        template,
        buildResume({ skills: [{ category: 'Engineering', items: [], skillsHtml: HTML_SKILLS, visible: true }] })
      )

      expect(html).toContain('Engineering')
      expect(formattedWrappers(html)).toBeGreaterThan(0)
      // The defect: the stored markup printed as text instead of being rendered.
      expect(html).not.toContain('&lt;strong&gt;')
      expect(html).not.toContain('&lt;p&gt;')
    })

    it('falls back to items when no skillsHtml is stored', () => {
      const html = render(
        template,
        buildResume({ skills: [{ category: 'Operations', items: PLAIN_ITEMS, visible: true }] })
      )

      expect(html).toContain('Operations')
      for (const item of PLAIN_ITEMS) {
        expect(html).toContain(item)
      }
    })

    it('prefers skillsHtml over a stale items list', () => {
      const html = render(
        template,
        buildResume({
          skills: [{ category: 'Engineering', items: PLAIN_ITEMS, skillsHtml: HTML_SKILLS, visible: true }],
        })
      )

      // `items` is the pre-edit list; showing it is the stale Preview this story fixes.
      for (const item of PLAIN_ITEMS) {
        expect(html).not.toContain(item)
      }
    })

    it('renders an HTML experience description as markup, not as text', () => {
      const plain = render(template, buildResume({}))
      const rich = render(
        template,
        buildResume({
          experience: [
            {
              company: 'Acme',
              position: 'Engineer',
              startDate: '2020-01',
              endDate: '2023-01',
              description: HTML_DESCRIPTION,
              visible: true,
            },
          ],
        })
      )

      expect(rich).not.toContain('&lt;p&gt;')
      expect(rich).not.toContain('&lt;em&gt;')
      expect(formattedWrappers(rich)).toBeGreaterThan(formattedWrappers(plain))
    })

    it.runIf(RENDERS_PROJECT_DESCRIPTION.includes(template))(
      'renders an HTML project description as markup, not as text',
      () => {
        const plain = render(template, buildResume({}))
        const rich = render(
          template,
          buildResume({ projects: [{ name: 'Openscribe', description: HTML_DESCRIPTION, visible: true }] })
        )

        expect(rich).not.toContain('&lt;p&gt;')
        expect(rich).not.toContain('&lt;em&gt;')
        expect(formattedWrappers(rich)).toBeGreaterThan(formattedWrappers(plain))
      }
    )

    it.runIf(RENDERS_EDUCATION_DESCRIPTION.includes(template))(
      'renders an HTML education description as markup, not as text',
      () => {
        const plain = render(template, buildResume({}))
        const rich = render(
          template,
          buildResume({
            education: [
              {
                school: 'EPFL',
                degree: 'MSc',
                field: 'CS',
                startDate: '2012-09',
                endDate: '2014-06',
                description: HTML_DESCRIPTION,
                visible: true,
              },
            ],
          })
        )

        expect(rich).not.toContain('&lt;p&gt;')
        expect(rich).not.toContain('&lt;em&gt;')
        expect(formattedWrappers(rich)).toBeGreaterThan(formattedWrappers(plain))
      }
    )

    it('writes no unsanitised HTML into the server render', () => {
      const payload = '<p>ok<img src=x onerror="alert(1)"><script>alert(2)</script></p>'
      const html = render(
        template,
        buildResume({
          skills: [{ category: 'Engineering', items: [], skillsHtml: payload, visible: true }],
          projects: [{ name: 'Openscribe', description: payload, visible: true }],
        })
      )

      expect(html).not.toContain('onerror')
      expect(html).not.toContain('<img')
      expect(html).not.toContain('<script')
      expect(html).not.toContain('alert(')
    })
  })
})
