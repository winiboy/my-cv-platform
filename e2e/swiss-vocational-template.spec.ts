import type { Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { test, expect } from './fixtures/auth'
import {
  FIXTURE_CERTIFICATIONS,
  FIXTURE_CONTACT,
  FIXTURE_EDUCATION,
  FIXTURE_EXPERIENCE,
  FIXTURE_LANGUAGES,
  FIXTURE_SKILLS,
  fixtureResumeContent,
  seedFixtureResume,
} from './fixtures/resume'
import { parsePdf, readPdf } from './fixtures/pdf'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import frCommon from '../src/locales/fr/common.json'
import enCommon from '../src/locales/en/common.json'

/**
 * swiss-cv-templates US-001: the "Formation professionnelle (CFC)" template
 * (`swissVocational`) on every surface — the new-CV picker, the Editor's live
 * preview, the Preview page, and the PDF and Word downloads.
 *
 * The Preview page's own HTTP status is asserted: a template that reached for
 * `document` during the server render answers 500 while the client re-render
 * hides it from anything that only looks at the screen.
 *
 * Headings are read from the DOM's text, which CSS `uppercase` does not change,
 * so they compare with the `resumes.template` labels exactly. Text in the PDF
 * is compared case- and whitespace-folded: pdf.js splits runs and the headings
 * are printed in capitals.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E swissVocational template spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function updateResume(resumeId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await admin().from('resumes').update(fields).eq('id', resumeId)
  if (error) throw new Error(`Could not update the resume: ${error.message}`)
}

/** An experience entry the owner hid: it must appear on no surface. */
const HIDDEN_EXPERIENCE = {
  company: 'Hidden Freight Ltd',
  position: 'Hidden Dispatcher',
  startDate: '2015-01',
  endDate: '2016-12',
  current: false,
  location: 'Hidden Town',
  description: 'Hidden description that no output may show.',
  achievements: ['Hidden achievement that no output may show.'],
  visible: false,
}

const CONTENT = {
  experience: [...FIXTURE_EXPERIENCE, HIDDEN_EXPERIENCE],
}

const HEADING_KEYS = ['summary', 'experience', 'education', 'training', 'skills', 'languages'] as const

function headings(dict: typeof enCommon, keys: readonly (typeof HEADING_KEYS)[number][] = HEADING_KEYS): string[] {
  return keys.map((key) => dict.resumes.template[key])
}

/** The section headings a document draws, in document order. */
async function drawnHeadings(document: Locator): Promise<string[]> {
  return document.locator('h2').evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').trim()))
}

const flat = (text: string) => text.replace(/\s+/g, '').toLowerCase()

/**
 * The PDF's text layer as a text extractor reads it (copy-paste, a screen
 * reader, an ATS parser): the items of one line concatenated with nothing
 * added between them, and a line break where the baseline changes.
 *
 * `readPdf` cannot answer this: it joins every item with a space, and the
 * server's PDF can come back one glyph per item, so it reports a space between
 * any two characters. Whether a separator is really there is only visible when
 * nothing is added, so a space found here is a space the PDF carries.
 */
async function pdfTextLayer(pdf: Buffer): Promise<string> {
  const lines: string[] = []
  await parsePdf(pdf, {
    pagerender: async (pageData: unknown) => {
      const proxy = pageData as { getTextContent(): Promise<{ items: { str: string; transform: number[] }[] }> }
      let baseline: number | null = null
      let line = ''
      for (const item of (await proxy.getTextContent()).items) {
        if (baseline !== null && Math.abs(item.transform[5] - baseline) > 1) {
          lines.push(line)
          line = ''
        }
        baseline = item.transform[5]
        line += item.str
      }
      lines.push(line)
      return ''
    },
  })
  return lines.join('\n')
}

async function expectPreviewDocument(page: Page, resumeId: string, locale: 'fr' | 'en'): Promise<Locator> {
  const response = await page.goto(`/${locale}/dashboard/resumes/${resumeId}/preview`)
  expect(response?.status(), 'the Preview server render').toBe(200)
  const document = page.getByTestId('resume-document')
  await expect(document).toBeVisible()
  return document
}

test('fr: a CV is created with swissVocational from the new-CV picker, and the Editor live preview draws it', async ({ page, authedUser }) => {
  const response = await page.goto('/fr/dashboard/resumes/new')
  expect(response?.status()).toBe(200)

  const option = page.getByRole('radiogroup').getByRole('radio', { name: frCommon.resumes.templates.swissVocational })
  await expect(option).toHaveAttribute('data-template', 'swissVocational')
  // Its live thumbnail draws the template itself.
  await expect(option.getByTestId('template-thumbnail').getByTestId('resume-document')).toHaveCount(1)
  await option.click()
  await expect(option).toHaveAttribute('aria-checked', 'true')

  await page.fill('#title', 'Employée de commerce CFC')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 })
  const resumeId = /\/resumes\/([0-9a-f-]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1]
  expect(resumeId).toBeTruthy()

  const { data, error } = await admin().from('resumes').select('template, user_id').eq('id', resumeId as string).single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'swissVocational', user_id: authedUser.id })

  // Fill every section the template draws, then open the Editor on it.
  await updateResume(resumeId as string, fixtureResumeContent(CONTENT))
  const editor = await page.goto(`/fr/dashboard/resumes/${resumeId}/edit`)
  expect(editor?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect(live).toBeVisible()
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(frCommon))
  await expect(live).toContainText(FIXTURE_CONTACT.name)
  await expect(live).toContainText(FIXTURE_EXPERIENCE[0].company)
  await expect(live).not.toContainText(HIDDEN_EXPERIENCE.company)

  // No photo yet: the photo's place is the upload affordance, in the Editor only.
  await expect(live.getByRole('button', { name: frCommon.resumes.editor.uploadPhoto })).toBeVisible()
  await expect(live.locator('img')).toHaveCount(0)
})

test('en: the Preview page renders on the server, in order, without hidden content or a photo frame', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissVocational', CONTENT)
  const document = await expectPreviewDocument(page, resume.id, 'en')

  await expect.poll(() => drawnHeadings(document)).toEqual(headings(enCommon))
  for (const text of [
    FIXTURE_CONTACT.name,
    FIXTURE_EXPERIENCE[0].company,
    FIXTURE_EDUCATION[0].school,
    FIXTURE_CERTIFICATIONS[0].name,
    FIXTURE_SKILLS[0].category,
    FIXTURE_LANGUAGES[0].language,
    enCommon.resumes.editor.levels.native,
  ]) {
    await expect(document).toContainText(text)
  }
  await expect(document).not.toContainText(HIDDEN_EXPERIENCE.company)
  await expect(document).not.toContainText(HIDDEN_EXPERIENCE.achievements[0])

  // No photo stored in this browser: no image and no empty frame.
  await expect(document.locator('img')).toHaveCount(0)
  await expect(document.getByRole('button')).toHaveCount(0)
})

test('en: a section hidden in the layout is absent from the Preview, heading included', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissVocational', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenMainSections: ['education'] } })

  const document = await expectPreviewDocument(page, resume.id, 'en')
  await expect
    .poll(() => drawnHeadings(document))
    .toEqual(headings(enCommon, ['summary', 'experience', 'training', 'skills', 'languages']))
  await expect(document).not.toContainText(FIXTURE_EDUCATION[0].school)
})

test('en: sidebar sections hidden in the layout are absent from the Preview, the PDF and the Word file', async ({ page, authedUser }) => {
  // Skills and training are sidebar ids in the layout model; a CV adapted from
  // another template's CV can carry them hidden although this one has no sidebar.
  const resume = await seedFixtureResume(authedUser.id, 'swissVocational', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenSidebarSections: ['skills', 'training'] } })

  const document = await expectPreviewDocument(page, resume.id, 'en')
  const expected = headings(enCommon, ['summary', 'experience', 'education', 'languages'])
  await expect.poll(() => drawnHeadings(document)).toEqual(expected)
  await expect(document).not.toContainText(FIXTURE_SKILLS[0].category)
  await expect(document).not.toContainText(FIXTURE_CERTIFICATIONS[0].name)
  await expect(document).toContainText(FIXTURE_LANGUAGES[0].language)

  const pdfResponse = await page.request.post(`/api/resumes/${resume.id}/download-pdf?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status()).toBe(200)
  const pdfText = flat((await readPdf(await pdfResponse.body())).pages.map((p) => p.text).join(''))
  expect(pdfText).not.toContain(flat(FIXTURE_SKILLS[0].category))
  expect(pdfText).not.toContain(flat(FIXTURE_CERTIFICATIONS[0].name))
  expect(pdfText).toContain(flat(FIXTURE_LANGUAGES[0].language))

  const docxResponse = await page.request.post(`/api/resumes/${resume.id}/download-docx?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
  expect(docxResponse.status()).toBe(200)
  const xml = await (await JSZip.loadAsync(await docxResponse.body())).file('word/document.xml')!.async('string')
  expect(xml).not.toContain(FIXTURE_SKILLS[0].category)
  expect(xml).not.toContain(FIXTURE_CERTIFICATIONS[0].name)
  expect(xml).toContain(FIXTURE_LANGUAGES[0].language)
})

test('en: the Editor offers the visibility of skills, languages and training, and no reordering', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissVocational', CONTENT)
  const response = await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=editSidebar`)
  expect(response?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon))

  // The panel lists the three rows this template draws, none of them draggable.
  const row = (label: string) => page.locator('div[draggable]').filter({ hasText: label })
  for (const label of [enCommon.resumes.template.skills, enCommon.resumes.template.languages, enCommon.resumes.template.training]) {
    await expect(row(label)).toHaveAttribute('draggable', 'false')
  }
  await expect(row(enCommon.resumes.template.keyAchievements)).toHaveCount(0)

  // Hiding skills there removes its heading from the live preview.
  await row(enCommon.resumes.template.skills).getByRole('button').click()
  await expect
    .poll(() => drawnHeadings(live))
    .toEqual(headings(enCommon, ['summary', 'experience', 'education', 'training', 'languages']))
})

test('en: the PDF and the Word downloads are valid files holding the CV and not its hidden content', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissVocational', CONTENT)
  // A page of the app first, so the requests carry the session.
  await expectPreviewDocument(page, resume.id, 'en')

  const visible = [FIXTURE_CONTACT.name, FIXTURE_EXPERIENCE[0].company, FIXTURE_EDUCATION[0].school, FIXTURE_CERTIFICATIONS[0].name]

  const pdfResponse = await page.request.post(`/api/resumes/${resume.id}/download-pdf?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status()).toBe(200)
  expect(pdfResponse.headers()['content-type']).toContain('application/pdf')
  const pdfBody = await pdfResponse.body()
  expect(pdfBody.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  const pdfText = flat((await readPdf(pdfBody)).pages.map((p) => p.text).join(''))

  // Words in side-by-side columns are separated in the PDF's text layer, which
  // copy-paste, screen readers and ATS parsers read. Whitespace, the no-break
  // space included, is normalised to one space.
  const pdfWords = (await pdfTextLayer(pdfBody)).replace(/\s+/g, ' ')
  for (const separated of [
    `${enCommon.resumes.editor.location} ${FIXTURE_CONTACT.location}`,
    // Label | value, then one pair | the next on the same row.
    `${FIXTURE_CONTACT.location} ${enCommon.resumes.editor.phone} ${FIXTURE_CONTACT.phone}`,
    `${enCommon.resumes.template.present} ${FIXTURE_EXPERIENCE[0].position}`,
    `${FIXTURE_SKILLS[0].category}: ${FIXTURE_SKILLS[0].items[0]}`,
    `${FIXTURE_LANGUAGES[0].language} ${enCommon.resumes.editor.levels.native}`,
  ]) {
    expect(pdfWords, separated).toContain(separated)
  }
  for (const text of [...visible, ...headings(enCommon)]) expect(pdfText, text).toContain(flat(text))
  expect(pdfText).not.toContain(flat(HIDDEN_EXPERIENCE.company))

  const docxResponse = await page.request.post(`/api/resumes/${resume.id}/download-docx?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
  expect(docxResponse.status()).toBe(200)
  expect(docxResponse.headers()['content-type']).toContain('wordprocessingml.document')
  const zip = await JSZip.loadAsync(await docxResponse.body())
  const part = zip.file('word/document.xml')
  expect(part, 'the .docx holds a document part').not.toBeNull()
  const xml = await part!.async('string')
  const docxText = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, text]) => text).join('|')
  for (const text of [...visible, ...headings(enCommon)]) expect(docxText, text).toContain(text)
  expect(docxText).not.toContain(HIDDEN_EXPERIENCE.company)
  // Its own generator: the red strip is a page border no other template writes.
  expect(xml).toMatch(/<w:pgBorders\b/)
})
