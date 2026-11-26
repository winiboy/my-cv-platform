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
import { SWISS_IT_GEOMETRY, swissItHeading } from '../src/lib/swiss-it-template'
import frCommon from '../src/locales/fr/common.json'
import enCommon from '../src/locales/en/common.json'
import deCommon from '../src/locales/de/common.json'

/**
 * swiss-cv-templates US-007: the "Informatique & IT" template (`swissIt`) on
 * every surface — the new-CV picker, the Editor's live preview, the Preview
 * page, and the PDF and Word downloads.
 *
 * The Preview page's own HTTP status is asserted: a template that reached for
 * `document` during the server render answers 500 while the client re-render
 * hides it from anything that only looks at the screen.
 *
 * Headings are drawn as "// label" in lower case (`swissItHeading`), the same
 * string in the DOM, the PDF and the Word file. Text in the PDF is compared
 * case- and whitespace-folded: pdf.js splits runs.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E swissIt template spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function updateResume(resumeId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await admin().from('resumes').update(fields).eq('id', resumeId)
  if (error) throw new Error(`Could not update the resume: ${error.message}`)
}

/** An experience entry the owner hid: it must appear on no surface. */
const HIDDEN_EXPERIENCE = {
  company: 'Hidden Software Ltd',
  position: 'Hidden Developer',
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
  name: 'Hidden Platform',
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
type HeadingKey = 'summary' | 'skills' | 'experience' | 'projects' | 'education' | 'languagesAndCertifications' | 'languages'
type Locale = 'fr' | 'en' | 'de'

/** The template's fixed section order, as `t7-informatique.png` draws it. */
const HEADING_KEYS: readonly HeadingKey[] = ['summary', 'skills', 'experience', 'projects', 'education', 'languagesAndCertifications']

function headings(dict: Dict, locale: Locale, keys: readonly HeadingKey[] = HEADING_KEYS): string[] {
  const t = dict.resumes.template
  return keys.map((key) =>
    swissItHeading(key === 'languagesAndCertifications' ? `${t.languages} & ${t.training}` : t[key], locale),
  )
}

/** The section headings a document draws, in document order. */
async function drawnHeadings(cv: Locator): Promise<string[]> {
  return cv.locator('h2').evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').trim()))
}

const flat = (text: string) => text.replace(/\s+/g, '').toLowerCase()

async function expectPreviewDocument(page: Page, resumeId: string, locale: Locale): Promise<Locator> {
  const response = await page.goto(`/${locale}/dashboard/resumes/${resumeId}/preview`)
  expect(response?.status(), 'the Preview server render').toBe(200)
  const cv = page.getByTestId('resume-document')
  await expect(cv).toBeVisible()
  return cv
}

const radius = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)

test('fr: a CV is created with swissIt from the new-CV picker, and the Editor live preview draws it', async ({ page, authedUser }) => {
  const response = await page.goto('/fr/dashboard/resumes/new')
  expect(response?.status()).toBe(200)

  const option = page.locator('[role="radio"][data-template="swissIt"]')
  await expect(option).toHaveCount(1)
  await expect(option).toHaveAccessibleName(new RegExp(frCommon.resumes.templates.swissIt))
  await expect(option.getByTestId('template-thumbnail').getByTestId('resume-document')).toHaveCount(1)
  await option.click()
  await expect(option).toHaveAttribute('aria-checked', 'true')

  await page.fill('#title', 'Développeuse full-stack')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/fr\/dashboard\/resumes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 })
  const resumeId = /\/resumes\/([0-9a-f-]+)\/edit$/.exec(new URL(page.url()).pathname)?.[1]
  expect(resumeId).toBeTruthy()

  const { data, error } = await admin().from('resumes').select('template, user_id').eq('id', resumeId as string).single()
  expect(error).toBeNull()
  expect(data).toEqual({ template: 'swissIt', user_id: authedUser.id })

  await updateResume(resumeId as string, fixtureResumeContent(CONTENT))
  const editor = await page.goto(`/fr/dashboard/resumes/${resumeId}/edit`)
  expect(editor?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect(live).toBeVisible()
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(frCommon, 'fr'))
  await expect(live).toContainText(FIXTURE_CONTACT.name)
  await expect(live).toContainText(FIXTURE_PROJECTS[0].name)
  await expect(live).not.toContainText(HIDDEN_EXPERIENCE.company)
  await expect(live).not.toContainText(HIDDEN_PROJECT.name)

  // No photo yet: no frame and no upload box in the CV (FR-5).
  await expect(live.getByRole('button')).toHaveCount(0)
  await expect(live.locator('img')).toHaveCount(0)
  await expect(live.locator('.swiss-it-photo')).toHaveCount(0)
  const photoRow = page.getByTestId('contact-photo-row')
  await expect(photoRow.getByRole('button', { name: frCommon.resumes.editor.uploadPhoto })).toBeVisible()
  await expect(photoRow.getByRole('checkbox', { name: frCommon.resumes.editor.showOnCv.photo })).toBeChecked()

  // FR-12: the live-preview pane holds no font, size or colour control — no
  // input, picker, slider or dropdown of any kind, only the drawn CV.
  await expect(
    page.getByTestId('resume-editor-preview').locator('input, select, textarea, [role="slider"], [role="combobox"], [role="listbox"]'),
  ).toHaveCount(0)
})

test('en: the Preview page renders on the server with its band, tags and project cards, without hidden content or a photo frame', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissIt', CONTENT)
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  await expect.poll(() => drawnHeadings(cv)).toEqual(headings(enCommon, 'en'))
  const band = cv.locator('header')
  for (const text of [FIXTURE_CONTACT.name, FIXTURE_CONTACT.phone]) await expect(band).toContainText(text)
  for (const text of [
    FIXTURE_PROJECTS[0].name,
    FIXTURE_EXPERIENCE[0].company,
    FIXTURE_EDUCATION[0].degree,
    FIXTURE_SKILLS[0].category,
    FIXTURE_SKILLS[0].items[0],
    `${FIXTURE_LANGUAGES[0].language} — ${enCommon.resumes.editor.levels.native}`,
    FIXTURE_CERTIFICATIONS[0].name,
  ]) {
    await expect(cv).toContainText(text)
  }
  // The band spans the page; each project is a card, two to a row.
  const widths = await cv.evaluate((element) => [element.getBoundingClientRect().width, element.querySelector('header')!.getBoundingClientRect().width])
  expect(widths[1]).toBe(widths[0])
  await expect(cv.locator('.swiss-it-card')).toHaveCount(FIXTURE_PROJECTS.length)
  await expect(cv.locator('.swiss-it-tag').first()).toBeVisible()
  for (const hidden of [HIDDEN_EXPERIENCE.company, HIDDEN_EXPERIENCE.achievements[0], HIDDEN_PROJECT.name, HIDDEN_PROJECT.description]) {
    await expect(cv).not.toContainText(hidden)
  }

  await expect(cv.locator('img')).toHaveCount(0)
  await expect(cv.locator('.swiss-it-photo')).toHaveCount(0)
  await expect(cv.getByRole('button')).toHaveCount(0)
})

test('de: long words of a project card and long tags that fit a card are never split, on screen and in print', async ({ page, authedUser }) => {
  const LONG = ['Reservierungsplattform', 'Verwaltungsdigitalisierung', 'Kubernetes Operator SDK', 'Infrastructure as Code']
  const resume = await seedFixtureResume(authedUser.id, 'swissIt', {
    ...CONTENT,
    projects: [
      {
        name: 'Reservierungsplattform für Vereine',
        description: 'Verwaltungsdigitalisierung der Gemeinde.',
        url: 'example.test/reservierung',
        startDate: '2023-01',
        technologies: ['Kubernetes Operator SDK', 'Infrastructure as Code'],
        visible: true,
      },
      { name: 'Zweites Projekt', description: 'Kurz.', url: '', startDate: '', technologies: ['Python'], visible: true },
    ],
  })
  const cv = await expectPreviewDocument(page, resume.id, 'de')
  await expect(cv).toContainText(swissItHeading(deCommon.resumes.template.projects, 'de'))

  /** How many line boxes each text's own range spans: 1 when it is drawn whole. */
  const lineCounts = () =>
    cv.evaluate((element, words) => {
      const counts: Record<string, number> = {}
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').replace(/\u00A0/g, ' ')
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

test('en: a project link wider than its card wraps only at its boundaries — after "/" or "-", before ".-?#=" — on screen and in print', async ({ page, authedUser }) => {
  const url = 'https://github.com/alineberset/energieverbrauchsueberwachungsplattform-backend-service'
  const resume = await seedFixtureResume(authedUser.id, 'swissIt', {
    ...CONTENT,
    projects: [{ name: 'Energy dashboard', description: 'Live consumption.', url, startDate: '', technologies: ['Python'], visible: true }],
  })
  const cv = await expectPreviewDocument(page, resume.id, 'en')
  const link = cv.locator('.swiss-it-card p').filter({ hasText: 'energieverbrauchsueberwachungsplattform' })
  await expect(link).toHaveCount(1)

  /** The link's text, and every place a new line starts in it: the index of the first character of each line after the first. */
  const breaks = () =>
    link.evaluate((element) => {
      const characters: { char: string; top: number }[] = []
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        for (let index = 0; index < text.length; index++) {
          const range = document.createRange()
          range.setStart(node, index)
          range.setEnd(node, index + 1)
          const rect = range.getClientRects()[0]
          characters.push({ char: text[index], top: rect ? Math.round(rect.top) : NaN })
        }
      }
      const text = characters.map(({ char }) => char).join('')
      const starts = characters.flatMap(({ top }, index) => (index > 0 && top > characters[index - 1].top ? [index] : []))
      return { text, starts }
    })

  for (const media of ['screen', 'print'] as const) {
    await page.emulateMedia({ media })
    const { text, starts } = await breaks()
    expect(text, media).toBe(url)
    // The link is wider than the card, so it wraps.
    expect(starts.length, `${media}: the link wraps`).toBeGreaterThan(0)
    for (const at of starts) {
      // A boundary the template marks (after a "/", before ".-?#="), or the one
      // every browser and Word already offer: after a hyphen. Never inside a word.
      const boundary = (text[at - 1] === '/' && text[at] !== '/') || text[at - 1] === '-' || '.-?#='.includes(text[at])
      expect(boundary, `${media}: a line starts at "${text.slice(at)}" after "${text.slice(0, at)}"`).toBe(true)
    }
  }
})

/** A 1x1 PNG: the photo lives in this browser, under the key the upload handler writes. */
const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

test('en: with a photo it is drawn round at the right of the band, and unticked it is not drawn', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissIt', CONTENT)
  await expectPreviewDocument(page, resume.id, 'en')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_photo_${resume.id}`, PHOTO])
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  const frame = cv.locator('header .swiss-it-photo')
  await expect(frame.locator(`img[src="${PHOTO}"]`)).toHaveCount(1)
  expect(await radius(frame), 'the photo is round on screen').toBe('50%')

  await updateResume(resume.id, { layout_settings: { hiddenContactFields: ['photo'] } })
  const unticked = await expectPreviewDocument(page, resume.id, 'en')
  await expect(unticked.locator('img')).toHaveCount(0)
  await expect(unticked.locator('.swiss-it-photo')).toHaveCount(0)
})

test('en: under print media, as the PDF prints it, the photo stays round, the tags pills, the cards rounded and the band full width', async ({ page, authedUser }) => {
  // The PDF route prints the Preview under print media, where globals.css
  // resets every border radius; swissIt restores its photo's, tags' and cards'.
  const resume = await seedFixtureResume(authedUser.id, 'swissIt', CONTENT)
  await expectPreviewDocument(page, resume.id, 'en')
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_photo_${resume.id}`, PHOTO])
  const cv = await expectPreviewDocument(page, resume.id, 'en')

  const photo = cv.locator('.swiss-it-photo')
  const tag = cv.locator('.swiss-it-tag').first()
  const card = cv.locator('.swiss-it-card').first()
  await expect(photo).toBeVisible()
  await expect(tag).toBeVisible()
  await expect(card).toBeVisible()
  expect(await radius(card), 'a card is rounded on screen').toBe('6px')

  await page.emulateMedia({ media: 'print' })
  expect(await radius(photo), 'the photo prints round').toBe('50%')
  expect(await radius(tag), 'a tag prints as a pill').toBe('9999px')
  expect(await radius(card), 'a card prints rounded').toBe('6px')
  const band = await cv.evaluate((element) => {
    const header = element.querySelector('header')!
    return { width: header.getBoundingClientRect().width, page: element.getBoundingClientRect().width, colour: getComputedStyle(header).backgroundColor }
  })
  expect(band.width).toBe(band.page)
  expect(band.colour).toBe('rgb(15, 23, 42)')
})

test('en: sections hidden in the layout are absent from the Preview, the PDF and the Word file', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissIt', CONTENT)
  await updateResume(resume.id, { layout_settings: { hiddenSidebarSections: ['keyAchievements', 'training'], hiddenMainSections: ['education'] } })

  const cv = await expectPreviewDocument(page, resume.id, 'en')
  await expect.poll(() => drawnHeadings(cv)).toEqual(headings(enCommon, 'en', ['summary', 'skills', 'experience', 'languages']))
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

test('en: the Editor offers the visibility of the skills, projects, languages and certifications, and no reordering', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissIt', CONTENT)
  const response = await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=editSidebar`)
  expect(response?.status()).toBe(200)

  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect.poll(() => drawnHeadings(live)).toEqual(headings(enCommon, 'en'))

  // The panel lists the four rows this template draws, none of them draggable;
  // keyAchievements is the projects' row, edited in the Projects tab.
  const row = (label: string) => page.locator('div[draggable]').filter({ hasText: label })
  for (const label of [
    enCommon.resumes.template.skills,
    enCommon.resumes.template.keyAchievements,
    enCommon.resumes.template.languages,
    enCommon.resumes.template.training,
  ]) {
    await expect(row(label)).toHaveAttribute('draggable', 'false')
  }

  // Hiding the projects there removes their cards and heading from the live preview.
  await row(enCommon.resumes.template.keyAchievements).getByRole('button').click()
  await expect
    .poll(() => drawnHeadings(live))
    .toEqual(headings(enCommon, 'en', ['summary', 'skills', 'experience', 'education', 'languagesAndCertifications']))
  await expect(live.locator('.swiss-it-card')).toHaveCount(0)
})

test('en: a two-page PDF prints its band flush with page 1’s top edge and starts page 2 at its top margin', async ({ page, authedUser }) => {
  // Enough experience for a second page.
  const experience = Array.from({ length: 12 }, (_, index) => ({
    ...FIXTURE_EXPERIENCE[0],
    company: `Continuation Employer ${index + 1}`,
    achievements: ['A first achievement long enough to fill its line of the page.', 'A second achievement, also drawn.'],
  }))
  const resume = await seedFixtureResume(authedUser.id, 'swissIt', { ...CONTENT, experience })
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
  /**
   * The page's text lines: items grouped by baseline (to the half point), each
   * line's text joined left to right with whitespace removed. The PDF's text
   * layer can split a line into one item per glyph, so a phrase is found on
   * its line, never in a single item.
   */
  const lines = (items: PdfTextItem[]) => {
    const byBaseline = new Map<number, PdfTextItem[]>()
    for (const item of items) {
      const key = Math.round(item.baseline * 2) / 2
      byBaseline.set(key, [...(byBaseline.get(key) ?? []), item])
    }
    return [...byBaseline.values()].map((line) => ({
      text: [...line].sort((a, b) => a.x - b.x).map((item) => item.str).join('').replace(/\s+/g, ''),
      items: line,
    }))
  }
  // Page 1: the name's line sits in the band, the band's padding from the paper's top edge.
  const nameLine = lines(pages[0]).find((line) => line.text.includes(FIXTURE_CONTACT.name.replace(/\s+/g, '')))
  expect(nameLine, 'the name on page 1').toBeDefined()
  expect(top(nameLine!.items)).toBeLessThan(SWISS_IT_GEOMETRY.bandPaddingY * 0.75 + 12)
  // Page 2: no glyph above the continuation margin (48px, 36pt).
  expect(pages[1].length, 'page 2 holds text').toBeGreaterThan(0)
  expect(top(pages[1])).toBeGreaterThanOrEqual(SWISS_IT_GEOMETRY.pageTop * 0.75 - 2)
  // Page 1's foot: its last line ends at least the foot margin (48px, 36pt) above the paper's bottom
  // edge, as in Word, so the two break their pages at the same place. A glyph reaches about a
  // quarter of its size below its baseline.
  const bottom = Math.max(...pages[0].map((item) => item.baseline + item.fontSize * 0.25))
  expect(A4_PT.height - bottom).toBeGreaterThanOrEqual(SWISS_IT_GEOMETRY.pageBottom * 0.75 - 2)
})

test('en: the PDF and the Word downloads are valid files holding the CV and not its hidden content', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'swissIt', CONTENT)
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
  for (const text of [...visible, ...headings(enCommon, 'en')]) expect(pdfText, text).toContain(flat(text))
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
  for (const text of [...visible, ...headings(enCommon, 'en')]) expect(docxText, text).toContain(text)
  for (const text of hidden) expect(docxText).not.toContain(text)
  // Its own generator: the band is a table shaded the band's colour, and no photo drawing without a photo.
  expect(xml).toMatch(/<w:shd [^>]*w:fill="0F172A"/)
  expect(xml).not.toContain('<w:drawing>')
})
