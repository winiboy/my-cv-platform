import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoverLetter } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { ModernLetterTemplate } from './modern-letter-template'

/**
 * The editor preview prints the date, subject and default greeting and
 * sign-off from the same parts as the PDF and Word exports, in the letter's
 * detected language, the page's locale otherwise
 * (cover-letter-template-language, US-002). Rendered as the server renders it;
 * the paragraphs themselves only appear after hydration (see
 * `sanitized-html.test.ts`), which is why plain text is used here.
 */

const LETTER: CoverLetter = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  resume_id: null,
  job_application_id: null,
  title: 'Unit fixture',
  recipient_name: null,
  recipient_title: null,
  company_name: 'Acme SA',
  company_address: null,
  greeting: '',
  opening_paragraph: null,
  body_paragraphs: [],
  closing_paragraph: null,
  sign_off: '',
  sender_name: 'Zoë Lovelace',
  sender_street: null,
  sender_postal_locality: null,
  sender_phone: null,
  sender_email: null,
  annexes: null,
  job_title: 'Ingénieur logiciel',
  job_description: null,
  template: 'modern',
  analysis_score: null,
  analysis_results: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const FRENCH =
  "<p>Je vous écris pour vous présenter ma candidature au poste d'ingénieur logiciel. Avec cinq ans d'expérience dans une équipe agile, je suis convaincu que mon profil correspond à vos besoins.</p>"
const ENGLISH =
  '<p>I am writing to apply for the position of software engineer at your company. With five years of experience in the field, I am confident that my skills will be an asset to your team.</p>'

const render = (letter: Partial<CoverLetter>, locale: Locale) =>
  renderToString(createElement(ModernLetterTemplate, { coverLetter: { ...LETTER, ...letter }, locale }))

describe('ModernLetterTemplate: the parts in the letter language', () => {
  beforeEach(() => {
    // Midday, so the date line is the same day in any runner time zone.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('prints a French letter opened under /de in French', () => {
    const html = render({ opening_paragraph: FRENCH }, 'de')

    expect(html).toContain('2 novembre 2026')
    expect(html).toContain('Objet : Candidature au poste de Ingénieur logiciel')
    expect(html).toContain('Madame, Monsieur,')
    expect(html).toContain('Veuillez agréer mes salutations distinguées,')
    expect(html).not.toContain('Betreff')
    expect(html).not.toContain('Re: Application for')
  })

  it("prints an English letter opened under /fr with today's English wording", () => {
    const html = render({ opening_paragraph: ENGLISH, job_title: 'Software Engineer' }, 'fr')

    expect(html).toContain('November 2, 2026')
    expect(html).toContain('<strong>Re: Application for Software Engineer</strong>')
    expect(html).toContain('Dear Hiring Manager,')
    expect(html).toContain('Sincerely,')
    expect(html).not.toContain('Objet')
  })
})
