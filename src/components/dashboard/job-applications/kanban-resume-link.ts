import type { JobApplicationWithRelations } from '@/types/database'

/** The CV a link route answered with, as the card's badge needs it. */
export interface KanbanLinkedResume {
  id: string
  title: string
  template: NonNullable<JobApplicationWithRelations['resume']>['template']
}

/**
 * The board after `resume` was linked to the application `applicationId`
 * (job-cv-linking US-002), mirroring what the server wrote: that card shows
 * the CV, and any other card that showed it no longer does, since a CV is
 * linked to one application at a time. A CV the card showed before simply
 * stops being shown there.
 *
 * Pure, so the board can apply it from the response and it can be tested
 * without rendering.
 */
export function applyResumeLink(
  applications: readonly JobApplicationWithRelations[],
  applicationId: string,
  resume: KanbanLinkedResume
): JobApplicationWithRelations[] {
  return applications.map((application) => {
    if (application.id === applicationId) {
      return { ...application, resume_id: resume.id, resume: { ...resume } }
    }
    if (application.resume_id === resume.id || application.resume?.id === resume.id) {
      return { ...application, resume_id: null, resume: null }
    }
    return application
  })
}
