import { describe, expect, it } from 'vitest'
import { COVER_LETTER_WORDING, formatCoverLetterDate, type CoverLetterLanguage } from './cover-letter-language'
import { effectiveSenderDetails, type CoverLetterSenderDetails } from './cover-letter-sender'
import {
  SWISS_LETTER_FONT_SIZE_PT,
  SWISS_LETTER_GEOMETRY_MM,
  SWISS_LETTER_LAYOUT_PX,
  SWISS_LETTER_LINE_HEIGHT,
  SWISS_LETTER_PAGE_PX,
  SWISS_LETTER_SPACE_BEFORE_LINES,
  SWISS_LETTER_WINDOW_MAX_LINES,
  mmToPx,
  ptToPx,
  swissLetterParts,
  swissLetterPlace,
  swissLetterRecipientLines,
  swissLetterSpaceBeforePx,
  type SwissLetterFields,
  type SwissLetterPart,
} from './cover-letter-swiss-letter'

const LANGUAGES: readonly CoverLetterLanguage[] = ['fr', 'en', 'de', 'it']

/** 5 November 2026, in local time, as `formatCoverLetterDate` formats in local time. */
const NOVEMBER_5_2026 = new Date(2026, 10, 5)

const LETTER: SwissLetterFields = {
  sender_name: 'Zoë Lovelace',
  recipient_name: 'Mme Claire Dupont',
  recipient_title: 'Responsable RH',
  company_name: 'Acme SA',
  company_address: 'Avenue de la Gare 10\n1003 Lausanne',
  job_title: 'Ingénieur logiciel',
  greeting: '',
  opening_paragraph: '<p>Opening</p>',
  body_paragraphs: ['<p>Body one</p>', '<p>Body two</p>'],
  closing_paragraph: '<p>Closing</p>',
  sign_off: '',
  annexes: null,
}

const SENDER: CoverLetterSenderDetails = {
  sender_street: 'Rue de Bourg 1',
  sender_postal_locality: '1003 Lausanne',
  sender_phone: '+41 21 555 01 42',
  sender_email: 'zoe@example.ch',
}

const parts = (
  letter: Partial<SwissLetterFields> = {},
  senderDetails: Partial<CoverLetterSenderDetails> = {},
  language: CoverLetterLanguage = 'fr',
) =>
  swissLetterParts(
    { ...LETTER, ...letter },
    { senderDetails: { ...SENDER, ...senderDetails }, date: formatCoverLetterDate(NOVEMBER_5_2026, language), language },
  )

const part = <K extends SwissLetterPart['kind']>(list: SwissLetterPart[], kind: K) =>
  list.find((candidate): candidate is SwissLetterPart & { kind: K } => candidate.kind === kind)

describe('swissLetterParts: the parts and their order', () => {
  it('prints every part, top to bottom, in the Swiss order', () => {
    expect(parts()).toEqual([
      {
        kind: 'sender',
        lines: ['Zoë Lovelace', 'Rue de Bourg 1', '1003 Lausanne', '+41 21 555 01 42', 'zoe@example.ch'],
      },
      {
        kind: 'recipient',
        lines: [
          { text: 'Mme Claire Dupont', multiline: false },
          { text: 'Responsable RH', multiline: false },
          { text: 'Acme SA', multiline: false },
          { text: 'Avenue de la Gare 10\n1003 Lausanne', multiline: true },
        ],
      },
      { kind: 'placeDate', text: 'Lausanne, le 5 novembre 2026' },
      { kind: 'subject', text: 'Candidature au poste de Ingénieur logiciel' },
      { kind: 'greeting', text: 'Madame, Monsieur,' },
      { kind: 'opening', html: '<p>Opening</p>' },
      { kind: 'body', html: '<p>Body one</p>' },
      { kind: 'body', html: '<p>Body two</p>' },
      { kind: 'closing', html: '<p>Closing</p>' },
      { kind: 'signOff', text: 'Meilleures salutations' },
      { kind: 'signature', text: 'Zoë Lovelace' },
      { kind: 'annexes', label: 'Annexes', text: 'CV, certificats de travail, diplômes' },
    ])
  })

  it('leaves out empty and whitespace-only sender lines', () => {
    expect(part(parts({}, { sender_street: '', sender_phone: '   ', sender_email: null }), 'sender')?.lines).toEqual([
      'Zoë Lovelace',
      '1003 Lausanne',
    ])
  })

  it('leaves out the sender block, and the signature, when nothing of the sender has text', () => {
    const list = parts(
      { sender_name: ' ' },
      { sender_street: null, sender_postal_locality: null, sender_phone: '', sender_email: null },
    )
    expect(part(list, 'sender')).toBeUndefined()
    expect(part(list, 'signature')).toBeUndefined()
  })

  it('leaves out empty recipient lines, and the block when none is left', () => {
    expect(part(parts({ recipient_title: ' ', company_address: '' }), 'recipient')?.lines).toEqual([
      { text: 'Mme Claire Dupont', multiline: false },
      { text: 'Acme SA', multiline: false },
    ])
    const none = parts({ recipient_name: null, recipient_title: null, company_name: '', company_address: null })
    expect(part(none, 'recipient')).toBeUndefined()
  })

  it('leaves out the subject without a job title, and empty body paragraphs', () => {
    const list = parts({ job_title: null, body_paragraphs: ['', '<p>Kept</p>', '  '] })
    expect(part(list, 'subject')).toBeUndefined()
    expect(list.filter((candidate) => candidate.kind === 'body')).toEqual([{ kind: 'body', html: '<p>Kept</p>' }])
  })

  it('prints what the user wrote exactly as written, "ß" included', () => {
    const list = parts({ greeting: 'Sehr geehrter Herr Strauß,', sign_off: 'Mit freundlichen Grüßen,', annexes: 'Zeugnisse\n  Diplome' })
    expect(part(list, 'greeting')?.text).toBe('Sehr geehrter Herr Strauß,')
    expect(part(list, 'signOff')?.text).toBe('Mit freundlichen Grüßen,')
    expect(part(list, 'annexes')?.text).toBe('Zeugnisse\n  Diplome')
  })
})

describe('swissLetterParts: the Annexes block', () => {
  it('prints the default list in the letter language when the annexes were never set', () => {
    for (const language of LANGUAGES) {
      expect(part(parts({ annexes: null }, {}, language), 'annexes')).toEqual({
        kind: 'annexes',
        label: COVER_LETTER_WORDING[language].annexesLabel,
        text: COVER_LETTER_WORDING[language].defaultAnnexes,
      })
    }
  })

  it('prints no Annexes block when the user cleared them', () => {
    expect(part(parts({ annexes: '' }), 'annexes')).toBeUndefined()
  })

  it('prints the default list for whitespace only, as the editor stores it', () => {
    expect(part(parts({ annexes: '   ' }), 'annexes')?.text).toBe('CV, certificats de travail, diplômes')
  })

  it('prints a stored list as stored, last', () => {
    const list = parts({ annexes: 'CV, diplômes' })
    expect(list.at(-1)).toEqual({ kind: 'annexes', label: 'Annexes', text: 'CV, diplômes' })
  })
})

describe('swissLetterParts: the sender details', () => {
  it('prints the effective sender details: the stored ones, the linked CV for those never set', () => {
    const stored: CoverLetterSenderDetails = {
      sender_street: 'Rue de Bourg 1',
      sender_postal_locality: null,
      sender_phone: '',
      sender_email: null,
    }
    const contact = { phone: '+41 79 000 00 00', email: 'cv@example.ch', location: '8001 Zürich' }
    const list = swissLetterParts(LETTER, {
      senderDetails: effectiveSenderDetails(stored, contact),
      date: formatCoverLetterDate(NOVEMBER_5_2026, 'de'),
      language: 'de',
    })
    // The cleared phone stays empty; the e-mail and locality come from the CV.
    expect(part(list, 'sender')?.lines).toEqual(['Zoë Lovelace', 'Rue de Bourg 1', '8001 Zürich', 'cv@example.ch'])
    expect(part(list, 'placeDate')?.text).toBe('Zürich, 5. November 2026')
  })
})

describe('FR-3: swissLetterPlace', () => {
  it('removes a leading four-digit postcode and the space after it', () => {
    expect(swissLetterPlace('1003 Lausanne')).toBe('Lausanne')
    expect(swissLetterPlace('8001 Zürich')).toBe('Zürich')
    expect(swissLetterPlace('  1700  Fribourg ')).toBe('Fribourg')
  })

  it('keeps a locality without a postcode', () => {
    expect(swissLetterPlace('Lausanne')).toBe('Lausanne')
    expect(swissLetterPlace('La Chaux-de-Fonds')).toBe('La Chaux-de-Fonds')
  })

  it('keeps digits that are not a leading four-digit postcode', () => {
    expect(swissLetterPlace('12345 Paris')).toBe('12345 Paris')
  })

  it('returns null when nothing remains', () => {
    expect(swissLetterPlace(null)).toBeNull()
    expect(swissLetterPlace('')).toBeNull()
    expect(swissLetterPlace('   ')).toBeNull()
    expect(swissLetterPlace('1003')).toBeNull()
    expect(swissLetterPlace('1003 ')).toBeNull()
  })
})

describe('FR-4 and FR-5: the Swiss wording per language', () => {
  const swiss = (language: CoverLetterLanguage, senderDetails: Partial<CoverLetterSenderDetails> = {}) => {
    const list = parts({ job_title: 'Engineer' }, senderDetails, language)
    return {
      placeDate: part(list, 'placeDate')?.text,
      subject: part(list, 'subject')?.text,
      greeting: part(list, 'greeting')?.text,
      signOff: part(list, 'signOff')?.text,
      annexes: part(list, 'annexes'),
    }
  }

  it.each([
    ['fr', 'Lausanne, le 5 novembre 2026', 'Candidature au poste de Engineer', 'Madame, Monsieur,', 'Meilleures salutations', 'Annexes', 'CV, certificats de travail, diplômes'],
    ['de', 'Lausanne, 5. November 2026', 'Bewerbung als Engineer', 'Sehr geehrte Damen und Herren,', 'Freundliche Grüsse', 'Beilagen', 'Lebenslauf, Arbeitszeugnisse, Diplome'],
    ['it', 'Lausanne, 5 novembre 2026', 'Candidatura per la posizione di Engineer', 'Gentili Signore e Signori,', 'Distinti saluti', 'Allegati', 'CV, certificati di lavoro, diplomi'],
    ['en', 'Lausanne, 5 November 2026', 'Application for Engineer', 'Dear Hiring Manager,', 'Kind regards', 'Enclosures', 'CV, references, diplomas'],
  ] as const)('%s', (language, placeDate, subject, greeting, signOff, label, list) => {
    expect(swiss(language)).toEqual({
      placeDate,
      subject,
      greeting,
      signOff,
      annexes: { kind: 'annexes', label, text: list },
    })
  })

  it.each([
    ['fr', '5 novembre 2026'],
    ['de', '5. November 2026'],
    ['it', '5 novembre 2026'],
    ['en', '5 November 2026'],
  ] as const)('prints the %s date alone without a locality', (language, date) => {
    expect(swiss(language, { sender_postal_locality: null }).placeDate).toBe(date)
    expect(swiss(language, { sender_postal_locality: '1003' }).placeDate).toBe(date)
  })

  it('has no default wording with "ß", and no subject label', () => {
    for (const language of LANGUAGES) {
      const wording = COVER_LETTER_WORDING[language]
      const defaults = [
        wording.subject('Engineer'),
        wording.defaultGreeting,
        wording.defaultSignOff,
        wording.annexesLabel,
        wording.defaultAnnexes,
        wording.placeDate('Lausanne', formatCoverLetterDate(NOVEMBER_5_2026, language)),
      ]
      for (const text of defaults) expect(text).not.toContain('ß')
      expect(wording.subject('Engineer')).not.toMatch(/^(Re:|Objet\s*:|Betreff:|Oggetto:)/)
      expect(wording.defaultSignOff).not.toMatch(/,$/)
    }
  })
})

describe('FR-2: positions on the A4 page', () => {
  it('is A4: 210 x 297 mm, 794 x 1123 CSS px', () => {
    expect([SWISS_LETTER_GEOMETRY_MM.pageWidth, SWISS_LETTER_GEOMETRY_MM.pageHeight]).toEqual([210, 297])
    expect(SWISS_LETTER_PAGE_PX).toEqual({ width: 794, height: 1123 })
    expect(Math.abs(SWISS_LETTER_PAGE_PX.width - mmToPx(210))).toBeLessThan(0.5)
    expect(Math.abs(SWISS_LETTER_PAGE_PX.height - mmToPx(297))).toBeLessThan(0.5)
  })

  it('has the FR-2 margins, and 11 pt type', () => {
    const { marginTop, marginRight, marginLeft } = SWISS_LETTER_GEOMETRY_MM
    expect(marginLeft).toBe(25)
    expect(marginRight).toBe(20)
    expect(marginTop).toBeGreaterThanOrEqual(15)
    expect(marginTop).toBeLessThanOrEqual(20)
    expect(SWISS_LETTER_FONT_SIZE_PT).toBe(11)

    expect(SWISS_LETTER_LAYOUT_PX.padding).toEqual({
      top: mmToPx(marginTop),
      right: mmToPx(20),
      bottom: mmToPx(SWISS_LETTER_GEOMETRY_MM.marginBottom),
      left: mmToPx(25),
    })
    expect(SWISS_LETTER_LAYOUT_PX.fontSize).toBeCloseTo(14.667, 3)
    expect(SWISS_LETTER_LAYOUT_PX.lineHeight).toBeCloseTo(ptToPx(11) * SWISS_LETTER_LINE_HEIGHT)
  })

  it('puts the window zone 110 mm from the left edge and 50 mm from the top, inside the right margin', () => {
    const { window, padding } = SWISS_LETTER_LAYOUT_PX
    expect(padding.left + window.left).toBeCloseTo(mmToPx(110))
    expect(padding.top + window.top).toBeCloseTo(mmToPx(50))
    expect(window.width).toBeLessThanOrEqual(mmToPx(85))
    expect(padding.left + window.left + window.width).toBeCloseTo(mmToPx(210 - 20))
    expect(SWISS_LETTER_WINDOW_MAX_LINES).toBe(6)
    expect(window.height).toBeCloseTo(6 * SWISS_LETTER_LAYOUT_PX.lineHeight)
  })

  it('keeps the sender block left of the window zone', () => {
    const { senderWidth, window } = SWISS_LETTER_LAYOUT_PX
    expect(senderWidth).toBeLessThan(window.left)
  })

  it('starts the place-and-date line one line below the window zone', () => {
    expect(SWISS_LETTER_SPACE_BEFORE_LINES.placeDate).toBe(1)
    expect(swissLetterSpaceBeforePx('placeDate')).toBeCloseTo(SWISS_LETTER_LAYOUT_PX.lineHeight)
  })
})

describe('swissLetterRecipientLines: the recipient block the window holds', () => {
  it('lists the lines with text, in print order, the address keeping its line breaks', () => {
    expect(
      swissLetterRecipientLines({
        recipient_name: 'Madame Claire Dupont',
        recipient_title: '   ',
        company_name: 'Acme SA',
        company_address: 'Avenue de la Gare 10\n1000 Lausanne',
      }),
    ).toEqual([
      { text: 'Madame Claire Dupont', multiline: false },
      { text: 'Acme SA', multiline: false },
      { text: 'Avenue de la Gare 10\n1000 Lausanne', multiline: true },
    ])
  })

  it('is empty when no line has text', () => {
    expect(
      swissLetterRecipientLines({ recipient_name: null, recipient_title: '', company_name: ' ', company_address: null }),
    ).toEqual([])
  })
})
