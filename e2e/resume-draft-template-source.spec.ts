import type { Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { test, expect } from './fixtures/auth'
import {
  FIXTURE_CONTACT,
  FIXTURE_SKILLS,
  fixtureResumeContent,
  seedFixtureResume,
  type SeededResume,
} from './fixtures/resume'
import { readPdf } from './fixtures/pdf'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import enCommon from '../src/locales/en/common.json'

/**
 * swiss-templates-only-page-fidelity US-001: the stored row is the only source
 * of a resume's template.
 *
 * A `resume_draft_${id}` blob written before migration 012 still names a legacy
 * template (`professional`). Over a `swissTrades` row it must change nothing
 * about the template: Save succeeds (it no longer writes `template`, which
 * `resumes_template_check` would refuse), and the Editor, the Preview, the PDF
 * (which prints the Preview with the draft seeded) and Word all draw
 * swissTrades — not the swissCommerce fallback a legacy id resolves to.
 *
 * The draft's other content still wins, which is how each surface is shown to
 * have read the draft at all.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E resume draft template source spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

const DRAFT_SUMMARY = 'Drafted summary written before the template set changed.'

/** The swissTrades section order: the dark column, then the main column. */
const TRADES_HEADINGS = [
  enCommon.resumes.editor.sections.contact,
  enCommon.resumes.template.skills,
  enCommon.resumes.template.training,
  enCommon.resumes.template.languages,
  enCommon.resumes.template.summary,
  enCommon.resumes.template.experience,
  enCommon.resumes.template.education,
]

const flat = (text: string) => text.replace(/\s+/g, '').toLowerCase()

/** A draft of the seeded row, as the editor writes one, naming `template`. */
function draftOf(resume: SeededResume, template: string): string {
  return JSON.stringify({
    id: resume.id,
    user_id: resume.userId,
    title: `Visual baseline - ${resume.template}`,
    template,
    ...fixtureResumeContent({ summary: DRAFT_SUMMARY }),
  })
}

/**
 * Store the draft once, from a page of the app, so it is in place before the
 * next navigation. Not an init script: that would put it back after Save
 * clears it.
 */
async function storeDraft(page: Page, resume: SeededResume, draft: string): Promise<void> {
  await page.goto('/en/dashboard/resumes')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_draft_${resume.id}`, draft])
}

async function drawnHeadings(page: Page, scope: string): Promise<string[]> {
  return page
    .locator(scope)
    .getByTestId('resume-document')
    .locator('h2')
    .evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').trim()))
}

async function requestPdfText(page: Page, resumeId: string, draft: string): Promise<string[]> {
  const response = await page.request.post(`/api/resumes/${resumeId}/download-pdf?locale=en`, {
    data: { draft },
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(response.status()).toBe(200)
  return (await readPdf(await response.body())).pages.map((p) => p.text)
}

test('en: a legacy template in a draft does not override the swissTrades row on any surface, and Save succeeds', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades')
  const legacyDraft = draftOf(resume, 'professional')
  await storeDraft(page, resume, legacyDraft)

  // Preview: the draft's content, drawn with the row's template.
  const previewResponse = await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  expect(previewResponse?.status(), 'the Preview server render').toBe(200)
  const preview = page.getByTestId('resume-document')
  await expect(preview).toContainText(DRAFT_SUMMARY)
  await expect(page.locator('.swiss-trades-template')).toHaveCount(1)
  await expect(preview.locator('.swiss-trades-tag').first()).toHaveText(FIXTURE_SKILLS[0].items[0])
  await expect.poll(() => drawnHeadings(page, 'body')).toEqual(TRADES_HEADINGS)

  // PDF: the draft is printed with the row's template. Its text is exactly the
  // text of the same draft naming swissTrades itself, and in swissTrades' order.
  const legacyPdf = await requestPdfText(page, resume.id, legacyDraft)
  const tradesPdf = await requestPdfText(page, resume.id, draftOf(resume, 'swissTrades'))
  expect(legacyPdf).toEqual(tradesPdf)
  const pdfText = flat(legacyPdf.join(''))
  expect(pdfText).toContain(flat(DRAFT_SUMMARY))
  const positions = TRADES_HEADINGS.map((heading) => pdfText.indexOf(flat(heading)))
  for (const position of positions) expect(position).toBeGreaterThanOrEqual(0)
  expect([...positions].sort((a, b) => a - b), 'the PDF draws the headings in swissTrades order').toEqual(positions)

  // Editor: the live preview draws swissTrades from the draft, and Save writes
  // the draft's content without touching the template.
  const editorResponse = await page.goto(`/en/dashboard/resumes/${resume.id}/edit`)
  expect(editorResponse?.status()).toBe(200)
  const live = page.getByTestId('resume-editor-preview')
  await expect(live.getByTestId('resume-document')).toContainText(DRAFT_SUMMARY)
  await expect(live.locator('.swiss-trades-template')).toHaveCount(1)
  await expect.poll(() => drawnHeadings(page, '[data-testid="resume-editor-preview"]')).toEqual(TRADES_HEADINGS)

  const saved = page.waitForResponse(
    (response) => response.url().includes('/rest/v1/resumes') && response.request().method() === 'PATCH',
  )
  await page.getByRole('button', { name: enCommon.common.save, exact: true }).click()
  const saveResponse = await saved
  expect(saveResponse.ok(), `Save answered ${saveResponse.status()}`).toBe(true)
  expect(saveResponse.request().postDataJSON()).not.toHaveProperty('template')
  await expect(page.getByText(enCommon.resumes.errors.saveFailed)).toHaveCount(0)
  await expect(page.getByText(enCommon.resumes.editor.unsavedChanges)).toHaveCount(0)

  const { data, error } = await admin().from('resumes').select('template, summary').eq('id', resume.id).single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'swissTrades', summary: DRAFT_SUMMARY })
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), `resume_draft_${resume.id}`))
    .toBeNull()

  // Word: the saved row, through the swissTrades generator. Its dark column
  // repeats through a header row; the swissCommerce fallback's Word file has none.
  const docxResponse = await page.request.post(`/api/resumes/${resume.id}/download-docx?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
  expect(docxResponse.status()).toBe(200)
  const xml = await (await JSZip.loadAsync(await docxResponse.body())).file('word/document.xml')!.async('string')
  expect(xml).toContain('<w:tblHeader/>')
  expect(xml).toContain(FIXTURE_CONTACT.name)
  expect(xml).toContain(DRAFT_SUMMARY)
})
