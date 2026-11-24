import { describe, expect, it } from 'vitest'
import type { ResumeTemplate } from '@/types/database'
import { SUPPORTED_TEMPLATES, docxTemplateFor } from './docx-templates'

describe('the templates the Word route accepts', () => {
  it('are the five original templates, swissVocational, swissCommerce, swissTrades, swissHealth, swissFinance, swissEngineering, swissIt, swissExecutive, swissAcademic and swissFirstJob: every template the schema accepts', () => {
    expect([...SUPPORTED_TEMPLATES]).toEqual(['professional', 'modern', 'classic', 'minimal', 'creative', 'swissVocational', 'swissCommerce', 'swissTrades', 'swissHealth', 'swissFinance', 'swissEngineering', 'swissIt', 'swissExecutive', 'swissAcademic', 'swissFirstJob'])
  })

  it('export each supported template with its own generator', () => {
    for (const template of SUPPORTED_TEMPLATES) expect(docxTemplateFor(template)).toBe(template)
  })

  it('leave no Swiss template unbuilt: every id the schema accepts is exported with its own generator', () => {
    const schema: readonly ResumeTemplate[] = ['professional', 'modern', 'classic', 'minimal', 'creative', 'swissVocational', 'swissCommerce', 'swissTrades', 'swissHealth', 'swissFinance', 'swissEngineering', 'swissIt', 'swissExecutive', 'swissAcademic', 'swissFirstJob']
    for (const id of schema) expect(docxTemplateFor(id), id).toBe(id)
  })

  it('fall back to professional for a missing or unknown value, as the route always did', () => {
    expect(docxTemplateFor(null)).toBe('professional')
    expect(docxTemplateFor(undefined)).toBe('professional')
    expect(docxTemplateFor('')).toBe('professional')
    expect(docxTemplateFor('brochure')).toBe('professional')
    // Not an own property: an inherited name is not an unbuilt template.
    expect(docxTemplateFor('toString')).toBe('professional')
  })
})
