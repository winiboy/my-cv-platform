import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../../src/test/local-stack'

/**
 * Checks shared by the specs that create a CV from a job offer
 * (cv-from-job-complete: a saved job application, US-002, and Job Search,
 * US-003): the stored row has every field filled, and the editor shows every
 * section's content.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E resume-from-job fixture')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function resumesOf(userId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await admin().from('resumes').select('*').eq('user_id', userId)
  if (error) throw new Error(`Could not read resumes: ${error.message}`)
  return data ?? []
}

/** Every field of the stored row non-empty except the photo (PRD AC "Every field"). */
export function expectCompleteRow(resume: Record<string, unknown>): void {
  const nonEmpty = (value: unknown, path: string) =>
    expect(typeof value === 'string' ? value.trim() : value, path).toBeTruthy()

  nonEmpty(resume.title, 'title')
  nonEmpty(resume.summary, 'summary')
  const contact = resume.contact as Record<string, unknown>
  for (const key of ['name', 'email', 'phone', 'location', 'linkedin', 'github', 'website']) {
    nonEmpty(contact[key], `contact.${key}`)
  }
  const sections: Record<string, string[]> = {
    experience: ['company', 'position', 'startDate', 'endDate', 'location', 'description'],
    education: ['school', 'degree', 'field', 'startDate', 'endDate', 'gpa', 'description'],
    skills: ['category', 'skillsHtml'],
    languages: ['language', 'level'],
    certifications: ['name', 'issuer', 'date', 'expiryDate', 'credentialId', 'url'],
    projects: ['name', 'description', 'url', 'startDate', 'endDate'],
  }
  for (const [section, keys] of Object.entries(sections)) {
    const entries = resume[section] as Array<Record<string, unknown>>
    expect(entries.length, section).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.visible, `${section}.visible`).toBe(true)
      for (const key of keys) nonEmpty(entry[key], `${section}.${key}`)
    }
  }
  const experience = resume.experience as Array<{ achievements: string[] }>
  const education = resume.education as Array<{ achievements: string[] }>
  const projects = resume.projects as Array<{ technologies: string[] }>
  expect(experience[0].achievements.length).toBeGreaterThan(0)
  expect(education[0].achievements.length).toBeGreaterThan(0)
  expect(projects[0].technologies.length).toBeGreaterThan(0)
}

/** The text a section shows in the editor: its form fields and its rich-text editors. */
async function editorSectionText(page: Page, locale: string, resumeId: string, section: string): Promise<string> {
  const response = await page.goto(`/${locale}/dashboard/resumes/${resumeId}/edit?section=${section}`)
  expect(response?.status()).toBe(200)
  await page.locator('input, textarea, [contenteditable="true"]').first().waitFor()
  return page.evaluate(() =>
    [
      ...Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')).map(
        (field) => field.value
      ),
      ...Array.from(document.querySelectorAll<HTMLElement>('[contenteditable="true"]')).map(
        (editor) => editor.innerText
      ),
    ].join('\n')
  )
}

/** One stored value per section must show in that section of the rendered editor. */
export async function expectEditorShowsEverySection(page: Page, locale: string, resume: Record<string, unknown>) {
  const first = (section: string) => (resume[section] as Array<Record<string, unknown>>)[0]
  const plain = (html: string) => html.replace(/<[^>]+>/g, '').trim()
  const expected: Record<string, string> = {
    contact: (resume.contact as Record<string, string>).name,
    summary: plain(resume.summary as string).slice(0, 30),
    experience: first('experience').company as string,
    education: first('education').school as string,
    skills: first('skills').category as string,
    languages: first('languages').language as string,
    certifications: first('certifications').name as string,
    projects: first('projects').name as string,
  }
  for (const [section, value] of Object.entries(expected)) {
    expect(value, `${section} has stored content`).toBeTruthy()
    await expect
      .poll(() => editorSectionText(page, locale, resume.id as string, section), { message: section })
      .toContain(value)
  }
}
