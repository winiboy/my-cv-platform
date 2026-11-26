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
import { readPdf } from './fixtures/pdf'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import frCommon from '../src/locales/fr/common.json'
import enCommon from '../src/locales/en/common.json'
import deCommon from '../src/locales/de/common.json'

/**
 * swiss-cv-templates US-006: the "Ingénierie & technique" template
 * (`swissEngineering`) on every surface — the new-CV picker, the Editor's live
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

assertLocalSupabase(SUPABASE_URL, 'E2E swissEngineering template spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function updateResume(resumeId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await admin().from('resumes').update(fields).eq('id', resumeId)
  if (error) throw new Error(`Could not update the resume: ${error.message}`)
}

/** An experience entry the owner hid: it must appear on no surface. */
const HIDDEN_EXPERIENCE = {
  company: 'Hidden Structures Ltd',
  position: 'Hidden Engineer',
  startDate: '2015-01',
  endDate: '2016-12',
  current: false,
  location: 'Hidden Town',
  description: 'Hidden description that no output may show.',
  achievements: ['Hidden achievement that no output may show.'],
  visible: false,
}

/** A project the owner hid: it must appear on no surface. */
const HIDDEN_PROJECT = {
  name: 'Hidden Viaduct',
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

type HeadingKey = 'summary' | 'keyAchievements' | 'experience' | 'contact' | 'education' | 'skills' | 'languages' | 'training'

/**
 * The template's fixed section order, as `t6-ingenierie.png` draws it: the main
 * column (summary, key achievements, experience), then the light column
 * (contact, education, skills, languages, certifications).
 */
const HEADING_KEYS: readonly HeadingKey[] = ['summary', 'keyAchievements', 'experience', 'contact', 'education', 'skills', 'languages', 'training']

function headings(dict: typeof enCommon, keys: readonly HeadingKey[] = HEADING_KEYS): string[] {
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

test('fr: a CV is created with swissEngineering from the new-CV picker, and the Editor live preview draws it', async ({ page, authedUser }) => {
  const response = await page.goto('/fr/dashboard/resumes/new')
  expect(response?.status()).toBe(200)

  const option = page.locator('[role="radio"][data-template="swissEngineering"]')
  await expect(option).toHaveCount(1)
  await expect(option).toHaveAccessibleName(new RegExp(frCommon.resumes.templates.swissEngineering))
  await expect(option.getByTestId('template-thumbnail').getByTestId('resume-document')).toHaveCount(1)
  await option.click()
  await expect(option).toHaveAttribute('aria-checked', 'true')

  await page.fill('#title', 'Ingénieur en génie civil HES')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 })
  const resumeId = /\/resumes\/([0-9a-f-]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1]
  expect(resumeId).toBeTruthy()

  const { data, error } = await admin().from('resumes').select('template, user_id').eq('id', resumeId as string).single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'swissEngineering', user_id: authedUser.id })

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
  await expect(live.locator('.swiss-engineering-photo')).toHaveCount(0)
  const photoRow = page.getByTestId('contact-photo-row')
  await expect(photoRow.getByRole('button', { name: frCommon.resumes.editor.uploadPhoto })).toBeVisible()
  await expect(photoRow.getByRole('checkbox', { name: frCommon.resumes.editor.showOnCv.photo })).toBeChecked()

  // FR-12: the live-preview pane holds no font, size or colour control — no
  // input, picker, slider or dropdown of any kind, only the drawn CV.
  await expect(
    page.getByTestId('resume-editor-preview').locator('input, select, textarea, [role="slider"], [role="combobox"], [role="listbox"]'),
  ).toHaveCount(0)
})

test('en: the Preview page renders on the server, in its two columns, without hidden content or a photo frame', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissEngineering', CONTENT)
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  await expect.poll(() => drawnHeadings(cv)).toEqual(headings(enCommon))
  const main = cv.locator('main')
  const side = cv.locator('aside')
  for (const text of [FIXTURE_CONTACT.name, FIXTURE_PROJECTS[0].name, FIXTURE_PROJECTS[0].technologies.join(', '), FIXTURE_PROJECTS[0].url, FIXTURE_EXPERIENCE[0].company]) {
    await expect(main).toContainText(text)
  }
  for (const text of [
    FIXTURE_CONTACT.phone,
    FIXTURE_EDUCATION[0].degree,
    FIXTURE_SKILLS[0].category,
    FIXTURE_SKILLS[0].items[0],
    `${FIXTURE_LANGUAGES[0].language} — ${enCommon.resumes.editor.levels.native}`,
    FIXTURE_CERTIFICATIONS[0].name,
  ]) {
    await expect(side).toContainText(text)
  }
  // Each project is a card; no skill is drawn with a level bar.
  await expect(cv.locator('.swiss-engineering-card')).toHaveCount(FIXTURE_PROJECTS.length)
  expect(await side.evaluate((element) => getComputedStyle(element).width)).toBe('250px')
  for (const hidden of [HIDDEN_EXPERIENCE.company, HIDDEN_EXPERIENCE.achievements[0], HIDDEN_PROJECT.name, HIDDEN_PROJECT.description]) {
    await expect(cv).not.toContainText(hidden)
  }

  await expect(cv.locator('img')).toHaveCount(0)
  await expect(cv.locator('.swiss-engineering-photo')).toHaveCount(0)
  await expect(cv.getByRole('button')).toHaveCount(0)
})

test('de: no word of the light column is split, whatever its length, on screen and in print', async ({ page, authedUser }) => {
  const LONG = ['Kommunikationsfähigkeiten', 'Projektleitungserfahrung', 'Bauingenieurwesen', 'Tragwerksplanung']
  const resume = await seedFixtureResume(authedUser.id, 'swissEngineering', {
    ...CONTENT,
    education: [{ ...FIXTURE_EDUCATION[0], degree: 'Bachelor of Science in Bauingenieurwesen' }],
    skills: [{ category: 'Kommunikationsfähigkeiten', items: ['Projektleitungserfahrung', 'Tragwerksplanung'], visible: true }],
  })
  const cv = await expectPreviewDocument(page, resume.id, 'de')
  const side = cv.locator('aside')
  await expect(side).toContainText(deCommon.resumes.template.skills)

  /** How many line boxes each word's own text range spans: 1 when it is drawn whole. */
  const lineCounts = () =>
    side.evaluate((element, words) => {
      const counts: Record<string, number> = {}
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        for (const word of words) {
          const at = text.indexOf(word)
          if (at < 0) continue
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + word.length)
          const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
          counts[word] = tops.size
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

test('en: with a photo it is drawn round at the top of the light column, and unticked it is not drawn', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissEngineering', CONTENT)
  await expectPreviewDocument(page, resume.id, 'en')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_photo_${resume.id}`, PHOTO])
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  const frame = cv.locator('aside .swiss-engineering-photo')
  await expect(frame.locator(`img[src="${PHOTO}"]`)).toHaveCount(1)
  expect(await radius(frame), 'the photo is round on screen').toBe('50%')

  await updateResume(resume.id, { layout_settings: { hiddenContactFields: ['photo'] } })
  const unticked = await expectPreviewDocument(page, resume.id, 'en')
  await expect(unticked.locator('img')).toHaveCount(0)
  await expect(unticked.locator('.swiss-engineering-photo')).toHaveCount(0)
})

test('en: under print media, as the PDF prints it, the photo stays round, the cards rounded, and the light column fills every page', async ({ page, authedUser }) => {
  // The PDF route prints the Preview under print media, where globals.css
  // resets every border radius; swissEngineering restores its photo's and
  // cards', and paints its light column and bar from the page's top to foot.
  const resume = await seedFixtureResume(authedUser.id, 'swissEngineering', CONTENT)
  await expectPreviewDocument(page, resume.id, 'en')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_photo_${resume.id}`, PHOTO])
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  const photo = cv.locator('.swiss-engineering-photo')
  const card = cv.locator('.swiss-engineering-card').first()
  await expect(photo).toBeVisible()
  await expect(card).toBeVisible()
  expect(await radius(card), 'a card is rounded on screen').toBe('4px')

  await page.emulateMedia({ media: 'print' })
  expect(await radius(photo), 'the photo prints round').toBe('50%')
  expect(await radius(card), 'a card prints rounded').toBe('4px')
  const band = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundImage)
  expect(band).toContain('linear-gradient')
  expect(band).toContain('rgb(37, 99, 235)')
  expect(band).toContain('rgb(241, 245, 249)')
})

test('en: sections hidden in the layout are absent from the Preview, the PDF and the Word file', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissEngineering', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenSidebarSections: ['keyAchievements', 'training'], hiddenMainSections: ['education'] } })

  const cv = await expectPreviewDocument(page, resume.id, 'en')
  await expect
    .poll(() => drawnHeadings(cv))
    .toEqual(headings(enCommon, ['summary', 'experience', 'contact', 'skills', 'languages']))
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

test('en: the Editor offers the visibility of the projects, skills, languages and certifications, and no reordering', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissEngineering', CONTENT)
  const response = await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=editSidebar`)
  expect(response?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon))

  // The panel lists the four rows this template draws, none of them draggable;
  // keyAchievements is the projects' row, edited in the Projects tab.
  const row = (label: string) => page.locator('div[draggable]').filter({ hasText: label })
  for (const label of [
    enCommon.resumes.template.keyAchievements,
    enCommon.resumes.template.skills,
    enCommon.resumes.template.languages,
    enCommon.resumes.template.training,
  ]) {
    await expect(row(label)).toHaveAttribute('draggable', 'false')
  }

  // Hiding the projects there removes their cards and heading from the live preview.
  await row(enCommon.resumes.template.keyAchievements).getByRole('button').click()
  await expect
    .poll(() => drawnHeadings(live))
    .toEqual(headings(enCommon, ['summary', 'experience', 'contact', 'education', 'skills', 'languages', 'training']))
  await expect(live.locator('.swiss-engineering-card')).toHaveCount(0)
})

test('en: the PDF and the Word downloads are valid files holding the CV and not its hidden content', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissEngineering', CONTENT)
  // A page of the app first, so the requests carry the session.
  await expectPreviewDocument(page, resume.id, 'en')

  const visible = [FIXTURE_CONTACT.name, FIXTURE_PROJECTS[0].name, FIXTURE_EXPERIENCE[0].company, FIXTURE_EDUCATION[0].school, FIXTURE_CERTIFICATIONS[0].name]
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
  const part = zip.file('word/document.xml')
  expect(part, 'the .docx holds a document part').not.toBeNull()
  const xml = await part!.async('string')
  const docxText = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, text]) => text).join('|')
  for (const text of [...visible, ...headings(enCommon)]) expect(docxText, text).toContain(text)
  for (const text of hidden) expect(docxText).not.toContain(text)
  // Its own generator: the light column and its bar fill every page, drawn behind the text.
  expect([...xml.matchAll(/<wp:anchor\b[^>]*behindDoc="1"/g)]).toHaveLength(2)
})
