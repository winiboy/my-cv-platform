import { describe, expect, it } from 'vitest'
import type { Resume } from '@/types/database'
import { TEMPLATE_SAMPLE_RESUME } from './template-sample-resume'
import { resumeSaveUpdates, resumeWithDraft } from './resume-draft'

/**
 * swiss-templates-only-page-fidelity US-001: the stored row is the only source
 * of a resume's template. A `resume_draft_${id}` blob written before migration
 * 012 still names a legacy id; it must neither win over the row on any surface
 * nor be written back by Save, where `resumes_template_check` would refuse it.
 */

const ROW: Resume = { ...TEMPLATE_SAMPLE_RESUME, id: 'row-1', template: 'swissTrades' }

describe('resumeWithDraft', () => {
  it("keeps the row's template over a legacy id in the draft", () => {
    const draft = { ...ROW, template: 'professional', title: 'Drafted title' }

    const merged = resumeWithDraft(ROW, draft)

    expect(merged.template).toBe('swissTrades')
    expect(merged.title).toBe('Drafted title')
  })

  it("keeps the row's template over another valid id in the draft", () => {
    expect(resumeWithDraft(ROW, { ...ROW, template: 'swissIt' }).template).toBe('swissTrades')
  })

  it("keeps the row's template when the draft has none", () => {
    const { template: _omitted, ...draft } = ROW
    void _omitted
    expect(resumeWithDraft(ROW, draft).template).toBe('swissTrades')
  })

  it("takes every other field from the draft", () => {
    const draft = { ...ROW, template: 'modern', summary: 'Drafted summary' }
    expect(resumeWithDraft(ROW, draft)).toEqual({ ...draft, template: 'swissTrades' })
  })

  it.each([null, 'text', 42, ['a']])('throws for a draft that is not an object (%j)', (draft) => {
    expect(() => resumeWithDraft(ROW, draft)).toThrow(TypeError)
  })
})

describe('resumeSaveUpdates', () => {
  it('does not write the template', () => {
    const updates = resumeSaveUpdates({ ...ROW, template: 'professional' as Resume['template'] })
    expect(updates).not.toHaveProperty('template')
  })

  it('writes exactly the authored content columns', () => {
    expect(Object.keys(resumeSaveUpdates(ROW)).sort()).toEqual(
      [
        'certifications',
        'contact',
        'custom_sections',
        'education',
        'experience',
        'languages',
        'projects',
        'skills',
        'summary',
        'title',
      ].sort(),
    )
  })

  it("carries the resume's values unchanged", () => {
    const updates = resumeSaveUpdates(ROW)
    expect(updates.title).toBe(ROW.title)
    expect(updates.experience).toBe(ROW.experience)
    expect(updates.custom_sections).toBe(ROW.custom_sections)
  })
})
