/**
 * Input ceilings for every route that forwards caller text to the AI provider.
 *
 * WHY
 * Prompt cost is a function of input length, so a field with a `.min()` and no
 * `.max()` is an open-ended bill: one request carrying a megabyte of text costs
 * the owner's account hundreds of times what a resume review costs, and nothing
 * in the route stopped it. Every limit here is enforced before the provider
 * call, so an over-sized request costs a JSON parse and nothing else.
 *
 * HOW THE NUMBERS WERE CHOSEN
 * Each ceiling is sized to the surface it guards, generously enough that no
 * plausible real document reaches it — a limit that rejects legitimate input is
 * a bug, not security. They are character counts, because that is what the
 * routes already validate in and what the caller can reason about; roughly four
 * characters per token for the languages this product supports.
 */

import { NextResponse, type NextRequest } from 'next/server'

export const AI_TEXT_LIMITS = {
  /**
   * A whole resume, pasted or extracted from an upload. A dense three-page CV
   * runs 6,000-8,000 characters; a long academic CV with publications can reach
   * 20,000. 30,000 (~7,500 tokens) clears both with room to spare.
   */
  RESUME_TEXT: 30_000,

  /**
   * A job advertisement. Verbose corporate postings with benefits and legal
   * boilerplate reach 8,000-10,000 characters; 15,000 clears the worst of them.
   */
  JOB_DESCRIPTION: 15_000,

  /**
   * A whole cover letter. One page is around 2,500-3,500 characters and a long
   * two-page letter under 6,000, so 8,000 is comfortably beyond any letter
   * anyone should send.
   */
  COVER_LETTER_TEXT: 8_000,

  /**
   * One paragraph of a structured cover letter (opening, one body paragraph,
   * closing). A long paragraph is 600-800 characters.
   */
  COVER_LETTER_PARAGRAPH: 2_000,

  /**
   * A professional summary or profile. The product's own generators target
   * 300-600 characters; 5,000 allows a raw, unedited draft to be sent in for
   * rewriting.
   */
  SUMMARY: 5_000,

  /**
   * One free-text description of a role, project or education entry, as held in
   * a single resume field.
   *
   * Deliberately loose. Nothing in the editor caps these fields today, so a
   * verbose user's existing description must keep working: a ceiling that broke
   * the optimise button on a stored value would be a regression, and 10,000
   * characters is roughly 2,500 tokens -- a rounding error against the cost this
   * is protecting. Bounding how *often* these routes can be called is what the
   * rate limiter does; these ceilings only have to rule out the pathological
   * single request.
   */
  DESCRIPTION: 10_000,

  /**
   * Text submitted for translation. Larger than a single description because
   * the caller may send a whole section at once, and the translator's own
   * output budget is 4,096 tokens.
   */
  TRANSLATABLE_TEXT: 10_000,

  /** Extra caller instructions for generation. Two thousand characters is an essay. */
  CUSTOM_PROMPT: 2_000,

  /**
   * One achievement, or one job requirement lifted out of an advertisement. The
   * generator's own extractor takes whole lines out of the posting, so this has
   * to clear a long bulleted line, not just a phrase.
   */
  BULLET: 1_000,

  /** One short list entry, such as a highlighted requirement to emphasise. */
  LIST_ITEM: 500,

  /** One skill name. */
  SKILL: 100,

  /**
   * A single-line label: job title, company name, recipient name, resume title.
   * Two hundred characters is far past any real value and keeps a label from
   * being used as a smuggled prompt body.
   */
  SHORT_LABEL: 200,

  /**
   * A database identifier supplied by the caller. These are UUIDs (36
   * characters); the ceiling exists so an oversized value cannot be forwarded
   * to the database or into an error path.
   */
  IDENTIFIER: 128,
} as const

export const AI_LIST_LIMITS = {
  /** Body paragraphs in a structured cover letter. */
  COVER_LETTER_PARAGRAPHS: 10,
  /** Achievements transformed in one request. */
  ACHIEVEMENTS: 30,
  /** Skills carried as context for a summary rewrite. */
  SKILLS: 50,
  /**
   * Job requirements the caller asks the generator to emphasise. The tool's own
   * UI extracts at most ten, so this is three times the largest request the
   * product itself makes.
   */
  SELECTED_DETAILS: 30,
} as const

/**
 * Ceiling on the raw request body.
 *
 * The largest field ceiling above is 30,000 characters and the largest schema
 * combines a resume with a job description, so no conforming request exceeds
 * ~45,000 characters — 180 KB even if every character is a four-byte sequence.
 * 256 KB therefore rejects nothing legitimate while keeping the JSON parser
 * from being handed the multi-megabyte body the platform would otherwise
 * accept. Checked before parsing, so an oversized body costs one header read.
 */
export const MAX_AI_REQUEST_BODY_BYTES = 256 * 1024

/** A field limit: a character ceiling, and for arrays an item-count ceiling. */
export interface FieldLimit {
  readonly maxCharacters: number
  /** Required for array fields, ignored for scalars. */
  readonly maxItems?: number
}

/**
 * Limits for the fields of one request body, keyed by field name. A bare number
 * is shorthand for a scalar string's character ceiling.
 */
export type FieldLimits = Readonly<Record<string, FieldLimit | number>>

export interface OversizedField {
  readonly field: string
  readonly limit: number
  readonly actual: number
  readonly unit: 'characters' | 'items'
}

function toFieldLimit(limit: FieldLimit | number): FieldLimit {
  return typeof limit === 'number' ? { maxCharacters: limit } : limit
}

/**
 * Finds the first field of `body` that exceeds its ceiling, or `null` when all
 * of them fit.
 *
 * Only strings and array members that are strings are measured. Everything else
 * is left to the type and presence checks the routes already perform: this
 * function answers "is it too big", not "is it the right shape", and silently
 * widening it to a general validator would make two places responsible for the
 * same decision.
 */
export function findOversizedField(body: unknown, limits: FieldLimits): OversizedField | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const record = body as Record<string, unknown>

  for (const [field, rawLimit] of Object.entries(limits)) {
    const { maxCharacters, maxItems } = toFieldLimit(rawLimit)
    const value = record[field]

    if (typeof value === 'string') {
      if (value.length > maxCharacters) {
        return { field, limit: maxCharacters, actual: value.length, unit: 'characters' }
      }
      continue
    }

    if (Array.isArray(value)) {
      if (maxItems !== undefined && value.length > maxItems) {
        return { field, limit: maxItems, actual: value.length, unit: 'items' }
      }
      for (const item of value) {
        if (typeof item === 'string' && item.length > maxCharacters) {
          return { field, limit: maxCharacters, actual: item.length, unit: 'characters' }
        }
      }
    }
  }

  return null
}

/**
 * The 400 for an over-sized field.
 *
 * The message names the field and its ceiling so a caller can fix the request,
 * and reports no detail about the request beyond its own length. Shaped like
 * the other validation failures in these routes (`{ error }`, status 400) so
 * existing clients render it the way they already render a short-input error.
 */
export function oversizedFieldResponse(oversized: OversizedField): NextResponse {
  const subject = oversized.unit === 'items' ? 'entries' : 'characters'
  return NextResponse.json(
    {
      error: `${oversized.field} must be at most ${oversized.limit} ${subject} (received ${oversized.actual})`,
    },
    { status: 400 }
  )
}

/**
 * Rejects a body whose declared length is over `maxBytes`, before it is read.
 *
 * Returns `null` when the header is absent or unparseable — a chunked request
 * declares no length, and there is nothing to check at this point. The field
 * ceilings above are what actually bound such a request, after parsing; this is
 * the cheap first line, not the only one.
 */
export function enforceJsonBodyLimit(
  request: NextRequest,
  maxBytes: number = MAX_AI_REQUEST_BODY_BYTES
): NextResponse | null {
  const declared = Number(request.headers.get('content-length'))
  if (!Number.isFinite(declared) || declared <= maxBytes) {
    return null
  }

  return NextResponse.json(
    { error: `Request body must be at most ${maxBytes} bytes` },
    { status: 413 }
  )
}
