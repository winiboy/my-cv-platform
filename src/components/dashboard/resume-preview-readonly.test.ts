import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import type { Resume } from '@/types/database'
import { SUPPORTED_TEMPLATES } from '@/app/api/resumes/[id]/download-docx/docx-templates'
import { ResumePreviewWrapper } from './resume-preview-wrapper'

/**
 * swiss-cv-templates FR-13: the Preview page has no "Show Controls" switch and
 * draws no in-template editing control for any template; it renders the stored
 * layout read-only.
 */

function resume(template: string): Resume {
  return {
    id: 'preview-readonly',
    user_id: 'u1',
    title: 'Kilnwright Lead',
    template,
    contact: { name: 'Robin Halvorsen', email: 'robin@halvorsen.test', phone: '+41 00 000 00 07' },
    summary: 'Kilnwright of documentation toolchains.',
    experience: [
      { company: 'Tessellate Freight', position: 'Kilnwright', startDate: '2021-03', current: true, description: 'Fired kilns.', visible: true },
    ],
    education: [{ school: 'Halvorsen Institute', degree: 'Magister', startDate: '2019-09', endDate: '2022-06', visible: true }],
    certifications: [{ name: 'Glazing permit', issuer: 'Kiln Guild', date: '2024-05', visible: true }],
    skills: [{ category: 'Toolchain', items: ['Quillwork'], visible: true }],
    languages: [{ language: 'Esperanto', level: 'Native', visible: true }],
    projects: [],
    custom_sections: {},
    layout_settings: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  } as unknown as Resume
}

describe('the Preview renders the layout read-only (FR-13)', () => {
  it.each(SUPPORTED_TEMPLATES)('%s: no slider, button, input or resize handle in the document', (template) => {
    const markup = renderToStaticMarkup(
      createElement(ResumePreviewWrapper, { initialResume: resume(template), locale: 'en', dict: en }),
    )
    expect(markup).toContain('data-testid="resume-document"')
    expect(markup).not.toMatch(/<input\b/)
    expect(markup).not.toMatch(/<button\b/)
    expect(markup).not.toMatch(/role="button"/)
    expect(markup).not.toMatch(/cursor-(?:ew|ns)-resize/)
  })

  it('has no Show Controls switch on the page', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/components/dashboard/resume-preview-page-client.tsx'), 'utf8')
    expect(source).not.toMatch(/ControlsToggle|showControls|controls-toggle/)
  })

  it('has removed the now-unused showControls label from all four locales', () => {
    for (const dict of [en, fr, de, it_]) {
      expect(dict.resumes).not.toHaveProperty('showControls')
    }
  })
})
