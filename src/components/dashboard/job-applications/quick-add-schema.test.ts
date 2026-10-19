import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import { createQuickAddSchema, type QuickAddMessages } from './quick-add-schema'

/**
 * The quick add schema takes its messages from the dictionary. Each rule must
 * report the locale's own message, and the en messages must be the English
 * the module-level schema reported before.
 */

const MESSAGES: Record<'en' | 'fr' | 'de' | 'it', QuickAddMessages> = {
  en: en.kanban.quickAdd,
  fr: fr.kanban.quickAdd,
  de: de.kanban.quickAdd,
  it: it_.kanban.quickAdd,
}

const VALID = { job_title: 'Designer', company_name: 'Acme', job_url: '' }

/** The message for `field`, or undefined when the input is valid. */
function messageFor(messages: QuickAddMessages, input: Record<string, string>, field: string): string | undefined {
  const result = createQuickAddSchema(messages).safeParse(input)
  if (result.success) return undefined
  const issue = result.error.issues.find((candidate) => candidate.path[0] === field)
  if (!issue) return undefined
  // `job_url` is a union with `''`; the rule's own message sits in the first branch.
  if (issue.code === 'invalid_union') return issue.errors[0]?.[0]?.message
  return issue.message
}

const CASES = [
  { rule: 'empty title', field: 'job_title', input: { ...VALID, job_title: '' }, key: 'jobTitleRequired' },
  { rule: 'title over 255', field: 'job_title', input: { ...VALID, job_title: 'a'.repeat(256) }, key: 'jobTitleTooLong' },
  { rule: 'empty company', field: 'company_name', input: { ...VALID, company_name: '' }, key: 'companyRequired' },
  { rule: 'company over 255', field: 'company_name', input: { ...VALID, company_name: 'a'.repeat(256) }, key: 'companyTooLong' },
  { rule: 'invalid URL', field: 'job_url', input: { ...VALID, job_url: 'not a url' }, key: 'invalidUrl' },
  {
    rule: 'URL over 2000',
    field: 'job_url',
    input: { ...VALID, job_url: `https://example.test/${'a'.repeat(2000)}` },
    key: 'urlTooLong',
  },
] as const

describe('createQuickAddSchema', () => {
  for (const locale of ['en', 'fr', 'de', 'it'] as const) {
    for (const { rule, field, input, key } of CASES) {
      it(`${locale}: ${rule} reports kanban.quickAdd.${key}`, () => {
        const expected = MESSAGES[locale][key]
        expect(expected).toBeTruthy()
        expect(messageFor(MESSAGES[locale], input, field)).toBe(expected)
      })
    }
  }

  it('en messages equal the English the form showed before', () => {
    expect(MESSAGES.en).toMatchObject({
      jobTitleRequired: 'Job title is required',
      jobTitleTooLong: 'Job title must be less than 255 characters',
      companyRequired: 'Company name is required',
      companyTooLong: 'Company name must be less than 255 characters',
      invalidUrl: 'Please enter a valid URL',
      urlTooLong: 'URL must be less than 2000 characters',
    })
  })

  it('falls back to the previous English when a message is missing', () => {
    for (const { field, input, key } of CASES) {
      expect(messageFor({}, input, field)).toBe(MESSAGES.en[key])
    }
  })

  it('accepts a valid entry, with and without a URL, at the length limits', () => {
    const schema = createQuickAddSchema(MESSAGES.fr)
    expect(schema.safeParse(VALID).success).toBe(true)
    expect(schema.safeParse({ ...VALID, job_url: 'https://example.test/offer' }).success).toBe(true)
    expect(
      schema.safeParse({ job_title: 'a'.repeat(255), company_name: 'b'.repeat(255), job_url: '' }).success,
    ).toBe(true)
  })
})
