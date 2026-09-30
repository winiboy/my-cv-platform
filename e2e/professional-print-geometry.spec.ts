import { test, expect } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'

/**
 * The professional PDF is `window.print()` over the Preview, so the Preview's
 * geometry is the PDF's contract (`.claude/rules/exports.md`).
 *
 * It used to break it: the sidebar and main column each carried a `print:p-*`
 * padding smaller than their screen padding. In print the sidebar's text
 * column grew by 8px, so lines wrapped at different words than the Preview
 * showed, and the two columns rose by different amounts, so a sidebar heading
 * aligned with a main heading in the Preview sat above it in the PDF.
 *
 * Measured, not inferred: the box of every heading, paragraph and list item,
 * relative to the document, under screen media and then under print media. A
 * padding change moves them all; a wrap change alters the height of the block
 * that wrapped, including the last one in a column.
 */

type Box = { text: string; x: number; y: number; width: number; height: number }

test('professional: print lays the document out exactly as the Preview does', async ({
  page,
  authedUser,
}) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional')
  await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
  const document = page.getByTestId('resume-document')
  await expect(document).toBeVisible()
  await page.evaluate(() => globalThis.document.fonts.ready)

  const measure = () =>
    document.evaluate((root): Box[] => {
      const origin = root.getBoundingClientRect()
      return [...root.querySelectorAll('h1, h2, h3, p, li')].map((el) => {
        const r = el.getBoundingClientRect()
        return {
          text: (el.textContent ?? '').trim(),
          x: Math.round(r.left - origin.left),
          y: Math.round(r.top - origin.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
        }
      })
    })

  await page.emulateMedia({ media: 'screen' })
  const screen = await measure()
  await page.emulateMedia({ media: 'print' })
  const print = await measure()

  // Both columns must be represented, or the comparison proves nothing.
  expect(screen.length).toBeGreaterThan(4)
  expect(new Set(screen.map((b) => b.x)).size).toBeGreaterThan(1)
  expect(print).toEqual(screen)
})
