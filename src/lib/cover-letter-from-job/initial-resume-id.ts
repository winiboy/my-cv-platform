/**
 * The CV that "Lier à un CV" starts on in the cover-letter creation form
 * (PRD `tasks/prds/cover-letter-from-job.md`, US-003).
 *
 * When the application has a linked CV, that link alone decides: the select
 * starts on it if it is one of the user's own CVs, and empty otherwise.
 * `?resume_id=` is not consulted then. Only when the application has no linked
 * CV, or there is no application, does `?resume_id=` apply, with the same check
 * against the user's own CVs. A foreign, deleted or forged id therefore never
 * pre-selects anything. The empty string is the select's "no CV" option.
 *
 * Pure, and free of server imports, because the client form calls it.
 */
export function initialCoverLetterResumeId({
  applicationResumeId,
  queryResumeId,
  resumes,
}: {
  applicationResumeId: string | null | undefined
  queryResumeId: string | null | undefined
  resumes: readonly { id: string }[]
}): string {
  const ownResumeOrEmpty = (id: string): string => (resumes.some((resume) => resume.id === id) ? id : '')

  if (applicationResumeId) return ownResumeOrEmpty(applicationResumeId)
  if (queryResumeId) return ownResumeOrEmpty(queryResumeId)
  return ''
}
