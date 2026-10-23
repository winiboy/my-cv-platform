import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildCoverLetterGenerationPrompt, type CoverLetterGenerationInput } from './prompts'

/**
 * Pins on the exact text of the cover-letter prompt, as the editor's generation
 * modal (`POST /api/ai/generate-cover-letter`) sends it.
 *
 * cover-letter-from-job (US-001, FR-3) reuses this builder for letters created
 * from a job application. The modal's prompt must stay byte-identical, so each
 * representative call is pinned to the SHA-256 of the output of the code before
 * that initiative (3cc4634), measured on 2026-10-24.
 */

const DESCRIPTION = 'We are hiring a Senior Data Engineer to build pipelines.'

/** A modal call with a linked CV and a named recipient. */
const WITH_RESUME: CoverLetterGenerationInput = {
  resumeSummary: 'Data engineer with eight years of experience.',
  resumeExperience: [
    { position: 'Data Engineer', company: 'Acme', description: '<p>Built pipelines.</p>' },
    { position: 'Analyst', company: 'Globex' },
  ],
  resumeSkills: ['Python', 'SQL'],
  jobDescription: DESCRIPTION,
  jobTitle: 'Senior Data Engineer',
  companyName: 'Initech',
  recipientName: 'Jane Doe',
  recipientTitle: 'Head of Data',
}

/** A modal call without a CV or recipient. */
const WITHOUT_RESUME: CoverLetterGenerationInput = {
  jobDescription: DESCRIPTION,
  jobTitle: 'Senior Data Engineer',
  companyName: 'Initech',
}

const PROMPT_SHA256_BEFORE_COVER_LETTER_FROM_JOB: Record<string, { withResume: string; withoutResume: string }> = {
  undefined: {
    withResume: 'ac07b6983ac16dc2ed0d37a38672eeb1848eff52a58fe1945da9345801b3e6d5',
    withoutResume: '8f878592de80524ac9a779c30f54970976c5f68002bc70075eb18f779ab51f70',
  },
  en: {
    withResume: 'ac07b6983ac16dc2ed0d37a38672eeb1848eff52a58fe1945da9345801b3e6d5',
    withoutResume: '8f878592de80524ac9a779c30f54970976c5f68002bc70075eb18f779ab51f70',
  },
  fr: {
    withResume: '775a22e20c68ec61f35a17f0e4cd22a5d04cead799f84c7980a45f6b41c06351',
    withoutResume: 'a7b56f0788bddde0fb69f53acb4a3a531e50f5aae37a36f85887910edaf02ad0',
  },
  de: {
    withResume: 'd26ce364707eb33925a344015a34393d5eaaf717116f33be85e59d83f44d03c4',
    withoutResume: 'b8794779700bfaac5e677aafaf86396e10b061d8bea89ec591a3a5bf6774b50b',
  },
  it: {
    withResume: 'cd234af16e751987650750a9da05fabe082a020291291732cb94488149bf9e39',
    withoutResume: 'a9814ee30c3fe2c2d5980092aedf7f5e26a2c1ebb7f5530d6fab293e863588e9',
  },
  xx: {
    withResume: 'ac07b6983ac16dc2ed0d37a38672eeb1848eff52a58fe1945da9345801b3e6d5',
    withoutResume: '8f878592de80524ac9a779c30f54970976c5f68002bc70075eb18f779ab51f70',
  },
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

describe('buildCoverLetterGenerationPrompt', () => {
  for (const [locale, expected] of Object.entries(PROMPT_SHA256_BEFORE_COVER_LETTER_FROM_JOB)) {
    const localeValue = locale === 'undefined' ? undefined : locale

    it(`keeps the modal's prompt with a CV unchanged (locale ${locale})`, () => {
      expect(sha256(buildCoverLetterGenerationPrompt({ ...WITH_RESUME, locale: localeValue }))).toBe(expected.withResume)
    })

    it(`keeps the modal's prompt without a CV unchanged (locale ${locale})`, () => {
      expect(sha256(buildCoverLetterGenerationPrompt({ ...WITHOUT_RESUME, locale: localeValue }))).toBe(
        expected.withoutResume
      )
    })
  }

  it('names the language to write in', () => {
    const prompt = buildCoverLetterGenerationPrompt({ ...WITHOUT_RESUME, locale: 'de' })
    expect(prompt).toContain('Write the ENTIRE cover letter in German')
  })
})
