import { describe, expect, it } from 'vitest'
import { TEMPLATE_SAMPLE_RESUME } from '@/lib/template-sample-resume'
import {
  isResumeContentLanguage,
  RESUME_CONTENT_LANGUAGES,
  RESUME_SAMPLE_VALUES,
  SAMPLE_DATES,
  SUMMARY_COMPANY_PLACEHOLDER,
  SUMMARY_JOB_TITLE_PLACEHOLDER,
  type ResumeContentLanguage,
} from './sample-values'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const EMAIL = /^[a-z0-9]+(\.[a-z0-9]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/
const LEVELS = ['Native', 'Fluent', 'Professional', 'Intermediate', 'Basic']

/** Host names a sample address may use: the reserved example domain, or the platform the field is for. */
function isAllowedHost(host: string): boolean {
  return ['example.com', 'linkedin.com', 'github.com'].includes(host) || host.endsWith('.example.com')
}

/** Every string in a value, with its path. */
function strings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key))
  }
  return []
}

/**
 * The words of a set: every string except language levels, which are stored
 * enum values (`Native`, ...) shared by every language and shown through the
 * page's dictionary.
 */
function words(value: unknown): { path: string; text: string }[] {
  return strings(value).filter(({ path }) => !path.endsWith('.level'))
}

/** The set's shape: keys and array presence, without the text. */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length > 0 ? ['non-empty', shape(value[0])] : ['empty']
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]))
  }
  return typeof value
}

describe('sample values', () => {
  it('exist for exactly fr, en, de and it', () => {
    expect([...RESUME_CONTENT_LANGUAGES].sort()).toEqual(['de', 'en', 'fr', 'it'])
    expect(Object.keys(RESUME_SAMPLE_VALUES).sort()).toEqual(['de', 'en', 'fr', 'it'])
  })

  it('narrows only supported languages', () => {
    for (const language of RESUME_CONTENT_LANGUAGES) expect(isResumeContentLanguage(language)).toBe(true)
    for (const other of ['es', 'FR', '', 'english', null, undefined, 3]) {
      expect(isResumeContentLanguage(other)).toBe(false)
    }
  })

  it('uses the values the owner gave for French', () => {
    const fr = RESUME_SAMPLE_VALUES.fr
    expect(fr.contact.name).toBe('Prénom Nom')
    // The PRD's `exemple.com` was illustrative; the owner chose the reserved
    // `example.com` on 2026-10-22.
    expect(fr.contact.email).toBe('prenom.nom@example.com')
    expect(fr.contact.website).toBe('https://votre-site.example.com')
    expect(fr.certification.url).toBe('https://example.com/votre-certificat')
    expect(fr.project.url).toBe('https://example.com/votre-projet')
    expect(fr.contact.phone).toBe('+41 00 000 00 00')
    expect(fr.contact.linkedin).toBe('linkedin.com/in/votre-profil')
    expect(fr.education.school).toBe('Nom de votre école')
    expect(fr.certification.name).toBe('Nom de votre certification')
  })

  describe.each(RESUME_CONTENT_LANGUAGES)('%s', (language) => {
    const set = RESUME_SAMPLE_VALUES[language]

    it('is complete: the same keys as every other set, and no empty value', () => {
      expect(shape(set)).toEqual(shape(RESUME_SAMPLE_VALUES.fr))
      for (const { path, text } of strings(set)) {
        expect(text.trim(), path).not.toBe('')
      }
    })

    it('shares no value with another language', () => {
      const own = new Set(words(set).map(({ text }) => text))
      for (const other of RESUME_CONTENT_LANGUAGES.filter((l): l is ResumeContentLanguage => l !== language)) {
        for (const { path, text } of words(RESUME_SAMPLE_VALUES[other])) {
          expect(own.has(text), `${other}.${path} = "${text}" also in ${language}`).toBe(false)
        }
      }
    })

    it('has summary sentences with their placeholders', () => {
      expect(set.summary.withCompany).toContain(SUMMARY_JOB_TITLE_PLACEHOLDER)
      expect(set.summary.withCompany).toContain(SUMMARY_COMPANY_PLACEHOLDER)
      expect(set.summary.withoutCompany).toContain(SUMMARY_JOB_TITLE_PLACEHOLDER)
      expect(set.summary.withoutCompany).not.toContain(SUMMARY_COMPANY_PLACEHOLDER)
    })

    it('has a well-formed email and well-formed URLs on reserved or platform hosts', () => {
      expect(set.contact.email).toMatch(EMAIL)
      expect(isAllowedHost(set.contact.email.split('@')[1])).toBe(true)

      for (const url of [set.contact.website, set.certification.url, set.project.url]) {
        const parsed = new URL(url)
        expect(parsed.protocol).toBe('https:')
        expect(isAllowedHost(parsed.hostname), url).toBe(true)
      }
      // Shown as typed, without a scheme, like the owner's LinkedIn example.
      for (const [url, host] of [
        [set.contact.linkedin, 'linkedin.com'],
        [set.contact.github, 'github.com'],
      ] as const) {
        expect(url).toMatch(/^[a-z]+\.com\/[a-z0-9/-]+$/)
        expect(new URL(`https://${url}`).hostname).toBe(host)
      }
    })

    it('has stored language levels', () => {
      expect(set.languages.length).toBeGreaterThan(0)
      for (const { level } of set.languages) expect(LEVELS).toContain(level)
    })

    it('contains no markup', () => {
      for (const { path, text } of strings(set)) expect(text, path).not.toMatch(/[<>]/)
    })
  })

  it('has YYYY-MM dates whose ranges end after they start', () => {
    for (const { path, text } of strings(SAMPLE_DATES)) expect(text, path).toMatch(MONTH)
    expect(SAMPLE_DATES.experience.endDate > SAMPLE_DATES.experience.startDate).toBe(true)
    expect(SAMPLE_DATES.education.endDate > SAMPLE_DATES.education.startDate).toBe(true)
    expect(SAMPLE_DATES.project.endDate > SAMPLE_DATES.project.startDate).toBe(true)
    expect(SAMPLE_DATES.certification.expiryDate > SAMPLE_DATES.certification.date).toBe(true)
  })

  it('differs from the template-picker sample, which draws a realistic person', () => {
    const thumbnail = new Set(strings(TEMPLATE_SAMPLE_RESUME).map(({ text }) => text))
    for (const language of RESUME_CONTENT_LANGUAGES) {
      for (const { path, text } of words(RESUME_SAMPLE_VALUES[language])) {
        expect(thumbnail.has(text), `${language}.${path}`).toBe(false)
      }
    }
  })
})
