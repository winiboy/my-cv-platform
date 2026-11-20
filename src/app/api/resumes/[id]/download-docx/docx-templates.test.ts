import { describe, expect, it } from 'vitest'
import { SUPPORTED_TEMPLATES, docxTemplateFor } from './docx-templates'

const UNBUILT = [
  'swissTrades',
  'swissHealth',
  'swissFinance',
  'swissEngineering',
  'swissIt',
  'swissExecutive',
  'swissAcademic',
  'swissFirstJob',
] as const

describe('the templates the Word route accepts', () => {
  it('are the five original templates, swissVocational and swissCommerce', () => {
    expect([...SUPPORTED_TEMPLATES]).toEqual(['professional', 'modern', 'classic', 'minimal', 'creative', 'swissVocational', 'swissCommerce'])
  })

  it('export each supported template with its own generator', () => {
    for (const template of SUPPORTED_TEMPLATES) expect(docxTemplateFor(template)).toBe(template)
  })

  it('accept none of the Swiss templates that are not built yet, and export a stored one as modern, as the Preview draws it', () => {
    for (const id of UNBUILT) {
      expect(SUPPORTED_TEMPLATES as readonly string[], id).not.toContain(id)
      expect(docxTemplateFor(id), id).toBe('modern')
    }
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
