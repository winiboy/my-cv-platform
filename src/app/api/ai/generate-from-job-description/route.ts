import { NextRequest, NextResponse } from 'next/server'
import { COMPLETE_RESUME_MAX_TOKENS } from '@/lib/ai/transformations'
import { resumeGeneratorFor } from '@/lib/ai/test-stub'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractJobRequirements } from '@/lib/ai/job-requirements-extractor'
import { calculateRelevanceScore, type ResumeContent } from '@/lib/ai/relevance-scorer'
import { QUALITY_THRESHOLD } from '@/lib/constants'
import type { ResumeInsert } from '@/types/database'
import { buildResumeFromJobOffer, toResumeColumns } from '@/lib/resume-from-job/build-resume-from-job'
import { detectOfferLanguage } from '@/lib/resume-from-job/detect-offer-language'
import { isResumeContentLanguage, type ResumeContentLanguage } from '@/lib/resume-from-job/sample-values'
import type { QualityAnalysis } from '@/types/quality-analysis'
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit'
import {
  AI_TEXT_LIMITS,
  enforceJsonBodyLimit,
  findOversizedField,
  oversizedFieldResponse,
} from '@/lib/api/ai-input-limits'
import {
  createJobApplicationWithDedupe,
  jobOfferApplicationSchema,
  type JobOfferApplication,
} from '@/lib/job-applications/create-job-application'
import { linkResumeToJobApplication } from '@/lib/job-applications/link-resume'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

const LOG_PREFIX = '[generate-from-job-description]'

/**
 * Saves the offer as the user's job application, or finds the one already
 * saved with the same URL, and links the new CV to it both ways
 * (job-cv-linking US-001).
 *
 * Called only once the CV exists, so a failed generation touches no
 * application. Never throws: the CV is the result of the request, and a
 * failure here is logged, by step and database code only, and leaves it as
 * it is (AC6).
 */
async function linkResumeToOfferApplication(
  supabase: ServerSupabaseClient,
  userId: string,
  resumeId: string,
  offer: JobOfferApplication
): Promise<void> {
  try {
    const saved = await createJobApplicationWithDedupe(supabase, userId, offer)
    if (saved.kind === 'failed') {
      console.error(`${LOG_PREFIX} Could not save the offer as a job application:`, saved.error.code)
      return
    }

    const jobApplicationId = saved.kind === 'created' ? saved.jobApplication.id : saved.existing.id
    const linked = await linkResumeToJobApplication(supabase, { userId, resumeId, jobApplicationId })
    if (!linked.ok) {
      console.error(`${LOG_PREFIX} Could not link the CV to its job application:`, linked.step, linked.code)
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not link the CV to its job application:`, error instanceof Error ? error.name : 'unknown')
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // This request spends the project's AI provider account -- three times over,
    // since it also extracts requirements and scores relevance. The budget is
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

    // Parse request body
    const body = await request.json()
    const { jobDescription, title, template, locale } = body

    // The Job Search offer the CV is made for, to save and link once the CV
    // exists. Optional and untrusted: when it is missing or invalid the CV is
    // still created, as before this field existed, and nothing is linked.
    const offer = body.offer === undefined ? null : jobOfferApplicationSchema.safeParse(body.offer)
    if (offer && !offer.success) {
      console.error(`${LOG_PREFIX} Offer ignored, invalid fields:`, offer.error.issues.map((issue) => issue.path.join('.')))
    }

    // Ceilings on everything that reaches the prompt: without them the cost of
    // a single request is whatever the caller chooses to upload.
    const oversized = findOversizedField(body, {
      jobDescription: AI_TEXT_LIMITS.JOB_DESCRIPTION,
      title: AI_TEXT_LIMITS.SHORT_LABEL,
    })
    if (oversized) {
      return oversizedFieldResponse(oversized)
    }

    // Validate inputs
    if (!jobDescription || typeof jobDescription !== 'string') {
      return NextResponse.json(
        { error: 'jobDescription is required and must be a string' },
        { status: 400 }
      )
    }

    if (jobDescription.trim().length < 50) {
      return NextResponse.json(
        { error: 'Job description is too short. Please provide a complete job description.' },
        { status: 400 }
      )
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'title is required and must be a string' },
        { status: 400 }
      )
    }

    const validTemplates = ['modern', 'classic', 'minimal', 'creative', 'professional']
    if (!template || !validTemplates.includes(template)) {
      return NextResponse.json(
        { error: 'Invalid template. Must be one of: modern, classic, minimal, creative, professional' },
        { status: 400 }
      )
    }

    // The offer's language when it is clearly fr, en, de or it, otherwise the
    // page's, as for a saved job application (cv-from-job-complete, US-003).
    // An unsupported page locale falls back to English, as the prompt always did.
    const language: ResumeContentLanguage =
      detectOfferLanguage(jobDescription) ?? (isResumeContentLanguage(locale) ? locale : 'en')

    // Generate resume content using AI. A failure or a provider rate limit
    // throws to the handler below, as before: Job Search shows the error and
    // creates no CV (US-003 AC3), unlike the saved-application flow.
    // `completeResume` asks for achievements and a summary naming the job, which
    // the AI takes from the description: this request carries no job title.
    const result = await resumeGeneratorFor(request)(
      { jobDescription: jobDescription.trim(), locale: language, completeResume: true },
      { maxTokens: COMPLETE_RESUME_MAX_TOKENS }
    )

    // Every field filled through the one builder: the AI's content, sanitized,
    // and the sample values of the same language for everything else. The
    // request has no separate job title, company or location; the CV title it
    // sends names the CV as before.
    const draft = buildResumeFromJobOffer({
      offer: { title },
      language,
      aiContent: result.resumeData,
    })

    const newResume: ResumeInsert = {
      user_id: user.id,
      template,
      ...toResumeColumns(draft),
      title: title.trim(),
      custom_sections: [],
      is_default: false,
      is_public: false,
    }

    const result2 = await supabase
      .from('resumes')
      .insert(newResume)
      .select()
      .single()

    if (result2.error) {
      console.error('Error creating resume:', result2.error)
      return NextResponse.json(
        { error: 'Failed to create resume in database' },
        { status: 500 }
      )
    }

    if (offer?.success) {
      await linkResumeToOfferApplication(supabase, user.id, result2.data.id, offer.data)
    }

    // Extract job requirements and calculate quality analysis
    let qualityAnalysis: QualityAnalysis | null = null

    try {
      const requirements = await extractJobRequirements(
        jobDescription.trim(),
        locale || 'en'
      )

      // The saved resume in ResumeContent format for scoring
      const resumeContent: ResumeContent = {
        summary: draft.summary,
        contact: draft.contact,
        experience: draft.experience,
        education: draft.education,
        skills: draft.skills,
        projects: draft.projects,
        certifications: draft.certifications,
      }

      const relevanceScore = calculateRelevanceScore(resumeContent, requirements)

      qualityAnalysis = {
        score: relevanceScore.score,
        matchedItems: relevanceScore.matchedItems,
        missingItems: relevanceScore.missingItems,
        genericItems: relevanceScore.genericItems,
        isInsufficient: relevanceScore.score < QUALITY_THRESHOLD,
        iteration: 1,
      }
    } catch (analysisError) {
      // Quality analysis is non-blocking - log error but don't fail the request
      console.error('Error calculating quality analysis:', analysisError)
    }

    return NextResponse.json({
      success: true,
      resumeId: result2.data.id,
      tokensUsed: result.tokensUsed,
      qualityAnalysis,
    })
  } catch (error) {
    console.error('Error generating resume from job description:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate resume',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
