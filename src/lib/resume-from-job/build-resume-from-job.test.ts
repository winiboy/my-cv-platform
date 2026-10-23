import { describe, expect, it } from 'vitest'
import { AI_TEXT_LIMITS } from '@/lib/api/ai-input-limits'
import { escapeHtml } from '@/lib/escape-html'
import {
  buildResumeFromJobOffer,
  MAX_AI_ENTRIES_PER_SECTION,
  type AiResumeContent,
  type JobOfferForResume,
  type ResumeDraftContent,
} from './build-resume-from-job'
import {
  RESUME_CONTENT_LANGUAGES,
  RESUME_SAMPLE_VALUES,
  SAMPLE_DATES,
  type ResumeContentLanguage,
} from './sample-values'

const OFFER: JobOfferForResume = {
  title: 'Data Engineer',
  company: 'Acme Analytics',
  location: 'Lausanne, Suisse',
}

const AI_CONTENT: AiResumeContent = {
  summary: '<p>Data engineer with <strong>8 years</strong> building pipelines.</p>',
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
  ],
  skills: [{ category: 'Data', items: ['Spark', 'Airflow', 'SQL'] }],
  projects: [
    {
      name: 'Real-time billing',
      description: '<p>Moved billing to <em>streaming</em>.</p>',
      url: 'https://example.com/billing',
      startDate: '2022-01',
      endDate: '2022-08',
      technologies: ['Kafka'],
    },
  ],
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const LEVELS = ['Native', 'Fluent', 'Professional', 'Intermediate', 'Basic']

const CONTACT_KEYS = ['name', 'email', 'phone', 'location', 'linkedin', 'github', 'website'] as const
const EXPERIENCE_KEYS = ['company', 'position', 'startDate', 'endDate', 'location', 'description', 'achievements'] as const
const EDUCATION_KEYS = ['school', 'degree', 'field', 'startDate', 'endDate', 'gpa', 'description', 'achievements'] as const
const CERTIFICATION_KEYS = ['name', 'issuer', 'date', 'expiryDate', 'credentialId', 'url'] as const
const PROJECT_KEYS = ['name', 'description', 'url', 'startDate', 'endDate', 'technologies'] as const

function isFilled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0 && value.every(isFilled)
  return false
}

/** Paths of every field the PRD requires that is missing or empty. Empty list = complete. */
function emptyFields(resume: ResumeDraftContent): string[] {
  const empty: string[] = []
  const check = (path: string, value: unknown) => {
    if (!isFilled(value)) empty.push(path)
  }
  const checkEntries = <T extends object>(section: string, entries: readonly T[], keys: readonly string[]) => {
    if (entries.length === 0) empty.push(section)
    entries.forEach((entry, i) => {
      for (const key of keys) check(`${section}[${i}].${key}`, (entry as Record<string, unknown>)[key])
      if ((entry as { visible?: boolean }).visible !== true) empty.push(`${section}[${i}].visible`)
    })
  }

  check('title', resume.title)
  for (const key of CONTACT_KEYS) check(`contact.${key}`, resume.contact[key])
  check('summary', resume.summary)
  checkEntries('experience', resume.experience, EXPERIENCE_KEYS)
  checkEntries('education', resume.education, EDUCATION_KEYS)
  checkEntries('skills', resume.skills, ['category', 'items', 'skillsHtml'])
  checkEntries('languages', resume.languages, ['language', 'level'])
  checkEntries('certifications', resume.certifications, CERTIFICATION_KEYS)
  checkEntries('projects', resume.projects, PROJECT_KEYS)
  return empty
}

/** Every string value in the built resume. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(allStrings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings)
  return []
}

/**
 * The words of a sample set: its strings minus the summary sentences (their
 * placeholders are filled) and the language levels (stored enum values shared
 * by every language).
 */
function sampleStrings(language: ResumeContentLanguage): string[] {
  const set = RESUME_SAMPLE_VALUES[language]
  return [
    set.headline,
    ...allStrings([set.contact, set.experience, set.education, set.skills, set.certification, set.project]),
    ...set.languages.map(({ language: name }) => name),
  ]
}

describe('buildResumeFromJobOffer', () => {
  describe.each(RESUME_CONTENT_LANGUAGES)('in %s', (language) => {
    it('fills every field for an offer with AI content', () => {
      const resume = buildResumeFromJobOffer({ offer: OFFER, language, aiContent: AI_CONTENT })
      expect(emptyFields(resume)).toEqual([])
    })

    it('fills every field for an offer without AI content', () => {
      const resume = buildResumeFromJobOffer({ offer: OFFER, language })
      expect(emptyFields(resume)).toEqual([])
    })

    it('fills every field for an offer without location or company', () => {
      for (const offer of [
        { title: 'Data Engineer' },
        { title: 'Data Engineer', company: null, location: null },
        { title: 'Data Engineer', company: '   ', location: '' },
      ]) {
        const resume = buildResumeFromJobOffer({ offer, language })
        expect(emptyFields(resume)).toEqual([])
        expect(resume.contact.location).toBe(RESUME_SAMPLE_VALUES[language].contact.location)
      }
    })

    it('fills every field even when the offer has no usable title', () => {
      const resume = buildResumeFromJobOffer({ offer: { title: '  <b></b> ' }, language })
      expect(emptyFields(resume)).toEqual([])
      expect(resume.title).toBe(RESUME_SAMPLE_VALUES[language].headline)
    })

    it('takes every sample value from its own language only', () => {
      const resume = buildResumeFromJobOffer({ offer: OFFER, language })
      const text = allStrings(resume).join('\n')

      const own = sampleStrings(language)
      expect(own.some((value) => text.includes(value))).toBe(true)

      for (const other of RESUME_CONTENT_LANGUAGES.filter((l) => l !== language)) {
        for (const value of sampleStrings(other)) {
          // Rich-text fields hold the value HTML-escaped.
          const found = text.includes(value) || text.includes(escapeHtml(value))
          expect(found, `${other} value "${value}" in a ${language} resume`).toBe(false)
        }
      }
    })

    it('writes the summary sentence naming the job title and the company', () => {
      const sample = RESUME_SAMPLE_VALUES[language].summary
      const withCompany = buildResumeFromJobOffer({ offer: OFFER, language })
      expect(withCompany.summary).toBe(
        `<p>${escapeHtml(sample.withCompany.replace('{jobTitle}', 'Data Engineer').replace('{company}', 'Acme Analytics'))}</p>`
      )

      const withoutCompany = buildResumeFromJobOffer({ offer: { title: 'Data Engineer' }, language })
      expect(withoutCompany.summary).toBe(
        `<p>${escapeHtml(sample.withoutCompany.replace('{jobTitle}', 'Data Engineer'))}</p>`
      )
    })
  })

  describe('offer data first', () => {
    it('uses the job title as the title and the job location as the contact location', () => {
      const resume = buildResumeFromJobOffer({ offer: OFFER, language: 'fr', aiContent: AI_CONTENT })
      expect(resume.title).toBe('Data Engineer')
      expect(resume.contact.location).toBe('Lausanne, Suisse')
    })

    it('names the job title and company in the summary when the AI wrote none', () => {
      const resume = buildResumeFromJobOffer({ offer: OFFER, language: 'de' })
      expect(resume.summary).toContain('Data Engineer')
      expect(resume.summary).toContain('Acme Analytics')
    })

    it('inserts the offer text literally, never as a replacement pattern or markup', () => {
      const resume = buildResumeFromJobOffer({
        offer: { title: 'Dev $& {company} <i>x</i>', company: "O'Neil & {jobTitle}" },
        language: 'en',
      })
      expect(resume.title).toBe('Dev $& {company} x')
      expect(resume.summary).toContain('Dev $&amp; {company} x')
      expect(resume.summary).toContain('O&#39;Neil &amp; {jobTitle}')
      expect(resume.summary).not.toContain('<i>')
    })

    it('cuts the offer fields to the existing label limit', () => {
      const resume = buildResumeFromJobOffer({ offer: { title: 'T'.repeat(500), location: 'L'.repeat(500) }, language: 'en' })
      expect(resume.title).toHaveLength(AI_TEXT_LIMITS.SHORT_LABEL)
      expect(resume.contact.location).toHaveLength(AI_TEXT_LIMITS.SHORT_LABEL)
    })
  })

  describe('AI content', () => {
    it('is used for summary, experience, skills and projects', () => {
      const resume = buildResumeFromJobOffer({ offer: OFFER, language: 'en', aiContent: AI_CONTENT })

      expect(resume.summary).toBe('<p>Data engineer with <strong>8 years</strong> building pipelines.</p>')
      expect(resume.experience).toEqual([
        {
          company: 'Pipeline Works',
          position: 'Senior Data Engineer',
          startDate: '2020-02',
          endDate: '2024-03',
          current: false,
          location: 'Geneva',
          description: '<ul><li>Built a streaming platform</li></ul>',
          achievements: ['Cut batch time by 60%'],
          visible: true,
        },
      ])
      expect(resume.skills).toEqual([
        { category: 'Data', items: ['Spark', 'Airflow', 'SQL'], skillsHtml: '<p>Spark, Airflow, SQL</p>', visible: true },
      ])
      expect(resume.projects).toEqual([
        {
          name: 'Real-time billing',
          description: '<p>Moved billing to <em>streaming</em>.</p>',
          url: 'https://example.com/billing',
          startDate: '2022-01',
          endDate: '2022-08',
          technologies: ['Kafka'],
          visible: true,
        },
      ])
    })

    it('has its empty fields filled from the sample set', () => {
      const sample = RESUME_SAMPLE_VALUES.it
      const resume = buildResumeFromJobOffer({
        offer: OFFER,
        language: 'it',
        aiContent: {
          summary: '   ',
          experience: [{ position: 'Analista', endDate: 'Present', current: true }],
          skills: [{ category: 'Strumenti' }, { items: ['Excel'] }],
          projects: [{ name: 'Migrazione', url: 'javascript:alert(1)' }],
        },
      })

      expect(emptyFields(resume)).toEqual([])
      expect(resume.summary).toContain('Data Engineer')

      const [experience] = resume.experience
      expect(experience.position).toBe('Analista')
      expect(experience.company).toBe(sample.experience.company)
      expect(experience.location).toBe(sample.experience.location)
      expect(experience.achievements).toEqual(sample.experience.achievements)
      expect(experience.description).toBe(`<p>${escapeHtml(sample.experience.description)}</p>`)
      // A role the AI calls current stays current; its end date is filler.
      expect(experience).toMatchObject({ ...SAMPLE_DATES.experience, current: true })

      expect(resume.skills.map(({ category, items }) => ({ category, items }))).toEqual([
        { category: 'Strumenti', items: sample.skills.items },
        { category: sample.skills.category, items: ['Excel'] },
      ])

      const [project] = resume.projects
      expect(project.name).toBe('Migrazione')
      expect(project.url).toBe(sample.project.url)
      expect(project.technologies).toEqual(sample.project.technologies)
      expect(project.description).toContain(sample.project.description)
      expect(project).toMatchObject(SAMPLE_DATES.project)
    })

    describe('a role the AI presents as current', () => {
      it.each([
        ['current: true', { current: true, endDate: '2023-04' }],
        ['endDate "Present"', { endDate: 'Present' }],
        ['no end date', {}],
        ['an invalid end date', { endDate: 'now', current: false }],
      ])('stays current with %s, keeps its start date and fills the end date', (_label, dates) => {
        const resume = buildResumeFromJobOffer({
          offer: OFFER,
          language: 'en',
          aiContent: { experience: [{ position: 'Analyst', startDate: '2019-04', ...dates }] },
        })
        const [experience] = resume.experience
        expect(experience.current).toBe(true)
        expect(experience.startDate).toBe('2019-04')
        expect(experience.endDate).toMatch(MONTH)
        expect(experience.endDate! >= experience.startDate).toBe(true)
        expect(emptyFields(resume)).toEqual([])
      })

      it('keeps a valid AI end date as the filler', () => {
        const resume = buildResumeFromJobOffer({
          offer: OFFER,
          language: 'en',
          aiContent: { experience: [{ position: 'Analyst', startDate: '2019-04', endDate: '2023-04', current: true }] },
        })
        expect(resume.experience[0]).toMatchObject({ startDate: '2019-04', endDate: '2023-04', current: true })
      })

      it('takes the sample start when the AI gave none, and the sample end as filler', () => {
        const resume = buildResumeFromJobOffer({
          offer: OFFER,
          language: 'en',
          aiContent: { experience: [{ position: 'Analyst', current: true }] },
        })
        expect(resume.experience[0]).toMatchObject({ ...SAMPLE_DATES.experience, current: true })
      })

      it('never gets a filler end date before its start', () => {
        const resume = buildResumeFromJobOffer({
          offer: OFFER,
          language: 'en',
          aiContent: { experience: [{ position: 'Analyst', startDate: '2026-05' }] },
        })
        expect(resume.experience[0]).toMatchObject({ startDate: '2026-05', endDate: '2026-05', current: true })
      })
    })

    it('keeps a finished AI role finished with its own dates', () => {
      const resume = buildResumeFromJobOffer({
        offer: OFFER,
        language: 'en',
        aiContent: { experience: [{ position: 'Analyst', startDate: '2018-02', endDate: '2020-07', current: false }] },
      })
      expect(resume.experience[0]).toMatchObject({ startDate: '2018-02', endDate: '2020-07', current: false })
    })

    it('never stores an inverted range for a finished role', () => {
      const resume = buildResumeFromJobOffer({
        offer: OFFER,
        language: 'en',
        aiContent: { experience: [{ position: 'Analyst', startDate: '2022-05', endDate: '2020-01' }] },
      })
      expect(resume.experience[0]).toMatchObject({ ...SAMPLE_DATES.experience, current: false })
    })

    it('gives a sample experience the finished sample range', () => {
      const resume = buildResumeFromJobOffer({ offer: OFFER, language: 'en' })
      expect(resume.experience[0]).toMatchObject({ ...SAMPLE_DATES.experience, current: false })
    })

    it('accepts a full date and keeps only its month', () => {
      const resume = buildResumeFromJobOffer({
        offer: OFFER,
        language: 'en',
        aiContent: { experience: [{ position: 'Analyst', startDate: '2019-04-15', endDate: '2020-11-30' }] },
      })
      expect(resume.experience[0]).toMatchObject({ startDate: '2019-04', endDate: '2020-11' })
    })

    it('ignores entries that are not objects or carry no text', () => {
      const resume = buildResumeFromJobOffer({
        offer: OFFER,
        language: 'en',
        aiContent: {
          experience: [null, 'text', [], { location: 'Bern' }] as unknown as AiResumeContent['experience'],
          skills: 'Spark' as unknown as AiResumeContent['skills'],
          projects: [{}],
        },
      })
      expect(resume.experience).toHaveLength(1)
      expect(resume.experience[0].position).toBe(RESUME_SAMPLE_VALUES.en.experience.position)
      expect(resume.skills[0].category).toBe(RESUME_SAMPLE_VALUES.en.skills.category)
      expect(resume.projects[0].name).toBe(RESUME_SAMPLE_VALUES.en.project.name)
    })

    it('keeps at most the entry ceiling per section', () => {
      const many = Array.from({ length: MAX_AI_ENTRIES_PER_SECTION + 5 }, (_, i) => ({ name: `P${i}` }))
      const resume = buildResumeFromJobOffer({ offer: OFFER, language: 'en', aiContent: { projects: many } })
      expect(resume.projects).toHaveLength(MAX_AI_ENTRIES_PER_SECTION)
    })

    it('is sanitized: scripts, handlers and markup in plain fields are removed', () => {
      const xss = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
      const resume = buildResumeFromJobOffer({
        offer: { title: `Engineer${xss}`, company: `Acme${xss}`, location: `Bern${xss}` },
        language: 'en',
        aiContent: {
          summary: `<p onclick="alert(3)">Summary</p>${xss}<a href="javascript:alert(4)">x</a>`,
          experience: [
            {
              position: `Lead${xss}`,
              company: `<b>Co</b>${xss}`,
              description: `<p>Did things</p>${xss}`,
              achievements: [`Won${xss}`],
            },
          ],
          skills: [{ category: `Cat${xss}`, items: [`<b>Go</b>${xss}`] }],
          projects: [{ name: `Proj${xss}`, description: `<p>Desc</p>${xss}`, technologies: [`Rust${xss}`] }],
        },
      })

      const text = allStrings(resume).join('\n')
      expect(text).not.toMatch(/onerror|onclick|<script|<img|<a\b|javascript:|alert\(/i)
      expect(resume.title).toBe('Engineer')
      expect(resume.summary).toBe('<p>Summary</p>x')
      expect(resume.experience[0]).toMatchObject({
        position: 'Lead',
        company: 'Co',
        description: '<p>Did things</p>',
        achievements: ['Won'],
      })
      expect(resume.skills[0]).toMatchObject({ category: 'Cat', items: ['Go'], skillsHtml: '<p>Go</p>' })
      expect(resume.projects[0]).toMatchObject({ name: 'Proj', description: '<p>Desc</p>', technologies: ['Rust'] })
    })

    it('escapes skill text written into skillsHtml', () => {
      const resume = buildResumeFromJobOffer({
        offer: OFFER,
        language: 'en',
        aiContent: { skills: [{ category: 'Lang', items: ['C & C++', 'R&amp;D'] }] },
      })
      expect(resume.skills[0].items).toEqual(['C & C++', 'R&D'])
      expect(resume.skills[0].skillsHtml).toBe('<p>C &amp; C++, R&amp;D</p>')
    })

    it('cuts AI text to the existing input limits', () => {
      const resume = buildResumeFromJobOffer({
        offer: OFFER,
        language: 'en',
        aiContent: {
          summary: 'S'.repeat(AI_TEXT_LIMITS.SUMMARY + 100),
          experience: [{ position: 'P'.repeat(500), achievements: ['A'.repeat(AI_TEXT_LIMITS.BULLET + 100)] }],
          skills: [{ items: ['K'.repeat(500)] }],
        },
      })
      expect(resume.summary).toBe(`<p>${'S'.repeat(AI_TEXT_LIMITS.SUMMARY)}</p>`)
      expect(resume.experience[0].position).toHaveLength(AI_TEXT_LIMITS.SHORT_LABEL)
      expect(resume.experience[0].achievements?.[0]).toHaveLength(AI_TEXT_LIMITS.BULLET)
      expect(resume.skills[0].items[0]).toHaveLength(AI_TEXT_LIMITS.SKILL)
    })
  })

  describe('formats', () => {
    it.each(RESUME_CONTENT_LANGUAGES)('are valid in %s, with and without AI content', (language) => {
      for (const aiContent of [undefined, AI_CONTENT]) {
        const resume = buildResumeFromJobOffer({ offer: OFFER, language, aiContent })

        const dates = [
          ...resume.experience.flatMap((e) => [e.startDate, e.endDate]),
          ...resume.education.flatMap((e) => [e.startDate, e.endDate]),
          ...resume.certifications.flatMap((c) => [c.date, c.expiryDate]),
          ...resume.projects.flatMap((p) => [p.startDate, p.endDate]),
        ]
        for (const date of dates) expect(date).toMatch(MONTH)

        expect(resume.contact.email).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/)
        for (const url of [
          resume.contact.website,
          ...resume.certifications.map((c) => c.url),
          ...resume.projects.map((p) => p.url),
        ]) {
          expect(['http:', 'https:']).toContain(new URL(url ?? '').protocol)
        }

        for (const { level } of resume.languages) expect(LEVELS).toContain(level)

        // AI_CONTENT's single role is finished (`current: false`, valid end date).
        for (const experience of resume.experience) {
          expect(experience.current).toBe(false)
          expect(experience.endDate! >= experience.startDate).toBe(true)
        }

        const richText = [
          resume.summary,
          ...resume.experience.map((e) => e.description),
          ...resume.education.map((e) => e.description),
          ...resume.skills.map((s) => s.skillsHtml),
          ...resume.projects.map((p) => p.description),
        ]
        for (const html of richText) {
          // Stored rich text: starts with an allowed block and carries no attribute.
          expect(html).toMatch(/^<(p|ul|ol)>/)
          expect(html).not.toMatch(/<[a-z]+\s/i)
        }
      }
    })
  })

  it('is deterministic', () => {
    const first = buildResumeFromJobOffer({ offer: OFFER, language: 'fr', aiContent: AI_CONTENT })
    const second = buildResumeFromJobOffer({ offer: OFFER, language: 'fr', aiContent: AI_CONTENT })
    expect(second).toEqual(first)
  })

  it('does not share mutable arrays with the sample set', () => {
    const resume = buildResumeFromJobOffer({ offer: OFFER, language: 'en' })
    resume.experience[0].achievements?.push('changed')
    resume.skills[0].items.push('changed')
    expect(RESUME_SAMPLE_VALUES.en.experience.achievements).not.toContain('changed')
    expect(RESUME_SAMPLE_VALUES.en.skills.items).not.toContain('changed')
  })
})
