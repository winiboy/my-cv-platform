import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AiCompletionError } from '@/lib/ai/client'
import {
  CoverLetterReplyError,
  coverLetterPartsOf,
  coverLetterProfileFromResume,
  type CoverLetterResumeProfile,
  type GeneratedCoverLetter,
} from '@/lib/ai/cover-letter-generation'
import { coverLetterOnePageDeadline, keepCoverLetterOnOnePage } from '@/lib/ai/cover-letter-one-page'
import { coverLetterGeneratorFor, coverLetterShortenerFor, offerPageCheckerFor } from '@/lib/ai/test-stub'
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit'
import { AI_TEXT_LIMITS, enforceJsonBodyLimit } from '@/lib/api/ai-input-limits'
import {
  boundCoverLetterResumeProfile,
  toStoredCoverLetterContent,
  type StoredCoverLetterContent,
} from '@/lib/cover-letter-from-job/stored-letter'
import type { CoverLetterPdfFields } from '@/lib/cover-letter-pdf-html'
import { countCoverLetterPages, logPageCountFailure } from '@/lib/pdf/cover-letter-page-count'
import { isDeadlinePassed, type OfferClosedReason } from '@/lib/cover-letter-from-job/offer-availability'
import { companyAddressFromOfferText } from '@/lib/cover-letter-from-job/offer-text-address'
import { locales, type Locale } from '@/lib/i18n'
import { detectOfferLanguage } from '@/lib/resume-from-job/detect-offer-language'
import type { ResumeContentLanguage } from '@/lib/resume-from-job/sample-values'
import { sanitizeUntrustedPlainText } from '@/lib/resume-from-job/untrusted-text'
import { effectiveSenderDetails, senderDetailsFromContact } from '@/lib/cover-letter-sender'
import type { CoverLetterInsert, ResumeContact } from '@/types/database'

/**
 * POST /api/cover-letters/from-job-application
 *
 * Creates a cover letter written by the AI for one of the caller's saved job
 * applications (PRD `tasks/prds/cover-letter-from-job.md`, US-001) and links
 * the application to it.
 *
 * The client sends only identifiers and form fields (FR-1). The offer's
 * description and the CV's content are read here, with the caller's session
 * and explicit `user_id` filters; a missing row and another user's are refused
 * alike, before anything is written.
 *
 * Unlike the CV flow, there is no fallback content: when the AI fails, is rate
 * limited or answers with something that is not a letter, nothing is stored or
 * linked and the client shows an error so the user can retry (AC6).
 *
 * An offer that is no longer open - deadline past, or its job-board page
 * answering 404 or 410 - gets no letter: 409 with the reason (US-002).
 *
 * The same, single page check gives the company's postal address when the
 * page's JobPosting data has a complete one; it is stored as the letter's
 * `company_address` (cover-letter-recipient-address-from-offer, US-001).
 * When it gives none, the same, single AI call also reads the address from the
 * offer's text, and it is stored only if it is found in that text (US-002).
 *
 * The letter, with its header, is then measured as the PDF prints it; one that
 * runs over one page is shortened by exactly one more AI call, counted against
 * no further rate-limit unit (cover-letter-one-page, US-002). A failed
 * measurement or shortening keeps the first letter.
 */

export const dynamic = 'force-dynamic'
// The one-page check (cover-letter-one-page, US-002) lays the letter out in the
// PDF renderer's headless browser, which needs Node APIs and, with up to two AI
// calls, more than the default duration: the PDF routes' limit.
export const runtime = 'nodejs'
export const maxDuration = 60

/** The cover-letter title limit of `POST /api/cover-letters`. */
const COVER_LETTER_TITLE_MAX_LENGTH = 255

/**
 * Stands in the prompt for a missing description (AC5), in the wording the
 * prompt already uses for a missing summary, experience or skills.
 */
const NO_JOB_DESCRIPTION = 'Not provided'

const requestSchema = z.object({
  jobApplicationId: z.uuid(),
  // Form fields are cut, not rejected: they are pre-filled from the application.
  title: z.string(),
  companyName: z.string(),
  jobTitle: z.string(),
  resumeId: z.uuid().nullable(),
  /** The page's locale: the letter's language when the offer's is not fr, en, de or it. */
  locale: z.enum(locales as [Locale, ...Locale[]]),
})

interface CreateCoverLetterFromJobApplicationResponse {
  coverLetterId: string
}

/** 409: the offer is no longer open (US-002); the client localizes `reason`. */
interface OfferClosedResponse {
  error: 'offer_closed'
  reason: OfferClosedReason
}

function offerClosed(reason: OfferClosedReason): NextResponse<OfferClosedResponse> {
  return NextResponse.json({ error: 'offer_closed', reason }, { status: 409 })
}

interface ResumeRow {
  id: string
  user_id: string
  summary: string | null
  experience: unknown
  skills: unknown
  contact: unknown
}

/** The CV's contact name, or `null` when it has none. */
function senderNameOf(contact: unknown): string | null {
  if (typeof contact !== 'object' || contact === null) return null
  const name = sanitizeUntrustedPlainText((contact as ResumeContact).name, AI_TEXT_LIMITS.SHORT_LABEL)
  return name || null
}

const AI_UNAVAILABLE = { error: 'The cover letter could not be generated' } as const

/** What the PDF would print of the row about to be stored: every field it prints, unset ones as null. */
function pdfFieldsOf(row: CoverLetterInsert): CoverLetterPdfFields {
  return {
    sender_name: row.sender_name ?? null,
    sender_street: row.sender_street ?? null,
    sender_postal_locality: row.sender_postal_locality ?? null,
    sender_phone: row.sender_phone ?? null,
    sender_email: row.sender_email ?? null,
    recipient_name: row.recipient_name ?? null,
    recipient_title: row.recipient_title ?? null,
    company_name: row.company_name ?? null,
    company_address: row.company_address ?? null,
    job_title: row.job_title ?? null,
    greeting: row.greeting ?? '',
    opening_paragraph: row.opening_paragraph ?? null,
    body_paragraphs: row.body_paragraphs ?? [],
    closing_paragraph: row.closing_paragraph ?? null,
    sign_off: row.sign_off ?? '',
    annexes: row.annexes ?? null,
  }
}

export async function POST(request: NextRequest) {
  // The one-page check's time budget runs from the request's start.
  const deadline = coverLetterOnePageDeadline(Date.now())
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const oversizedBody = enforceJsonBodyLimit(request)
    if (oversizedBody) return oversizedBody

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { jobApplicationId, resumeId, locale } = parsed.data
    const title = sanitizeUntrustedPlainText(parsed.data.title, COVER_LETTER_TITLE_MAX_LENGTH)
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    // RLS limits the reads to the caller's rows; the explicit user_id filters
    // and the checks below keep ownership enforced even if a policy widened.
    const { data: application, error: applicationError } = await supabase
      .from('job_applications')
      .select('id, user_id, job_title, company_name, job_description, deadline, job_url')
      .eq('id', jobApplicationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (applicationError) {
      console.error('[cover-letters/from-job-application] Error loading job application:', applicationError.code)
      return NextResponse.json({ error: 'Failed to load job application' }, { status: 500 })
    }

    // Missing and not-owned get the same answer, so the route does not reveal
    // whether another user's id exists.
    if (!application || application.user_id !== user.id) {
      return NextResponse.json({ error: 'Job application not found' }, { status: 404 })
    }

    let resume: ResumeRow | null = null
    if (resumeId !== null) {
      const { data, error: resumeError } = await supabase
        .from('resumes')
        .select('id, user_id, summary, experience, skills, contact')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .maybeSingle<ResumeRow>()

      if (resumeError) {
        console.error('[cover-letters/from-job-application] Error loading resume:', resumeError.code)
        return NextResponse.json({ error: 'Failed to load resume' }, { status: 500 })
      }
      if (!data || data.user_id !== user.id) {
        return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
      }
      resume = data
    }

    // US-002: a closed offer gets no letter. The deadline needs no network and
    // is checked first, so a past deadline spends no budget at all.
    if (isDeadlinePassed(application.deadline, new Date())) {
      console.info('[cover-letters/from-job-application] Offer closed: deadline_passed')
      return offerClosed('deadline_passed')
    }

    // Counted before the page fetch, so the per-user AI budget also bounds how
    // often a user can make the server fetch job-board pages. A page found
    // removed therefore spends one unit.
    const throttled = await enforceAiRateLimit(request, { kind: 'user', userId: user.id })
    if (throttled) return throttled

    const pageCheck = await offerPageCheckerFor(request)(application.job_url)
    if (pageCheck.kind === 'gone') {
      // The reason and the page's status only: the URL may carry personal data.
      console.info('[cover-letters/from-job-application] Offer closed: page_unavailable', pageCheck.status)
      return offerClosed('page_unavailable')
    }

    const description = (application.job_description ?? '').trim()
    // AC4: the offer's language when it is clearly fr, en, de or it, otherwise
    // the page's, decided the same way as for a CV created from the offer.
    const language: ResumeContentLanguage = detectOfferLanguage(description) ?? locale

    // The form's values, pre-filled from the application and editable there,
    // name the job in the prompt and on the letter; a cleared field falls back
    // to the application's own value.
    const jobTitle =
      sanitizeUntrustedPlainText(parsed.data.jobTitle, AI_TEXT_LIMITS.SHORT_LABEL) ||
      sanitizeUntrustedPlainText(application.job_title, AI_TEXT_LIMITS.SHORT_LABEL)
    const companyName =
      sanitizeUntrustedPlainText(parsed.data.companyName, AI_TEXT_LIMITS.SHORT_LABEL) ||
      sanitizeUntrustedPlainText(application.company_name, AI_TEXT_LIMITS.SHORT_LABEL)

    const profile: CoverLetterResumeProfile = resume
      ? boundCoverLetterResumeProfile(coverLetterProfileFromResume(resume))
      : {}

    // From the offer page's JobPosting data, already cleaned and bounded by the
    // page check; null when the page gave no complete address.
    const pageAddress = pageCheck.kind === 'answered' ? pageCheck.companyAddress : null
    const offerText = description.slice(0, AI_TEXT_LIMITS.JOB_DESCRIPTION)
    // US-002: only then does the generation also read the address from the
    // text, in the same call, so no rate-limit unit or provider call is added.
    const askCompanyAddress = pageAddress === null && offerText !== ''

    let generated: GeneratedCoverLetter
    try {
      const generate = coverLetterGeneratorFor(request)
      generated = await generate({
        ...profile,
        jobDescription: offerText || NO_JOB_DESCRIPTION,
        jobTitle,
        companyName,
        locale: language,
        ...(askCompanyAddress ? { askCompanyAddress } : {}),
      })
    } catch (error) {
      // Provider failures are already reported to Sentry by `generateCompletion`.
      // Only the error's class is logged: the reply and the prompt carry the
      // offer's and the CV's text.
      if (error instanceof AiCompletionError) {
        console.error('[cover-letters/from-job-application] AI provider failed:', error.reason)
        const status = error.reason === 'rate_limited' ? 429 : 502
        return NextResponse.json(AI_UNAVAILABLE, { status })
      }
      if (error instanceof CoverLetterReplyError) {
        console.error('[cover-letters/from-job-application] AI reply is not a letter')
        return NextResponse.json(AI_UNAVAILABLE, { status: 502 })
      }
      throw error
    }

    const firstContent = toStoredCoverLetterContent(generated)
    if (!firstContent) {
      console.error('[cover-letters/from-job-application] AI reply is an incomplete letter')
      return NextResponse.json(AI_UNAVAILABLE, { status: 502 })
    }

    // Everything but the AI's text, decided from the first reply: the address
    // comes from it and never changes with the shortening (AC9).
    const letterHeader: Omit<CoverLetterInsert, keyof StoredCoverLetterContent> = {
      user_id: user.id,
      title,
      resume_id: resume?.id ?? null,
      job_application_id: application.id,
      company_name: companyName || null,
      // The page's address first (FR-2), then the AI's reading of the text,
      // kept only when found in the text it was given; otherwise null.
      company_address:
        pageAddress ??
        (askCompanyAddress ? companyAddressFromOfferText(generated.companyAddress, offerText, companyName) : null),
      job_title: jobTitle || null,
      // As the form stored it before: the offer the letter was written for.
      job_description: application.job_description,
      sender_name: resume ? senderNameOf(resume.contact) : null,
      // The phone, e-mail and locality the CV has, as the editor prefills them.
      ...(resume ? senderDetailsFromContact(resume.contact) : {}),
      template: 'modern',
    }

    // cover-letter-one-page, US-002: the letter as it will be stored, with its
    // header, measured as the PDF prints it; shortened once if it runs over.
    const shorten = coverLetterShortenerFor(request)
    const { letter: keptLetter, outcome } = await keepCoverLetterOnOnePage<GeneratedCoverLetter>({
      letter: generated,
      deadline,
      countPages: async (_letter, timeoutMs) => {
        const stored = { ...letterHeader, ...firstContent, annexes: null }
        try {
          return await countCoverLetterPages(
            pdfFieldsOf(stored),
            effectiveSenderDetails(pdfFieldsOf(stored), resume ? resume.contact : null),
            // The page's locale, as the PDF route is given it: the fallback for
            // a letter whose own language its text cannot tell.
            locale,
            timeoutMs,
          )
        } catch (error) {
          logPageCountFailure('cover-letters/from-job-application', error)
          throw error
        }
      },
      // The letter is written in `language`; it is shortened in the same one.
      shorten: (letter, timeoutMs) => shorten({ letter: coverLetterPartsOf(letter), locale: language }, { timeoutMs }),
      isUsable: (letter) => toStoredCoverLetterContent(letter) !== null,
    })
    console.info('[cover-letters/from-job-application] One-page check:', outcome)
    const content = (outcome === 'shortened' ? toStoredCoverLetterContent(keptLetter) : null) ?? firstContent

    const newCoverLetter: CoverLetterInsert = { ...letterHeader, ...content }

    const { data: coverLetter, error: insertError } = await supabase
      .from('cover_letters')
      .insert(newCoverLetter)
      .select('id')
      .single()

    if (insertError || !coverLetter) {
      console.error('[cover-letters/from-job-application] Error creating cover letter:', insertError?.code)
      return NextResponse.json({ error: 'Failed to create cover letter' }, { status: 500 })
    }

    // The application's half of the link, exactly as the form did it before: a
    // failure here is logged and does not undo the letter, which is already
    // linked through its own job_application_id.
    const { error: linkError } = await supabase
      .from('job_applications')
      .update({ cover_letter_id: coverLetter.id, updated_at: new Date().toISOString() })
      .eq('id', application.id)
      .eq('user_id', user.id)

    if (linkError) {
      console.error('[cover-letters/from-job-application] Error linking cover letter to job application:', linkError.code)
    }

    const responseBody: CreateCoverLetterFromJobApplicationResponse = { coverLetterId: coverLetter.id }
    return NextResponse.json(responseBody, { status: 201 })
  } catch (error) {
    console.error('[cover-letters/from-job-application] Unexpected error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: 'Failed to create cover letter' }, { status: 500 })
  }
}
