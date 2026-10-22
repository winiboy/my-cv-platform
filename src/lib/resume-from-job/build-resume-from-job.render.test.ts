import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Resume, ResumeTemplate } from '@/types/database'
import de from '@/locales/de/common.json'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import it_ from '@/locales/it/common.json'
import { ClassicTemplate } from '@/components/dashboard/resume-templates/classic-template'
import { CreativeTemplate } from '@/components/dashboard/resume-templates/creative-template'
import { MinimalTemplate } from '@/components/dashboard/resume-templates/minimal-template'
import { ModernTemplate } from '@/components/dashboard/resume-templates/modern-template'
import { ProfessionalTemplate } from '@/components/dashboard/resume-templates/professional-template'
import { presentLabel } from '@/lib/resume-template-strings'
import { buildResumeFromJobOffer, type AiResumeContent, type ResumeDraftContent } from './build-resume-from-job'
import { RESUME_CONTENT_LANGUAGES, RESUME_SAMPLE_VALUES, type ResumeContentLanguage } from './sample-values'

/**
 * The builder's resume, rendered by each of the five templates exactly as the
 * Preview renders a stored resume (server render, as in `rich-text.test.ts`),
 * for a draft built from sample values only and for one built with AI content.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 * Plain fields are asserted by their text. Rich-text fields render through
 * `SanitizedHtml`, which is deliberately EMPTY on the server and filled only
 * after hydration in the browser. So for rich text this test proves that each
 * expected field reaches the sanitizer - one `formatted-content` wrapper per
 * field - and that no markup leaks as visible text. It cannot prove the rich
 * text is visible: that needs rendered browser evidence, which US-002's e2e
 * and ui-expert validation provide.
 */

const TEMPLATES: Record<ResumeTemplate, ComponentType<never>> = {
  classic: ClassicTemplate as ComponentType<never>,
  creative: CreativeTemplate as ComponentType<never>,
  minimal: MinimalTemplate as ComponentType<never>,
  modern: ModernTemplate as ComponentType<never>,
  professional: ProfessionalTemplate as ComponentType<never>,
}

const TEMPLATE_IDS = Object.keys(TEMPLATES) as ResumeTemplate[]

const DICTIONARIES: Record<ResumeContentLanguage, unknown> = { fr, en, de, it: it_ }

const OFFER = { title: 'Data Engineer', company: 'Acme Analytics', location: 'Bern' }

/** Two entries per AI section, so a per-entry count cannot pass by accident. */
const AI_CONTENT: AiResumeContent = {
  summary: '<p>Engineer with <strong>eight years</strong> of pipelines.</p>',
  experience: [
    {
      position: 'Senior Data Engineer',
      company: 'Pipeline Works',
      location: 'Geneva',
      startDate: '2020-02',
      endDate: '2024-03',
      current: false,
      description: '<ul><li>Built a streaming platform</li></ul>',
      achievements: ['Cut batch time by 60%'],
    },
    {
      position: 'Data Analyst',
      company: 'Metric House',
      location: 'Basel',
      startDate: '2016-01',
      endDate: '2019-12',
      current: false,
      description: '<p>Owned the reporting stack.</p>',
    },
  ],
  skills: [
    { category: 'Data', items: ['Spark', 'Airflow'] },
    { category: 'Cloud', items: ['GCP'] },
  ],
  projects: [
    { name: 'Real-time billing', description: '<p>Moved billing to <em>streaming</em>.</p>', technologies: ['Kafka'] },
    { name: 'Data catalogue', description: '<p>Documented every table.</p>', technologies: ['dbt'] },
  ],
}

const DRAFTS = {
  'sample values only': undefined,
  'AI content': AI_CONTENT,
} as const satisfies Record<string, AiResumeContent | undefined>

type DraftName = keyof typeof DRAFTS

/**
 * The rich-text fields each template sends through the sanitizer, one wrapper
 * each. Taken from the templates as they are (their rendering is out of this
 * story's scope):
 * - every template draws the summary, each skill category's `skillsHtml` and
 *   each project description (professional as its key-achievement entries);
 * - classic, creative, minimal and professional draw an experience's
 *   description only when it has no achievements, and every built experience
 *   has achievements, so they draw none; modern draws each description;
 * - only classic draws an education description.
 */
const EXPECTED_RICH_FIELDS: Readonly<Record<ResumeTemplate, (draft: ResumeDraftContent) => number>> = {
  classic: (d) => 1 + d.skills.length + d.projects.length + d.education.length,
  creative: (d) => 1 + d.skills.length + d.projects.length,
  minimal: (d) => 1 + d.skills.length + d.projects.length,
  modern: (d) => 1 + d.skills.length + d.projects.length + d.experience.length,
  professional: (d) => 1 + d.skills.length + d.projects.length,
}

type DrawnField =
  | 'title'
  | 'name'
  | 'email'
  | 'phone'
  | 'location'
  | 'linkedin'
  | 'github'
  | 'website'
  | 'experienceCompany'
  | 'experiencePosition'
  | 'experienceLocation'
  | 'experienceAchievement'
  | 'school'
  | 'degree'
  | 'field'
  | 'gpa'
  | 'skillCategory'
  | 'language'
  | 'certification'
  | 'issuer'
  | 'project'
  | 'technology'

/**
 * Fields a template does not draw at all, whatever the resume holds. This is
 * existing template behaviour, out of this story's scope: the values are still
 * stored and shown in the editor.
 *
 * No template draws an education's achievements, a certification's credential
 * id or URL, or a project's URL, so those are not listed as drawn fields.
 */
const NOT_DRAWN: Readonly<Record<ResumeTemplate, readonly DrawnField[]>> = {
  // These three draw the resume title as the headline in place of the name.
  classic: ['name'],
  creative: ['name'],
  minimal: ['name'],
  modern: ['gpa'],
  professional: ['technology'],
}

/** The first entry of each section's text, as the draft holds it. */
function drawnValues(draft: ResumeDraftContent): Record<DrawnField, string> {
  const [experience] = draft.experience
  const [education] = draft.education
  const [certification] = draft.certifications
  const [project] = draft.projects
  return {
    title: draft.title,
    name: draft.contact.name ?? '',
    email: draft.contact.email ?? '',
    phone: draft.contact.phone ?? '',
    location: draft.contact.location ?? '',
    linkedin: draft.contact.linkedin ?? '',
    github: draft.contact.github ?? '',
    website: draft.contact.website ?? '',
    experienceCompany: experience.company,
    experiencePosition: experience.position,
    experienceLocation: experience.location ?? '',
    experienceAchievement: experience.achievements?.[0] ?? '',
    school: education.school,
    degree: education.degree,
    field: education.field ?? '',
    gpa: education.gpa ?? '',
    skillCategory: draft.skills[0].category,
    language: draft.languages[0].language,
    certification: certification.name,
    issuer: certification.issuer,
    project: project.name,
    technology: project.technologies?.[0] ?? '',
  }
}

/** Text as React writes it into server HTML. */
function asRendered(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
}

function renderDraft(template: ResumeTemplate, language: ResumeContentLanguage, draft: ResumeDraftContent): string {
  const resume = {
    id: 'resume-from-job',
    user_id: 'user',
    template,
    custom_sections: {},
    layout_settings: null,
    is_default: false,
    is_public: false,
    public_slug: null,
    job_application_id: null,
    created_at: '2026-10-22T00:00:00.000Z',
    updated_at: '2026-10-22T00:00:00.000Z',
    ...draft,
  } as unknown as Resume
  return renderToString(
    createElement(TEMPLATES[template] as ComponentType<{ resume: Resume; locale: string; dict: unknown }>, {
      resume,
      locale: language,
      dict: DICTIONARIES[language],
    })
  )
}

function formattedWrappers(html: string): number {
  return html.split('class="formatted-content"').length - 1
}

describe.each(TEMPLATE_IDS)('the %s template', (template) => {
  describe.each(RESUME_CONTENT_LANGUAGES)('in %s', (language) => {
    describe.each(Object.keys(DRAFTS) as DraftName[])('with %s', (draftName) => {
      const draft = buildResumeFromJobOffer({ offer: OFFER, language, aiContent: DRAFTS[draftName] })
      const html = renderDraft(template, language, draft)

      it('shows the text of every section it draws', () => {
        const values = drawnValues(draft)
        const missing = (Object.keys(values) as DrawnField[])
          .filter((field) => !NOT_DRAWN[template].includes(field))
          .filter((field) => !html.includes(asRendered(values[field])))
        expect(missing).toEqual([])
      })

      it('sends each expected rich-text field through the sanitizer, without leaking markup', () => {
        expect(formattedWrappers(html)).toBe(EXPECTED_RICH_FIELDS[template](draft))
        expect(html).not.toMatch(/&lt;\/?(p|ul|ol|li|strong|em|u|br)&gt;/)
      })
    })
  })
})

describe('a role the AI presents as current', () => {
  // A filler end date in a year that appears nowhere else in the resume.
  const draft = buildResumeFromJobOffer({
    offer: OFFER,
    language: 'fr',
    aiContent: { experience: [{ position: 'Analyste', startDate: '2011-03', endDate: '2012-08', current: true }] },
  })

  it.each(TEMPLATE_IDS)('draws "present" and hides the filler end date in %s', (template) => {
    expect(draft.experience[0]).toMatchObject({ endDate: '2012-08', current: true })
    const html = renderDraft(template, 'fr', draft)
    expect(html).toContain(asRendered(presentLabel(fr)))
    expect(html).toContain('2011')
    expect(html).not.toContain('2012')
  })
})

it('lists only fields a template really omits', () => {
  // Guards NOT_DRAWN from hiding a regression: each listed field is absent from
  // that template's render.
  const draft = buildResumeFromJobOffer({ offer: OFFER, language: 'en' })
  for (const template of TEMPLATE_IDS) {
    const html = renderDraft(template, 'en', draft)
    const values = drawnValues(draft)
    for (const field of NOT_DRAWN[template]) {
      expect(html.includes(asRendered(values[field])), `${template} draws ${field}`).toBe(false)
    }
  }
})

it('renders sample values that are the sample set, so the checks above test real content', () => {
  const draft = buildResumeFromJobOffer({ offer: OFFER, language: 'de' })
  expect(drawnValues(draft).school).toBe(RESUME_SAMPLE_VALUES.de.education.school)
})
