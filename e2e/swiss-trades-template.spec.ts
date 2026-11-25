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
 * swiss-cv-templates US-003: the "Métiers techniques & manuels" template
 * (`swissTrades`) on every surface — the new-CV picker, the Editor's live
 * preview, the Preview page, and the PDF and Word downloads.
 *
 * The Preview page's own HTTP status is asserted: a template that reached for
 * `document` during the server render answers 500 while the client re-render
 * hides it from anything that only looks at the screen.
 *
 * Headings are read from the DOM's text, which CSS `uppercase` does not change,
 * so they compare with the dictionary labels exactly. Text in the PDF is
 * compared case- and whitespace-folded: pdf.js splits runs and the headings
 * are printed in capitals.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E swissTrades template spec')

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

/** A certificate the owner hid: it must appear on no surface. */
const HIDDEN_CERTIFICATION = { name: 'Hidden Forklift Permit', issuer: 'Hidden Issuer', date: '2020-01', visible: false }

const CONTENT = {
  experience: [...FIXTURE_EXPERIENCE, HIDDEN_EXPERIENCE],
  certifications: [...FIXTURE_CERTIFICATIONS, HIDDEN_CERTIFICATION],
}

type HeadingKey = 'contact' | 'skills' | 'training' | 'languages' | 'summary' | 'experience' | 'education'

/**
 * The template's fixed section order, as `t3-technique-manuel.png` draws it:
 * the dark column (contact, skills, certificates, languages), then the main
 * column (summary, experience, education).
 */
const HEADING_KEYS: readonly HeadingKey[] = ['contact', 'skills', 'training', 'languages', 'summary', 'experience', 'education']

function headings(dict: typeof enCommon, keys: readonly HeadingKey[] = HEADING_KEYS): string[] {
  return keys.map((key) => (key === 'contact' ? dict.resumes.editor.sections.contact : dict.resumes.template[key]))
}

/** The section headings a document draws, in document order. */
async function drawnHeadings(document: Locator): Promise<string[]> {
  return document.locator('h2').evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').trim()))
}

const flat = (text: string) => text.replace(/\s+/g, '').toLowerCase()

/**
 * The PDF's text layer as a text extractor reads it: the items of one line
 * concatenated with nothing added between them, and a line break where the
 * baseline changes. See the same helper in `swiss-vocational-template.spec.ts`.
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

test('fr: a CV is created with swissTrades from the new-CV picker, and the Editor live preview draws it', async ({ page, authedUser }) => {
  const response = await page.goto('/fr/dashboard/resumes/new')
  expect(response?.status()).toBe(200)

  const option = page.locator('[role="radio"][data-template="swissTrades"]')
  await expect(option).toHaveCount(1)
  await expect(option).toHaveAccessibleName(new RegExp(frCommon.resumes.templates.swissTrades))
  // Its live thumbnail draws the template itself.
  await expect(option.getByTestId('template-thumbnail').getByTestId('resume-document')).toHaveCount(1)
  await option.click()
  await expect(option).toHaveAttribute('aria-checked', 'true')

  await page.fill('#title', 'Polymécanicien CFC')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 })
  const resumeId = /\/resumes\/([0-9a-f-]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1]
  expect(resumeId).toBeTruthy()

  const { data, error } = await admin().from('resumes').select('template, user_id').eq('id', resumeId as string).single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'swissTrades', user_id: authedUser.id })

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
  await expect(live).not.toContainText(HIDDEN_CERTIFICATION.name)

  // No photo yet: no frame and no upload box in the CV (FR-5). The upload is
  // the Contact tab's photo row, with its "show photo on CV" tick (FR-14).
  await expect(live.getByRole('button')).toHaveCount(0)
  await expect(live.locator('img')).toHaveCount(0)
  await expect(live.locator('.swiss-trades-photo')).toHaveCount(0)
  const photoRow = page.getByTestId('contact-photo-row')
  await expect(photoRow.getByRole('button', { name: frCommon.resumes.editor.uploadPhoto })).toBeVisible()
  await expect(photoRow.getByRole('checkbox', { name: frCommon.resumes.editor.showOnCv.photo })).toBeChecked()

  // FR-12: no font carousel and no font-size slider above the live preview.
  await expect(page.getByTestId('resume-editor-preview').locator('input.font-slider')).toHaveCount(0)
})

test('en: the Preview page renders on the server, in order, without hidden content or a photo frame', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades', CONTENT)
  const document = await expectPreviewDocument(page, resume.id, 'en')

  await expect.poll(() => drawnHeadings(document)).toEqual(headings(enCommon))
  for (const text of [
    FIXTURE_CONTACT.name,
    FIXTURE_CONTACT.phone,
    FIXTURE_EXPERIENCE[0].company,
    FIXTURE_EDUCATION[0].school,
    FIXTURE_CERTIFICATIONS[0].name,
    FIXTURE_SKILLS[0].category,
    `${FIXTURE_LANGUAGES[0].language} — ${enCommon.resumes.editor.levels.native}`,
  ]) {
    await expect(document).toContainText(text)
  }
  // Each skill is a tag of its own.
  const tags = document.locator('.swiss-trades-tag')
  await expect(tags).toHaveCount(FIXTURE_SKILLS.reduce((count, skill) => count + skill.items.length, 0))
  await expect(tags.first()).toHaveText(FIXTURE_SKILLS[0].items[0])
  await expect(document).not.toContainText(HIDDEN_EXPERIENCE.company)
  await expect(document).not.toContainText(HIDDEN_EXPERIENCE.achievements[0])
  await expect(document).not.toContainText(HIDDEN_CERTIFICATION.name)

  // No photo stored in this browser: no image and no empty frame.
  await expect(document.locator('img')).toHaveCount(0)
  await expect(document.locator('.swiss-trades-photo')).toHaveCount(0)
  await expect(document.getByRole('button')).toHaveCount(0)
})

/** A 1x1 PNG: the photo lives in this browser, under the key the upload handler writes. */
const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

test('en: with a photo it is drawn at the top of the dark column, and unticked it is not drawn', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades', CONTENT)
  await expectPreviewDocument(page, resume.id, 'en')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_photo_${resume.id}`, PHOTO])
  const document = await expectPreviewDocument(page, resume.id, 'en')

  const frame = document.locator('aside .swiss-trades-photo')
  await expect(frame.locator(`img[src="${PHOTO}"]`)).toHaveCount(1)
  // Square corners, as the mockup draws the frame.
  expect(await frame.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)).toBe('0px')

  await updateResume(resume.id, { layout_settings: { hiddenContactFields: ['photo'] } })
  const unticked = await expectPreviewDocument(page, resume.id, 'en')
  await expect(unticked.locator('img')).toHaveCount(0)
  await expect(unticked.locator('.swiss-trades-photo')).toHaveCount(0)
})

test('en: under print media, as the PDF prints it, the skill tags stay rounded', async ({ page, authedUser }) => {
  // The PDF route prints the Preview under print media, where globals.css
  // resets every border radius; swissTrades restores its tags' own.
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades', CONTENT)
  const document = await expectPreviewDocument(page, resume.id, 'en')

  const tag = document.locator('.swiss-trades-tag').first()
  await expect(tag).toBeVisible()
  const radius = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)
  expect(await radius(tag), 'a skill tag is rounded on screen').toBe('4px')

  await page.emulateMedia({ media: 'print' })
  expect(await radius(tag), 'a skill tag prints rounded').toBe('4px')
})

test('en: a section hidden in the layout is absent from the Preview, heading included', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenMainSections: ['education'] } })

  const document = await expectPreviewDocument(page, resume.id, 'en')
  await expect
    .poll(() => drawnHeadings(document))
    .toEqual(headings(enCommon, ['contact', 'skills', 'training', 'languages', 'summary', 'experience']))
  await expect(document).not.toContainText(FIXTURE_EDUCATION[0].school)
})

test('en: sidebar sections hidden in the layout are absent from the Preview, the PDF and the Word file', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenSidebarSections: ['skills', 'training'] } })

  const document = await expectPreviewDocument(page, resume.id, 'en')
  await expect
    .poll(() => drawnHeadings(document))
    .toEqual(headings(enCommon, ['contact', 'languages', 'summary', 'experience', 'education']))
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

test('en: the Editor offers the visibility of skills, certificates and languages, and no reordering', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades', CONTENT)
  const response = await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=editSidebar`)
  expect(response?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon))

  // The panel lists the three rows this template draws, none of them draggable.
  const row = (label: string) => page.locator('div[draggable]').filter({ hasText: label })
  for (const label of [enCommon.resumes.template.skills, enCommon.resumes.template.training, enCommon.resumes.template.languages]) {
    await expect(row(label)).toHaveAttribute('draggable', 'false')
  }
  await expect(row(enCommon.resumes.template.keyAchievements)).toHaveCount(0)

  // Hiding languages there removes its heading from the live preview.
  await row(enCommon.resumes.template.languages).getByRole('button').click()
  await expect
    .poll(() => drawnHeadings(live))
    .toEqual(headings(enCommon, ['contact', 'skills', 'training', 'summary', 'experience', 'education']))
})

test('en: the PDF and the Word downloads are valid files holding the CV and not its hidden content', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissTrades', CONTENT)
  // A page of the app first, so the requests carry the session.
  await expectPreviewDocument(page, resume.id, 'en')

  const visible = [FIXTURE_CONTACT.name, FIXTURE_EXPERIENCE[0].company, FIXTURE_EDUCATION[0].school, FIXTURE_CERTIFICATIONS[0].name]
  const hidden = [HIDDEN_EXPERIENCE.company, HIDDEN_CERTIFICATION.name]

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

  // Words drawn side by side stay separated in the PDF's text layer, which
  // copy-paste, screen readers and ATS parsers read. Whitespace, the no-break
  // space included, is normalised to one space.
  const pdfWords = (await pdfTextLayer(pdfBody)).replace(/\s+/g, ' ')
  for (const separated of [
    // Two skill tags on one row.
    `${FIXTURE_SKILLS[0].items[0]} ${FIXTURE_SKILLS[0].items[1]}`,
    // A position, then its dates at the right of the same line.
    `${FIXTURE_EXPERIENCE[0].position} `,
    `${FIXTURE_LANGUAGES[0].language} — ${enCommon.resumes.editor.levels.native}`,
  ]) {
    expect(pdfWords, separated).toContain(separated)
  }
  for (const text of [...visible, ...headings(enCommon)]) expect(pdfText, text).toContain(flat(text))
  for (const text of hidden) expect(pdfText, text).not.toContain(flat(text))

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
  for (const text of hidden) expect(docxText).not.toContain(text)
  // Its own generator: the dark column's fill repeats on every page through a header row.
  expect(xml).toContain('<w:tblHeader/>')
})
