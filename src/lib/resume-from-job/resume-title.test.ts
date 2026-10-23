import { describe, expect, it } from 'vitest'
import { AI_TEXT_LIMITS } from '@/lib/api/ai-input-limits'
import { cutResumeTitle, RESUME_TITLE_MAX_LENGTH } from './resume-title'

describe('cutResumeTitle', () => {
  it('uses the limit the route cuts the title to', () => {
    expect(RESUME_TITLE_MAX_LENGTH).toBe(AI_TEXT_LIMITS.SHORT_LABEL)
  })

  it('keeps a title within the limit as it is', () => {
    expect(cutResumeTitle('Data Engineer')).toBe('Data Engineer')
    expect(cutResumeTitle('x'.repeat(200))).toBe('x'.repeat(200))
  })

  it('cuts a 255-character job title to 200', () => {
    expect(cutResumeTitle('x'.repeat(255))).toBe('x'.repeat(200))
  })

  it('never leaves half of a surrogate pair at the end', () => {
    const title = `${'x'.repeat(199)}😀tail`
    expect(cutResumeTitle(title)).toBe('x'.repeat(199))
  })
})
