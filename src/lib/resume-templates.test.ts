import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import type { Resume } from '@/types/database'
import { ResumePreview } from '@/components/dashboard/resume-preview'
import { TEMPLATE_SAMPLE_RESUME } from './template-sample-resume'
import {
  DEFAULT_RESUME_TEMPLATE,
  RESUME_TEMPLATES,
  isResumeTemplate,
  resolveResumeTemplate,
} from './resume-templates'

/**
 * swiss-templates-only-page-fidelity US-001, FR-1: the ten Swiss templates are
 * the only resume templates, `swissCommerce` is the default, and any other
 * stored or drafted id is drawn as `swissCommerce` on every surface without
 * throwing.
 */

const ROOT = path.resolve(__dirname, '../..')
const LEGACY = ['professional', 'modern', 'classic', 'minimal', 'creative'] as const

describe('RESUME_TEMPLATES', () => {
  it('is the ten Swiss templates, in the order the picker offers them', () => {
    expect([...RESUME_TEMPLATES]).toEqual([
      'swissVocational',
      'swissCommerce',
      'swissTrades',
      'swissHealth',
      'swissFinance',
      'swissEngineering',
      'swissIt',
      'swissExecutive',
      'swissAcademic',
      'swissFirstJob',
    ])
  })

  it('is exactly the set migration 012 lets resumes.template hold', () => {
    const migration = readFileSync(path.join(ROOT, 'supabase/migrations/012_swiss_templates_only.sql'), 'utf-8')
    const check = /ADD CONSTRAINT resumes_template_check\s+CHECK \(template IN \(([^)]*)\)\)/.exec(migration)?.[1]
    expect(check).toBeDefined()
    const ids = [...(check ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(ids).toEqual([...RESUME_TEMPLATES])
    expect(migration).toContain(`ALTER COLUMN template SET DEFAULT '${DEFAULT_RESUME_TEMPLATE}'`)
  })
})

describe('DEFAULT_RESUME_TEMPLATE', () => {
  it('is swissCommerce', () => {
    expect(DEFAULT_RESUME_TEMPLATE).toBe('swissCommerce')
  })
})

describe('isResumeTemplate', () => {
  it.each(RESUME_TEMPLATES)('accepts %s', (template) => {
    expect(isResumeTemplate(template)).toBe(true)
  })

  it.each([...LEGACY, 'brochure', '', 'toString', 'constructor', 'SWISSCOMMERCE'])('refuses %j', (value) => {
    expect(isResumeTemplate(value)).toBe(false)
  })

  it('refuses a value that is not a string', () => {
    for (const value of [null, undefined, 7, {}, ['swissCommerce']]) expect(isResumeTemplate(value)).toBe(false)
  })
})

describe('resolveResumeTemplate', () => {
  it.each(RESUME_TEMPLATES)('keeps %s', (template) => {
    expect(resolveResumeTemplate(template)).toBe(template)
  })

  it.each([...LEGACY, 'brochure', '', 'toString', '__proto__'])('draws %j as swissCommerce', (value) => {
    expect(resolveResumeTemplate(value)).toBe('swissCommerce')
  })

  it('draws a missing value as swissCommerce', () => {
    expect(resolveResumeTemplate(null)).toBe('swissCommerce')
    expect(resolveResumeTemplate(undefined)).toBe('swissCommerce')
  })
})

describe('the Preview draws an unknown template as swissCommerce', () => {
  const render = (template: string) =>
    renderToStaticMarkup(
      createElement(ResumePreview, {
        // A stored row can hold any text: the constraint is the only guard.
        resume: { ...TEMPLATE_SAMPLE_RESUME, template } as unknown as Resume,
        locale: 'en',
        dict: en,
      }),
    )

  it.each([...LEGACY, 'brochure'])('renders %s exactly as swissCommerce, without throwing', (template) => {
    expect(render(template)).toBe(render('swissCommerce'))
  })
})
