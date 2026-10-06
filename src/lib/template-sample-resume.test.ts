import { describe, expect, it } from 'vitest'
import { TEMPLATE_SAMPLE_RESUME } from '@/lib/template-sample-resume'

/**
 * The sample every template thumbnail draws must stay plain text: the
 * templates route markup through `sanitizeHtml`, which needs `document` and
 * fails the server render.
 */

function strings(value: unknown, path = 'resume'): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`))
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`))
  }
  return []
}

describe('TEMPLATE_SAMPLE_RESUME', () => {
  const fields = strings(TEMPLATE_SAMPLE_RESUME)

  it('has string content to walk', () => {
    expect(fields.length).toBeGreaterThan(20)
  })

  it('contains no markup in any string field', () => {
    expect(fields.filter(([, value]) => value.includes('<'))).toEqual([])
  })

  it('fills every section a thumbnail is meant to show', () => {
    expect(TEMPLATE_SAMPLE_RESUME.summary).toBeTruthy()
    for (const section of ['experience', 'education', 'skills', 'languages'] as const) {
      expect(Array.isArray(TEMPLATE_SAMPLE_RESUME[section])).toBe(true)
      expect((TEMPLATE_SAMPLE_RESUME[section] as unknown[]).length).toBeGreaterThan(0)
    }
  })

  it('headlines a job title rather than repeating the contact name', () => {
    const contact = TEMPLATE_SAMPLE_RESUME.contact as { name?: string }

    expect(TEMPLATE_SAMPLE_RESUME.title).toBe('Product Manager')
    expect(contact.name).toBeTruthy()
    expect(TEMPLATE_SAMPLE_RESUME.title).not.toBe(contact.name)
  })

  it('links nowhere real: the profile URL is on a reserved example domain', () => {
    const contact = TEMPLATE_SAMPLE_RESUME.contact as { linkedin?: string; email?: string }

    expect(contact.linkedin).toMatch(/^example\.com\//)
    expect(contact.email).toMatch(/@example\.test$/)
  })

  it('uses fixed dates only', () => {
    const dates = fields.filter(([path]) => /(startDate|endDate|_at)$/.test(path))

    expect(dates.length).toBeGreaterThan(0)
    for (const [path, value] of dates) {
      expect(value, path).toMatch(/^\d{4}-\d{2}(-\d{2}T00:00:00\.000Z)?$/)
    }
  })
})
