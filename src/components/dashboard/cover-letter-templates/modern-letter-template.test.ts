import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoverLetter } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import type { CoverLetterSenderDetails } from '@/lib/cover-letter-sender'
import { SWISS_LETTER_LAYOUT_PX } from '@/lib/cover-letter-swiss-letter'
import { ModernLetterTemplate } from './modern-letter-template'

/**
 * The editor preview draws the Swiss letter's canonical parts
 * (`swissLetterParts`) in the letter's detected language, the page's locale
 * otherwise (cover-letter-template-language, US-002; cover-letter-swiss-format,
 * US-002). Rendered as the server renders it; the paragraphs themselves only
 * appear after hydration (see `sanitized-html.test.ts`), which is why plain
 * text is used here.
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

const NO_SENDER_DETAILS: CoverLetterSenderDetails = {
  sender_street: null,
  sender_postal_locality: null,
  sender_phone: null,
  sender_email: null,
}

const render = (letter: Partial<CoverLetter>, locale: Locale, senderDetails = NO_SENDER_DETAILS) =>
  renderToString(
    createElement(ModernLetterTemplate, { coverLetter: { ...LETTER, ...letter }, senderDetails, locale }),
  )

/** The `data-letter-part` names of the rendered parts, in document order. */
const partOrder = (html: string) => [...html.matchAll(/data-letter-part="([a-zA-Z]+)"/g)].map(([, kind]) => kind)

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
    expect(html).toContain('<strong>Candidature au poste de Ingénieur logiciel</strong>')
    expect(html).toContain('Madame, Monsieur,')
    expect(html).toContain('Meilleures salutations')
    expect(html).toContain('Annexes')
    expect(html).toContain('CV, certificats de travail, diplômes')
    expect(html).not.toContain('Objet')
    expect(html).not.toContain('Bewerbung')
  })

  it('prints an English letter opened under /fr in English', () => {
    const html = render({ opening_paragraph: ENGLISH, job_title: 'Software Engineer' }, 'fr')

    expect(html).toContain('2 November 2026')
    expect(html).toContain('<strong>Application for Software Engineer</strong>')
    expect(html).toContain('Dear Hiring Manager,')
    expect(html).toContain('Kind regards')
    expect(html).toContain('Enclosures')
    expect(html).not.toContain('Re:')
    expect(html).not.toContain('Candidature')
  })
})

describe('ModernLetterTemplate: the Swiss letter on A4', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const SENDER: CoverLetterSenderDetails = {
    sender_street: 'Rue de Bourg 1',
    sender_postal_locality: '1003 Lausanne',
    sender_phone: '+41 21 555 01 42',
    sender_email: 'zoe@example.ch',
  }

  it('draws every part in the canonical order', () => {
    const html = render(
      {
        recipient_name: 'Mme Dupont',
        opening_paragraph: FRENCH,
        body_paragraphs: ['<p>Un.</p>', '<p>Deux.</p>'],
        closing_paragraph: '<p>Merci.</p>',
      },
      'fr',
      SENDER,
    )

    expect(partOrder(html)).toEqual([
      'sender',
      'recipient',
      'placeDate',
      'subject',
      'greeting',
      'opening',
      'body',
      'body',
      'closing',
      'signOff',
      'signature',
      'annexes',
    ])
  })

  it('prints the sender details it is given, and the place-and-date line from their locality', () => {
    const html = render({ opening_paragraph: FRENCH }, 'fr', SENDER)

    for (const line of ['Zoë Lovelace', 'Rue de Bourg 1', '1003 Lausanne', '+41 21 555 01 42', 'zoe@example.ch']) {
      expect(html).toContain(`<div>${line}</div>`)
    }
    expect(html).toContain('Lausanne, le 5 novembre 2026')
  })

  it('draws an A4 page at 11 pt, left-aligned, within the FR-2 margins', () => {
    const html = render({}, 'fr')
    const { padding } = SWISS_LETTER_LAYOUT_PX

    expect(html).toContain('width:794px')
    expect(html).toContain('min-height:1123px')
    expect(html).toContain(`padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`)
    expect(html).toContain(`font-size:${SWISS_LETTER_LAYOUT_PX.fontSize}px`)
    expect(html).toContain('text-left')
    expect(html).not.toContain('text-justify')
  })

  it('places the recipient block in the window zone', () => {
    const html = render({ recipient_name: 'Mme Dupont' }, 'fr')
    const { window } = SWISS_LETTER_LAYOUT_PX

    expect(html).toContain(`margin-top:${window.top}px;margin-left:${window.left}px;width:${window.width}px`)
  })
})
