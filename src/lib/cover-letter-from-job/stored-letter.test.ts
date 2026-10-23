import { describe, expect, it } from 'vitest'
import { AI_TEXT_LIMITS } from '@/lib/api/ai-input-limits'
import { boundCoverLetterResumeProfile, toStoredCoverLetterContent } from './stored-letter'

const LETTER = {
  greeting: 'Madame, Monsieur,',
  openingParagraph: 'Ouverture.',
  bodyParagraphs: ['Corps.'],
  closingParagraph: 'Conclusion.',
  signOff: 'Cordialement,',
}

describe('toStoredCoverLetterContent', () => {
  it('stores paragraphs as one escaped <p> each, and the greeting and sign-off as plain text', () => {
    expect(
      toStoredCoverLetterContent({
        ...LETTER,
        greeting: 'Madame, <b>Monsieur</b>,',
        openingParagraph: 'Chez <i>R&amp;D</i> & "co" <script>alert(1)</script>',
      })
    ).toEqual({
      greeting: 'Madame, Monsieur ,',
      opening_paragraph: '<p>Chez R&amp;D &amp; &quot;co&quot;</p>',
      body_paragraphs: ['<p>Corps.</p>'],
      closing_paragraph: '<p>Conclusion.</p>',
      sign_off: 'Cordialement,',
    })
  })

  it('cuts a paragraph to the paragraph limit', () => {
    const content = toStoredCoverLetterContent({ ...LETTER, openingParagraph: 'a'.repeat(3_000) })
    expect(content?.opening_paragraph).toBe(`<p>${'a'.repeat(AI_TEXT_LIMITS.COVER_LETTER_PARAGRAPH)}</p>`)
  })

  it('drops empty body paragraphs', () => {
    expect(toStoredCoverLetterContent({ ...LETTER, bodyParagraphs: ['', 'Corps.', '<br>'] })?.body_paragraphs).toEqual([
      '<p>Corps.</p>',
    ])
  })

  it('refuses a letter missing any part once sanitized', () => {
    for (const broken of [
      { greeting: ' ' },
      { openingParagraph: '<p></p>' },
      { bodyParagraphs: [] },
      { closingParagraph: '' },
      { signOff: '<style>x</style>' },
    ]) {
      expect(toStoredCoverLetterContent({ ...LETTER, ...broken })).toBeNull()
    }
  })
})

describe('boundCoverLetterResumeProfile', () => {
  it('bounds every field the prompt carries', () => {
    const bounded = boundCoverLetterResumeProfile({
      resumeSummary: 's'.repeat(AI_TEXT_LIMITS.SUMMARY + 1),
      resumeExperience: [
        {
          position: 'p'.repeat(AI_TEXT_LIMITS.SHORT_LABEL + 1),
          company: 'Acme',
          description: 'd'.repeat(AI_TEXT_LIMITS.DESCRIPTION + 1),
        },
      ],
      resumeSkills: Array.from({ length: 60 }, () => 'k'.repeat(AI_TEXT_LIMITS.SKILL + 1)),
    })

    expect(bounded.resumeSummary).toHaveLength(AI_TEXT_LIMITS.SUMMARY)
    expect(bounded.resumeExperience?.[0].position).toHaveLength(AI_TEXT_LIMITS.SHORT_LABEL)
    expect(bounded.resumeExperience?.[0].description).toHaveLength(AI_TEXT_LIMITS.DESCRIPTION)
    expect(bounded.resumeSkills).toHaveLength(50)
    expect(bounded.resumeSkills?.[0]).toHaveLength(AI_TEXT_LIMITS.SKILL)
  })

  it('keeps an absent field absent', () => {
    expect(boundCoverLetterResumeProfile({})).toEqual({
      resumeSummary: undefined,
      resumeExperience: undefined,
      resumeSkills: undefined,
    })
  })
})
