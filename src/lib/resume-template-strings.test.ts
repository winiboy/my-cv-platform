import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import type { Locale } from '@/lib/i18n'
import type { ResumeLanguage } from '@/types/database'
import { CONTACT_LABEL_KEYS, contactLabel, presentLabel } from './resume-template-strings'

/**
 * The words the five templates and their Word generators draw from `common`
 * beyond section headings: "present", Modern's contact labels and the language
 * levels. Every locale must hold each of them, and en must still spell them
 * the way the templates hard-coded them before they were read from `common`.
 */

const DICTS: Record<Locale, unknown> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]

/** Every stored level; a display label is looked up by its lowercase form. */
const STORED_LEVELS = ['Native', 'Fluent', 'Professional', 'Intermediate', 'Basic'] as const satisfies readonly ResumeLanguage['level'][]

/** What en drew before these words came from the dictionary. */
const EN_WORDING = {
  present: 'Present',
  contact: { phone: 'Phone', email: 'Email', website: 'Website', linkedin: 'LinkedIn', github: 'GitHub', location: 'Location' },
} as const

function levelsOf(dict: unknown): Record<string, unknown> {
  const levels = (dict as { resumes?: { editor?: { levels?: unknown } } }).resumes?.editor?.levels
  return typeof levels === 'object' && levels !== null ? (levels as Record<string, unknown>) : {}
}

describe.each(LOCALES)('%s common.json', (locale) => {
  const dict = DICTS[locale]

  it('holds resumes.template.present', () => {
    expect(presentLabel(dict)).not.toBe('')
  })

  it.each(CONTACT_LABEL_KEYS)('holds resumes.editor.%s', (key) => {
    expect(contactLabel(dict, key)).not.toBe('')
  })

  it.each(STORED_LEVELS)('holds a non-empty label for the stored level %s', (level) => {
    const label = levelsOf(dict)[level.toLowerCase()]
    expect(typeof label).toBe('string')
    expect(label).not.toBe('')
  })
})

describe('en wording', () => {
  it('is what the templates drew before', () => {
    expect(presentLabel(en)).toBe(EN_WORDING.present)
    for (const key of CONTACT_LABEL_KEYS) expect(contactLabel(en, key)).toBe(EN_WORDING.contact[key])
    for (const level of STORED_LEVELS) expect(levelsOf(en)[level.toLowerCase()]).toBe(level)
  })
})

describe('a missing translation', () => {
  it('throws rather than falling back to another language', () => {
    expect(() => presentLabel({})).toThrow('Missing translation common.json resumes.template.present')
    expect(() => contactLabel({ resumes: { editor: { phone: '' } } }, 'phone')).toThrow(
      'Missing translation common.json resumes.editor.phone',
    )
  })
})
