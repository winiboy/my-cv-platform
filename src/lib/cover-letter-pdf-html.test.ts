import { describe, expect, it, vi } from 'vitest'
import {
  buildCoverLetterPdfHtml,
  escapeHtml,
  type CoverLetterPdfFields,
} from './cover-letter-pdf-html'

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
    ...overrides,
  }
}

function build(overrides: Partial<CoverLetterPdfFields> = {}): string {
  return buildCoverLetterPdfHtml(makeCoverLetter(overrides), {
    currentDate: CURRENT_DATE,
    sanitizeRichText: passthrough,
  })
}

describe('escapeHtml', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected)
  })

  it('escapes an existing entity again instead of assuming it is already encoded', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })

  it('returns an empty string for null and undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('leaves text without special characters unchanged', () => {
    expect(escapeHtml('Jane Doe')).toBe('Jane Doe')
  })
})

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
      currentDate: IMG_PAYLOAD,
      sanitizeRichText: passthrough,
    })

    expect(html).not.toContain('<img')
    expect(html).toContain(ESCAPED_IMG_PAYLOAD)
  })

  it('renders ampersands in plain text as entities', () => {
    expect(build({ company_name: 'AT&T' })).toContain('<div>AT&amp;T</div>')
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
      { currentDate: CURRENT_DATE, sanitizeRichText },
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
      currentDate: CURRENT_DATE,
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
      { currentDate: CURRENT_DATE, sanitizeRichText },
    )

    expect(sanitizeRichText).not.toHaveBeenCalled()
    expect(html).not.toContain('text-align: justify')
  })
})

describe('buildCoverLetterPdfHtml fallbacks and conditionals', () => {
  // greeting and sign_off are non-nullable in the generated types, so the
  // falsy value reachable through the typed contract is the empty string.
  it('renders the default greeting and sign-off when they are empty', () => {
    const html = build({ greeting: '', sign_off: '' })

    expect(html).toContain('<div style="margin-bottom: 16px;">Dear Hiring Manager,</div>')
    expect(html).toContain('<div style="margin-bottom: 32px;">Sincerely,</div>')
  })

  it('omits optional blocks when their values are empty or null', () => {
    const html = build({
      sender_name: '',
      recipient_name: null,
      recipient_title: 'Ignored without recipient or company',
      company_name: null,
      company_address: null,
      job_title: '',
      opening_paragraph: '',
      body_paragraphs: [],
      closing_paragraph: null,
    })

    expect(html).not.toContain('font-weight: 600')
    expect(html).not.toContain('Ignored without recipient or company')
    expect(html).not.toContain('Re: Application for')
    expect(html).not.toContain('text-align: justify')
  })
})
