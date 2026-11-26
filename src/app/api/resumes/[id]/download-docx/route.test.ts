import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEMPLATE_SAMPLE_RESUME } from '@/lib/template-sample-resume'

/**
 * Unit coverage for the template dispatch of `/api/resumes/[id]/download-docx`
 * (swiss-templates-only-page-fidelity US-001, FR-1): the Word export draws the
 * stored row's template, and a stored id outside the ten — a row read before
 * migration 012 was applied — is exported with the `swissCommerce` generator,
 * the template the Editor, the Preview and the PDF draw it as.
 *
 * Supabase answers with one owned row. Each generator is replaced by a stub
 * returning a buffer that names it, so the response body says which one ran.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'
const RESUME_ID = '55555555-5555-4555-8555-555555555555'

const state: { template: string } = { template: 'swissCommerce' }

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: async () => ({
        data: { ...TEMPLATE_SAMPLE_RESUME, id: RESUME_ID, user_id: USER_ID, template: state.template },
        error: null,
      }),
    }
    return {
      auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
      from: () => builder,
    }
  },
}))

const generators = vi.hoisted(() => {
  const stub = (name: string) => vi.fn(async () => Buffer.from(name))
  return {
    swissVocational: stub('swissVocational'),
    swissCommerce: stub('swissCommerce'),
    swissTrades: stub('swissTrades'),
    swissHealth: stub('swissHealth'),
    swissFinance: stub('swissFinance'),
    swissEngineering: stub('swissEngineering'),
    swissIt: stub('swissIt'),
    swissExecutive: stub('swissExecutive'),
    swissAcademic: stub('swissAcademic'),
    swissFirstJob: stub('swissFirstJob'),
  }
})

vi.mock('./docx-swiss-vocational', () => ({ generateSwissVocationalDocx: generators.swissVocational }))
vi.mock('./docx-swiss-commerce', () => ({ generateSwissCommerceDocx: generators.swissCommerce }))
vi.mock('./docx-swiss-trades', () => ({ generateSwissTradesDocx: generators.swissTrades }))
vi.mock('./docx-swiss-health', () => ({ generateSwissHealthDocx: generators.swissHealth }))
vi.mock('./docx-swiss-finance', () => ({ generateSwissFinanceDocx: generators.swissFinance }))
vi.mock('./docx-swiss-engineering', () => ({ generateSwissEngineeringDocx: generators.swissEngineering }))
vi.mock('./docx-swiss-it', () => ({ generateSwissItDocx: generators.swissIt }))
vi.mock('./docx-swiss-executive', () => ({ generateSwissExecutiveDocx: generators.swissExecutive }))
vi.mock('./docx-swiss-academic', () => ({ generateSwissAcademicDocx: generators.swissAcademic }))
vi.mock('./docx-swiss-first-job', () => ({ generateSwissFirstJobDocx: generators.swissFirstJob }))

const { GET, POST } = await import('./route')

const params = { params: Promise.resolve({ id: RESUME_ID }) }
const url = `http://localhost/api/resumes/${RESUME_ID}/download-docx?locale=en`

async function exportedBy(response: Response): Promise<string> {
  expect(response.status).toBe(200)
  return Buffer.from(await response.arrayBuffer()).toString()
}

beforeEach(() => {
  for (const generator of Object.values(generators)) generator.mockClear()
})

describe('download-docx template dispatch', () => {
  it.each(['professional', 'modern', 'classic', 'minimal', 'creative', 'unknown', ''])(
    'exports a stored %j with the swissCommerce generator',
    async (stored) => {
      state.template = stored

      const response = await POST(
        new NextRequest(url, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }),
        params,
      )

      expect(await exportedBy(response)).toBe('swissCommerce')
      expect(generators.swissCommerce).toHaveBeenCalledTimes(1)
      const others = Object.entries(generators).filter(([name]) => name !== 'swissCommerce')
      for (const [, generator] of others) expect(generator).not.toHaveBeenCalled()
    },
  )

  it('exports an unknown stored id with swissCommerce through GET as well', async () => {
    state.template = 'professional'
    expect(await exportedBy(await GET(new NextRequest(url), params))).toBe('swissCommerce')
  })

  it.each(Object.keys(generators))('exports a stored %s with its own generator', async (template) => {
    state.template = template
    expect(await exportedBy(await GET(new NextRequest(url), params))).toBe(template)
  })
})
