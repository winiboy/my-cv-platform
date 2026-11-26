import type { APIResponse, Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { test, expect } from './fixtures/auth'
import { FIXTURE_EXPERIENCE, seedFixtureResume } from './fixtures/resume'
import { readPdf } from './fixtures/pdf'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'

/**
 * rich-text-single-line-entities US-001: a line typed into an empty rich-text
 * field without pressing Enter reads the same in the Preview, the PDF and Word.
 *
 * The editor stores such a line as its serialized text node: no tags, but
 * entity-encoded (`R&amp;D &lt; 5%`). That shape is reproduced through the real
 * editor and asserted on the column first, so the outputs below are checked
 * against the value a user actually produces, not a hand-written one.
 *
 * Both Preview surfaces are checked: the Editor's live preview and the Preview
 * page, which is what the PDF route prints.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E rich text single-line entities spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

const TYPED = 'R&D < 5%'
/** What the editor stores for `TYPED` typed into an empty field with no Enter. */
const STORED = 'R&amp;D &lt; 5%'
/** `TYPED` as `word/document.xml` holds it: XML-escaped exactly once. */
const WORD_XML_TEXT = `>${STORED}<`

const EDITOR_ID = 'experience-description-0'

/** Read the column itself, past the browser and past RLS. */
async function storedDescription(resumeId: string): Promise<string> {
  const { data, error } = await admin().from('resumes').select('experience').eq('id', resumeId).single()
  if (error) throw new Error(`Could not read the stored experience: ${error.message}`)
  const experience = data?.experience as Array<{ description?: string }> | null
  return experience?.[0]?.description ?? ''
}

/**
 * Forget the browser's own copy of the resume, so a reload renders what was
 * stored rather than the editor's debounced localStorage draft.
 */
async function clearLocalDraft(page: Page, resumeId: string): Promise<void> {
  await page.evaluate((id) => {
    window.localStorage.removeItem(`resume_draft_${id}`)
    window.localStorage.removeItem(`resume_modified_sections_${id}`)
  }, resumeId)
}

/**
 * The Preview text must show the characters, never their codes. Soft, as are
 * the PDF and Word checks, so one run reports every output that is wrong.
 */
async function expectDecoded(surface: Locator, label: string): Promise<void> {
  await expect.soft(surface, label).toContainText(TYPED)
  const text = (await surface.textContent()) ?? ''
  expect.soft(text, `${label}: no &amp;`).not.toContain('&amp;')
  expect.soft(text, `${label}: no &lt;`).not.toContain('&lt;')
  expect.soft(text, `${label}: no &nbsp;`).not.toContain('&nbsp;')
}

async function documentXml(response: APIResponse): Promise<string> {
  expect(response.status(), 'the Word export').toBe(200)
  const part = (await JSZip.loadAsync(await response.body())).file('word/document.xml')
  if (part === null) throw new Error('The Word export has no word/document.xml')
  return part.async('string')
}

test('en: a single line typed without Enter shows R&D < 5% in the Preview, the PDF and Word', async ({
  page,
  authedUser,
}, testInfo) => {
  // No achievements: swissCommerce draws an entry's achievements in place of
  // its description, so with any present the typed line would not be drawn.
  const resume = await seedFixtureResume(authedUser.id, 'swissCommerce', {
    experience: [{ ...FIXTURE_EXPERIENCE[0], description: '', achievements: [] }, FIXTURE_EXPERIENCE[1]],
  })
  const editUrl = `/en/dashboard/resumes/${resume.id}/edit?section=experience`

  // --- Type one line into the empty description and save it ---
  const editorResponse = await page.goto(editUrl)
  expect(editorResponse?.status(), 'the Editor server render').toBe(200)
  const editor = page.locator(`#${EDITOR_ID}`)
  await expect(editor).toBeVisible()
  await expect(editor).toHaveText('')

  await editor.click()
  await page.keyboard.type(TYPED)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect.poll(() => storedDescription(resume.id), { timeout: 20_000 }).not.toBe('')

  // The defect's shape, reproduced through the real editor: tagless and
  // entity-encoded, escaped exactly once.
  expect(await storedDescription(resume.id), 'the stored description').toBe(STORED)

  // --- Reload: the stored value, not the draft ---
  await clearLocalDraft(page, resume.id)
  const reloadResponse = await page.goto(editUrl)
  expect(reloadResponse?.status(), 'the Editor server render after reload').toBe(200)
  await expect(page.locator(`#${EDITOR_ID}`)).toBeVisible()

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect(live).toBeVisible()
  await expectDecoded(live, 'the Editor live preview')

  // The reload has not added a layer of escaping to the column.
  const afterReload = await storedDescription(resume.id)
  expect(afterReload).toBe(STORED)
  expect(afterReload).not.toContain('&amp;amp;')

  // --- The Preview page, which the PDF prints ---
  const previewResponse = await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  expect(previewResponse?.status(), 'the Preview server render').toBe(200)
  const preview = page.getByTestId('resume-document')
  await expect(preview).toBeVisible()
  await expectDecoded(preview, 'the Preview page')

  // The description as drawn, decoded or not, for the rendered evidence.
  const description = preview.getByText(/^R&(?:amp;)?D /)
  await description.scrollIntoViewIfNeeded()
  await testInfo.attach('preview-description.png', {
    body: await description.screenshot({ path: testInfo.outputPath('preview-description.png') }),
    contentType: 'image/png',
  })

  // --- PDF ---
  const pdfResponse = await page.request.post(`/api/resumes/${resume.id}/download-pdf?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status(), 'the PDF route').toBe(200)
  expect(pdfResponse.headers()['content-type']).toBe('application/pdf')
  const pdfText = (await readPdf(await pdfResponse.body())).pages.map((p) => p.text).join(' ')
  // pdf.js splits a line into runs wherever glyphs are positioned separately,
  // and joins the runs with spaces (`R&amp; D`), so every check is made with
  // whitespace removed.
  const flatPdf = pdfText.replace(/\s+/g, '')
  expect.soft(flatPdf, 'the PDF text').toContain(TYPED.replace(/\s+/g, ''))
  expect.soft(flatPdf, 'the PDF text: no &amp;').not.toContain('&amp;')
  expect.soft(flatPdf, 'the PDF text: no &lt;').not.toContain('&lt;')
  expect.soft(flatPdf, 'the PDF text: no &nbsp;').not.toContain('&nbsp;')

  // --- Word ---
  const xml = await documentXml(
    await page.request.post(`/api/resumes/${resume.id}/download-docx?locale=en`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  expect.soft(xml, 'word/document.xml holds the line, XML-escaped once').toContain(WORD_XML_TEXT)
  expect.soft(xml, 'word/document.xml: no &amp;amp;').not.toContain('&amp;amp;')
  expect.soft(xml, 'word/document.xml: no &amp;lt;').not.toContain('&amp;lt;')
})
