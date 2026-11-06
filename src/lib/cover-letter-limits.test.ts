import { describe, expect, it } from 'vitest'
import type { CoverLetterPdfFields } from './cover-letter-pdf-html'
import { COVER_LETTER_FIELD_LIMITS, COVER_LETTER_PDF_GUARD, isCoverLetterWithinPdfGuard } from './cover-letter-limits'

function letter(overrides: Partial<CoverLetterPdfFields> = {}): CoverLetterPdfFields {
  return {
    sender_name: 'Ada Lovelace',
    recipient_name: 'Charles Babbage',
    recipient_title: 'Head of Engineering',
    company_name: 'Analytical Engines SA',
    company_address: '12 Rue du Calcul',
    job_title: 'Engineer',
    greeting: 'Dear Mr. Babbage,',
    opening_paragraph: '<p>Opening</p>',
    body_paragraphs: ['<p>Body</p>'],
    closing_paragraph: '<p>Closing</p>',
    sign_off: 'Sincerely,',
    sender_street: 'Rue de Bourg 12',
    sender_postal_locality: '1003 Lausanne',
    sender_phone: '+41 21 555 01 42',
    sender_email: 'ada@example.ch',
    annexes: null,
    ...overrides,
  }
}

const over = (limit: number) => 'x'.repeat(limit + 1)
const at = (limit: number) => 'x'.repeat(limit)

describe('COVER_LETTER_FIELD_LIMITS', () => {
  it('keeps the values the cover-letter APIs have always validated with, unchanged', () => {
    expect(COVER_LETTER_FIELD_LIMITS).toEqual({
      title: 255,
      recipient_name: 255,
      recipient_title: 255,
      company_name: 255,
      company_address: 1000,
      greeting: 255,
      opening_paragraph: 5000,
      body_paragraph: 5000,
      closing_paragraph: 5000,
      sign_off: 255,
      sender_name: 255,
      sender_street: 255,
      sender_postal_locality: 255,
      sender_phone: 50,
      sender_email: 254,
      annexes: 1000,
      job_title: 255,
      job_description: 50000,
    })
  })
})

describe('isCoverLetterWithinPdfGuard', () => {
  const guard = COVER_LETTER_PDF_GUARD

  it('is a resource bound far above the API input limits, not a copy of them', () => {
    expect(guard).toEqual({ richTextField: 20_000, plainTextField: 2_000, bodyParagraphs: 50, totalPrinted: 200_000 })
    expect(guard.richTextField).toBeGreaterThan(COVER_LETTER_FIELD_LIMITS.body_paragraph)
    expect(guard.plainTextField).toBeGreaterThan(COVER_LETTER_FIELD_LIMITS.company_address)
  })

  it('accepts an ordinary letter, and one with empty or missing parts', () => {
    expect(isCoverLetterWithinPdfGuard(letter())).toBe(true)
    expect(
      isCoverLetterWithinPdfGuard(letter({ sender_name: null, opening_paragraph: null, body_paragraphs: null })),
    ).toBe(true)
  })

  it('accepts a letter over the API limits, as the editor can save it', () => {
    const overApi = over(COVER_LETTER_FIELD_LIMITS.body_paragraph)
    expect(
      isCoverLetterWithinPdfGuard(
        letter({
          opening_paragraph: overApi,
          body_paragraphs: [overApi],
          closing_paragraph: overApi,
          greeting: over(COVER_LETTER_FIELD_LIMITS.greeting),
        }),
      ),
    ).toBe(true)
  })

  it.each(['opening_paragraph', 'closing_paragraph'] as const)(
    'accepts %s at the rich-text guard and refuses it one over',
    (field) => {
      expect(isCoverLetterWithinPdfGuard(letter({ [field]: at(guard.richTextField) }))).toBe(true)
      expect(isCoverLetterWithinPdfGuard(letter({ [field]: over(guard.richTextField) }))).toBe(false)
    },
  )

  it('applies the rich-text guard to each body paragraph', () => {
    expect(isCoverLetterWithinPdfGuard(letter({ body_paragraphs: ['ok', at(guard.richTextField)] }))).toBe(true)
    expect(isCoverLetterWithinPdfGuard(letter({ body_paragraphs: ['ok', over(guard.richTextField)] }))).toBe(false)
  })

  it.each([
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
  ] as const)('accepts %s at the plain-text guard and refuses it one over', (field) => {
    expect(isCoverLetterWithinPdfGuard(letter({ [field]: at(guard.plainTextField) }))).toBe(true)
    expect(isCoverLetterWithinPdfGuard(letter({ [field]: over(guard.plainTextField) }))).toBe(false)
  })

  it('bounds the number of body paragraphs', () => {
    const paragraphs = (n: number) => Array.from({ length: n }, () => '<p>p</p>')
    expect(isCoverLetterWithinPdfGuard(letter({ body_paragraphs: paragraphs(guard.bodyParagraphs) }))).toBe(true)
    expect(isCoverLetterWithinPdfGuard(letter({ body_paragraphs: paragraphs(guard.bodyParagraphs + 1) }))).toBe(false)
  })

  it('bounds everything printed together, with every field under its own guard', () => {
    // Ten body paragraphs at the field guard are exactly the total; one more character is over.
    const tenAtGuard = Array.from({ length: 10 }, () => at(guard.richTextField))
    const nothingElse = {
      sender_name: null,
      recipient_name: null,
      recipient_title: null,
      company_name: null,
      company_address: null,
      job_title: null,
      greeting: '',
      opening_paragraph: null,
      closing_paragraph: null,
      sign_off: '',
      sender_street: null,
      sender_postal_locality: null,
      sender_phone: null,
      sender_email: null,
      annexes: null,
    }
    expect(isCoverLetterWithinPdfGuard(letter({ ...nothingElse, body_paragraphs: tenAtGuard }))).toBe(true)
    expect(isCoverLetterWithinPdfGuard(letter({ ...nothingElse, body_paragraphs: tenAtGuard, sign_off: 'x' }))).toBe(false)
    // The sender details and the annexes print, so they count towards the total too.
    for (const field of ['sender_street', 'sender_postal_locality', 'sender_phone', 'sender_email', 'annexes'] as const) {
      expect(isCoverLetterWithinPdfGuard(letter({ ...nothingElse, body_paragraphs: tenAtGuard, [field]: 'x' })), field).toBe(false)
    }
    expect(isCoverLetterWithinPdfGuard(letter({ body_paragraphs: tenAtGuard }))).toBe(false)
  })

  it('counts only the paragraphs that print: items that are not strings are ignored', () => {
    const body = [...Array.from({ length: guard.bodyParagraphs }, () => 'p'), null, 3, { x: 1 }]
    expect(isCoverLetterWithinPdfGuard(letter({ body_paragraphs: body }))).toBe(true)
    expect(isCoverLetterWithinPdfGuard(letter({ body_paragraphs: { not: 'an array' } }))).toBe(true)
  })
})
