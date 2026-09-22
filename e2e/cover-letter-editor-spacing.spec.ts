import { test, expect } from './fixtures/auth'
import { seedFixtureResume, FIXTURE_EXPERIENCE } from './fixtures/resume'
import type { Locator, Page, TestInfo } from '@playwright/test'

/**
 * The cover letter generator's editor separates paragraphs and keeps line
 * breaks, and that spacing does not leak into any other contentEditable.
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The behaviour is pure cascade. `globals.css` zeroes the margin of every
 * `[contenteditable="true"] p` with an unlayered `!important`, which no
 * Tailwind utility can beat, so the editor's spacing comes from one scoped
 * rule under `.cover-letter-editor`, and its line breaks from
 * `white-space: pre-line`. Removing either leaves every unit test green; only
 * computed style and line layout in a real engine can see it.
 *
 * WHAT IS ASSERTED
 *
 * - Generator editor: 16px below each paragraph, 0 below the last.
 * - Generator editor: a single newline inside a paragraph renders as a second
 *   line box rather than collapsing into a space.
 * - Resume editor: its paragraphs keep the shared zero margin, which is what
 *   shows the new rule is scoped to the cover letter editor.
 * - Every locale's generator path is served by the generator itself; a
 *   pre-built placeholder there made the editor tests above intermittent.
 *
 * The letter comes from a stubbed generation endpoint: what is under test is
 * how the editor lays out a letter, not what a model writes.
 */

const LETTER = [
  'Dear Hiring Manager,',
  'I am applying for the Senior Engineer role at Acme.',
  'Kind regards,\nJane Doe',
].join('\n\n')

/** Pasted resume text; the generator requires at least 200 characters. */
const RESUME_TEXT =
  'Jane Doe - Senior Software Engineer. Ten years building document rendering ' +
  'platforms, PDF and DOCX export pipelines, and accessible web applications ' +
  'with TypeScript, React and PostgreSQL. Led a team of six engineers.'

/** Pasted job description; the generator requires at least 100 characters. */
const JOB_DESCRIPTION =
  'Acme is hiring a Senior Engineer to own its document platform, working ' +
  'across rendering, export and editor tooling in TypeScript and React.'

/** The resume editor paragraphs: complete tags, so they render as markup. */
const RESUME_DESCRIPTION = '<p>First paragraph.</p><p>Second paragraph.</p>'

interface ParagraphLayout {
  readonly text: string
  readonly marginBottom: string
  /** Distinct line boxes the paragraph's content occupies. */
  readonly lineBoxes: number
}

/** Computed margin and line count of every paragraph inside `editor`. */
async function paragraphLayout(editor: Locator): Promise<ParagraphLayout[]> {
  return editor.evaluate((root) =>
    Array.from(root.querySelectorAll('p'), (paragraph) => {
      const range = document.createRange()
      range.selectNodeContents(paragraph)
      // One rect per line fragment; a newline can add a zero-width rect on the
      // line it ends, so lines are counted by distinct top edge.
      const tops = new Set(
        Array.from(range.getClientRects(), (rect) => Math.round(rect.top)),
      )
      return {
        text: paragraph.textContent ?? '',
        marginBottom: getComputedStyle(paragraph).marginBottom,
        lineBoxes: tops.size,
      }
    }),
  )
}

async function attachScreenshot(
  editor: Locator,
  name: string,
  testInfo: TestInfo,
): Promise<void> {
  await editor.scrollIntoViewIfNeeded()
  await testInfo.attach(name, {
    body: await editor.screenshot({ path: testInfo.outputPath(name) }),
    contentType: 'image/png',
  })
}

/** Fill the generator's inputs and produce `LETTER` in its editor. */
async function openGeneratorEditor(page: Page): Promise<Locator> {
  await page.route('**/api/tools/generate-cover-letter', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, coverLetter: LETTER }),
    }),
  )

  await page.goto('/en/tools/cover-letter-generator')
  await page.locator('#resume-tab-paste').click()
  await page.locator('#resume-text-input').fill(RESUME_TEXT)
  await page.locator('#job-description-input').fill(JOB_DESCRIPTION)
  await page.getByRole('button', { name: 'Write with AI', exact: true }).click()

  const editor = page.getByRole('textbox', { name: 'Cover letter editor' })
  await expect(editor).toBeVisible()
  await expect(editor.locator('p')).toHaveCount(3)
  return editor
}

// Where a test requests `authedUser` without using it, it is for the login
// alone: the generator renders only for a signed-in user, and Playwright runs
// a fixture only when a test asks for it.
test('the cover letter editor spaces paragraphs and keeps line breaks', async ({
  page,
  authedUser,
}, testInfo) => {
  const editor = await openGeneratorEditor(page)

  // The scoped rule is qualified by this attribute; pin it so a change in how
  // React serialises contentEditable cannot silently unhook the rule.
  await expect(editor).toHaveAttribute('contenteditable', 'true')

  const layout = await paragraphLayout(editor)
  await attachScreenshot(editor, 'cover-letter-editor.png', testInfo)

  expect(layout.map((p) => p.text)).toEqual([
    'Dear Hiring Manager,',
    'I am applying for the Senior Engineer role at Acme.',
    'Kind regards,\nJane Doe',
  ])
  expect(layout.map((p) => p.marginBottom)).toEqual(['16px', '16px', '0px'])

  // Both short lines fit the editor's width, so two line boxes can only come
  // from the newline itself.
  expect(layout.map((p) => p.lineBoxes)).toEqual([1, 1, 2])
})

/**
 * The generator's own page answers its path in every locale.
 *
 * `tools/[tool]` used to pre-build a "Coming Soon" copy of this path too, and
 * on some server starts that copy was served (`x-nextjs-cache: HIT`) in place
 * of the generator. The dedicated page reads the session, so it is always
 * rendered per request and must never come back as a cache hit.
 */
for (const locale of ['fr', 'en', 'de', 'it'] as const) {
  test(`/${locale}/tools/cover-letter-generator serves the generator, not a pre-built placeholder`, async ({
    page,
    authedUser,
  }) => {
    const response = await page.goto(`/${locale}/tools/cover-letter-generator`)

    expect(response?.status()).toBe(200)
    expect(response?.headers()['x-nextjs-cache']).toBeUndefined()
    await expect(page.locator('#resume-tab-paste')).toBeVisible()
  })
}

test('resume editor paragraphs keep the shared zero margin', async ({
  page,
  authedUser,
}, testInfo) => {
  const resume = await seedFixtureResume(authedUser.id, 'classic', {
    experience: [{ ...FIXTURE_EXPERIENCE[0], description: RESUME_DESCRIPTION }],
  })

  await page.goto(`/en/dashboard/resumes/${resume.id}/edit?section=experience`)
  const editor = page.locator('#experience-description-0')
  await expect(editor).toBeVisible()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await expect(editor.locator('p')).toHaveCount(2)

  const layout = await paragraphLayout(editor)
  await attachScreenshot(editor, 'resume-description-editor.png', testInfo)

  expect(layout.map((p) => p.text)).toEqual(['First paragraph.', 'Second paragraph.'])
  expect(layout.map((p) => p.marginBottom)).toEqual(['0px', '0px'])
})
