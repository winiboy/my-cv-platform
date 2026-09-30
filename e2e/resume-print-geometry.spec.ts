import { test, expect } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'
import type { ResumeTemplate } from '../src/types/database'

/**
 * A resume PDF is `window.print()` over the Preview, so the Preview's geometry
 * is the PDF's contract (`.claude/rules/exports.md`).
 *
 * Every template used to break it: each carried a `print:p-*` padding smaller
 * than its screen padding. In print, text columns grew, so lines wrapped at
 * different words than the Preview showed; in the two-column templates the
 * columns also rose by different amounts, so a sidebar heading aligned with a
 * main heading in the Preview sat above it in the PDF.
 *
 * Measured, not inferred: the box of every heading, paragraph and list item,
 * relative to the document, under screen media and then under print media. A
 * padding change moves them all; a wrap change alters the height of the block
 * that wrapped, including the last one in a column.
 *
 * Each side is measured in the state that matters: the Preview with the editing
 * controls off (the document itself), and print as shipped, with the controls
 * on, because that is what a user downloads. A control that left layout behind
 * in print would fail here. Only geometry is compared: some slider labels sit
 * inside a heading and change its text, not its box.
 */

const TEMPLATES: ResumeTemplate[] = ['professional', 'modern', 'classic', 'minimal', 'creative']

type Box = { tag: string; x: number; y: number; width: number; height: number }

for (const template of TEMPLATES) {
  test(`${template}: print lays the document out exactly as the Preview does`, async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, template)
    await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
    const controls = page.getByTestId('controls-toggle')
    // As shipped, the controls are on; assert it rather than assume it.
    await expect(controls).toBeChecked()
    const document = page.getByTestId('resume-document')
    await expect(document).toBeVisible()
    await page.evaluate(() => globalThis.document.fonts.ready)

    const measure = () =>
      document.evaluate((root): Box[] => {
        const origin = root.getBoundingClientRect()
        return [...root.querySelectorAll('h1, h2, h3, p, li')].map((el) => {
          const r = el.getBoundingClientRect()
          return {
            tag: el.tagName,
            x: Math.round(r.left - origin.left),
            y: Math.round(r.top - origin.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
          }
        })
      })

    // `force` because the checkbox is `sr-only`, the real control behind the label.
    await controls.uncheck({ force: true })
    await page.emulateMedia({ media: 'screen' })
    const screen = await measure()

    await controls.check({ force: true })
    await page.emulateMedia({ media: 'print' })
    const print = await measure()

    // Enough of the document must be measured for the comparison to prove anything.
    expect(screen.length).toBeGreaterThan(4)
    expect(print).toEqual(screen)
  })
}
