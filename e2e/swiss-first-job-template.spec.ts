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
import { A4_PT, rasteriseColumns, readPdf, readPdfTextItems, type PdfTextItem, type Rgb } from './fixtures/pdf'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { SWISS_FIRST_JOB_GEOMETRY, swissFirstJobEmailFit } from '../src/lib/swiss-first-job-template'
import frCommon from '../src/locales/fr/common.json'
import enCommon from '../src/locales/en/common.json'
import deCommon from '../src/locales/de/common.json'

/**
 * swiss-cv-templates US-010: the "Premier emploi" template (`swissFirstJob`)
 * on every surface — the new-CV picker, the Editor's live preview, the
 * Preview page, and the PDF and Word downloads — with its round photo in the
 * light violet sidebar and its languages' level dots.
 *
 * The Preview page's own HTTP status is asserted: a template that reached for
 * `document` during the server render answers 500 while the client re-render
 * hides it from anything that only looks at the screen.
 *
 * Headings are read from the DOM's text, which CSS `uppercase` does not
 * change; text in the PDF is compared case- and whitespace-folded.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E swissFirstJob template spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function updateResume(resumeId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await admin().from('resumes').update(fields).eq('id', resumeId)
  if (error) throw new Error(`Could not update the resume: ${error.message}`)
}

/** An experience entry the owner hid: it must appear on no surface. */
const HIDDEN_EXPERIENCE = {
  company: 'Hidden Warehouse',
  position: 'Hidden Picker',
  startDate: '2015-01',
  endDate: '2016-12',
  current: false,
  location: 'Hidden Town',
  description: 'Hidden description that no output may show.',
  achievements: ['Hidden achievement that no output may show.'],
  visible: false,
}

/** A certificate the owner hid: it must appear on no surface. */
const HIDDEN_CERTIFICATION = { name: 'Hidden Licence', issuer: 'Nobody', date: '2020-01', visible: false }

const CONTENT = {
  experience: [...FIXTURE_EXPERIENCE, HIDDEN_EXPERIENCE],
  certifications: [...FIXTURE_CERTIFICATIONS, HIDDEN_CERTIFICATION],
}

type Dict = typeof enCommon
type HeadingKey = 'contact' | 'skills' | 'languages' | 'training' | 'summary' | 'experience' | 'education'

/** The template's fixed section order: the sidebar's, then the main column's. */
const HEADING_KEYS: readonly HeadingKey[] = ['contact', 'skills', 'languages', 'training', 'summary', 'experience', 'education']

function headings(dict: Dict, keys: readonly HeadingKey[] = HEADING_KEYS): string[] {
  return keys.map((key) => (key === 'contact' ? dict.resumes.editor.sections.contact : dict.resumes.template[key]))
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

/** A 1x1 PNG: the photo lives in this browser, under the key the upload handler writes. */
const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

test('fr: a CV is created with swissFirstJob from the new-CV picker, and the Editor live preview draws it, with its photo row', async ({ page, authedUser }) => {
  const response = await page.goto('/fr/dashboard/resumes/new')
  expect(response?.status()).toBe(200)

  const option = page.locator('[role="radio"][data-template="swissFirstJob"]')
  await expect(option).toHaveCount(1)
  await expect(option).toHaveAccessibleName(new RegExp(frCommon.resumes.templates.swissFirstJob))
  await expect(option.getByTestId('template-thumbnail').getByTestId('resume-document')).toHaveCount(1)
  await option.click()
  await expect(option).toHaveAttribute('aria-checked', 'true')

  await page.fill('#title', 'Assistant logistique')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 })
  const resumeId = /\/resumes\/([0-9a-f-]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1]
  expect(resumeId).toBeTruthy()

  const { data, error } = await admin().from('resumes').select('template, user_id').eq('id', resumeId as string).single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'swissFirstJob', user_id: authedUser.id })

  await updateResume(resumeId as string, fixtureResumeContent(CONTENT))
  const editor = await page.goto(`/fr/dashboard/resumes/${resumeId}/edit`)
  expect(editor?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect(live).toBeVisible()
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(frCommon))
  await expect(live).toContainText(FIXTURE_CONTACT.name)
  await expect(live).not.toContainText(HIDDEN_EXPERIENCE.company)
  await expect(live).not.toContainText(HIDDEN_CERTIFICATION.name)

  // No photo yet: no frame and no upload box in the CV, and the Contact tab offers the photo row (FR-5).
  await expect(live.getByRole('button')).toHaveCount(0)
  await expect(live.locator('img')).toHaveCount(0)
  await expect(live.locator('.swiss-first-job-photo')).toHaveCount(0)
  const photoRow = page.getByTestId('contact-photo-row')
  await expect(photoRow.getByRole('button', { name: frCommon.resumes.editor.uploadPhoto })).toBeVisible()
  await expect(photoRow.getByRole('checkbox', { name: frCommon.resumes.editor.showOnCv.photo })).toBeChecked()

  // FR-12: no font carousel and no font-size slider above the live preview.
  await expect(page.getByTestId('resume-editor-preview').locator('input.font-slider')).toHaveCount(0)
})

test('en: the Preview page renders on the server: sidebar then main column, level dots named, no projects, no hidden content', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissFirstJob', CONTENT)
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  await expect.poll(() => drawnHeadings(cv)).toEqual(headings(enCommon))
  const sidebar = cv.locator('aside')
  for (const text of [FIXTURE_CONTACT.phone, FIXTURE_CONTACT.email, FIXTURE_SKILLS[0].category, FIXTURE_SKILLS[0].items[0], FIXTURE_CERTIFICATIONS[0].name]) {
    await expect(sidebar).toContainText(text)
  }
  const main = cv.locator('main')
  for (const text of [FIXTURE_CONTACT.name, FIXTURE_EXPERIENCE[0].company, FIXTURE_EDUCATION[0].degree]) await expect(main).toContainText(text)

  // A language's level is not told by its dots alone: they are an image named by the level (FR-7).
  await expect(sidebar.getByRole('img', { name: enCommon.resumes.editor.levels.native })).toHaveCount(1)
  await expect(sidebar.getByRole('img', { name: enCommon.resumes.editor.levels.fluent })).toHaveCount(1)
  await expect(sidebar).toContainText(FIXTURE_LANGUAGES[0].language)

  // The mockup draws no projects.
  await expect(cv).not.toContainText(FIXTURE_PROJECTS[0].name)
  for (const hidden of [HIDDEN_EXPERIENCE.company, HIDDEN_EXPERIENCE.achievements[0], HIDDEN_CERTIFICATION.name]) {
    await expect(cv).not.toContainText(hidden)
  }
  await expect(cv.locator('img')).toHaveCount(0)
  await expect(cv.getByRole('button')).toHaveCount(0)
})

test('en: with a photo it is drawn round at the top of the sidebar, also in print, and unticked it is not drawn', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissFirstJob', CONTENT)
  await expectPreviewDocument(page, resume.id, 'en')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_photo_${resume.id}`, PHOTO])
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  const frame = cv.locator('aside .swiss-first-job-photo')
  await expect(frame.locator(`img[src="${PHOTO}"]`)).toHaveCount(1)
  expect(await radius(frame), 'the photo is round on screen').toBe('50%')
  await page.emulateMedia({ media: 'print' })
  expect(await radius(frame), 'the photo prints round').toBe('50%')
  expect(await radius(cv.locator('.swiss-first-job-circle').first()), 'a heading circle prints round').toBe('50%')
  await page.emulateMedia({ media: 'screen' })

  await updateResume(resume.id, { layout_settings: { hiddenContactFields: ['photo'] } })
  const unticked = await expectPreviewDocument(page, resume.id, 'en')
  await expect(unticked.locator('img')).toHaveCount(0)
  await expect(unticked.locator('.swiss-first-job-photo')).toHaveCount(0)
})

test('de: long words of the sidebar are never split, and no date wraps, on screen and in print', async ({ page, authedUser }) => {
  const LONG = ['Kommunikationsfähigkeiten', 'Lagerbewirtschaftung', 'Kommissionierung', deCommon.resumes.editor.levels.native]
  const resume = await seedFixtureResume(authedUser.id, 'swissFirstJob', {
    ...CONTENT,
    skills: [{ category: '', items: ['Kommunikationsfähigkeiten', 'Lagerbewirtschaftung und Kommissionierung'], visible: true }],
  })
  const cv = await expectPreviewDocument(page, resume.id, 'de')
  await expect(cv).toContainText(deCommon.resumes.template.skills)

  /** How many line boxes each word's own range spans, at each place it appears: 1 when it is drawn whole. */
  const lineCounts = (words: readonly string[]) =>
    cv.evaluate((element, list) => {
      const counts: Record<string, number> = {}
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').replace(/\u00A0/g, ' ')
        for (const word of list) {
          let at = text.indexOf(word)
          while (at >= 0) {
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + word.length)
            counts[word] = Math.max(counts[word] ?? 0, new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size)
            at = text.indexOf(word, at + word.length)
          }
        }
      }
      return counts
    }, words)
  // The language level is the dots' accessible name: the words to check are those drawn as text.
  const drawn = LONG.slice(0, 3)
  const present = `– ${deCommon.resumes.template.present}`
  for (const media of ['screen', 'print'] as const) {
    await page.emulateMedia({ media })
    expect(await lineCounts([...drawn, present])).toEqual(Object.fromEntries([...drawn, present].map((word) => [word, 1])))
  }
  await expect(cv.getByRole('img', { name: LONG[3] })).toHaveCount(1)
})

test('en: an email wider than the sidebar is drawn as stored on exactly one line, shrunk to fit, on screen and in print', async ({ page, authedUser }) => {
  const EMAIL = 'maximilian.mustermann-gomes@hotmail.com'
  const fit = swissFirstJobEmailFit(EMAIL)
  const resume = await seedFixtureResume(authedUser.id, 'swissFirstJob', CONTENT)
  await updateResume(resume.id, { contact: { ...FIXTURE_CONTACT, email: EMAIL } })
  const cv = await expectPreviewDocument(page, resume.id, 'en')
  const line = cv.locator('aside p').filter({ hasText: EMAIL })
  await expect(line).toHaveCount(1)
  // The stored address, never altered: its text is the address, with no break opportunity in it.
  expect(await line.textContent()).toBe(EMAIL)
  await expect(line.locator('wbr')).toHaveCount(0)

  /** The line boxes the address spans, and the size it is drawn at. */
  const drawn = () =>
    line.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
      const text = element.querySelector('span') ?? element
      return { lines, fontSize: parseFloat(getComputedStyle(text).fontSize) }
    })
  for (const media of ['screen', 'print'] as const) {
    await page.emulateMedia({ media })
    const { lines, fontSize } = await drawn()
    expect(lines, media).toBe(1)
    expect(fontSize, media).toBeCloseTo(fit.px, 2)
  }
})

test('en: sections hidden in the layout are absent from the Preview, the PDF and the Word file', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissFirstJob', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenSidebarSections: ['training', 'skills'], hiddenMainSections: ['education'] } })

  const cv = await expectPreviewDocument(page, resume.id, 'en')
  await expect.poll(() => drawnHeadings(cv)).toEqual(headings(enCommon, ['contact', 'languages', 'summary', 'experience']))
  await expect(cv).not.toContainText(FIXTURE_CERTIFICATIONS[0].name)
  await expect(cv).not.toContainText(FIXTURE_EDUCATION[0].school)

  const pdfResponse = await page.request.post(`/api/resumes/${resume.id}/download-pdf?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status()).toBe(200)
  const pdfText = flat((await readPdf(await pdfResponse.body())).pages.map((p) => p.text).join(''))
  expect(pdfText).not.toContain(flat(FIXTURE_CERTIFICATIONS[0].name))
  expect(pdfText).not.toContain(flat(FIXTURE_EDUCATION[0].school))
  expect(pdfText).toContain(flat(FIXTURE_LANGUAGES[0].language))

  const docxResponse = await page.request.post(`/api/resumes/${resume.id}/download-docx?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
  expect(docxResponse.status()).toBe(200)
  const xml = await (await JSZip.loadAsync(await docxResponse.body())).file('word/document.xml')!.async('string')
  expect(xml).not.toContain(FIXTURE_CERTIFICATIONS[0].name)
  expect(xml).not.toContain(FIXTURE_EDUCATION[0].school)
  expect(xml).toContain(FIXTURE_LANGUAGES[0].language)
})

test('en: the Editor offers the visibility of skills, languages and certificates, no projects row, and no reordering', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissFirstJob', CONTENT)
  const response = await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=editSidebar`)
  expect(response?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon))

  const row = (label: string) => page.locator('div[draggable]').filter({ hasText: label })
  for (const label of [enCommon.resumes.template.skills, enCommon.resumes.template.languages, enCommon.resumes.template.training]) {
    await expect(row(label)).toHaveAttribute('draggable', 'false')
  }
  await expect(row(enCommon.resumes.template.keyAchievements)).toHaveCount(0)

  // Hiding the languages row there removes the languages and their heading.
  await row(enCommon.resumes.template.languages).getByRole('button').click()
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon, ['contact', 'skills', 'training', 'summary', 'experience', 'education']))
  await expect(live).not.toContainText(FIXTURE_LANGUAGES[0].language)
})

test('en: a two-page PDF keeps a top margin on every page and a foot margin on page 1, and its sidebar fill runs edge to edge on every page', async ({ page, authedUser }) => {
  const experience = Array.from({ length: 14 }, (_, index) => ({
    ...FIXTURE_EXPERIENCE[0],
    company: `Continuation Warehouse ${index + 1}`,
    achievements: ['A first achievement long enough to fill its line of the page.', 'A second achievement, also drawn.'],
  }))
  const resume = await seedFixtureResume(authedUser.id, 'swissFirstJob', { ...CONTENT, experience })
  await expectPreviewDocument(page, resume.id, 'en')

  const pdfResponse = await page.request.post(`/api/resumes/${resume.id}/download-pdf?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status()).toBe(200)
  const pdfBody = await pdfResponse.body()
  const pages = await readPdfTextItems(pdfBody)
  expect(pages.length, 'the sample runs onto a second page').toBeGreaterThanOrEqual(2)
  const top = (items: PdfTextItem[]) => Math.min(...items.map((item) => item.baseline - item.fontSize))
  // Page 1: the first text sits the page's top margin (48px, 36pt) down, as on screen.
  expect(top(pages[0])).toBeGreaterThanOrEqual(SWISS_FIRST_JOB_GEOMETRY.pageTop * 0.75 - 2)
  expect(top(pages[0])).toBeLessThan(SWISS_FIRST_JOB_GEOMETRY.pageTop * 0.75 + 12)
  // Page 2: no glyph above the top margin.
  expect(pages[1].length, 'page 2 holds text').toBeGreaterThan(0)
  expect(top(pages[1])).toBeGreaterThanOrEqual(SWISS_FIRST_JOB_GEOMETRY.pageTop * 0.75 - 2)
  // Page 1's foot: its last line ends at least the foot margin (48px, 36pt) above the paper's bottom edge.
  const bottom = Math.max(...pages[0].map((item) => item.baseline + item.fontSize * 0.25))
  expect(A4_PT.height - bottom).toBeGreaterThanOrEqual(SWISS_FIRST_JOB_GEOMETRY.pageBottom * 0.75 - 2)

  // The sidebar's fill on every page, from the paper's top edge to its foot, margins included: every pixel
  // row of two columns inside the sidebar, clear of its text (2pt from the left edge, and 190pt, past the
  // 212px of text and before its 260px, 195pt, edge), is the sidebar's violet.
  const SIDEBAR: Rgb = [0xf5, 0xf3, 0xff]
  const agrees = (rgb: Rgb, expected: Rgb) => rgb.every((channel, i) => Math.abs(channel - expected[i]) <= 6)
  const raster = await rasteriseColumns(page, pdfBody, [2, 190])
  expect(raster.length).toBe(pages.length)
  raster.forEach((p, index) => {
    for (const [label, column] of [['left edge', p.columns[0]], ['right of the text', p.columns[1]]] as const) {
      const off = column.map((rgb, row) => ({ rgb, row })).filter(({ rgb }) => !agrees(rgb, SIDEBAR))
      const summary = off.length === 0 ? null : { rows: off.length, first: off[0], last: off[off.length - 1] }
      expect(summary, `page ${index + 1}, ${label}: rows not the sidebar's violet (of ${p.height})`).toBeNull()
    }
  })
})

test('en: the PDF and the Word downloads are valid files holding the CV and not its hidden content', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissFirstJob', CONTENT)
  // A page of the app first, so the requests carry the session.
  await expectPreviewDocument(page, resume.id, 'en')

  const visible = [FIXTURE_CONTACT.name, FIXTURE_EXPERIENCE[0].company, FIXTURE_EDUCATION[0].degree, FIXTURE_CERTIFICATIONS[0].name, FIXTURE_LANGUAGES[0].language]
  const hidden = [HIDDEN_EXPERIENCE.company, HIDDEN_CERTIFICATION.name, FIXTURE_PROJECTS[0].name]

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
  const xml = await zip.file('word/document.xml')!.async('string')
  const docxText = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, text]) => text.replace(/&amp;/g, '&')).join('|')
  for (const text of [...visible, ...headings(enCommon)]) expect(docxText, text).toContain(text)
  for (const text of hidden) expect(docxText).not.toContain(text)
  // Its own generator: the sidebar's fill is a page-anchored picture in the repeated header, and no photo is drawn without one.
  const headerName = Object.keys(zip.files).find((name) => /^word\/header\d*\.xml$/.test(name))
  expect(headerName, 'a header part').toBeTruthy()
  expect(await zip.file(headerName as string)!.async('string')).toContain('<wp:positionV relativeFrom="page">')
  expect(xml).not.toContain('prst="ellipse"')
})
