import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import {
  AI_TEXT_LIMITS,
  MAX_AI_REQUEST_BODY_BYTES,
  enforceJsonBodyLimit,
  findOversizedField,
  oversizedFieldResponse,
} from './ai-input-limits'

/**
 * Unit coverage for the input ceilings.
 *
 * The property that matters in both directions: a request over a ceiling is
 * refused, and a request at or under it is untouched. A ceiling that rejected
 * legitimate input would be a regression dressed as a security fix, so the
 * boundary is asserted from both sides.
 */

describe('findOversizedField', () => {
  it('finds a scalar string over its ceiling and reports the measurement', () => {
    const oversized = findOversizedField(
      { resumeText: 'x'.repeat(AI_TEXT_LIMITS.RESUME_TEXT + 1) },
      { resumeText: AI_TEXT_LIMITS.RESUME_TEXT }
    )

    expect(oversized).toEqual({
      field: 'resumeText',
      limit: AI_TEXT_LIMITS.RESUME_TEXT,
      actual: AI_TEXT_LIMITS.RESUME_TEXT + 1,
      unit: 'characters',
    })
  })

  it('admits a field exactly at its ceiling', () => {
    expect(
      findOversizedField(
        { resumeText: 'x'.repeat(AI_TEXT_LIMITS.RESUME_TEXT) },
        { resumeText: AI_TEXT_LIMITS.RESUME_TEXT }
      )
    ).toBeNull()
  })

  it('admits a realistic payload', () => {
    expect(
      findOversizedField(
        {
          resumeText: 'Senior engineer with ten years of experience. '.repeat(120),
          jobDescription: 'We are looking for a senior engineer. '.repeat(60),
          jobTitle: 'Senior Software Engineer',
          locale: 'en',
        },
        {
          resumeText: AI_TEXT_LIMITS.RESUME_TEXT,
          jobDescription: AI_TEXT_LIMITS.JOB_DESCRIPTION,
          jobTitle: AI_TEXT_LIMITS.SHORT_LABEL,
        }
      )
    ).toBeNull()
  })

  it('measures each string in an array against the per-item ceiling', () => {
    const oversized = findOversizedField(
      { achievements: ['fine', 'y'.repeat(AI_TEXT_LIMITS.BULLET + 1)] },
      { achievements: { maxCharacters: AI_TEXT_LIMITS.BULLET, maxItems: 30 } }
    )

    expect(oversized).toMatchObject({ field: 'achievements', unit: 'characters' })
  })

  it('refuses an array with too many items even when each one is short', () => {
    const oversized = findOversizedField(
      { achievements: Array.from({ length: 31 }, () => 'short') },
      { achievements: { maxCharacters: AI_TEXT_LIMITS.BULLET, maxItems: 30 } }
    )

    expect(oversized).toEqual({
      field: 'achievements',
      limit: 30,
      actual: 31,
      unit: 'items',
    })
  })

  it('leaves absent, null and non-string values to the routes own type checks', () => {
    // This function answers "is it too big", not "is it the right shape".
    // Reporting a size failure for a missing or wrongly typed field would put
    // two places in charge of the same decision and change the error a client
    // already receives for it.
    expect(
      findOversizedField(
        { resumeText: null, jobDescription: 42, other: 'ignored' },
        { resumeText: 10, jobDescription: 10, missing: 10 }
      )
    ).toBeNull()
  })

  it('ignores a body that is not an object', () => {
    expect(findOversizedField('a string body', { resumeText: 10 })).toBeNull()
    expect(findOversizedField(null, { resumeText: 10 })).toBeNull()
  })
})

describe('oversizedFieldResponse', () => {
  it('answers 400 and names the field and its ceiling', async () => {
    const response = oversizedFieldResponse({
      field: 'jobDescription',
      limit: 15_000,
      actual: 900_000,
      unit: 'characters',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'jobDescription must be at most 15000 characters (received 900000)',
    })
  })
})

describe('enforceJsonBodyLimit', () => {
  function requestWithContentLength(contentLength?: string): NextRequest {
    return new NextRequest('http://localhost:3000/api/tools/review-resume', {
      method: 'POST',
      headers: contentLength === undefined ? {} : { 'content-length': contentLength },
    })
  }

  it('refuses a body whose declared length is over the ceiling', async () => {
    const response = enforceJsonBodyLimit(requestWithContentLength(String(MAX_AI_REQUEST_BODY_BYTES + 1)))

    expect(response?.status).toBe(413)
    await expect(response?.json()).resolves.toEqual({
      error: `Request body must be at most ${MAX_AI_REQUEST_BODY_BYTES} bytes`,
    })
  })

  it('admits a body at the ceiling', () => {
    expect(enforceJsonBodyLimit(requestWithContentLength(String(MAX_AI_REQUEST_BODY_BYTES)))).toBeNull()
  })

  it('admits a request that declares no length', () => {
    // A chunked request has nothing to check here; the field ceilings bound it
    // after parsing. This guard is the cheap first line, not the only one.
    expect(enforceJsonBodyLimit(requestWithContentLength())).toBeNull()
    expect(enforceJsonBodyLimit(requestWithContentLength('not-a-number'))).toBeNull()
  })
})
