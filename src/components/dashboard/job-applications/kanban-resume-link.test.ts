import { describe, expect, it } from 'vitest'
import type { JobApplicationWithRelations } from '@/types/database'
import { applyResumeLink } from './kanban-resume-link'

/** The board update after "Lier un CV existant" (job-cv-linking US-002). */

function card(id: string, resume: { id: string; title: string } | null): JobApplicationWithRelations {
  return {
    id,
    job_title: `Job ${id}`,
    company_name: 'Company',
    resume_id: resume?.id ?? null,
    resume: resume ? { ...resume, template: 'classic' } : null,
    cover_letter: null,
  } as unknown as JobApplicationWithRelations
}

const NEW_CV = { id: 'cv-new', title: 'New CV', template: 'modern' as const }

describe('applyResumeLink', () => {
  it('shows the linked CV on its card', () => {
    const [linked] = applyResumeLink([card('a', null)], 'a', NEW_CV)
    expect(linked.resume_id).toBe('cv-new')
    expect(linked.resume).toEqual(NEW_CV)
  })

  it("replaces the CV the card showed", () => {
    const [linked] = applyResumeLink([card('a', { id: 'cv-old', title: 'Old CV' })], 'a', NEW_CV)
    expect(linked.resume).toEqual(NEW_CV)
  })

  it('removes the CV from the card it was linked to before, and leaves the others', () => {
    const board = [card('a', null), card('b', { id: 'cv-new', title: 'New CV' }), card('c', { id: 'cv-c', title: 'C' })]

    const [a, b, c] = applyResumeLink(board, 'a', NEW_CV)

    expect(a.resume?.id).toBe('cv-new')
    expect(b.resume).toBeNull()
    expect(b.resume_id).toBeNull()
    expect(c).toBe(board[2])
  })

  it('does not change the board it is given', () => {
    const board = [card('a', null), card('b', { id: 'cv-new', title: 'New CV' })]
    const snapshot = JSON.stringify(board)
    applyResumeLink(board, 'a', NEW_CV)
    expect(JSON.stringify(board)).toBe(snapshot)
  })
})
