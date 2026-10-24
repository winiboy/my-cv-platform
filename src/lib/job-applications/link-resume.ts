import type { createServerSupabaseClient } from '@/lib/supabase/server'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/** The step a link failed at, for logs: no CV or offer content. */
export type LinkStep =
  | 'load_application'
  | 'load_resume'
  | 'link_resume'
  | 'link_application'
  /** `link_application` failed AND undoing the CV's link failed too: the CV is left pointing at the application. */
  | 'rollback_link_resume'
  | 'clear_previous_resumes'

export type LinkResult = { ok: true } | { ok: false; step: LinkStep; code: string | null }

/**
 * Links one of the user's CVs to one of the user's job applications, both
 * ways (job-cv-linking FR-1):
 *
 * 1. the CV's `job_application_id` is set to the application;
 * 2. the application's `resume_id` is set to the CV;
 * 3. every other CV of the user that still points to the application has its
 *    `job_application_id` cleared, so none points to an application that
 *    points elsewhere. Those CVs are kept. All of them, not only the one the
 *    application named: the resume editor can leave several CVs on one
 *    application.
 *
 * When step 2 fails, step 1 is undone (the CV gets its previous link back), as
 * the resume editor does; a failed undo is reported as its own step. There is
 * no transaction across the writes (no schema change, FR-4); a failure at
 * step 3 is reported, not undone, as the new link is already consistent.
 *
 * Both rows are read first, filtered on `userId` (the authenticated user) on
 * top of RLS: a CV or an application of another user is not found, and
 * nothing is written. Every write is filtered on `userId` too.
 */
export async function linkResumeToJobApplication(
  supabase: ServerSupabaseClient,
  { userId, resumeId, jobApplicationId }: { userId: string; resumeId: string; jobApplicationId: string }
): Promise<LinkResult> {
  const { data: application, error: applicationLoadError } = await supabase
    .from('job_applications')
    .select('id')
    .eq('id', jobApplicationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (applicationLoadError || !application) {
    return { ok: false, step: 'load_application', code: applicationLoadError?.code ?? null }
  }

  const { data: resume, error: resumeLoadError } = await supabase
    .from('resumes')
    .select('id, job_application_id')
    .eq('id', resumeId)
    .eq('user_id', userId)
    .maybeSingle()

  if (resumeLoadError || !resume) {
    return { ok: false, step: 'load_resume', code: resumeLoadError?.code ?? null }
  }

  // `.select` makes a write that matched no row (RLS, a row deleted meanwhile)
  // visible: without it an update of nothing succeeds silently.
  const { data: linkedResume, error: resumeError } = await supabase
    .from('resumes')
    .update({ job_application_id: application.id })
    .eq('id', resume.id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()

  if (resumeError || !linkedResume) {
    return { ok: false, step: 'link_resume', code: resumeError?.code ?? null }
  }

  const { data: linkedApplication, error: applicationError } = await supabase
    .from('job_applications')
    .update({ resume_id: resume.id, updated_at: new Date().toISOString() })
    .eq('id', application.id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()

  if (applicationError || !linkedApplication) {
    // Only while the CV still holds the link written above.
    const { data: restored, error: rollbackError } = await supabase
      .from('resumes')
      .update({ job_application_id: resume.job_application_id ?? null })
      .eq('id', resume.id)
      .eq('user_id', userId)
      .eq('job_application_id', application.id)
      .select('id')
      .maybeSingle()

    if (rollbackError || !restored) {
      return { ok: false, step: 'rollback_link_resume', code: rollbackError?.code ?? null }
    }
    return { ok: false, step: 'link_application', code: applicationError?.code ?? null }
  }

  // Only CVs that still point here: one since linked elsewhere keeps its link.
  const { error: clearError } = await supabase
    .from('resumes')
    .update({ job_application_id: null })
    .eq('user_id', userId)
    .eq('job_application_id', application.id)
    .neq('id', resume.id)

  if (clearError) {
    return { ok: false, step: 'clear_previous_resumes', code: clearError.code ?? null }
  }

  return { ok: true }
}
