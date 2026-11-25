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
  FIXTURE_PROJECTS,
  FIXTURE_SKILLS,
  fixtureResumeContent,
  seedFixtureResume,
} from './fixtures/resume'
import { A4_PT, readPdf, readPdfTextItems, type PdfTextItem } from './fixtures/pdf'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { SWISS_EXECUTIVE_GEOMETRY } from '../src/lib/swiss-executive-template'
import frCommon from '../src/locales/fr/common.json'
import enCommon from '../src/locales/en/common.json'
import deCommon from '../src/locales/de/common.json'

/**
 * swiss-cv-templates US-008: the "Cadre & direction" template
 * (`swissExecutive`) on every surface — the new-CV picker, the Editor's live
 * preview, the Preview page, and the PDF and Word downloads.
 *
 * The Preview page's own HTTP status is asserted: a template that reached for
 * `document` during the server render answers 500 while the client re-render
 * hides it from anything that only looks at the screen.
 *
 * Text in the PDF is compared case- and whitespace-folded: pdf.js splits runs,
 * and the CV title is printed in capitals.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E swissExecutive template spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function updateResume(resumeId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await admin().from('resumes').update(fields).eq('id', resumeId)
  if (error) throw new Error(`Could not update the resume: ${error.message}`)
}

/** An experience entry the owner hid: it must appear on no surface. */
const HIDDEN_EXPERIENCE = {
  company: 'Hidden Holding AG',
  position: 'Hidden Director',
  startDate: '2015-01',
  endDate: '2016-12',
  current: false,
  location: 'Hidden Town',
  description: 'Hidden description that no output may show.',
  achievements: ['Hidden achievement that no output may show.'],
  visible: false,
}

/** A project (key achievement) the owner hid: it must appear on no surface. */
const HIDDEN_PROJECT = {
  name: 'Hidden Merger',
  description: 'Hidden project description that no output may show.',
  url: 'example.test/hidden',
  startDate: '2020-01',
  technologies: ['Hidden tool'],
  visible: false,
}

const CONTENT = {
  experience: [...FIXTURE_EXPERIENCE, HIDDEN_EXPERIENCE],
  projects: [...FIXTURE_PROJECTS, HIDDEN_PROJECT],
}

type Dict = typeof enCommon
type HeadingKey = 'keyAchievements' | 'experience' | 'education' | 'languagesAndCertifications' | 'languages'

/** The template's fixed section order, as `t8-cadre-direction.png` draws it: the summary sits above them with no heading. */
const HEADING_KEYS: readonly HeadingKey[] = ['keyAchievements', 'experience', 'education', 'languagesAndCertifications']

function headings(dict: Dict, keys: readonly HeadingKey[] = HEADING_KEYS): string[] {
  const t = dict.resumes.template
  return keys.map((key) => (key === 'languagesAndCertifications' ? `${t.languages} & ${t.training}` : t[key]))
}

/** The section headings a document draws, in document order. */
async function drawnHeadings(cv: Locator): Promise<string[]> {
  return cv.locator('h2').evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').trim()))
}

const flat = (text: string) => text.replace(/\s+/g, '').toLowerCase()

async function expectPreviewDocument(page: Page, resumeId: string, locale: 'fr' | 'en' | 'de'): Promise<Locator> {
  const response = await page.goto(`/${locale}/dashboard/resumes/${resumeId}/preview`)
  expect(response?.status(), 'the Preview server render').toBe(200)
  const cv = page.getByTestId('resume-document')
  await expect(cv).toBeVisible()
  return cv
}

const radius = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)

test('fr: a CV is created with swissExecutive from the new-CV picker, and the Editor live preview draws it', async ({ page, authedUser }) => {
  const response = await page.goto('/fr/dashboard/resumes/new')
  expect(response?.status()).toBe(200)

  const option = page.locator('[role="radio"][data-template="swissExecutive"]')
  await expect(option).toHaveCount(1)
  await expect(option).toHaveAccessibleName(new RegExp(frCommon.resumes.templates.swissExecutive))
  await expect(option.getByTestId('template-thumbnail').getByTestId('resume-document')).toHaveCount(1)
  await option.click()
  await expect(option).toHaveAttribute('aria-checked', 'true')

  await page.fill('#title', 'Directrice générale \u00B7 MBA')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 })
  const resumeId = /\/resumes\/([0-9a-f-]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1]
  expect(resumeId).toBeTruthy()

  const { data, error } = await admin().from('resumes').select('template, user_id').eq('id', resumeId as string).single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'swissExecutive', user_id: authedUser.id })

  await updateResume(resumeId as string, fixtureResumeContent(CONTENT))
  const editor = await page.goto(`/fr/dashboard/resumes/${resumeId}/edit`)
  expect(editor?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect(live).toBeVisible()
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(frCommon))
  await expect(live).toContainText(FIXTURE_CONTACT.name)
  await expect(live).toContainText(FIXTURE_PROJECTS[0].name)
  await expect(live).not.toContainText(HIDDEN_EXPERIENCE.company)
  await expect(live).not.toContainText(HIDDEN_PROJECT.name)

  // No photo yet: no frame and no upload box in the CV (FR-5).
  await expect(live.getByRole('button')).toHaveCount(0)
  await expect(live.locator('img')).toHaveCount(0)
  await expect(live.locator('.swiss-executive-photo')).toHaveCount(0)
  const photoRow = page.getByTestId('contact-photo-row')
  await expect(photoRow.getByRole('button', { name: frCommon.resumes.editor.uploadPhoto })).toBeVisible()
  await expect(photoRow.getByRole('checkbox', { name: frCommon.resumes.editor.showOnCv.photo })).toBeChecked()

  // FR-12: no font carousel and no font-size slider above the live preview.
  await expect(page.getByTestId('resume-editor-preview').locator('input.font-slider')).toHaveCount(0)
})

test('en: the Preview page renders on the server: summary box, key achievements, no skills, no hidden content, no photo frame', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissExecutive', CONTENT)
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  await expect.poll(() => drawnHeadings(cv)).toEqual(headings(enCommon))
  const header = cv.locator('header')
  for (const text of [FIXTURE_CONTACT.name, FIXTURE_CONTACT.phone, FIXTURE_CONTACT.linkedin, FIXTURE_CONTACT.github]) await expect(header).toContainText(text)
  for (const text of [
    FIXTURE_PROJECTS[0].name,
    FIXTURE_EXPERIENCE[0].company,
    FIXTURE_EDUCATION[0].degree,
    `${FIXTURE_LANGUAGES[0].language} — ${enCommon.resumes.editor.levels.native}`,
    FIXTURE_CERTIFICATIONS[0].name,
  ]) {
    await expect(cv).toContainText(text)
  }
  // The mockup draws no skills: none is drawn, nor the summary's heading.
  await expect(cv).not.toContainText(FIXTURE_SKILLS[0].category)
  await expect(cv.locator('section.italic')).toHaveCount(1)
  await expect(cv.locator('.swiss-executive-card')).toHaveCount(FIXTURE_PROJECTS.length)
  for (const hidden of [HIDDEN_EXPERIENCE.company, HIDDEN_EXPERIENCE.achievements[0], HIDDEN_PROJECT.name, HIDDEN_PROJECT.description]) {
    await expect(cv).not.toContainText(hidden)
  }

  await expect(cv.locator('img')).toHaveCount(0)
  await expect(cv.locator('.swiss-executive-photo')).toHaveCount(0)
  await expect(cv.getByRole('button')).toHaveCount(0)
})

test('de: long words of an achievement card and a long title beside its dates are never split, on screen and in print', async ({ page, authedUser }) => {
  const LONG = ['Kommunikationsfähigkeiten', 'Unternehmensentwicklung', 'Restrukturierungsprogramme', 'Geschäftsleitungsmitglied']
  const resume = await seedFixtureResume(authedUser.id, 'swissExecutive', {
    ...CONTENT,
    projects: [
      { name: 'Unternehmensentwicklung und Restrukturierungsprogramme', description: 'Kommunikationsfähigkeiten im Verwaltungsrat.', url: '', startDate: '', technologies: [], visible: true },
      { name: 'Zweite Leistung', description: 'Kurz.', url: '', startDate: '', technologies: [], visible: true },
    ],
    experience: [{ ...FIXTURE_EXPERIENCE[0], position: 'Geschäftsleitungsmitglied für Unternehmensentwicklung und Restrukturierungsprogramme' }],
  })
  const cv = await expectPreviewDocument(page, resume.id, 'de')
  await expect(cv).toContainText(deCommon.resumes.template.keyAchievements)

  /** How many line boxes each word's own range spans, at each place it appears: 1 when it is drawn whole. */
  const lineCounts = () =>
    cv.evaluate((element, words) => {
      const counts: Record<string, number> = {}
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').replace(/\u00A0/g, ' ')
        for (const word of words) {
          let at = text.indexOf(word)
          while (at >= 0) {
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + word.length)
            const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
            counts[word] = Math.max(counts[word] ?? 0, tops.size)
            at = text.indexOf(word, at + word.length)
          }
        }
      }
      return counts
    }, LONG)

  expect(await lineCounts()).toEqual(Object.fromEntries(LONG.map((word) => [word, 1])))
  await page.emulateMedia({ media: 'print' })
  expect(await lineCounts()).toEqual(Object.fromEntries(LONG.map((word) => [word, 1])))
})

/** A 1x1 PNG: the photo lives in this browser, under the key the upload handler writes. */
const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

test('en: with a photo it is drawn round at the right of the header, also in print, and unticked it is not drawn', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissExecutive', CONTENT)
  await expectPreviewDocument(page, resume.id, 'en')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_photo_${resume.id}`, PHOTO])
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  const frame = cv.locator('header .swiss-executive-photo')
  await expect(frame.locator(`img[src="${PHOTO}"]`)).toHaveCount(1)
  expect(await radius(frame), 'the photo is round on screen').toBe('50%')
  await page.emulateMedia({ media: 'print' })
  expect(await radius(frame), 'the photo prints round').toBe('50%')
  await page.emulateMedia({ media: 'screen' })

  await updateResume(resume.id, { layout_settings: { hiddenContactFields: ['photo'] } })
  const unticked = await expectPreviewDocument(page, resume.id, 'en')
  await expect(unticked.locator('img')).toHaveCount(0)
  await expect(unticked.locator('.swiss-executive-photo')).toHaveCount(0)
})

test('en: unticked contact details and the CV title are absent from the Preview, the PDF and the Word file', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissExecutive', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenContactFields: ['email', 'github', 'title'] } })
  const cv = await expectPreviewDocument(page, resume.id, 'en')
  const header = cv.locator('header')
  await expect(header).toContainText(FIXTURE_CONTACT.phone)
  for (const hidden of [FIXTURE_CONTACT.email, FIXTURE_CONTACT.github]) await expect(header).not.toContainText(hidden)
  await expect(header.locator('.tracking-widest')).toHaveCount(0)

  const docxResponse = await page.request.post(`/api/resumes/${resume.id}/download-docx?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
  expect(docxResponse.status()).toBe(200)
  const xml = await (await JSZip.loadAsync(await docxResponse.body())).file('word/document.xml')!.async('string')
  expect(xml).not.toContain(FIXTURE_CONTACT.email)
  expect(xml).not.toContain(FIXTURE_CONTACT.github)
})

test('en: sections hidden in the layout are absent from the Preview, the PDF and the Word file', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissExecutive', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenSidebarSections: ['keyAchievements', 'training'], hiddenMainSections: ['education'] } })

  const cv = await expectPreviewDocument(page, resume.id, 'en')
  await expect.poll(() => drawnHeadings(cv)).toEqual(headings(enCommon, ['experience', 'languages']))
  await expect(cv).not.toContainText(FIXTURE_PROJECTS[0].name)
  await expect(cv).not.toContainText(FIXTURE_CERTIFICATIONS[0].name)
  await expect(cv).not.toContainText(FIXTURE_EDUCATION[0].school)

  const pdfResponse = await page.request.post(`/api/resumes/${resume.id}/download-pdf?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status()).toBe(200)
  const pdfText = flat((await readPdf(await pdfResponse.body())).pages.map((p) => p.text).join(''))
  expect(pdfText).not.toContain(flat(FIXTURE_PROJECTS[0].name))
  expect(pdfText).not.toContain(flat(FIXTURE_CERTIFICATIONS[0].name))
  expect(pdfText).toContain(flat(FIXTURE_LANGUAGES[0].language))

  const docxResponse = await page.request.post(`/api/resumes/${resume.id}/download-docx?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
  expect(docxResponse.status()).toBe(200)
  const xml = await (await JSZip.loadAsync(await docxResponse.body())).file('word/document.xml')!.async('string')
  expect(xml).not.toContain(FIXTURE_PROJECTS[0].name)
  expect(xml).not.toContain(FIXTURE_CERTIFICATIONS[0].name)
  expect(xml).toContain(FIXTURE_LANGUAGES[0].language)
})

test('en: the Editor offers the visibility of the key achievements, languages and certifications, no skills row, and no reordering', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissExecutive', CONTENT)
  const response = await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=editSidebar`)
  expect(response?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon))

  const row = (label: string) => page.locator('div[draggable]').filter({ hasText: label })
  for (const label of [enCommon.resumes.template.keyAchievements, enCommon.resumes.template.languages, enCommon.resumes.template.training]) {
    await expect(row(label)).toHaveAttribute('draggable', 'false')
  }
  // The template draws no skills, so their row is not offered (FR-3).
  await expect(row(enCommon.resumes.template.skills)).toHaveCount(0)

  // Hiding the key achievements there removes their cards and heading from the live preview.
  await row(enCommon.resumes.template.keyAchievements).getByRole('button').click()
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon, ['experience', 'education', 'languagesAndCertifications']))
  await expect(live.locator('.swiss-executive-card')).toHaveCount(0)
})

test('en: a two-page PDF keeps a top margin on page 2 and a foot margin on page 1, page 1 starting where the Preview does', async ({ page, authedUser }) => {
  // Enough experience for a second page.
  const experience = Array.from({ length: 12 }, (_, index) => ({
    ...FIXTURE_EXPERIENCE[0],
    company: `Continuation Employer ${index + 1}`,
    achievements: ['A first achievement long enough to fill its line of the page.', 'A second achievement, also drawn.'],
  }))
  const resume = await seedFixtureResume(authedUser.id, 'swissExecutive', { ...CONTENT, experience })
  await expectPreviewDocument(page, resume.id, 'en')

  const pdfResponse = await page.request.post(`/api/resumes/${resume.id}/download-pdf?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status()).toBe(200)
  const pages = await readPdfTextItems(await pdfResponse.body())
  expect(pages.length, 'the sample runs onto a second page').toBeGreaterThanOrEqual(2)
  /** The top of the highest glyph among `items`, in points from the page's top edge. */
  const top = (items: PdfTextItem[]) => Math.min(...items.map((item) => item.baseline - item.fontSize))
  // Page 1: the first text (the name) sits the document's top padding (56px, 42pt) down, as on screen.
  expect(top(pages[0])).toBeGreaterThanOrEqual(SWISS_EXECUTIVE_GEOMETRY.paddingTop * 0.75 - 4)
  expect(top(pages[0])).toBeLessThan(SWISS_EXECUTIVE_GEOMETRY.paddingTop * 0.75 + 12)
  // Page 2: no glyph above the top margin (48px, 36pt).
  expect(pages[1].length, 'page 2 holds text').toBeGreaterThan(0)
  expect(top(pages[1])).toBeGreaterThanOrEqual(SWISS_EXECUTIVE_GEOMETRY.pageTop * 0.75 - 2)
  // Page 1's foot: its last line ends at least the foot margin (48px, 36pt) above the paper's bottom
  // edge, as in Word, so the two break their pages at the same place. A glyph reaches about a
  // quarter of its size below its baseline.
  const bottom = Math.max(...pages[0].map((item) => item.baseline + item.fontSize * 0.25))
  expect(A4_PT.height - bottom).toBeGreaterThanOrEqual(SWISS_EXECUTIVE_GEOMETRY.pageBottom * 0.75 - 2)
})

test('en: the PDF and the Word downloads are valid files holding the CV and not its hidden content', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissExecutive', CONTENT)
  // A page of the app first, so the requests carry the session.
  await expectPreviewDocument(page, resume.id, 'en')

  const visible = [FIXTURE_CONTACT.name, FIXTURE_PROJECTS[0].name, FIXTURE_EXPERIENCE[0].company, FIXTURE_EDUCATION[0].degree, FIXTURE_CERTIFICATIONS[0].name]
  const hidden = [HIDDEN_EXPERIENCE.company, HIDDEN_PROJECT.name, FIXTURE_SKILLS[0].category]

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
  const docxText = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, text]) => text.replace(/&amp;/g, '&')).join('|')
  for (const text of [...visible, ...headings(enCommon)]) expect(docxText, text).toContain(text)
  for (const text of hidden) expect(docxText).not.toContain(text)
  // Its own generator: the summary's cream box, and no photo drawing without a photo.
  expect(xml).toMatch(/<w:shd [^>]*w:fill="FAF6EE"/)
  expect(xml).not.toContain('<w:drawing>')
})
