import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/jobs.json'
import en from '@/locales/en/jobs.json'
import de from '@/locales/de/jobs.json'
import it_ from '@/locales/it/jobs.json'
import type { Locale } from '@/lib/i18n'
import { cvAdaptationStrings, type CVAdaptationStrings } from '@/lib/cv-adaptation-strings'

/**
 * The adaptation modal, its diff viewer and the resume editor's "Adapt to Job"
 * button read every string from `cvAdaptationStrings`, and the type makes each
 * of them required. These tests hold the four `jobs.json` files to that
 * contract: every string exists, non-empty, in every locale.
 */

const DICTS: Record<Locale, Record<string, unknown>> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]

/**
 * The English the modal used to hard-code, or fall back to, before these
 * strings had keys. en must keep reading exactly this.
 */
const EN_WORDING: Partial<CVAdaptationStrings> = {
  title: 'Adapt CV to Job',
  jobDescriptionCharacterCount: '({count}/100 characters minimum)',
  jobDescriptionTooShort: 'Job description must be at least 100 characters.',
  jobTitlePlaceholder: 'e.g., Senior Software Engineer',
  jobTitleRequired: 'Job title is required.',
  companyPlaceholder: 'e.g., Google',
  optional: '(optional)',
  analyzeButton: 'Analyze & Generate Adaptation',
  adaptationFailed: 'Failed to generate adaptation',
  createFailed: 'Failed to create CV',
  summaryTitle: 'Professional Summary',
  experienceTitle: 'Experience Description',
  addSkills: 'Add Skills',
  enhanceSkills: 'Enhance',
  noContent: 'No content',
  noChangesTitle: 'Great News!',
  noChangesMessage: "Your CV already aligns well with this job description. We don't recommend any changes at this time.",
  confidenceHigh: 'High Confidence',
  confidenceMedium: 'Medium Confidence',
  confidenceLow: 'Low Confidence',
  selectAll: 'Select All',
  deselectAll: 'Deselect All',
  applySelected: 'Apply Selected Changes',
  cancel: 'Cancel',
  adaptToJob: 'Adapt to Job',
  successMessage: 'CV adapted successfully. Review and save when ready.',
  createModeTitle: 'Create CV from Job',
}

/** Strings that had no key before; each must read differently from en. */
const PREVIOUSLY_HARD_CODED = [
  'jobDescriptionCharacterCount',
  'jobTitlePlaceholder',
  'jobTitleRequired',
  'companyPlaceholder',
  'optional',
  'summaryTitle',
  'experienceTitle',
  'addSkills',
  'enhanceSkills',
  'noContent',
  'noChangesTitle',
  'noChangesMessage',
  'createFailed',
  'adaptationFailed',
  'createModeTitle',
] as const satisfies readonly (keyof CVAdaptationStrings)[]

/** German writes "optional" exactly as English does. */
const SAME_AS_ENGLISH: Partial<Record<Locale, readonly (keyof CVAdaptationStrings)[]>> = {
  de: ['optional'],
}

describe('cvAdaptationStrings', () => {
  const english = cvAdaptationStrings(en)

  for (const locale of LOCALES) {
    it(`carries every modal string, non-empty, in ${locale}`, () => {
      const strings = cvAdaptationStrings(DICTS[locale])

      expect(Object.keys(strings).sort()).toEqual(Object.keys(english).sort())
      for (const [key, value] of Object.entries(strings)) {
        expect(value, `${locale} ${key}`).toMatch(/\S/)
      }
      expect(strings.jobDescriptionCharacterCount).toContain('{count}')
    })

    if (locale !== 'en') {
      it(`translates the previously hard-coded strings in ${locale}`, () => {
        const strings = cvAdaptationStrings(DICTS[locale])
        const allowed = SAME_AS_ENGLISH[locale] ?? []

        for (const key of PREVIOUSLY_HARD_CODED) {
          if (allowed.includes(key)) continue
          expect(strings[key], `${locale} ${key}`).not.toBe(english[key])
        }
      })
    }
  }

  it('keeps the English wording the modal and the editor showed before', () => {
    expect(english).toMatchObject(EN_WORDING)
  })

  it('maps the create-from-job strings from createCV', () => {
    for (const locale of LOCALES) {
      const dict = DICTS[locale] as { createCV: Record<string, string> }
      const strings = cvAdaptationStrings(DICTS[locale])

      expect(strings.createModeTitle).toBe(dict.createCV.modalTitle)
      expect(strings.createCVButton).toBe(dict.createCV.createButton)
      expect(strings.creatingCV).toBe(dict.createCV.creating)
      expect(strings.createCVHelpText).toBe(dict.createCV.helpText)
    }
  })

  it('throws instead of falling back to another language when a string is missing', () => {
    const withoutClose = { ...fr, cvAdaptation: { ...fr.cvAdaptation, close: '' } }
    const withoutModalTitle = { ...fr, createCV: { ...fr.createCV, modalTitle: undefined } }

    expect(() => cvAdaptationStrings(withoutClose)).toThrow(/cvAdaptation\.close/)
    expect(() => cvAdaptationStrings(withoutModalTitle)).toThrow(/createCV\.modalTitle/)
    expect(() => cvAdaptationStrings({})).toThrow(/cvAdaptation\.title/)
  })
})
