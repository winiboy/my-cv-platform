import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AiCompletionError } from '@/lib/ai/client'
import { CoverLetterTranslationReplyError } from '@/lib/ai/cover-letter-translation'
import { TRANSLATION_LANGUAGES } from '@/lib/ai/prompts'
import { coverLetterTranslatorFor } from '@/lib/ai/test-stub'
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit'
import { enforceJsonBodyLimit } from '@/lib/api/ai-input-limits'
import { isCoverLetterWithinPdfGuard } from '@/lib/cover-letter-limits'
import type { CoverLetterInsert } from '@/types/database'
import {
  CoverLetterTranslationTooLargeError,
  planLetterTranslation,
  translatedCopyTitle,
  type LetterTranslationPlan,
} from './letter-segments'

/**
 * POST /api/cover-letters/[id]/translate  `{ "targetLanguage": "de" }`
 *
 * Creates a translated COPY of the caller's SAVED cover letter
 * (cover-letter-export-translate, US-003) and answers `201 { coverLetterId }`.
 *
 * The greeting, opening, body paragraphs, closing and sign-off are translated
 * through the AI translation core (`coverLetterTranslatorFor`); every other
 * column is copied. A default title becomes the target language's default
 * title; any other title gets the language suffix, e.g. " (DE)"
 * (`translatedCopyTitle`).
 *
 * WHAT IS NEVER WRITTEN
 * The original row and `job_applications`. The copy keeps the original's
 * `job_application_id`, but the application's `cover_letter_id` still points
 * to the original: only an insert is issued.
 *
 * ORDER OF CHECKS
 * session (401) → JSON content type (415, so a cross-site form cannot trigger
 * it) → body size (413) → body shape and language (400) → id and ownership
 * (404, the same for a missing letter and another user's) → size (422), or
 * no text at all (422 `{ error: 'empty' }`) →
 * the AI budget (429) → the translation (502, or 429 when the provider
 * rate-limits) → the insert. A refusal or failure at any step creates nothing,
 * and nothing before the AI budget spends any of it.
 *
 * Logs carry error classes and database codes only, never letter or AI text.
 */

export const dynamic = 'force-dynamic'

/**
 * The function's budget. The work is one AI completion of up to 6,000 tokens
 * (`COVER_LETTER_TRANSLATION_COMPLETION_OPTIONS`); a long letter's reply plus
 * the provider's queueing can outlast the 10-15 s default duration of the
 * platform's older plans. 60 s is the budget of the other
 * letter routes under `/api/cover-letters/[id]/`; the browser waits a little
 * longer (`COVER_LETTER_TRANSLATE_TIMEOUT_MS`).
 */
export const maxDuration = 60

const idSchema = z.uuid()

const requestSchema = z.object({
  targetLanguage: z.enum(TRANSLATION_LANGUAGES),
})

/** The columns a translation reads: what it translates and what it copies. */
const TRANSLATE_COLUMNS =
  'title, resume_id, job_application_id, recipient_name, recipient_title, company_name, company_address, greeting, opening_paragraph, body_paragraphs, closing_paragraph, sign_off, sender_name, job_title, job_description, template'

const json = (error: string, status: number) => NextResponse.json({ error }, { status })

const TRANSLATION_FAILED = 'The cover letter could not be translated'

/**
 * The 422 body code for a letter with no text to translate, which the client
 * tells apart from a letter too large to translate (also 422).
 */
const EMPTY_LETTER = 'empty'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json('Unauthorized', 401)

    const contentType = request.headers.get('content-type') ?? ''
    if (!/^application\/json\s*(?:;|$)/i.test(contentType)) return json('Unsupported Media Type', 415)

    const oversizedBody = enforceJsonBodyLimit(request)
    if (oversizedBody) return oversizedBody

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json('Invalid JSON body', 400)
    }
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) return json('targetLanguage must be one of: fr, de, en, it', 400)
    const { targetLanguage } = parsed.data

    if (!idSchema.safeParse(id).success) return json('Cover letter not found', 404)

    // RLS already hides other users' rows; the explicit owner filter does not
    // rely on it.
    const { data: original, error: readError } = await supabase
      .from('cover_letters')
      .select(TRANSLATE_COLUMNS)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (readError) {
      console.error('Cover letter translate route: reading the letter failed:', readError.code ?? 'unknown code')
      return json(TRANSLATION_FAILED, 500)
    }
    if (!original) return json('Cover letter not found', 404)

    // The export bound first, so a translated copy can always be exported;
    // then the AI input bound.
    if (!isCoverLetterWithinPdfGuard(original)) return json('Cover letter too large to translate', 422)
    let plan: LetterTranslationPlan
    try {
      plan = planLetterTranslation(original)
    } catch (planError) {
      if (planError instanceof CoverLetterTranslationTooLargeError) return json('Cover letter too large to translate', 422)
      throw planError
    }
    if (plan.segments.length === 0) return json(EMPTY_LETTER, 422)

    // The budget is keyed by the authenticated user and spent only by a
    // request that is about to call the provider.
    const throttled = await enforceAiRateLimit(request, { kind: 'user', userId: user.id })
    if (throttled) return throttled

    let translations: string[]
    try {
      translations = await coverLetterTranslatorFor(request)({ segments: plan.segments, targetLanguage })
    } catch (translateError) {
      // Provider failures are already reported to Sentry by `generateCompletion`.
      if (translateError instanceof AiCompletionError) {
        console.error('Cover letter translate route: AI provider failed:', translateError.reason)
        return json(TRANSLATION_FAILED, translateError.reason === 'rate_limited' ? 429 : 502)
      }
      if (translateError instanceof CoverLetterTranslationReplyError) {
        console.error('Cover letter translate route: AI reply is not a translation')
        return json(TRANSLATION_FAILED, 502)
      }
      throw translateError
    }

    const content = plan.rebuild(translations)
    if (!content) {
      console.error('Cover letter translate route: AI reply left a part empty')
      return json(TRANSLATION_FAILED, 502)
    }

    const copy: CoverLetterInsert = {
      // The session's user, never anything from the request or the row.
      user_id: user.id,
      title: translatedCopyTitle(original, targetLanguage),
      resume_id: original.resume_id,
      job_application_id: original.job_application_id,
      recipient_name: original.recipient_name,
      recipient_title: original.recipient_title,
      company_name: original.company_name,
      company_address: original.company_address,
      sender_name: original.sender_name,
      job_title: original.job_title,
      job_description: original.job_description,
      template: original.template,
      ...content,
    }

    const { data: created, error: insertError } = await supabase
      .from('cover_letters')
      .insert(copy)
      .select('id')
      .single()
    if (insertError || !created) {
      console.error('Cover letter translate route: creating the copy failed:', insertError?.code ?? 'no row')
      return json(TRANSLATION_FAILED, 500)
    }

    return NextResponse.json({ coverLetterId: created.id }, { status: 201 })
  } catch (error) {
    console.error('Cover letter translate route failed:', error instanceof Error ? error.name : 'unknown error')
    return json(TRANSLATION_FAILED, 500)
  }
}
