/**
 * AI Cover Letter Generation API
 * Generates a cover letter from resume data and job description
 *
 * The letter is then measured as the PDF would print it, inside the header of
 * the letter being edited (`coverLetterId`, read with the caller's session and
 * owner filter), and one that runs over one page is shortened by exactly one
 * more AI call, counted against no further rate-limit unit
 * (cover-letter-one-page, US-002). A failed measurement or shortening returns
 * the first letter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  CoverLetterReplyError,
  coverLetterPartsOf,
  coverLetterProfileFromResume,
  isCompleteGeneratedCoverLetter,
  type CoverLetterResumeRow,
  type GeneratedCoverLetter,
} from '@/lib/ai/cover-letter-generation'
import { coverLetterOnePageDeadline, keepCoverLetterOnOnePage } from '@/lib/ai/cover-letter-one-page'
import { coverLetterGeneratorFor, coverLetterShortenerFor } from '@/lib/ai/test-stub'
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit'
import {
  AI_TEXT_LIMITS,
  enforceJsonBodyLimit,
  findOversizedField,
  oversizedFieldResponse,
} from '@/lib/api/ai-input-limits'
import { coverLetterRequestLanguage } from '@/lib/cover-letter-language'
import { linkedResumeContact } from '@/lib/cover-letter-linked-contact'
import { COVER_LETTER_EXPORT_COLUMNS, type CoverLetterPdfFields } from '@/lib/cover-letter-pdf-html'
import { effectiveSenderDetails, type CoverLetterSenderDetails } from '@/lib/cover-letter-sender'
import { countCoverLetterPages, logPageCountFailure } from '@/lib/pdf/cover-letter-page-count'

// The one-page check lays the letter out in the PDF renderer's headless
// browser, which needs Node APIs and, with up to two AI calls, more than the
// default duration: the PDF routes' limit.
export const runtime = 'nodejs'
export const maxDuration = 60

/** How this route's AI call has always been named in the provider client's monitoring. */
const EDITOR_GENERATION_OPERATION = 'generateCompletion'

/** The letter as this route has always answered it, with its defaults for an empty greeting or sign-off. */
function editorReply(letter: GeneratedCoverLetter) {
  return {
    greeting: letter.greeting || 'Dear Hiring Manager,',
    openingParagraph: letter.openingParagraph || '',
    bodyParagraphs: letter.bodyParagraphs,
    closingParagraph: letter.closingParagraph || '',
    signOff: letter.signOff || 'Sincerely,',
  }
}

/** Every field the PDF prints besides the AI's text, as an empty letter has them. */
const EMPTY_HEADER: Omit<
  CoverLetterPdfFields,
  'greeting' | 'opening_paragraph' | 'body_paragraphs' | 'closing_paragraph' | 'sign_off'
> = {
  sender_name: null,
  sender_street: null,
  sender_postal_locality: null,
  sender_phone: null,
  sender_email: null,
  recipient_name: null,
  recipient_title: null,
  company_name: null,
  company_address: null,
  job_title: null,
  annexes: null,
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * The header the generated letter is measured in: the stored letter's, read
 * with the caller's session and an explicit owner filter, with the sender
 * details the PDF prints (`effectiveSenderDetails`). Without an id, or for a
 * letter that does not exist, is not the caller's or cannot be read, the
 * header of a letter with every field empty, as the editor prints a new one:
 * nothing of another user's letter is ever read or measured.
 *
 * The STORED header: an unsaved edit in the editor is not measured, as it is
 * not what the PDF prints either.
 */
async function measuredHeader(
  supabase: ServerSupabaseClient,
  userId: string,
  coverLetterId: unknown,
): Promise<{ fields: typeof EMPTY_HEADER; senderDetails: CoverLetterSenderDetails }> {
  const empty = { fields: EMPTY_HEADER, senderDetails: effectiveSenderDetails(EMPTY_HEADER, null) }
  if (!z.uuid().safeParse(coverLetterId).success) return empty

  const { data: stored, error } = await supabase
    .from('cover_letters')
    .select(COVER_LETTER_EXPORT_COLUMNS)
    .eq('id', coverLetterId as string)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[ai/generate-cover-letter] Reading the letter header failed:', error.code ?? 'unknown code')
    return empty
  }
  if (!stored) return empty

  const fields: typeof EMPTY_HEADER = {
    sender_name: stored.sender_name,
    sender_street: stored.sender_street,
    sender_postal_locality: stored.sender_postal_locality,
    sender_phone: stored.sender_phone,
    sender_email: stored.sender_email,
    recipient_name: stored.recipient_name,
    recipient_title: stored.recipient_title,
    company_name: stored.company_name,
    company_address: stored.company_address,
    job_title: stored.job_title,
    annexes: stored.annexes,
  }
  const contact = await linkedResumeContact(supabase, stored.resume_id, userId, 'ai/generate-cover-letter')
  return { fields, senderDetails: effectiveSenderDetails(stored, contact) }
}

export async function POST(request: NextRequest) {
  // The one-page check's time budget runs from the request's start.
  const deadline = coverLetterOnePageDeadline(Date.now())
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // This request spends the project's AI provider account. The budget is
    // keyed by the authenticated user, so it is counted once the identity is
    // known and cannot be reset by changing address.
    const throttled = await enforceAiRateLimit(request, { kind: 'user', userId: user.id })
    if (throttled) {
      return throttled
    }

    const oversizedBody = enforceJsonBodyLimit(request)
    if (oversizedBody) {
      return oversizedBody
    }

    const body = await request.json()
    const {
      resumeId,
      jobDescription,
      jobTitle,
      companyName,
      recipientName,
      recipientTitle,
      jobApplicationId,
      coverLetterId,
      locale,
    } = body

    // Ceilings on everything the caller supplies. The resume content in the
    // prompt is read from the caller's own stored resume; these fields are the
    // caller-supplied part, and without them one request's cost is unbounded.
    const oversized = findOversizedField(body, {
      resumeId: AI_TEXT_LIMITS.IDENTIFIER,
      jobApplicationId: AI_TEXT_LIMITS.IDENTIFIER,
      coverLetterId: AI_TEXT_LIMITS.IDENTIFIER,
      jobDescription: AI_TEXT_LIMITS.JOB_DESCRIPTION,
      jobTitle: AI_TEXT_LIMITS.SHORT_LABEL,
      companyName: AI_TEXT_LIMITS.SHORT_LABEL,
      recipientName: AI_TEXT_LIMITS.SHORT_LABEL,
      recipientTitle: AI_TEXT_LIMITS.SHORT_LABEL,
    })
    if (oversized) {
      return oversizedFieldResponse(oversized)
    }

    if (!jobDescription || typeof jobDescription !== 'string') {
      return NextResponse.json(
        { error: 'jobDescription is required' },
        { status: 400 }
      )
    }

    if (!jobTitle || typeof jobTitle !== 'string') {
      return NextResponse.json(
        { error: 'jobTitle is required' },
        { status: 400 }
      )
    }

    if (!companyName || typeof companyName !== 'string') {
      return NextResponse.json(
        { error: 'companyName is required' },
        { status: 400 }
      )
    }

    // Validate jobApplicationId belongs to user if provided
    if (jobApplicationId && typeof jobApplicationId === 'string') {
      const { data: jobApp, error: jobError } = await supabase
        .from('job_applications')
        .select('id')
        .eq('id', jobApplicationId)
        .eq('user_id', user.id)
        .single()

      if (jobError || !jobApp) {
        return NextResponse.json(
          { error: 'Invalid job application ID' },
          { status: 400 }
        )
      }
    }

    // Fetch resume data if resumeId provided
    let resumeSummary: string | undefined
    let resumeExperience: { position: string; company: string; description?: string }[] | undefined
    let resumeSkills: string[] | undefined

    if (resumeId) {
      const { data: resume, error } = await supabase
        .from('resumes')
        .select('summary, experience, skills')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .single<CoverLetterResumeRow>()

      if (error) {
        console.error('Error fetching resume:', error)
      } else if (resume) {
        ;({ resumeSummary, resumeExperience, resumeSkills } = coverLetterProfileFromResume(resume))
      }
    }

    // The shared prompt, model settings and reply parsing; never the company
    // address opt-in. The stub answers instead only on a local e2e server.
    let generated: GeneratedCoverLetter
    try {
      generated = await coverLetterGeneratorFor(request)(
        {
          resumeSummary,
          resumeExperience,
          resumeSkills,
          jobDescription,
          jobTitle,
          companyName,
          recipientName,
          recipientTitle,
          locale,
        },
        { operation: EDITOR_GENERATION_OPERATION },
      )
    } catch (error) {
      if (error instanceof CoverLetterReplyError) {
        // Not the reply itself: it is derived from the offer and the CV.
        console.error('Failed to parse AI response as a cover letter')
        return NextResponse.json(
          { error: 'Failed to parse AI response' },
          { status: 500 }
        )
      }
      throw error
    }

    // cover-letter-one-page, US-002: measured as the PDF would print it inside
    // the letter's header, and shortened once if it runs over one page.
    const shorten = coverLetterShortenerFor(request)
    const pageLanguage = coverLetterRequestLanguage(body)
    const { letter, outcome } = await keepCoverLetterOnOnePage<GeneratedCoverLetter>({
      letter: generated,
      deadline,
      countPages: async (candidate, timeoutMs) => {
        const reply = editorReply(candidate)
        try {
          // Read here, so that a failed or slow read only leaves the letter
          // unmeasured: the measurement's time limit covers it too.
          const header = await measuredHeader(supabase, user.id, coverLetterId)
          return await countCoverLetterPages(
            {
              ...header.fields,
              greeting: reply.greeting,
              opening_paragraph: reply.openingParagraph,
              body_paragraphs: reply.bodyParagraphs,
              closing_paragraph: reply.closingParagraph,
              sign_off: reply.signOff,
            },
            header.senderDetails,
            pageLanguage,
            timeoutMs,
          )
        } catch (error) {
          logPageCountFailure('ai/generate-cover-letter', error)
          throw error
        }
      },
      shorten: (candidate, timeoutMs) => shorten({ letter: coverLetterPartsOf(candidate), locale }, { timeoutMs }),
      isUsable: isCompleteGeneratedCoverLetter,
    })
    console.info('[ai/generate-cover-letter] One-page check:', outcome)

    return NextResponse.json({
      success: true,
      coverLetter: editorReply(letter),
    })
  } catch (error) {
    console.error('Error generating cover letter:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate cover letter',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
