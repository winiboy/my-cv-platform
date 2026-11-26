import type { Resume, ResumeUpdate } from '@/types/database'

/**
 * The resume a surface draws once the browser's `resume_draft_${id}` blob has
 * been laid over the stored row.
 *
 * The draft carries the whole resume, `template` included, but the editor never
 * changes the template: the stored row is its only source. A draft written
 * before migration 012 can still name a legacy id such as `professional`, and
 * letting it win would make the Editor, the Preview and the PDF (which prints
 * the Preview with the draft seeded) draw a fallback while Word reads the row.
 * So the row's `template` always replaces the draft's.
 *
 * Throws when `draft` is not an object, so a caller treats a corrupt draft the
 * same way it treats unparsable JSON.
 */
export function resumeWithDraft(row: Resume, draft: unknown): Resume {
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) {
    throw new TypeError('A resume draft must be an object')
  }
  return { ...(draft as Resume), template: row.template }
}

/**
 * The columns the editor's Save writes: the user's authored content only.
 *
 * `template` is deliberately absent. The editor has no control that changes it,
 * so writing it back could only ever replay a stale value — and one outside
 * `resumes_template_check` would make every Save fail. Layout state has its own
 * column and writer (`useResumeLayout`), so it is absent too. `custom_sections`
 * round-trips whatever shape the row already had, so a row still holding the
 * legacy `{ items, layoutSettings }` wrapper keeps it and stays readable.
 */
export function resumeSaveUpdates(resume: Resume): ResumeUpdate {
  return {
    title: resume.title,
    contact: resume.contact,
    summary: resume.summary,
    experience: resume.experience,
    education: resume.education,
    skills: resume.skills,
    languages: resume.languages,
    certifications: resume.certifications,
    projects: resume.projects,
    custom_sections: resume.custom_sections,
  }
}
