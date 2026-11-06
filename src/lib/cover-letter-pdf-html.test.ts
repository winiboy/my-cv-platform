import { describe, expect, it, vi } from 'vitest'
import {
  buildCoverLetterPdfHtml,
  coverLetterBodyParagraphs,
  coverLetterExportLanguage,
  coverLetterLanguage,
  coverLetterParts,
  type CoverLetterPdfFields,
} from './cover-letter-pdf-html'
import { effectiveSenderDetails } from './cover-letter-sender'
import { SWISS_LETTER_LAYOUT_PX, swissLetterParts } from './cover-letter-swiss-letter'

const CURRENT_DATE = 'September 15, 2026'
const IMG_PAYLOAD = '<img src=x onerror=alert(1)>'
const ESCAPED_IMG_PAYLOAD = '&lt;img src=x onerror=alert(1)&gt;'

const passthrough = (html: string): string => html

function makeCoverLetter(overrides: Partial<CoverLetterPdfFields> = {}): CoverLetterPdfFields {
  return {
    sender_name: 'Jane Doe',
    recipient_name: 'John Smith',
    recipient_title: 'Head of Talent',
    company_name: 'Acme',
    company_address: '1 Main Street',
    job_title: 'Engineer',
    greeting: 'Dear John,',
    opening_paragraph: 'Opening',
    body_paragraphs: ['Body one', 'Body two'],
    closing_paragraph: 'Closing',
    sign_off: 'Best regards,',
    sender_street: null,
    sender_postal_locality: null,
    sender_phone: null,
    sender_email: null,
    annexes: null,
    ...overrides,
  }
}

/** The sender details as the route prints them for a letter with no linked CV. */
const storedDetails = (letter: CoverLetterPdfFields) => effectiveSenderDetails(letter, null)

function build(overrides: Partial<CoverLetterPdfFields> = {}): string {
  const letter = makeCoverLetter(overrides)
  return buildCoverLetterPdfHtml(letter, {
    senderDetails: storedDetails(letter),
    currentDate: CURRENT_DATE,
    language: 'en',
    sanitizeRichText: passthrough,
  })
}

/** The `data-letter-part` names of the markup, in document order. */
const partOrder = (html: string) => [...html.matchAll(/data-letter-part="([a-zA-Z]+)"/g)].map((match) => match[1])

describe('buildCoverLetterPdfHtml plain-text fields', () => {
  const PLAIN_TEXT_FIELDS = [
    'sender_name',
    'recipient_name',
    'recipient_title',
    'company_name',
    'company_address',
    'job_title',
    'greeting',
    'sign_off',
    'sender_street',
    'sender_postal_locality',
    'sender_phone',
    'sender_email',
    'annexes',
  ] as const

  it.each(PLAIN_TEXT_FIELDS)('escapes an HTML payload in %s', (field) => {
    const html = build({ [field]: IMG_PAYLOAD })

    expect(html).not.toContain('<img')
    expect(html).toContain(ESCAPED_IMG_PAYLOAD)
  })

  it.each(PLAIN_TEXT_FIELDS)('prevents an attribute-breakout payload in %s', (field) => {
    const html = build({ [field]: '"><script>alert(1)</script>' })

    expect(html).not.toContain('<script')
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('escapes sender_name in both the header and the signature', () => {
    const html = build({ sender_name: IMG_PAYLOAD })

    expect(html).not.toContain('<img')
    expect(html.split(ESCAPED_IMG_PAYLOAD)).toHaveLength(3)
  })

  it('escapes the current date', () => {
    const html = buildCoverLetterPdfHtml(makeCoverLetter(), {
      senderDetails: storedDetails(makeCoverLetter()),
      currentDate: IMG_PAYLOAD,
      language: 'en',
      sanitizeRichText: passthrough,
    })

    expect(html).not.toContain('<img')
    expect(html).toContain(ESCAPED_IMG_PAYLOAD)
  })

  it('renders ampersands in plain text as entities', () => {
    expect(build({ company_name: 'AT&T' })).toContain('<div>AT&amp;T</div>')
  })

  it('escapes the sender details it is given, the CV fallback included, as text', () => {
    const html = buildCoverLetterPdfHtml(makeCoverLetter(), {
      senderDetails: {
        sender_street: '<b>x</b>',
        sender_postal_locality: '1003 <i>Lausanne</i>',
        sender_phone: '<script>alert(1)</script>',
        sender_email: '"><img src=x>@example.ch',
      },
      currentDate: CURRENT_DATE,
      language: 'fr',
      sanitizeRichText: passthrough,
    })
    expect(html).not.toMatch(/<(b|i|script|img)[\s>]/)
    expect(html).toContain('<div>&lt;b&gt;x&lt;/b&gt;</div>')
    expect(html).toContain('<div>1003 &lt;i&gt;Lausanne&lt;/i&gt;</div>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot;&gt;&lt;img src=x&gt;@example.ch')
    // The place of the place-and-date line is the locality, escaped too.
    expect(html).toContain(`&lt;i&gt;Lausanne&lt;/i&gt;, le ${CURRENT_DATE}`)
  })

  it('escapes every recipient line, the address keeping its line breaks', () => {
    const html = build({
      recipient_name: '<b>Name</b>',
      recipient_title: '<i>Title</i>',
      company_name: '<u>Company</u>',
      company_address: '<s>Street 1</s>\n1000 <em>Town</em>',
    })
    expect(html).not.toMatch(/<(b|i|u|s|em)>/)
    expect(html).toContain('<div>&lt;b&gt;Name&lt;/b&gt;</div>')
    expect(html).toContain('<div>&lt;i&gt;Title&lt;/i&gt;</div>')
    expect(html).toContain('<div>&lt;u&gt;Company&lt;/u&gt;</div>')
    expect(html).toContain('<div style="white-space: pre-line;">&lt;s&gt;Street 1&lt;/s&gt;\n1000 &lt;em&gt;Town&lt;/em&gt;</div>')
  })

  it('escapes a stored annexes list and keeps its line breaks', () => {
    const html = build({ annexes: 'CV\n<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img')
    expect(html).toContain(
      '<div>Enclosures</div><div style="white-space: pre-line;">CV\n&lt;img src=x onerror=alert(1)&gt;</div>',
    )
  })
})

describe('buildCoverLetterPdfHtml rich-text fields', () => {
  it('passes each raw rich-text paragraph to the sanitizer', () => {
    const sanitizeRichText = vi.fn(passthrough)

    buildCoverLetterPdfHtml(
      makeCoverLetter({
        opening_paragraph: '<p>Open & <em>go</em></p>',
        body_paragraphs: ['<b>One</b>', '<i>Two</i>'],
        closing_paragraph: '<u>Close</u>',
      }),
      { senderDetails: storedDetails(makeCoverLetter()), currentDate: CURRENT_DATE, language: 'en', sanitizeRichText },
    )

    expect(sanitizeRichText.mock.calls).toEqual([
      ['<p>Open & <em>go</em></p>'],
      ['<b>One</b>'],
      ['<i>Two</i>'],
      ['<u>Close</u>'],
    ])
  })

  it('inserts the sanitizer output verbatim without escaping it', () => {
    const sanitizeRichText = vi.fn(() => '<strong>Bold</strong>')

    const html = buildCoverLetterPdfHtml(makeCoverLetter(), {
      senderDetails: storedDetails(makeCoverLetter()),
      currentDate: CURRENT_DATE,
      language: 'en',
      sanitizeRichText,
    })

    expect(html.split('<strong>Bold</strong>')).toHaveLength(5)
    expect(html).not.toContain('&lt;strong&gt;')
  })

  it('renders no body paragraphs when body_paragraphs is not an array', () => {
    const sanitizeRichText = vi.fn(passthrough)

    const html = buildCoverLetterPdfHtml(
      makeCoverLetter({
        opening_paragraph: null,
        closing_paragraph: null,
        body_paragraphs: { not: 'an array' },
      }),
      { senderDetails: storedDetails(makeCoverLetter()), currentDate: CURRENT_DATE, language: 'en', sanitizeRichText },
    )

    expect(sanitizeRichText).not.toHaveBeenCalled()
    expect(partOrder(html)).not.toContain('body')
  })

  it('leaves out an empty body paragraph, as the preview does, and sanitizes only what prints', () => {
    const sanitizeRichText = vi.fn(passthrough)
    const html = buildCoverLetterPdfHtml(makeCoverLetter({ body_paragraphs: ['', '  ', 'Body one'] }), {
      senderDetails: storedDetails(makeCoverLetter()),
      currentDate: CURRENT_DATE,
      language: 'en',
      sanitizeRichText,
    })
    expect(partOrder(html).filter((kind) => kind === 'body')).toHaveLength(1)
    expect(sanitizeRichText.mock.calls).toEqual([['Opening'], ['Body one'], ['Closing']])
  })
})

describe('buildCoverLetterPdfHtml fallbacks and conditionals', () => {
  // greeting and sign_off are non-nullable in the generated types, so the
  // falsy value reachable through the typed contract is the empty string.
  it('renders the default greeting and sign-off when they are empty', () => {
    const html = build({ greeting: '', sign_off: '' })

    expect(html).toMatch(/<div data-letter-part="greeting" style="[^"]*">Dear Hiring Manager,<\/div>/)
    expect(html).toMatch(/<div data-letter-part="signOff" style="[^"]*">Kind regards<\/div>/)
  })

  it('omits optional blocks when their values are empty or null', () => {
    const html = build({
      sender_name: '',
      recipient_name: null,
      recipient_title: null,
      company_name: null,
      company_address: null,
      job_title: '',
      opening_paragraph: '',
      body_paragraphs: [],
      closing_paragraph: null,
      annexes: '',
    })

    expect(partOrder(html)).toEqual(['placeDate', 'greeting', 'signOff'])
    expect(html).not.toContain('Application for')
  })

  it('prints a recipient title on its own, as the Swiss letter does', () => {
    const html = build({ recipient_name: null, recipient_title: 'Head of Talent', company_name: null, company_address: null })
    expect(html).toMatch(/data-letter-part="recipient"[^>]*><div>Head of Talent<\/div><\/div>/)
  })
})

describe('coverLetterParts: the one list of parts both exports print', () => {
  it('lists every part in the letter order', () => {
    expect(coverLetterParts(makeCoverLetter({ company_address: '1 Main Street\nTown' }), CURRENT_DATE, 'en')).toEqual([
      { kind: 'sender', text: 'Jane Doe' },
      { kind: 'date', text: CURRENT_DATE },
      {
        kind: 'recipient',
        lines: [
          { text: 'John Smith', multiline: false },
          { text: 'Head of Talent', multiline: false },
          { text: 'Acme', multiline: false },
          { text: '1 Main Street\nTown', multiline: true },
        ],
      },
      { kind: 'subject', text: 'Application for Engineer' },
      { kind: 'greeting', text: 'Dear John,' },
      { kind: 'opening', html: 'Opening' },
      { kind: 'body', html: 'Body one' },
      { kind: 'body', html: 'Body two' },
      { kind: 'closing', html: 'Closing' },
      { kind: 'signOff', text: 'Best regards,' },
      { kind: 'signature', text: 'Jane Doe' },
    ])
  })

  it('leaves out empty optional parts and falls back to the default greeting and sign-off', () => {
    const parts = coverLetterParts(
      makeCoverLetter({
        sender_name: '',
        recipient_name: null,
        company_name: null,
        job_title: null,
        greeting: '',
        opening_paragraph: '',
        body_paragraphs: [],
        closing_paragraph: null,
        sign_off: '',
      }),
      CURRENT_DATE,
      'en',
    )
    expect(parts).toEqual([
      { kind: 'date', text: CURRENT_DATE },
      { kind: 'greeting', text: 'Dear Hiring Manager,' },
      { kind: 'signOff', text: 'Kind regards' },
    ])
  })

  it.each([
    ['fr', 'Candidature au poste de Engineer', 'Madame, Monsieur,', 'Meilleures salutations'],
    ['de', 'Bewerbung als Engineer', 'Sehr geehrte Damen und Herren,', 'Freundliche Grüsse'],
    ['it', 'Candidatura per la posizione di Engineer', 'Gentili Signore e Signori,', 'Distinti saluti'],
    ['en', 'Application for Engineer', 'Dear Hiring Manager,', 'Kind regards'],
  ] as const)('words the subject and the empty greeting and sign-off in %s', (language, subject, greeting, signOff) => {
    const parts = coverLetterParts(makeCoverLetter({ greeting: '', sign_off: '' }), CURRENT_DATE, language)
    expect(parts.find((part) => part.kind === 'subject')).toEqual({ kind: 'subject', text: subject })
    expect(parts.find((part) => part.kind === 'greeting')).toEqual({ kind: 'greeting', text: greeting })
    expect(parts.find((part) => part.kind === 'signOff')).toEqual({ kind: 'signOff', text: signOff })
    expect(parts.find((part) => part.kind === 'date')).toEqual({ kind: 'date', text: CURRENT_DATE })
  })

  it.each(['fr', 'de', 'it', 'en'] as const)('prints a stored greeting and sign-off as stored, in %s', (language) => {
    const parts = coverLetterParts(
      makeCoverLetter({ greeting: 'Dear John,', sign_off: 'Best regards,' }),
      CURRENT_DATE,
      language,
    )
    expect(parts.find((part) => part.kind === 'greeting')).toEqual({ kind: 'greeting', text: 'Dear John,' })
    expect(parts.find((part) => part.kind === 'signOff')).toEqual({ kind: 'signOff', text: 'Best regards,' })
  })

  it('prints the localized parts in the PDF markup', () => {
    const html = buildCoverLetterPdfHtml(makeCoverLetter({ greeting: '', sign_off: '' }), {
      senderDetails: storedDetails(makeCoverLetter()),
      currentDate: '2. November 2026',
      language: 'de',
      sanitizeRichText: passthrough,
    })
    expect(html).toContain('2. November 2026')
    expect(html).toContain('<strong>Bewerbung als Engineer</strong>')
    expect(html).toContain('Sehr geehrte Damen und Herren,')
    expect(html).toContain('Freundliche Grüsse')
    expect(html).toContain('<div>Beilagen</div><div style="white-space: pre-line;">Lebenslauf, Arbeitszeugnisse, Diplome</div>')
    expect(html).not.toContain('Application for')
    expect(html).not.toContain('Betreff')
  })
})

describe('buildCoverLetterPdfHtml: the Swiss letter of swissLetterParts', () => {
  const SWISS_LETTER = makeCoverLetter({
    sender_street: 'Rue de Bourg 12',
    sender_postal_locality: '1003 Lausanne',
    sender_phone: '+41 21 555 01 42',
    sender_email: 'jane@example.ch',
    company_address: 'Avenue de la Gare 10\n1003 Lausanne',
  })

  const buildIn = (language: 'fr' | 'de' | 'it' | 'en') =>
    buildCoverLetterPdfHtml(SWISS_LETTER, {
      senderDetails: storedDetails(SWISS_LETTER),
      currentDate: CURRENT_DATE,
      language,
      sanitizeRichText: passthrough,
    })

  it.each(['fr', 'de', 'it', 'en'] as const)('prints the parts of swissLetterParts, in their order and text, in %s', (language) => {
    const html = buildIn(language)
    const parts = swissLetterParts(SWISS_LETTER, { senderDetails: storedDetails(SWISS_LETTER), date: CURRENT_DATE, language })
    expect(partOrder(html)).toEqual(parts.map((part) => part.kind))
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
    // Every part's text, in order (none of these samples needs escaping).
    let from = 0
    for (const part of parts) {
      const texts =
        part.kind === 'sender'
          ? part.lines
          : part.kind === 'recipient'
            ? part.lines.map((line) => line.text)
            : part.kind === 'annexes'
              ? [part.label, part.text]
              : 'html' in part
                ? [part.html]
                : [part.text]
      for (const text of texts) {
        const at = html.indexOf(text, from)
        expect(at, `${part.kind}: ${text}`).toBeGreaterThanOrEqual(from)
        from = at + text.length
      }
    }
  })

  it.each(['fr', 'de', 'it', 'en'] as const)('prints the subject without a label, in %s', (language) => {
    expect(buildIn(language)).not.toMatch(/Betreff|Objet ?:|Oggetto:|Re:/)
  })

  it("draws the preview's geometry: A4 width, FR-2 margins, the window zone, 11 pt, left-aligned", () => {
    const html = build()
    const layout = SWISS_LETTER_LAYOUT_PX
    const round = (value: number) => `${Number(value.toFixed(3))}px`
    expect(html).toMatch(/^<div style="width: 793\.701px; min-height: 1123px; /)
    expect(html).toContain(
      `padding: ${round(layout.padding.top)} ${round(layout.padding.right)} ${round(layout.padding.bottom)} ${round(layout.padding.left)}`,
    )
    expect(html).toContain('font-family: Georgia, serif; font-size: 14.667px;')
    expect(html).toContain(`line-height: ${round(layout.lineHeight)}`)
    expect(html).toContain('text-align: left')
    expect(html).toContain(
      `margin-top: ${round(layout.window.top)}; margin-left: ${round(layout.window.left)}; width: ${round(layout.window.width)}`,
    )
    expect(html).toContain(`display: grid; min-height: ${round(layout.window.top + layout.window.height)}`)
    expect(html).not.toContain('justify')
  })
})

describe('malformed body_paragraphs', () => {
  it('keeps the string paragraphs, in order, and skips anything else', () => {
    expect(coverLetterBodyParagraphs(['One', null, 3, { p: 'x' }, ['y'], 'Two', ''])).toEqual(['One', 'Two', ''])
  })

  it('treats a value that is not an array as no paragraphs', () => {
    expect(coverLetterBodyParagraphs(null)).toEqual([])
    expect(coverLetterBodyParagraphs('<p>One</p>')).toEqual([])
    expect(coverLetterBodyParagraphs({ 0: 'One' })).toEqual([])
  })

  it('builds the letter from the string paragraphs only, never handing the sanitizer a non-string', () => {
    const sanitizeRichText = vi.fn((html: string) => {
      if (typeof html !== 'string') throw new Error('non-string reached the sanitizer')
      return html
    })
    const html = buildCoverLetterPdfHtml(makeCoverLetter({ body_paragraphs: ['Body one', null, 42, 'Body two'] }), {
      senderDetails: storedDetails(makeCoverLetter()),
      currentDate: CURRENT_DATE,
      language: 'en',
      sanitizeRichText,
    })
    expect(html).toContain('Body one')
    expect(html).toContain('Body two')
    expect(html).not.toContain('42')
    expect(html.indexOf('Body one')).toBeLessThan(html.indexOf('Body two'))
  })

  it('builds a letter whose body is not an array, with its other parts', () => {
    const html = build({ body_paragraphs: { broken: true } })
    expect(html).toContain('Opening')
    expect(html).toContain('Closing')
  })
})

describe('coverLetterLanguage: the letter display-language resolver', () => {
  const GERMAN =
    '<p>Mit großem Interesse habe ich Ihre Anzeige gelesen und bewerbe mich für die Stelle als Entwickler.</p>'
  const GERMAN_MORE = '<p>In meiner Erfahrung bei einer Firma habe ich die Aufgaben im Team mit Freude übernommen.</p>'

  it('detects the language from the opening, the body and the closing together', () => {
    const letter = makeCoverLetter({ opening_paragraph: GERMAN, body_paragraphs: [GERMAN_MORE], closing_paragraph: '' })
    expect(coverLetterLanguage(letter, 'fr')).toBe('de')
  })

  it('falls back to the page language for a letter too short to tell', () => {
    expect(coverLetterLanguage(makeCoverLetter(), 'it')).toBe('it')
    expect(
      coverLetterLanguage(makeCoverLetter({ opening_paragraph: null, body_paragraphs: null, closing_paragraph: null }), 'de'),
    ).toBe('de')
  })

  it('reads only the string body paragraphs of a malformed row', () => {
    const letter = makeCoverLetter({ opening_paragraph: '', body_paragraphs: [GERMAN, 42, null, GERMAN_MORE], closing_paragraph: '' })
    expect(coverLetterLanguage(letter, 'en')).toBe('de')
  })
})

describe('coverLetterExportLanguage: what both export routes print', () => {
  const GERMAN =
    '<p>Mit großem Interesse habe ich Ihre Anzeige gelesen und bewerbe mich für die Stelle als Entwickler. In meiner Erfahrung bei einer Firma habe ich die Aufgaben im Team mit Freude übernommen.</p>'
  const NOVEMBER_2_2026 = new Date(2026, 10, 2, 12)

  it('formats the date line in the language the letter resolves to', () => {
    expect(coverLetterExportLanguage(makeCoverLetter({ opening_paragraph: GERMAN }), 'fr', NOVEMBER_2_2026)).toEqual({
      language: 'de',
      currentDate: '2. November 2026',
    })
  })

  it('falls back to the page language for both, for a letter too short to tell', () => {
    expect(coverLetterExportLanguage(makeCoverLetter(), 'it', NOVEMBER_2_2026)).toEqual({
      language: 'it',
      currentDate: '2 novembre 2026',
    })
  })
})
