import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The pieces shared by the editor's generation modal and the letter created
 * from a job application. The modal's route used them inline before they were
 * extracted; these tests pin that behaviour.
 */

const generateCompletion = vi.fn<(prompt: string, options: unknown) => Promise<{ text: string }>>()

vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  generateCompletion: (prompt: string, options: unknown) => generateCompletion(prompt, options),
}))

const {
  COMPANY_ADDRESS_MAX_TOKENS_MARGIN,
  COVER_LETTER_COMPLETION_OPTIONS,
  CoverLetterReplyError,
  coverLetterProfileFromResume,
  generateCoverLetter,
  parseCoverLetterJson,
  toGeneratedCoverLetter,
} = await import('./cover-letter-generation')
const { buildCoverLetterGenerationPrompt } = await import('./prompts')

beforeEach(() => {
  generateCompletion.mockReset()
})

describe('coverLetterProfileFromResume', () => {
  it('reads the summary, the first three experiences and every skill', () => {
    const profile = coverLetterProfileFromResume({
      summary: 'A summary.',
      experience: [
        { position: 'P1', company: 'C1', description: 'D1', location: 'Bern' },
        { position: 'P2', company: 'C2' },
        { position: 'P3', company: 'C3' },
        { position: 'P4', company: 'C4' },
      ],
      skills: [{ category: 'A', items: ['x', 'y'] }, { category: 'B' }, { category: 'C', items: ['z'] }],
    })

    expect(profile).toEqual({
      resumeSummary: 'A summary.',
      resumeExperience: [
        { position: 'P1', company: 'C1', description: 'D1' },
        { position: 'P2', company: 'C2', description: undefined },
        { position: 'P3', company: 'C3', description: undefined },
      ],
      resumeSkills: ['x', 'y', 'z'],
    })
  })

  it('leaves out what the CV does not have', () => {
    expect(coverLetterProfileFromResume({ summary: '', experience: null, skills: null })).toEqual({
      resumeSummary: undefined,
    })
  })
})

describe('parseCoverLetterJson', () => {
  it('reads bare JSON and JSON in a code fence, with or without a language', () => {
    const letter = { greeting: 'Hello,' }
    expect(parseCoverLetterJson(`  ${JSON.stringify(letter)}  `)).toEqual(letter)
    expect(parseCoverLetterJson(`Here it is:\n\`\`\`json\n${JSON.stringify(letter)}\n\`\`\``)).toEqual(letter)
    expect(parseCoverLetterJson(`\`\`\`\n${JSON.stringify(letter)}\n\`\`\``)).toEqual(letter)
  })

  it('throws a SyntaxError when the reply holds no JSON', () => {
    expect(() => parseCoverLetterJson('Dear Hiring Manager,')).toThrow(SyntaxError)
  })
})

describe('toGeneratedCoverLetter', () => {
  it('keeps only string fields and string body paragraphs', () => {
    expect(
      toGeneratedCoverLetter({
        greeting: 'Hello,',
        openingParagraph: 1,
        bodyParagraphs: ['One', null, 'Two', { text: 'x' }],
        closingParagraph: 'Bye.',
      })
    ).toEqual({
      greeting: 'Hello,',
      openingParagraph: '',
      bodyParagraphs: ['One', 'Two'],
      closingParagraph: 'Bye.',
      signOff: '',
    })
  })

  it('refuses a reply that is not an object', () => {
    for (const reply of [null, 'text', 42, ['a']]) {
      expect(() => toGeneratedCoverLetter(reply)).toThrow(CoverLetterReplyError)
    }
  })

  describe('the company address (cover-letter-recipient-address-from-offer, US-002)', () => {
    const LETTER = {
      greeting: 'Hello,',
      openingParagraph: 'Open.',
      bodyParagraphs: ['Body.'],
      closingParagraph: 'Close.',
      signOff: 'Bye,',
    }

    it('keeps the string parts of companyAddress', () => {
      expect(
        toGeneratedCoverLetter({
          ...LETTER,
          companyAddress: {
            streetAddress: 'Rue du Lac 5',
            postalCode: 1201,
            addressLocality: 'Genève',
            addressCountry: { name: 'Suisse' },
            extra: 'ignored',
          },
        }).companyAddress
      ).toEqual({ streetAddress: 'Rue du Lac 5', addressLocality: 'Genève' })
    })

    it('has no address when the field is missing, malformed or has no string part, and never throws', () => {
      for (const companyAddress of [undefined, null, 'Rue du Lac 5, 1201 Genève', 42, ['Rue du Lac 5'], {}, { postalCode: 1201 }]) {
        const letter = toGeneratedCoverLetter({ ...LETTER, companyAddress })
        expect(letter).not.toHaveProperty('companyAddress')
        expect(letter).toEqual(toGeneratedCoverLetter(LETTER))
      }
    })
  })
})

describe('generateCoverLetter', () => {
  const INPUT = { jobDescription: 'An offer.', jobTitle: 'Engineer', companyName: 'Acme', locale: 'fr' }

  it("sends the shared prompt with the modal's model settings", async () => {
    generateCompletion.mockResolvedValueOnce({ text: JSON.stringify({ greeting: 'Madame, Monsieur,' }) })

    const letter = await generateCoverLetter(INPUT)

    expect(generateCompletion).toHaveBeenCalledWith(
      buildCoverLetterGenerationPrompt(INPUT),
      expect.objectContaining({ ...COVER_LETTER_COMPLETION_OPTIONS })
    )
    expect(COVER_LETTER_COMPLETION_OPTIONS.maxTokens).toBe(1500)
    expect(letter.greeting).toBe('Madame, Monsieur,')
  })

  it('asks for the address in the same, single call when the input opts in, and returns it', async () => {
    const asking = { ...INPUT, askCompanyAddress: true }
    const companyAddress = { streetAddress: 'Rue du Lac 5', postalCode: '1201', addressLocality: 'Genève' }
    generateCompletion.mockResolvedValueOnce({ text: JSON.stringify({ greeting: 'Madame,', companyAddress }) })

    const letter = await generateCoverLetter(asking)

    expect(generateCompletion).toHaveBeenCalledTimes(1)
    expect(generateCompletion).toHaveBeenCalledWith(buildCoverLetterGenerationPrompt(asking), expect.anything())
    expect(letter.companyAddress).toEqual(companyAddress)
  })

  it('gives the reply room for the address only when the input opts in', async () => {
    generateCompletion.mockResolvedValue({ text: JSON.stringify({ greeting: 'Madame,' }) })

    await generateCoverLetter(INPUT)
    await generateCoverLetter({ ...INPUT, askCompanyAddress: false })
    await generateCoverLetter({ ...INPUT, askCompanyAddress: true })

    const [plain, optedOut, asking] = generateCompletion.mock.calls.map(([, options]) => options)
    expect(plain).toEqual({ ...COVER_LETTER_COMPLETION_OPTIONS, operation: 'generateCoverLetterFromJobApplication' })
    expect(optedOut).toEqual(plain)
    expect(asking).toEqual({
      ...COVER_LETTER_COMPLETION_OPTIONS,
      maxTokens: COVER_LETTER_COMPLETION_OPTIONS.maxTokens + COMPANY_ADDRESS_MAX_TOKENS_MARGIN,
      operation: 'generateCoverLetterFromJobApplication',
    })
    expect(COMPANY_ADDRESS_MAX_TOKENS_MARGIN).toBe(200)
    expect(COVER_LETTER_COMPLETION_OPTIONS).toEqual({ model: COVER_LETTER_COMPLETION_OPTIONS.model, temperature: 0.7, maxTokens: 1500 })
  })

  it('throws CoverLetterReplyError for a reply that is not JSON', async () => {
    generateCompletion.mockResolvedValueOnce({ text: 'Madame, Monsieur, ...' })

    await expect(generateCoverLetter(INPUT)).rejects.toBeInstanceOf(CoverLetterReplyError)
  })
})
