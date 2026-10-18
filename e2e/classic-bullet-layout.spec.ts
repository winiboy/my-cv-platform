import { test, expect } from './fixtures/auth'
import { seedFixtureResume, FIXTURE_EXPERIENCE, type FixtureExperience } from './fixtures/resume'

/**
 * Classic's achievement bullets start their line, in the Preview and in print
 * (tasks/prds/classic-bullet-layout.md, US-001).
 *
 * The defect was a CSS `list-inside` marker in front of the block that
 * `renderFormattedText` always returns, so the bullet sat alone on one line and
 * the text began on the next. Both rendered shapes are exercised, because they
 * are different blocks: plain text becomes `div.text-justify`, stored HTML
 * becomes `div.formatted-content` once `SanitizedHtml` fills it in the browser.
 *
 * MEASURED, NOT INFERRED. For each achievement, the bullet's box against the
 * line boxes of the achievement's own text (a Range over its text node, which
 * reports one rect per laid-out line):
 *
 *   - alignment: the bullet's vertical centre is within 4 px of the centre of
 *     the text's first line;
 *   - wrap indent: every later line of a wrapped achievement starts at the x
 *     its first line starts at, which is right of the bullet, not under it.
 *
 * Print is `window.print()` over this same Preview, so the PDF path is the same
 * measurement under print media, with the controls on as a user downloads it.
 *
 * It also pins where the text lives: inside `.formatted-content` or
 * `div.text-justify`, the elements the parity suite samples body typography
 * from (US-016). A fix that moved the text out of them would pass the geometry
 * and silently change what parity measures.
 */

/** Long enough to wrap at Classic's body width at the default 14px. */
const LONG_PLAIN =
  'Rebuilt the document rendering pipeline so that the Preview, the printed PDF and the Word export ' +
  'are drawn from one layout model, retiring four template-specific code paths and the drift between them.'
const LONG_HTML_TEXT =
  'Led the migration of every stored resume to the rich-text format, writing the converter, the rollback ' +
  'path and the audit that proved no achievement, date or section order changed for any of the users.'

const SHORT_PLAIN = FIXTURE_EXPERIENCE[0].achievements[0]
const SHORT_HTML_TEXT = FIXTURE_EXPERIENCE[0].achievements[1]

/** The first role carries both shapes, short and wrapping; the second role is the fixture's own. */
const EXPERIENCE: readonly FixtureExperience[] = [
  {
    ...FIXTURE_EXPERIENCE[0],
    achievements: [SHORT_PLAIN, `<p>${SHORT_HTML_TEXT}</p>`, LONG_PLAIN, `<p>${LONG_HTML_TEXT}</p>`],
  },
  FIXTURE_EXPERIENCE[1],
]

interface Case {
  label: string
  text: string
  container: 'formatted-content' | 'text-justify'
  wraps: boolean
}

const CASES: readonly Case[] = [
  { label: 'short plain text', text: SHORT_PLAIN, container: 'text-justify', wraps: false },
  { label: 'short HTML', text: SHORT_HTML_TEXT, container: 'formatted-content', wraps: false },
  { label: 'wrapped plain text', text: LONG_PLAIN, container: 'text-justify', wraps: true },
  { label: 'wrapped HTML', text: LONG_HTML_TEXT, container: 'formatted-content', wraps: true },
]

const CENTRE_TOLERANCE_PX = 4
/** Sub-pixel layout can put two line starts a fraction apart; a bullet is several px wide. */
const LINE_START_TOLERANCE_PX = 0.5

interface Measurement {
  markerText: string
  markerColour: string
  textColour: string
  inContainer: boolean
  markerTop: number
  markerBottom: number
  markerRight: number
  /** One entry per laid-out line of the achievement's text, top to bottom. */
  lines: { top: number; bottom: number; left: number }[]
}

for (const media of ['screen', 'print'] as const) {
  test(`classic ${media}: each achievement bullet starts the line its text starts`, async ({
    page,
    authedUser,
  }) => {
    const resume = await seedFixtureResume(authedUser.id, 'classic', { experience: EXPERIENCE })
    await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
    const document = page.getByTestId('resume-document')
    await expect(document).toBeVisible()
    // The HTML achievements are filled in after hydration; measuring before
    // that would measure an empty block.
    for (const { text } of CASES) {
      await expect(document.getByText(text, { exact: true })).toBeVisible()
    }
    await page.evaluate(() => globalThis.document.fonts.ready)
    await page.emulateMedia({ media })

    for (const c of CASES) {
      const m = await document.evaluate(
        (root, { text, container }): Measurement => {
          const walker = globalThis.document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
          const nodes: Text[] = []
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if ((node.nodeValue ?? '').trim() === text) nodes.push(node as Text)
          }
          if (nodes.length !== 1) throw new Error(`Expected one text node reading "${text}", found ${nodes.length}`)
          const textNode = nodes[0]
          const parent = textNode.parentElement
          const item = parent?.closest('li')
          if (!parent || !item) throw new Error(`"${text}" is not inside a list item`)
          const marker = item.firstElementChild as HTMLElement | null
          if (!marker || marker.contains(textNode)) throw new Error(`"${text}" has no bullet before it`)

          const range = globalThis.document.createRange()
          range.selectNodeContents(textNode)
          const byTop = new Map<number, { top: number; bottom: number; left: number }>()
          for (const rect of Array.from(range.getClientRects())) {
            if (rect.width === 0) continue
            const key = Math.round(rect.top)
            const seen = byTop.get(key)
            if (!seen || rect.left < seen.left) byTop.set(key, { top: rect.top, bottom: rect.bottom, left: rect.left })
          }
          const lines = [...byTop.values()].sort((a, b) => a.top - b.top)
          const markerBox = marker.getBoundingClientRect()

          return {
            markerText: (marker.textContent ?? '').trim(),
            markerColour: getComputedStyle(marker).color,
            textColour: getComputedStyle(parent).color,
            inContainer: parent.closest(container === 'formatted-content' ? '.formatted-content' : 'div.text-justify') !== null,
            markerTop: markerBox.top,
            markerBottom: markerBox.bottom,
            markerRight: markerBox.right,
            lines,
          }
        },
        { text: c.text, container: c.container },
      )

      const at = `${media}, ${c.label}`
      // The bullet keeps Classic's disc look: the disc glyph, in the text colour.
      expect(m.markerText, `${at}: bullet glyph`).toBe('•')
      expect(m.markerColour, `${at}: bullet colour`).toBe(m.textColour)
      expect(m.inContainer, `${at}: text stays inside its ${c.container} block`).toBe(true)

      expect(m.lines.length, `${at}: laid-out lines`).toBeGreaterThan(0)
      const first = m.lines[0]
      const markerCentre = (m.markerTop + m.markerBottom) / 2
      const firstLineCentre = (first.top + first.bottom) / 2
      expect(Math.abs(markerCentre - firstLineCentre), `${at}: bullet and first line share a line`).toBeLessThanOrEqual(
        CENTRE_TOLERANCE_PX,
      )
      expect(first.left, `${at}: text starts right of the bullet`).toBeGreaterThanOrEqual(m.markerRight)

      if (c.wraps) {
        // Without a second line the indent assertion below would hold vacuously.
        expect(m.lines.length, `${at}: the achievement wraps`).toBeGreaterThan(1)
        for (const line of m.lines.slice(1)) {
          expect(Math.abs(line.left - first.left), `${at}: a wrapped line starts under the text`).toBeLessThanOrEqual(
            LINE_START_TOLERANCE_PX,
          )
        }
      } else {
        expect(m.lines.length, `${at}: one line`).toBe(1)
      }
    }
  })
}
