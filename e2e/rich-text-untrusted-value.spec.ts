import { test, expect } from './fixtures/auth'
import { seedFixtureResume, FIXTURE_EXPERIENCE } from './fixtures/resume'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * Stored rich text reaches the real editor as text, never as markup.
 *
 * WHY THIS NEEDS THE APPLICATION
 *
 * `e2e/rich-text-migrate.spec.ts` covers `migrateTextToHtml` in isolation on
 * about:blank. It cannot show that the value a row actually holds travels
 * through the editor page to the contenteditable div and back to the column
 * unharmed. That path is the one that corrupted content (each save adding a
 * layer of entities) and the one an injected payload would travel.
 *
 * THE TWO STORED SHAPES
 *
 * Both are TAGLESS, which is what sends them down the plain-text branch of
 * `migrateTextToHtml`:
 *
 *   1. What the editor itself saves for a single typed line with no Enter:
 *      the serialized text node, entity-encoded and with no tags.
 *   2. An injected payload with no closing `>`, which the wrapping `</p>`
 *      used to complete into a live <img>.
 *
 * WHAT IS ASSERTED
 *
 * On screen: the decoded text, no <img> in the editor, no handler run, no
 * dialog. Through a save and a reload: the same text, and a stored value that
 * has not gained a layer of escaping.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E rich text untrusted value spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

declare global {
  interface Window {
    /** Incremented by a payload handler if one ever runs. */
    __xss?: number
  }
}

/** The editor output shape: entity-encoded, no tags. */
const ENCODED_STORED = 'R&amp;D lead, budget &lt; 5% &amp; "quotes"'
const ENCODED_RENDERED = 'R&D lead, budget < 5% & "quotes"'

/** No closing `>`: the `>` of `</p>` used to complete this tag. */
const PAYLOAD_STORED = '<img src=x onerror="window.__xss=(window.__xss||0)+1"//'

/** Typed at the end of the description, so a save carries a real edit. */
const TYPED = '!'

interface StoredShape {
  readonly label: string
  readonly stored: string
  readonly rendered: string
}

const STORED_SHAPES: readonly StoredShape[] = [
  { label: 'entity-encoded editor output', stored: ENCODED_STORED, rendered: ENCODED_RENDERED },
  { label: 'an unterminated img payload', stored: PAYLOAD_STORED, rendered: PAYLOAD_STORED },
]

/** Read the column itself, past the browser and past RLS. */
async function storedDescription(resumeId: string): Promise<string> {
  const { data, error } = await admin()
    .from('resumes')
    .select('experience')
    .eq('id', resumeId)
    .single()
  if (error) throw new Error(`Could not read the stored experience: ${error.message}`)
  const experience = data?.experience as Array<{ description?: string }> | null
  return experience?.[0]?.description ?? ''
}

async function seedDescription(userId: string, description: string) {
  return seedFixtureResume(userId, 'classic', {
    experience: [{ ...FIXTURE_EXPERIENCE[0], description }],
  })
}

/**
 * Fail the test if the page ever opens a dialog.
 *
 * `alert(1)` is the canonical payload, and Playwright dismisses dialogs by
 * default - so without this guard a firing alert would leave no trace at all.
 */
function failOnDialog(page: Page): { dialogs: string[] } {
  const dialogs: string[] = []
  page.on('dialog', async (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`)
    await dialog.dismiss()
  })
  return { dialogs }
}

/** What the live editor shows, and whether anything executed. */
async function inspectEditor(page: Page, editorId: string) {
  return page.evaluate((id) => {
    const editor = document.getElementById(id) as HTMLElement
    return {
      text: editor.textContent ?? '',
      imgCount: editor.querySelectorAll('img').length,
      html: editor.innerHTML,
      xss: window.__xss ?? 0,
    }
  }, editorId)
}

/**
 * A sentinel image, awaited after the content under test has rendered. Its
 * error event is queued behind any error a payload triggered, so this is a
 * deterministic point at which such a handler would already have run.
 */
async function settleImageErrors(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const img = document.createElement('img')
        img.onerror = () => {
          img.remove()
          resolve()
        }
        img.src = 'x-e2e-sentinel'
        document.body.appendChild(img)
      }),
  )
}

/**
 * Forget the browser's own copy of the resume.
 *
 * The editor restores a debounced localStorage draft on mount. Left in place,
 * the reload below would re-render that draft and prove nothing about what was
 * stored - the very thing this test exists to observe.
 */
async function clearLocalDraft(page: Page, resumeId: string): Promise<void> {
  await page.evaluate((id) => {
    window.localStorage.removeItem(`resume_draft_${id}`)
    window.localStorage.removeItem(`resume_modified_sections_${id}`)
  }, resumeId)
}

for (const shape of STORED_SHAPES) {
  test(`the editor renders ${shape.label} as text and saves it unchanged`, async ({
    page,
    authedUser,
  }, testInfo) => {
    const { dialogs } = failOnDialog(page)
    const resume = await seedDescription(authedUser.id, shape.stored)
    const editorId = 'experience-description-0'

    await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=experience`)
    await expect(page.locator(`#${editorId}`)).toBeVisible()
    await settleImageErrors(page)

    const onLoad = await inspectEditor(page, editorId)
    expect(onLoad.text).toBe(shape.rendered)
    expect(onLoad.text).not.toContain('&amp;')
    expect(onLoad.imgCount).toBe(0)
    expect(onLoad.xss).toBe(0)
    expect(dialogs).toEqual([])

    // The editor itself, not the page: the section panel scrolls internally,
    // so a full-page capture shows the header and not the content under test.
    await page.locator(`#${editorId}`).scrollIntoViewIfNeeded()
    await testInfo.attach('description-editor.png', {
      body: await page.locator(`#${editorId}`).screenshot({
        path: testInfo.outputPath('description-editor.png'),
      }),
      contentType: 'image/png',
    })

    // --- Edit and save through the real controls ---
    await page.locator(`#${editorId}`).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(TYPED)

    const expectedText = `${shape.rendered}${TYPED}`
    expect((await inspectEditor(page, editorId)).text).toBe(expectedText)

    await page.getByRole('button', { name: 'Save', exact: true }).click()

    // The save is observed on the column, not on a toast: only the column can
    // show what a later load will read back.
    await expect
      .poll(() => storedDescription(resume.id), { timeout: 20_000 })
      .toContain(TYPED)

    const afterSave = await storedDescription(resume.id)
    // A second layer of escaping is exactly the corruption under test.
    expect(afterSave).not.toContain('&amp;amp;')
    expect(afterSave).not.toContain('&amp;lt;')
    expect(afterSave).not.toContain('&amp;quot;')

    // --- Reload and confirm the stored value renders the same ---
    await clearLocalDraft(page, resume.id)
    await page.reload()
    await expect(page.locator(`#${editorId}`)).toBeVisible()
    await settleImageErrors(page)

    const afterReload = await inspectEditor(page, editorId)
    expect(afterReload.text).toBe(expectedText)
    expect(afterReload.imgCount).toBe(0)
    expect(afterReload.xss).toBe(0)
    expect(dialogs).toEqual([])

    // Saving the reloaded content must be a no-op on the stored string. If the
    // value gained escaping on each cycle, these two would differ.
    await page.locator(`#${editorId}`).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(TYPED)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect
      .poll(() => storedDescription(resume.id), { timeout: 20_000 })
      .toBe(afterSave.replace(TYPED, `${TYPED}${TYPED}`))
  })
}

/**
 * The AI preview sinks in the Key Achievements section.
 *
 * These render `dangerouslySetInnerHTML` from an AI response. A response that
 * contains a COMPLETE tag is returned untouched by `migrateTextToHtml`, so
 * escaping cannot help here and `sanitizeHtml` is the only thing standing
 * between the model's output and the DOM. The response is stubbed rather than
 * requested: the point is what the component does with untrusted content, and
 * a real model would not produce it on demand.
 *
 * WHAT IS NOT ASSERTED, AND WHY
 *
 * Not the handler count. `sanitizeHtml` on this branch still parses through a
 * div owned by the live document, so the payload's handler runs during
 * sanitization itself. That is fixed on the separate, unmerged
 * `fix/sanitize-html-inert-parse` branch, and pinning the count here would
 * either encode today's vulnerable behaviour or fail once that branch lands.
 * What this test does pin is that no <img> survives into the preview - which
 * is precisely what the `sanitizeHtml` wrapper contributes.
 */
const AI_PAYLOAD = '<p>Optimized <img src=x onerror="window.__xss=(window.__xss||0)+1"> copy</p>'
const AI_PAYLOAD_TEXT = 'Optimized  copy'

test('the Key Achievements AI previews strip markup out of the model response', async ({
  page,
  authedUser,
}, testInfo) => {
  const { dialogs } = failOnDialog(page)
  const resume = await seedFixtureResume(authedUser.id, 'classic')

  await page.route('**/api/ai/optimize-description', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ optimizedText: AI_PAYLOAD }),
    }),
  )
  await page.route('**/api/ai/translate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ translatedSummary: AI_PAYLOAD }),
    }),
  )

  await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=projects`)
  await expect(page.locator('#project-description-0')).toBeVisible()

  // Optimized preview
  await page.getByRole('button', { name: 'Optimize with AI' }).click()
  const optimized = page.locator('.border-purple-200 .prose').first()
  await expect(optimized).toBeVisible()
  await settleImageErrors(page)
  expect(await optimized.locator('img').count()).toBe(0)
  expect(await optimized.textContent()).toBe(AI_PAYLOAD_TEXT)

  // Translated preview
  await page.getByTitle('Translate to French').click()
  const translated = page.locator('.border-blue-200 .prose').first()
  await expect(translated).toBeVisible()
  await settleImageErrors(page)
  expect(await translated.locator('img').count()).toBe(0)
  expect(await translated.textContent()).toBe(AI_PAYLOAD_TEXT)

  expect(dialogs).toEqual([])

  for (const [name, preview] of [
    ['optimized', optimized],
    ['translated', translated],
  ] as const) {
    await preview.scrollIntoViewIfNeeded()
    await testInfo.attach(`ai-preview-${name}.png`, {
      body: await preview.screenshot({ path: testInfo.outputPath(`ai-preview-${name}.png`) }),
      contentType: 'image/png',
    })
  }
})
