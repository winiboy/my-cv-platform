import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit'
import { AI_TEXT_LIMITS, enforceJsonBodyLimit } from '@/lib/api/ai-input-limits'
import { generateResumeFromJobDescription } from '@/lib/ai/transformations'
import { generateStubResumeFromJobDescription, isAiTestStubEnabled } from '@/lib/ai/test-stub'
import { locales, type Locale } from '@/lib/i18n'
import { buildResumeFromJobOffer, type AiResumeContent } from '@/lib/resume-from-job/build-resume-from-job'
import { detectOfferLanguage } from '@/lib/resume-from-job/detect-offer-language'
import type { ResumeContentLanguage } from '@/lib/resume-from-job/sample-values'
import { sanitizeUntrustedPlainText } from '@/lib/resume-from-job/untrusted-text'
import { RESUME_TITLE_MAX_LENGTH } from '@/lib/resume-from-job/resume-title'
import type { ResumeInsert, ResumeTemplate } from '@/types/database'
import type { Json } from '@/types/supabase'

/**
 * POST /api/resumes/from-job-application
 *
 * Creates a complete CV for one of the caller's saved job applications (PRD
 * `tasks/prds/cv-from-job-complete.md`, US-002) and links the two both ways.
 *
 * The client sends only the application id, the CV title it chose and the
 * template (FR-3). The job's title, company, location and description are read
 * here, with the caller's session, from an application the caller owns; a
 * missing application and another user's are refused alike, before anything is
 * written.
 *
 * When the description is usable, the AI writes content in the offer's language
 * and `buildResumeFromJobOffer` fills every gap with sample values. When it is
 * not, or the AI fails or is rate-limited, the CV is still created from sample
 * values and the job's own fields, and `tailored: false` tells the client to say
 * so (AC4).
 */

export const dynamic = 'force-dynamic'

/**
 * The shortest description worth sending to the AI. The same floor as
 * `/api/ai/generate-from-job-description`, which refuses anything shorter as
 * "not a complete job description".
 */
const MIN_USABLE_DESCRIPTION_LENGTH = 50

/**
 * Output budget for the complete-resume request, twice Job Search's 2000.
 *
 * This request asks for more than Job Search's: 2-3 achievements per
 * experience on top of the same summary, experiences, skills and projects.
 * The reasoning model bills its hidden reasoning against the same budget
 * (`src/lib/ai/client.ts`: measured from 18 to 1470 tokens per call), and a
 * reply cut short is not valid JSON, which this route then turns into a
 * sample-only CV. Doubling the room makes that cut much less likely; the cost
 * per call stays bounded and the rate limit is unchanged. The real failure
 * rate has not been measured (no provider calls from the development checkout).
 */
const COMPLETE_RESUME_MAX_TOKENS = 4000

const RESUME_TEMPLATES = ['modern', 'classic', 'minimal', 'creative', 'professional'] as const satisfies readonly ResumeTemplate[]

const requestSchema = z.object({
  jobApplicationId: z.uuid(),
  // Cut, not rejected: the form pre-fills a job title, which may be longer.
  title: z.string(),
  template: z.enum(RESUME_TEMPLATES),
  /** The page's locale: the content language when the offer's is not fr, en, de or it. */
  locale: z.enum(locales as [Locale, ...Locale[]]),
})

interface CreateResumeFromJobApplicationResponse {
  resumeId: string
  /** `false` when the content could not be tailored by the AI (AC4). */
  tailored: boolean
}

/**
 * A builder section as a JSONB column value. The sections are plain JSON data
 * (strings, booleans, arrays, objects), but their interfaces in
 * `@/types/database` carry no index signature, which the generated `Json` type
 * requires; the cast states that, and nothing more.
 */
function asJson(value: object): Json {
  return value as unknown as Json
}

/** The AI's content for the offer, or `null` when it was not used or failed. */
async function generateTailoredContent(
  request: NextRequest,
  userId: string,
  description: string,
  language: ResumeContentLanguage,
  jobTitle: string
): Promise<AiResumeContent | null> {
  // Counted only when the AI is actually about to be called. A throttled
  // caller still gets a complete CV from sample values, as on any AI failure.
  const throttled = await enforceAiRateLimit(request, { kind: 'user', userId })
  if (throttled) return null

  const input = {
    jobDescription: description.slice(0, AI_TEXT_LIMITS.JOB_DESCRIPTION),
    locale: language,
    targetJobTitle: jobTitle,
  }

  try {
    const generate = isAiTestStubEnabled(process.env, request)
      ? generateStubResumeFromJobDescription
      : generateResumeFromJobDescription
    const { resumeData } = await generate(input, { maxTokens: COMPLETE_RESUME_MAX_TOKENS })
    return resumeData
  } catch (error) {
    // Provider failures are already reported to Sentry by `generateCompletion`;
    // a reply that is not JSON is logged by the parser. Neither carries the
    // offer's text here. The CV is created from sample values instead (AC4).
    console.error('[resumes/from-job-application] AI content unavailable:', error instanceof Error ? error.name : 'unknown')
    return null
  }
}

export async function POST(request: NextRequest) {
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

    const { jobApplicationId, template, locale } = parsed.data
    const title = sanitizeUntrustedPlainText(parsed.data.title, RESUME_TITLE_MAX_LENGTH)
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    // RLS limits the read to the caller's rows; the explicit user_id filter and
    // the check below keep ownership enforced even if a policy ever widened.
    const { data: application, error: applicationError } = await supabase
      .from('job_applications')
      .select('id, user_id, job_title, company_name, location, job_description')
      .eq('id', jobApplicationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (applicationError) {
      console.error('[resumes/from-job-application] Error loading job application:', applicationError.code)
      return NextResponse.json({ error: 'Failed to load job application' }, { status: 500 })
    }

    // Missing and not-owned get the same answer, so the route does not reveal
    // whether another user's application id exists.
    if (!application || application.user_id !== user.id) {
      return NextResponse.json({ error: 'Job application not found' }, { status: 404 })
    }

    const description = (application.job_description ?? '').trim()
    // AC3: the offer's language when it is clearly fr, en, de or it, otherwise
    // the page's. Decided before the AI call and handed to it, so the AI text
    // and the sample values that fill its gaps share one language.
    const language: ResumeContentLanguage = detectOfferLanguage(description) ?? locale
    const jobTitle = sanitizeUntrustedPlainText(application.job_title, AI_TEXT_LIMITS.SHORT_LABEL)

    const aiContent =
      description.length >= MIN_USABLE_DESCRIPTION_LENGTH
        ? await generateTailoredContent(request, user.id, description, language, jobTitle)
        : null

    const draft = buildResumeFromJobOffer({
      offer: {
        title: application.job_title,
        company: application.company_name,
        location: application.location,
      },
      language,
      aiContent,
    })

    const newResume: ResumeInsert = {
      user_id: user.id,
      template,
      // The title the user chose on the form (pre-filled with the job title)
      // names the CV; templates draw it as the headline.
      title,
      contact: asJson(draft.contact),
      summary: draft.summary,
      experience: asJson(draft.experience),
      education: asJson(draft.education),
      skills: asJson(draft.skills),
      languages: asJson(draft.languages),
      certifications: asJson(draft.certifications),
      projects: asJson(draft.projects),
      custom_sections: [],
      is_default: false,
      is_public: false,
      job_application_id: application.id,
    }

    const { data: resume, error: insertError } = await supabase
      .from('resumes')
      .insert(newResume)
      .select('id')
      .single()

    if (insertError || !resume) {
      console.error('[resumes/from-job-application] Error creating resume:', insertError?.code)
      return NextResponse.json({ error: 'Failed to create resume' }, { status: 500 })
    }

    // The second half of the link, exactly as the form did it before: a failure
    // here is logged and does not undo the CV, which is already linked through
    // its own job_application_id.
    const { error: linkError } = await supabase
      .from('job_applications')
      .update({ resume_id: resume.id, updated_at: new Date().toISOString() })
      .eq('id', application.id)
      .eq('user_id', user.id)

    if (linkError) {
      console.error('[resumes/from-job-application] Error linking resume to job application:', linkError.code)
    }

    const responseBody: CreateResumeFromJobApplicationResponse = {
      resumeId: resume.id,
      tailored: aiContent !== null,
    }
    return NextResponse.json(responseBody, { status: 201 })
  } catch (error) {
    console.error('[resumes/from-job-application] Unexpected error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: 'Failed to create resume' }, { status: 500 })
  }
}
