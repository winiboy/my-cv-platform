import { test, expect, type TestUser } from './fixtures/auth'
import { seedFixtureResume, type FixtureExperience } from './fixtures/resume'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page, Response } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * Rich HTML content survives a direct page load.
 *
 * Resume and cover-letter text is stored as HTML and sanitized with the DOM
 * before it is rendered. The sanitizer used to run during render, which for a
 * `'use client'` component includes the server render - where `document` does
 * not exist. A direct load (a bookmark, a refresh, a shared link) of any page
 * showing HTML content therefore failed with an HTTP 500. Navigating there
 * from a list did not, because that path renders on the client only, which is
 * why each test here loads its page with `page.goto` and nothing before it.
 *
 * Each test establishes three things:
 *
 *   1. The server answers 200.
 *   2. The server HTML carries none of the payload as markup. Sanitizing needs
 *      the DOM, so the server renders an empty wrapper rather than the raw
 *      HTML; if it ever rendered the raw HTML instead, the `onerror` handler
 *      and the inline script would be live markup before hydration.
 *   3. After hydration the page shows what only the browser can produce - the
 *      sanitized formatting, or the character count derived from it - and,
 *      where the rendered content is asserted, no injected handler ran.
 *
 * Seeded rows belong to `authedUser` and are removed with it: resumes and
 * cover letters both cascade from the user's profile.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E sanitized HTML direct-load spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Formatting that must survive, plus two injection vectors that must not. */
function payload(boldText: string): string {
  return (
    `<p><strong>${boldText}</strong> text` +
    '<img src=x onerror="window.__xss=1">' +
    '<script>window.__xss=2</script></p>'
  )
}

const RESUME_BOLD = 'Direct load bold'
const SUMMARY_BOLD = 'Summary bold'
const LETTER_OPENING_BOLD = 'Letter opening bold'
const LETTER_BODY_BOLD = 'Letter body bold'
const LETTER_CLOSING_BOLD = 'Letter closing bold'

/**
 * One role, with no achievements so the professional template renders its
 * description - the branch that goes through `renderFormattedText`.
 */
const HTML_EXPERIENCE: FixtureExperience = {
  company: 'Northwind Systems',
  position: 'Principal Engineer',
  startDate: '2021-03',
  endDate: '2024-02',
  current: false,
  location: 'Lausanne',
  description: payload(RESUME_BOLD),
  achievements: [],
  visible: true,
}

async function seedHtmlCoverLetter(user: TestUser): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: user.id,
      title: 'Sanitized HTML direct load',
      opening_paragraph: payload(LETTER_OPENING_BOLD),
      body_paragraphs: [payload(LETTER_BODY_BOLD)],
      closing_paragraph: payload(LETTER_CLOSING_BOLD),
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Could not seed the cover letter: ${error?.message ?? 'no row returned'}`)
  }
  return data.id
}

/**
 * What `htmlToPlainText` makes of `payload(SUMMARY_BOLD)`.
 *
 * Every tag is dropped and the text of the remaining nodes is concatenated.
 * The `<img>` contributes nothing; the `<script>` contributes its source text,
 * because to the DOM that is text content like any other. That quirk belongs to
 * the counter and is not what this test is about - it is written out here so
 * the expected length is a value a reader can check rather than a bare number.
 */
const SUMMARY_PLAIN_TEXT = `${SUMMARY_BOLD} textwindow.__xss=2`

/**
 * Load `path` directly and assert on the server's own response, returning the
 * server HTML so a caller can make further assertions about it.
 *
 * The React Server Components payload is inlined into the page as script
 * strings, and it legitimately carries the stored content - JSON-encoded, with
 * `<` escaped, so it is data rather than markup. Those scripts are stripped
 * before looking for the payload, and the whole document is separately checked
 * for the payload's markup in unescaped form.
 */
async function loadDirectly(page: Page, path: string): Promise<string> {
  const response: Response | null = await page.goto(path)
  expect(response, `no response for ${path}`).not.toBeNull()
  expect(response!.status()).toBe(200)

  const html = await response!.text()
  expect(html).not.toContain('<img src=x')
  expect(html).not.toContain('<script>window.__xss')

  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  expect(markup).not.toContain('onerror')
  expect(markup).not.toContain('window.__xss')

  return html
}

async function expectSanitized(container: Locator, boldText: string): Promise<void> {
  await expect(container.locator('strong')).toHaveText(boldText)
  await expect(container).toContainText('text')
  await expect(container.locator('img')).toHaveCount(0)
  await expect(container.locator('script')).toHaveCount(0)
}

async function expectNoInjectedCodeRan(page: Page): Promise<void> {
  const xss = await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss)
  expect(xss).toBeUndefined()
}

test('a resume with HTML content loads directly and renders it sanitized', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional', {
    experience: [HTML_EXPERIENCE],
  })

  await loadDirectly(page, `/en/dashboard/resumes/${resume.id}/preview`)

  const resumeDocument = page.getByTestId('resume-document')
  await expect(resumeDocument).toBeVisible()

  const content = resumeDocument.locator('.formatted-content').filter({ hasText: RESUME_BOLD })
  await expect(content).toHaveCount(1)
  await expectSanitized(content, RESUME_BOLD)
  await expectNoInjectedCodeRan(page)
})

test('a cover letter with HTML paragraphs loads directly and renders them sanitized', async ({
  page,
  authedUser,
}) => {
  const coverLetterId = await seedHtmlCoverLetter(authedUser)

  await loadDirectly(page, `/en/dashboard/cover-letters/${coverLetterId}/edit`)

  // The letter preview is the ModernLetterTemplate inside CoverLetterPreview's
  // page shadow; the editor pane beside it is a different surface.
  const letter = page.locator('div.shadow-2xl').filter({ hasText: LETTER_OPENING_BOLD })
  await expect(letter).toHaveCount(1)

  const opening = letter.locator('.mb-4.text-justify').filter({ hasText: LETTER_OPENING_BOLD })
  const body = letter.locator('.mb-4.text-justify').filter({ hasText: LETTER_BODY_BOLD })
  const closing = letter.locator('.mb-6.text-justify').filter({ hasText: LETTER_CLOSING_BOLD })

  for (const [paragraph, boldText] of [
    [opening, LETTER_OPENING_BOLD],
    [body, LETTER_BODY_BOLD],
    [closing, LETTER_CLOSING_BOLD],
  ] as const) {
    await expect(paragraph).toHaveCount(1)
    await expectSanitized(paragraph, boldText)
  }
  await expectNoInjectedCodeRan(page)
})

/**
 * The editor counts the characters of the summary, and counting them means
 * turning the stored HTML into plain text - which needs the DOM, exactly like
 * sanitizing does. `?section=summary` is enough to make the server render that
 * section, because the editor seeds its active section from the query string.
 *
 * `expectNoInjectedCodeRan` is deliberately not repeated here. Both the rich
 * text editor and the character counter parse this summary in the live
 * document once mounted, so the injected `<img>` is fetched and its `onerror`
 * can fire on this page too - the same defect the tests above already assert
 * against and which the inert-parse work owns. It fires only when the failed
 * request lands before the assertion, so repeating the check here would add a
 * third intermittent copy of one known failure rather than new coverage.
 */
test('a resume whose summary is HTML loads its editor directly and counts the characters', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional', {
    summary: payload(SUMMARY_BOLD),
  })

  const serverHtml = await loadDirectly(
    page,
    `/en/dashboard/resumes/${resume.id}/edit?section=summary`
  )

  // A count the server cannot compute must not be guessed at either: no digit
  // may sit in that element until the browser has produced a real one.
  expect(serverHtml).toMatch(
    /<span[^>]*data-testid="summary-character-count"[^>]*><\/span>/
  )

  await expect(page.getByTestId('summary-character-count')).toHaveText(
    `${SUMMARY_PLAIN_TEXT.length} characters`
  )
})
