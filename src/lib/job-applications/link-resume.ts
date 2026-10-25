import type { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Resume } from '@/types/database'

/**
 * The one server-side writer of the CV <-> job application link
 * (job-cv-linking FR-1), used by "Créer un CV" from Job Search (US-001) and
 * by "Lier un CV existant" on a Kanban card (US-002).
 *
 * WHAT IT GUARANTEES
 * - Ownership: the CV and the application are read first with the caller's
 *   `userId` (the authenticated user) as an explicit filter, on top of RLS.
 *   If either is missing or belongs to another user, nothing is written and
 *   `load_resume` / `load_application` is returned. Every write is filtered
 *   on `userId` too, so no other user's row is ever changed.
 * - On success, the CV and the application point to each other, no other CV
 *   of the user points to the application, and no other application of the
 *   user points to the CV. CVs and applications that lose their link are
 *   kept; only the link column is cleared, and only where it still points to
 *   the row being linked.
 * - On a failure before both directions are written (`link_resume`,
 *   `link_application`), the CV's previous link is restored, so nothing has
 *   changed. If that restore fails too, `rollback_link_resume` is returned:
 *   the CV then points to the application, which does not point back.
 * - On a failure clearing the previous links, the new link is in place and is
 *   kept: the result is `ok`, with `staleLink` naming the failed step
 *   (`clear_previous_resumes` or `clear_previous_applications`) for the
 *   caller to log. Both clears are always attempted, and the first failure is
 *   reported. A stale link to the other row may then remain.
 *
 * WHAT IT DOES NOT GUARANTEE
 * Atomicity: the writes are separate statements, without a transaction
 * (no schema change, FR-4). A crash between them can leave a half link, the
 * same exposure as the resume editor's association code.
 */

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/** The step a link failed at, for logs: no CV or offer content. */
export type LinkStep =
  | 'load_application'
  | 'load_resume'
  | 'link_resume'
  | 'link_application'
  /** `link_application` failed AND undoing the CV's link failed too: the CV is left pointing at the application. */
  | 'rollback_link_resume'

/** A clear that failed after the link was written: the link stands, a stale one may remain elsewhere. */
export type ClearStep = 'clear_previous_resumes' | 'clear_previous_applications'

export interface LinkedResume {
  id: string
  title: string
  template: Resume['template']
}

export type LinkResult =
  | { ok: true; resume: LinkedResume; staleLink: { step: ClearStep; code: string | null } | null }
  | { ok: false; step: LinkStep; code: string | null }

function failure(step: LinkStep, error: { code?: string } | null): LinkResult {
  return { ok: false, step, code: error?.code ?? null }
}

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
    return failure('load_application', applicationLoadError)
  }

  const { data: resume, error: resumeLoadError } = await supabase
    .from('resumes')
    .select('id, title, template, job_application_id')
    .eq('id', resumeId)
    .eq('user_id', userId)
    .maybeSingle()

  if (resumeLoadError || !resume) {
    return failure('load_resume', resumeLoadError)
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
    return failure('link_resume', resumeError)
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
      return failure('rollback_link_resume', rollbackError)
    }
    return failure('link_application', applicationError)
  }

  // Every other CV of the user still pointing to this application: the resume
  // editor can leave several there, so not only the one the application named.
  const { error: clearResumesError } = await supabase
    .from('resumes')
    .update({ job_application_id: null })
    .eq('user_id', userId)
    .eq('job_application_id', application.id)
    .neq('id', resume.id)

  // Every other application of the user still pointing to this CV, such as the
  // one the CV was linked to before.
  const { error: clearApplicationsError } = await supabase
    .from('job_applications')
    .update({ resume_id: null })
    .eq('user_id', userId)
    .eq('resume_id', resume.id)
    .neq('id', application.id)

  const staleLink = clearResumesError
    ? { step: 'clear_previous_resumes' as const, code: clearResumesError.code ?? null }
    : clearApplicationsError
      ? { step: 'clear_previous_applications' as const, code: clearApplicationsError.code ?? null }
      : null

  return { ok: true, resume: { id: resume.id, title: resume.title, template: resume.template }, staleLink }
}
