import type { APIResponse, Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { test, expect } from './fixtures/auth'
import { FIXTURE_CONTACT, seedFixtureResume } from './fixtures/resume'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import enCommon from '../src/locales/en/common.json'

/**
 * swiss-cv-templates US-011 / FR-14: the Contact tab's "show on CV" ticks.
 *
 * An unticked detail or photo is drawn by none of the Editor live preview, the
 * Preview page and the Word export; the stored value stays in the form; the
 * choice is persisted in `resumes.layout_settings` and survives a reload; and
 * ticking it again brings it back. The Preview page's own status is asserted,
 * and that it has no "Show Controls" switch (FR-13).
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E contact visibility spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** The stored hidden list, read from the account row. */
async function storedHiddenContactFields(resumeId: string): Promise<unknown> {
  const { data, error } = await admin().from('resumes').select('layout_settings').eq('id', resumeId).single()
  if (error) throw new Error(`Could not read the resume: ${error.message}`)
  const settings = (data as { layout_settings: Record<string, unknown> | null }).layout_settings
  return settings?.hiddenContactFields ?? []
}

/** A 1x1 PNG, stored where the Editor's upload handler stores a photo. */
const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const LABELS = enCommon.resumes.editor.showOnCv

function tick(page: Page, label: string): Locator {
  return page.getByRole('checkbox', { name: label, exact: true })
}

async function openEditor(page: Page, resumeId: string): Promise<Locator> {
  const response = await page.goto(`/en/dashboard/resumes/${resumeId}/edit`)
  expect(response?.status(), 'the Editor server render').toBe(200)
  const live = page.getByTestId('resume-editor-preview').getByTestId('resume-document')
  await expect(live).toBeVisible()
  return live
}

async function openPreview(page: Page, resumeId: string): Promise<Locator> {
  const response = await page.goto(`/en/dashboard/resumes/${resumeId}/preview`)
  expect(response?.status(), 'the Preview server render').toBe(200)
  await expect(page.getByTestId('controls-toggle')).toHaveCount(0)
  const document = page.getByTestId('resume-document')
  await expect(document).toBeVisible()
  return document
}

async function documentXml(response: APIResponse): Promise<string> {
  expect(response.status()).toBe(200)
  const part = (await JSZip.loadAsync(await response.body())).file('word/document.xml')
  if (part === null) throw new Error('The Word export has no word/document.xml')
  return part.async('string')
}

async function downloadWord(page: Page, resumeId: string, photoBase64?: string): Promise<string> {
  return documentXml(
    await page.request.post(`/api/resumes/${resumeId}/download-docx?locale=en`, {
      data: photoBase64 === undefined ? {} : { photoBase64 },
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

const drawings = (xml: string) => (xml.match(/<w:drawing>/g) ?? []).length

test('en: an unticked e-mail and photo leave every output, survive a reload, and come back when ticked', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'modern')

  // The photo lives in this browser, under the key the upload handler writes.
  await openEditor(page, resume.id)
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [`resume_photo_${resume.id}`, PHOTO])
  let live = await openEditor(page, resume.id)

  // Every box starts ticked on a CV that never set the list.
  for (const label of Object.values(LABELS)) {
    await expect(tick(page, label), label).toBeChecked()
  }
  await expect(page.getByTestId('contact-photo-row')).toBeVisible()
  await expect(live).toContainText(FIXTURE_CONTACT.email)
  await expect(live.locator(`img[src="${PHOTO}"]`)).toHaveCount(1)

  const wordWithoutPhoto = drawings(await downloadWord(page, resume.id))
  expect(drawings(await downloadWord(page, resume.id, PHOTO))).toBe(wordWithoutPhoto + 1)

  // Untick: gone from the live preview, still in the form field.
  await tick(page, LABELS.email).uncheck()
  await tick(page, LABELS.photo).uncheck()
  await expect(live).not.toContainText(FIXTURE_CONTACT.email)
  await expect(live).toContainText(FIXTURE_CONTACT.phone)
  await expect(live.locator(`img[src="${PHOTO}"]`)).toHaveCount(0)
  await expect(page.locator('#email')).toHaveValue(FIXTURE_CONTACT.email)

  // Persisted on the account, in the one stored list.
  await expect.poll(() => storedHiddenContactFields(resume.id), { timeout: 15_000 }).toEqual(['email', 'photo'])

  // Reopened: still unticked, still hidden.
  live = await openEditor(page, resume.id)
  await expect(tick(page, LABELS.email)).not.toBeChecked()
  await expect(tick(page, LABELS.photo)).not.toBeChecked()
  await expect(tick(page, LABELS.phone)).toBeChecked()
  await expect(live).not.toContainText(FIXTURE_CONTACT.email)
  await expect(live.locator(`img[src="${PHOTO}"]`)).toHaveCount(0)

  // The Preview page, which the PDF prints.
  let document = await openPreview(page, resume.id)
  await expect(document).not.toContainText(FIXTURE_CONTACT.email)
  await expect(document).toContainText(FIXTURE_CONTACT.phone)
  await expect(document.locator(`img[src="${PHOTO}"]`)).toHaveCount(0)

  // Word, with the photo sent as the Download button sends it.
  let xml = await downloadWord(page, resume.id, PHOTO)
  expect(xml).not.toContain(FIXTURE_CONTACT.email)
  expect(xml).toContain(FIXTURE_CONTACT.phone)
  expect(drawings(xml)).toBe(wordWithoutPhoto)

  // Ticked again: back on every output. The photo is re-ticked by uploading
  // one from the Contact tab's photo row: whoever uploads a photo wants it shown.
  live = await openEditor(page, resume.id)
  await tick(page, LABELS.email).check()
  await page.getByTestId('contact-photo-row').locator('input[type="file"]').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PHOTO.split(',')[1], 'base64'),
  })
  await expect(tick(page, LABELS.photo)).toBeChecked()
  await expect(live).toContainText(FIXTURE_CONTACT.email)
  await expect(live.locator(`img[src="${PHOTO}"]`)).toHaveCount(1)
  await expect.poll(() => storedHiddenContactFields(resume.id), { timeout: 15_000 }).toEqual([])

  document = await openPreview(page, resume.id)
  await expect(document).toContainText(FIXTURE_CONTACT.email)
  await expect(document.locator(`img[src="${PHOTO}"]`)).toHaveCount(1)

  xml = await downloadWord(page, resume.id, PHOTO)
  expect(xml).toContain(FIXTURE_CONTACT.email)
  expect(drawings(xml)).toBe(wordWithoutPhoto + 1)
})

test('en: an unticked CV title leaves no title and no placeholder, and the name heads the CV instead', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic')
  const title = `Visual baseline - classic`

  const live = await openEditor(page, resume.id)
  // Classic draws no photo, so it has no photo row.
  await expect(page.getByTestId('contact-photo-row')).toHaveCount(0)
  await expect(live).toContainText(title)

  // Classic draws the full name nowhere but this heading; it cannot be hidden.
  await expect(live).not.toContainText(FIXTURE_CONTACT.name)
  await tick(page, LABELS.title).uncheck()
  await expect(live).not.toContainText(title)
  await expect(live).not.toContainText('CV TITLE')
  await expect(live.locator('h1')).toHaveText(FIXTURE_CONTACT.name)
  await expect(page.locator('#cvName')).toHaveValue(title)
  await expect.poll(() => storedHiddenContactFields(resume.id), { timeout: 15_000 }).toEqual(['title'])

  const document = await openPreview(page, resume.id)
  await expect(document).not.toContainText(title)
  await expect(document).not.toContainText('CV TITLE')
  await expect(document.locator('h1')).toHaveText(FIXTURE_CONTACT.name)

  const xml = await downloadWord(page, resume.id)
  expect(xml).not.toContain(title.toUpperCase())
  expect(xml).not.toContain('CV TITLE')
  expect(xml).toContain(FIXTURE_CONTACT.name.toUpperCase())
})
