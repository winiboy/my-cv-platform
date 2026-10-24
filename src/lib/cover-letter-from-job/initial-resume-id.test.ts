import { describe, expect, it } from 'vitest'
import { initialCoverLetterResumeId } from './initial-resume-id'

const OWN_A = '11111111-1111-4111-8111-111111111111'
const OWN_B = '22222222-2222-4222-8222-222222222222'
const FOREIGN = '33333333-3333-4333-8333-333333333333'
const RESUMES = [{ id: OWN_A }, { id: OWN_B }]

describe('initialCoverLetterResumeId', () => {
  it("starts on the application's CV when it is one of the user's", () => {
    expect(
      initialCoverLetterResumeId({ applicationResumeId: OWN_A, queryResumeId: undefined, resumes: RESUMES })
    ).toBe(OWN_A)
  })

  it("starts empty when the application's CV is not one of the user's", () => {
    expect(
      initialCoverLetterResumeId({ applicationResumeId: FOREIGN, queryResumeId: undefined, resumes: RESUMES })
    ).toBe('')
  })

  it("starts empty when the application's CV is not one of the user's, even with a valid ?resume_id=", () => {
    expect(
      initialCoverLetterResumeId({ applicationResumeId: FOREIGN, queryResumeId: OWN_B, resumes: RESUMES })
    ).toBe('')
  })

  it("treats an empty application resume_id as no linked CV, so a valid ?resume_id= applies", () => {
    expect(initialCoverLetterResumeId({ applicationResumeId: '', queryResumeId: OWN_B, resumes: RESUMES })).toBe(
      OWN_B
    )
  })

  it('starts on ?resume_id= when no application CV is linked and the query names an own CV', () => {
    expect(initialCoverLetterResumeId({ applicationResumeId: null, queryResumeId: OWN_B, resumes: RESUMES })).toBe(
      OWN_B
    )
  })

  it('starts empty when no application CV is linked and the query names a foreign CV', () => {
    expect(initialCoverLetterResumeId({ applicationResumeId: null, queryResumeId: FOREIGN, resumes: RESUMES })).toBe(
      ''
    )
  })

  it("prefers the application's CV when both are the user's", () => {
    expect(initialCoverLetterResumeId({ applicationResumeId: OWN_A, queryResumeId: OWN_B, resumes: RESUMES })).toBe(
      OWN_A
    )
  })

  it('starts empty when neither is given', () => {
    expect(
      initialCoverLetterResumeId({ applicationResumeId: undefined, queryResumeId: undefined, resumes: RESUMES })
    ).toBe('')
    expect(initialCoverLetterResumeId({ applicationResumeId: null, queryResumeId: '', resumes: RESUMES })).toBe('')
  })

  it('starts empty when the user has no CVs, whatever the ids', () => {
    expect(initialCoverLetterResumeId({ applicationResumeId: OWN_A, queryResumeId: OWN_B, resumes: [] })).toBe('')
  })
})
