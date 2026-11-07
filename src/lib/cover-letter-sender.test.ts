import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { COVER_LETTER_FIELD_LIMITS } from './cover-letter-limits'
import {
  COVER_LETTER_NO_ANNEXES,
  coverLetterSenderFieldsShape,
  effectiveSenderDetails,
  normalizeAnnexes,
  senderDetailsFromContact,
  validateCoverLetterSenderFields,
  type CoverLetterSenderDetails,
} from './cover-letter-sender'

/**
 * cover-letter-swiss-format, US-001: the validation the create and update
 * APIs and the editor share for the five new columns, the annexes'
 * normalization, and the automatic fallback to the linked CV.
 */

const schema = z.object(coverLetterSenderFieldsShape)
const FIELDS = ['sender_street', 'sender_postal_locality', 'sender_phone', 'sender_email', 'annexes'] as const

const EMPTY: CoverLetterSenderDetails = {
  sender_street: null,
  sender_postal_locality: null,
  sender_phone: null,
  sender_email: null,
}

const CONTACT = {
  name: 'Alex Rivera',
  email: 'alex.rivera@example.test',
  phone: '+41 21 555 0142',
  location: '1003 Lausanne',
}

/** An address of exactly `length` characters. */
const emailOfLength = (length: number) => `${'a'.repeat(length - '@example.ch'.length)}@example.ch`

describe('coverLetterSenderFieldsShape', () => {
  it('has a limit in COVER_LETTER_FIELD_LIMITS for each of the five fields', () => {
    expect(Object.keys(coverLetterSenderFieldsShape).sort()).toEqual([...FIELDS].sort())
    for (const field of FIELDS) expect(COVER_LETTER_FIELD_LIMITS[field]).toBeGreaterThan(0)
  })

  it('accepts each field absent, null, or empty', () => {
    expect(schema.safeParse({}).success).toBe(true)
    for (const field of FIELDS) {
      expect(schema.safeParse({ [field]: null }).success, `${field}: null`).toBe(true)
      expect(schema.safeParse({ [field]: '' }).success, `${field}: ''`).toBe(true)
    }
  })

  it.each(['sender_street', 'sender_postal_locality', 'sender_phone', 'annexes'] as const)(
    'accepts %s at its limit and refuses it one over',
    (field) => {
      const limit = COVER_LETTER_FIELD_LIMITS[field]
      expect(schema.safeParse({ [field]: 'x'.repeat(limit) }).success).toBe(true)
      expect(schema.safeParse({ [field]: 'x'.repeat(limit + 1) }).success).toBe(false)
    },
  )

  it('accepts an e-mail at its limit and refuses one over', () => {
    const limit = COVER_LETTER_FIELD_LIMITS.sender_email
    expect(schema.safeParse({ sender_email: emailOfLength(limit) }).success).toBe(true)
    expect(schema.safeParse({ sender_email: emailOfLength(limit + 1) }).success).toBe(false)
  })

  it.each(['not-an-email', 'alex@', '@example.ch', 'alex rivera@example.ch', ' ', '<b>x</b>@example.ch'])(
    'refuses the e-mail %j',
    (email) => {
      expect(schema.safeParse({ sender_email: email }).success).toBe(false)
    },
  )

  it('accepts a well-formed e-mail', () => {
    expect(schema.safeParse({ sender_email: 'alex.rivera@example.ch' }).success).toBe(true)
  })

  it('refuses a value that is not a string', () => {
    for (const field of FIELDS) expect(schema.safeParse({ [field]: 42 }).success, field).toBe(false)
  })

  it('keeps an empty annexes and a null annexes apart', () => {
    expect(schema.parse({ annexes: '' }).annexes).toBe(COVER_LETTER_NO_ANNEXES)
    expect(schema.parse({ annexes: null }).annexes).toBeNull()
    expect('annexes' in schema.parse({})).toBe(false)
  })

  it('keeps Unicode text exactly', () => {
    const value = { sender_street: 'Bahnhofstrasse 1', sender_postal_locality: '8001 Zürich', sender_phone: '+41 21 555 01 42' }
    expect(schema.parse(value)).toEqual(value)
  })
})

describe('validateCoverLetterSenderFields', () => {
  it('accepts what the schema accepts', () => {
    expect(
      validateCoverLetterSenderFields({
        sender_street: 'Rue de Bourg 12',
        sender_postal_locality: null,
        sender_phone: '',
        sender_email: 'alex@example.ch',
        annexes: '',
      }),
    ).toEqual({})
    expect(validateCoverLetterSenderFields({})).toEqual({})
  })

  it('names an e-mail that is not an address', () => {
    expect(validateCoverLetterSenderFields({ sender_email: 'alex at example' })).toEqual({ sender_email: 'invalidEmail' })
  })

  it('names every field over its limit, the e-mail included', () => {
    const over = (field: (typeof FIELDS)[number]) => 'x'.repeat(COVER_LETTER_FIELD_LIMITS[field] + 1)
    expect(
      validateCoverLetterSenderFields({
        sender_street: over('sender_street'),
        sender_postal_locality: over('sender_postal_locality'),
        sender_phone: over('sender_phone'),
        sender_email: emailOfLength(COVER_LETTER_FIELD_LIMITS.sender_email + 1),
        annexes: over('annexes'),
      }),
    ).toEqual({
      sender_street: 'tooLong',
      sender_postal_locality: 'tooLong',
      sender_phone: 'tooLong',
      sender_email: 'tooLong',
      annexes: 'tooLong',
    })
  })

  it('refuses exactly what the API schema refuses', () => {
    const cases = [
      { sender_email: 'nope' },
      { sender_phone: 'x'.repeat(COVER_LETTER_FIELD_LIMITS.sender_phone + 1) },
      { annexes: 'CV' },
      { sender_email: '' },
      { sender_street: null },
    ]
    for (const values of cases) {
      const refused = Object.keys(validateCoverLetterSenderFields(values)).length > 0
      expect(refused, JSON.stringify(values)).toBe(!schema.safeParse(values).success)
    }
  })
})

describe('normalizeAnnexes', () => {
  it('keeps null (the default list) and the empty string (no Annexes block) apart', () => {
    expect(normalizeAnnexes(null)).toBeNull()
    expect(normalizeAnnexes(COVER_LETTER_NO_ANNEXES)).toBe('')
  })

  it('turns whitespace-only annexes into null, the default list', () => {
    expect(normalizeAnnexes('   ')).toBeNull()
    expect(normalizeAnnexes('\n\t ')).toBeNull()
  })

  it('trims the ends of a list and keeps its text', () => {
    expect(normalizeAnnexes('  CV, Diplôme Zürich \n')).toBe('CV, Diplôme Zürich')
    expect(normalizeAnnexes('CV\ncertificats')).toBe('CV\ncertificats')
  })
})

describe('senderDetailsFromContact', () => {
  it('takes the phone, the e-mail and the location, and no street', () => {
    expect(senderDetailsFromContact(CONTACT)).toEqual({
      sender_street: null,
      sender_postal_locality: '1003 Lausanne',
      sender_phone: '+41 21 555 0142',
      sender_email: 'alex.rivera@example.test',
    })
  })

  it('copies the location as it is', () => {
    expect(senderDetailsFromContact({ location: 'Lausanne, Switzerland' }).sender_postal_locality).toBe(
      'Lausanne, Switzerland',
    )
  })

  it('gives null for what the CV lacks, is blank, or is not a string', () => {
    expect(senderDetailsFromContact({ phone: '   ', email: 7, location: undefined })).toEqual(EMPTY)
    expect(senderDetailsFromContact(null)).toEqual(EMPTY)
    expect(senderDetailsFromContact('contact')).toEqual(EMPTY)
  })

  it('leaves out an e-mail the API would refuse', () => {
    expect(senderDetailsFromContact({ email: 'not an email' }).sender_email).toBeNull()
  })

  it('keeps plain text only', () => {
    expect(senderDetailsFromContact({ phone: '+41 21<script>x</script> 555', location: '<b>Zürich</b>' })).toMatchObject({
      sender_phone: '+41 21 555',
      sender_postal_locality: 'Zürich',
    })
  })

  it('cuts each value to its column limit', () => {
    const details = senderDetailsFromContact({
      phone: '1'.repeat(COVER_LETTER_FIELD_LIMITS.sender_phone + 10),
      location: 'L'.repeat(COVER_LETTER_FIELD_LIMITS.sender_postal_locality + 10),
    })
    expect(details.sender_phone).toHaveLength(COVER_LETTER_FIELD_LIMITS.sender_phone)
    expect(details.sender_postal_locality).toHaveLength(COVER_LETTER_FIELD_LIMITS.sender_postal_locality)
  })
})

describe('effectiveSenderDetails', () => {
  it('falls back to the CV for every detail never set (null), except the street', () => {
    expect(effectiveSenderDetails(EMPTY, CONTACT)).toEqual({
      sender_street: null,
      sender_postal_locality: '1003 Lausanne',
      sender_phone: '+41 21 555 0142',
      sender_email: 'alex.rivera@example.test',
    })
  })

  it('uses a stored value as it is stored, never the CV', () => {
    const stored = {
      sender_street: 'Rue de Bourg 12',
      sender_postal_locality: '8001 Zürich',
      sender_phone: '+41 44 000 00 00',
      sender_email: 'mine@example.ch',
    }
    expect(effectiveSenderDetails(stored, CONTACT)).toEqual(stored)
  })

  it.each(['sender_postal_locality', 'sender_phone', 'sender_email'] as const)(
    'keeps %s empty when the user cleared it (empty string): no fallback',
    (field) => {
      expect(effectiveSenderDetails({ ...EMPTY, [field]: '' }, CONTACT)[field]).toBe('')
    },
  )

  it('falls back field by field: a set field does not stop the others', () => {
    expect(effectiveSenderDetails({ ...EMPTY, sender_phone: '+41 79 000 00 00' }, CONTACT)).toEqual({
      sender_street: null,
      sender_postal_locality: '1003 Lausanne',
      sender_phone: '+41 79 000 00 00',
      sender_email: 'alex.rivera@example.test',
    })
  })

  it('gives no e-mail for a CV e-mail that is not an address', () => {
    expect(effectiveSenderDetails(EMPTY, { ...CONTACT, email: 'alex at example' }).sender_email).toBeNull()
  })

  it('without a CV, keeps the stored details and nothing else', () => {
    expect(effectiveSenderDetails(EMPTY, null)).toEqual(EMPTY)
    expect(effectiveSenderDetails({ ...EMPTY, sender_phone: '' }, null)).toEqual({ ...EMPTY, sender_phone: '' })
  })

  it('treats a missing column as never set', () => {
    expect(effectiveSenderDetails({} as CoverLetterSenderDetails, CONTACT).sender_phone).toBe('+41 21 555 0142')
  })
})
