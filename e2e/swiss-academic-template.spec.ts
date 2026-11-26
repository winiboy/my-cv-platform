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
import { SWISS_ACADEMIC_GEOMETRY } from '../src/lib/swiss-academic-template'
import frCommon from '../src/locales/fr/common.json'
import enCommon from '../src/locales/en/common.json'
import deCommon from '../src/locales/de/common.json'

/**
 * swiss-cv-templates US-009: the "Académique & recherche" template
 * (`swissAcademic`) on every surface — the new-CV picker, the Editor's live
 * preview, the Preview page, and the PDF and Word downloads — and the PRD's
 * one exception to FR-5: no photo on any of them, even with one stored and
 * ticked.
 *
 * The Preview page's own HTTP status is asserted: a template that reached for
 * `document` during the server render answers 500 while the client re-render
 * hides it from anything that only looks at the screen.
 *
 * Headings are read from the DOM's text, which CSS `small-caps` does not
 * change; text in the PDF is compared case- and whitespace-folded.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E swissAcademic template spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function updateResume(resumeId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await admin().from('resumes').update(fields).eq('id', resumeId)
  if (error) throw new Error(`Could not update the resume: ${error.message}`)
}

/** An experience entry the owner hid: it must appear on no surface. */
const HIDDEN_EXPERIENCE = {
  company: 'Hidden Institute',
  position: 'Hidden Fellow',
  startDate: '2015-01',
  endDate: '2016-12',
  current: false,
  location: 'Hidden Town',
  description: 'Hidden description that no output may show.',
  achievements: ['Hidden achievement that no output may show.'],
  visible: false,
}

/** A publication the owner hid: it must appear on no surface. */
const HIDDEN_PROJECT = {
  name: 'Hidden Paper',
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
type HeadingKey = 'summary' | 'education' | 'experience' | 'publications' | 'distinctions' | 'skillsAndLanguages'

/** The template's fixed section order, as `t9-academique.png` draws it. */
const HEADING_KEYS: readonly HeadingKey[] = ['summary', 'education', 'experience', 'publications', 'distinctions', 'skillsAndLanguages']

function headings(dict: Dict, keys: readonly HeadingKey[] = HEADING_KEYS): string[] {
  const t = dict.resumes.template
  return keys.map((key) => (key === 'skillsAndLanguages' ? `${t.skills} & ${t.languages}` : t[key]))
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

/** A 1x1 PNG: the photo lives in this browser, under the key the upload handler writes. */
const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

test('fr: a CV is created with swissAcademic from the new-CV picker, and the Editor live preview draws it, with no photo row', async ({ page, authedUser }) => {
  const response = await page.goto('/fr/dashboard/resumes/new')
  expect(response?.status()).toBe(200)

  const option = page.locator('[role="radio"][data-template="swissAcademic"]')
  await expect(option).toHaveCount(1)
  await expect(option).toHaveAccessibleName(new RegExp(frCommon.resumes.templates.swissAcademic))
  await expect(option.getByTestId('template-thumbnail').getByTestId('resume-document')).toHaveCount(1)
  await option.click()
  await expect(option).toHaveAttribute('aria-checked', 'true')

  await page.fill('#title', 'Chercheuse postdoctorale en neurosciences')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 })
  const resumeId = /\/resumes\/([0-9a-f-]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1]
  expect(resumeId).toBeTruthy()

  const { data, error } = await admin().from('resumes').select('template, user_id').eq('id', resumeId as string).single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'swissAcademic', user_id: authedUser.id })

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

  // No photo, and no photo control: the Contact tab offers no photo row and no photo tick (FR-3).
  await expect(live.getByRole('button')).toHaveCount(0)
  await expect(live.locator('img')).toHaveCount(0)
  await expect(page.getByTestId('contact-photo-row')).toHaveCount(0)

  // FR-12: the live-preview pane holds no font, size or colour control — no
  // input, picker, slider or dropdown of any kind, only the drawn CV.
  await expect(
    page.getByTestId('resume-editor-preview').locator('input, select, textarea, [role="slider"], [role="combobox"], [role="listbox"]'),
  ).toHaveCount(0)
})

test('en: a photo stored and ticked is drawn neither in the Editor live preview nor on the Preview page', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissAcademic', CONTENT)
  await expectPreviewDocument(page, resume.id, 'en')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_photo_${resume.id}`, PHOTO])
  // Every contact detail ticked, the photo among them.
  await updateResume(resume.id, { layout_settings: { hiddenContactFields: [] } })

  const cv = await expectPreviewDocument(page, resume.id, 'en')
  await expect(cv).toContainText(FIXTURE_CONTACT.name)
  await expect(cv.locator('img')).toHaveCount(0)

  const editor = await page.goto(`/en/dashboard/resumes/${resume.id}/edit`)
  expect(editor?.status()).toBe(200)
  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect(live).toBeVisible()
  await expect(live).toContainText(FIXTURE_CONTACT.name)
  await expect(live.locator('img')).toHaveCount(0)
  await expect(page.getByTestId('contact-photo-row')).toHaveCount(0)

  // Nor in the Word file, whatever photo the request carries.
  const docxResponse = await page.request.post(`/api/resumes/${resume.id}/download-docx?locale=en`, {
    data: { photoBase64: PHOTO },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(docxResponse.status()).toBe(200)
  const zip = await JSZip.loadAsync(await docxResponse.body())
  expect(Object.keys(zip.files).filter((name) => name.startsWith('word/media/'))).toEqual([])
})

test('en: the Preview page renders on the server in the serif face, numbering the publications, without hidden content', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissAcademic', CONTENT)
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  await expect.poll(() => drawnHeadings(cv)).toEqual(headings(enCommon))
  for (const text of [
    FIXTURE_CONTACT.name,
    FIXTURE_CONTACT.phone,
    FIXTURE_PROJECTS[0].name,
    FIXTURE_EXPERIENCE[0].company,
    FIXTURE_EDUCATION[0].degree,
    FIXTURE_SKILLS[0].category,
    `${FIXTURE_LANGUAGES[0].language} (${enCommon.resumes.editor.levels.native})`,
    FIXTURE_CERTIFICATIONS[0].name,
  ]) {
    await expect(cv).toContainText(text)
  }
  await expect(cv.locator('ol.list-decimal > li')).toHaveCount(FIXTURE_PROJECTS.length)
  expect(await cv.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/Georgia|serif/)
  expect(await cv.locator('h2').first().evaluate((element) => getComputedStyle(element).fontVariantCaps)).toBe('small-caps')
  for (const hidden of [HIDDEN_EXPERIENCE.company, HIDDEN_EXPERIENCE.achievements[0], HIDDEN_PROJECT.name, HIDDEN_PROJECT.description]) {
    await expect(cv).not.toContainText(hidden)
  }
  await expect(cv.locator('img')).toHaveCount(0)
  await expect(cv.getByRole('button')).toHaveCount(0)
})

test('de: long words beside the date column are never split, and no date wraps, on screen and in print', async ({ page, authedUser }) => {
  const LONG = ['Neurowissenschaftlerin', 'Kommunikationsfähigkeiten', 'Forschungsstipendium']
  const resume = await seedFixtureResume(authedUser.id, 'swissAcademic', {
    ...CONTENT,
    experience: [{ ...FIXTURE_EXPERIENCE[0], position: 'Neurowissenschaftlerin mit Kommunikationsfähigkeiten', current: true }],
    certifications: [{ ...FIXTURE_CERTIFICATIONS[0], name: 'Forschungsstipendium des Nationalfonds' }],
  })
  const cv = await expectPreviewDocument(page, resume.id, 'de')
  await expect(cv).toContainText(deCommon.resumes.template.distinctions)

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
  const present = `– ${deCommon.resumes.template.present}`
  for (const media of ['screen', 'print'] as const) {
    await page.emulateMedia({ media })
    expect(await lineCounts([...LONG, present])).toEqual(Object.fromEntries([...LONG, present].map((word) => [word, 1])))
  }
})

test('en: sections hidden in the layout are absent from the Preview, the PDF and the Word file', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissAcademic', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenSidebarSections: ['keyAchievements', 'training', 'skills'], hiddenMainSections: ['education'] } })

  const cv = await expectPreviewDocument(page, resume.id, 'en')
  await expect.poll(() => drawnHeadings(cv)).toEqual([...headings(enCommon, ['summary', 'experience']), enCommon.resumes.template.languages])
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

test('en: the Editor offers the visibility of publications, distinctions, skills and languages, and no reordering', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissAcademic', CONTENT)
  const response = await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=editSidebar`)
  expect(response?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon))

  const row = (label: string) => page.locator('div[draggable]').filter({ hasText: label })
  for (const label of [enCommon.resumes.template.keyAchievements, enCommon.resumes.template.training, enCommon.resumes.template.skills, enCommon.resumes.template.languages]) {
    await expect(row(label)).toHaveAttribute('draggable', 'false')
  }

  // Hiding the projects row there removes the numbered publications and their heading.
  await row(enCommon.resumes.template.keyAchievements).getByRole('button').click()
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon, ['summary', 'education', 'experience', 'distinctions', 'skillsAndLanguages']))
  await expect(live.locator('ol.list-decimal')).toHaveCount(0)
})

test('en: a two-page PDF keeps a top margin on page 2 and a foot margin on page 1, page 1 starting where the Preview does', async ({ page, authedUser }) => {
  const experience = Array.from({ length: 14 }, (_, index) => ({
    ...FIXTURE_EXPERIENCE[0],
    company: `Continuation Institute ${index + 1}`,
    achievements: ['A first achievement long enough to fill its line of the page.', 'A second achievement, also drawn.'],
  }))
  const resume = await seedFixtureResume(authedUser.id, 'swissAcademic', { ...CONTENT, experience })
  await expectPreviewDocument(page, resume.id, 'en')

  const pdfResponse = await page.request.post(`/api/resumes/${resume.id}/download-pdf?locale=en`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
    timeout: 90_000,
  })
  expect(pdfResponse.status()).toBe(200)
  const pages = await readPdfTextItems(await pdfResponse.body())
  expect(pages.length, 'the sample runs onto a second page').toBeGreaterThanOrEqual(2)
  const top = (items: PdfTextItem[]) => Math.min(...items.map((item) => item.baseline - item.fontSize))
  // Page 1: the first text (the name) sits the document's top padding (56px, 42pt) down, as on screen.
  expect(top(pages[0])).toBeGreaterThanOrEqual(SWISS_ACADEMIC_GEOMETRY.paddingTop * 0.75 - 4)
  expect(top(pages[0])).toBeLessThan(SWISS_ACADEMIC_GEOMETRY.paddingTop * 0.75 + 12)
  // Page 2: no glyph above the top margin (48px, 36pt).
  expect(pages[1].length, 'page 2 holds text').toBeGreaterThan(0)
  expect(top(pages[1])).toBeGreaterThanOrEqual(SWISS_ACADEMIC_GEOMETRY.pageTop * 0.75 - 2)
  // Page 1's foot: its last line ends at least the foot margin (48px, 36pt) above the paper's bottom edge.
  const bottom = Math.max(...pages[0].map((item) => item.baseline + item.fontSize * 0.25))
  expect(A4_PT.height - bottom).toBeGreaterThanOrEqual(SWISS_ACADEMIC_GEOMETRY.pageBottom * 0.75 - 2)
})

test('en: the PDF and the Word downloads are valid files holding the CV and not its hidden content', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissAcademic', CONTENT)
  // A page of the app first, so the requests carry the session.
  await expectPreviewDocument(page, resume.id, 'en')

  const visible = [FIXTURE_CONTACT.name, FIXTURE_PROJECTS[0].name, FIXTURE_EXPERIENCE[0].company, FIXTURE_EDUCATION[0].degree, FIXTURE_CERTIFICATIONS[0].name]
  const hidden = [HIDDEN_EXPERIENCE.company, HIDDEN_PROJECT.name]

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
  // Its own generator: the publications are a real Word numbered list.
  expect(await zip.file('word/numbering.xml')!.async('string')).toContain('<w:lvlText w:val="%1."/>')
  expect(xml).toContain('<w:numPr>')
})
