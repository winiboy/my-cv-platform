import path from 'node:path'
import pdfParse from 'pdf-parse'
import type { Browser } from '@playwright/test'
import { test, expect } from '@playwright/test'
import {
  FONT_SUBSTITUTES,
  loadFontSubstitutes,
  registerFontSubstitutes,
  type SubstituteFontFace,
} from '../src/lib/pdf/font-substitutes'

/**
 * US-003 (resume-pdf-direct-download): the serverless renderer's substitute
 * fonts print the same lines and pages as the fonts they stand in for.
 *
 * THE COMPARISON. One deterministic, CV-shaped document — a narrow sidebar and
 * a main column, the sizes, weights, italics, capitals and letter-spacing the
 * templates use, French, German and English text — printed to A4 twice in
 * this machine's Chromium, with the same CSS naming, say, `Arial`:
 *
 *   - reference: the real Arial installed on this computer;
 *   - substitute: the same page with `registerFontSubstitutes` and the faces
 *     `loadFontSubstitutes` reads from the installed packages — exactly what
 *     the serverless renderer registers — which take precedence over the
 *     installed font of the same name.
 *
 * Both PDFs must have the same page count and, on every page and in each
 * column, the same lines of text at the same heights (to within the rounding
 * of the comparison, or the measured tolerance noted at CASES).
 *
 * WHERE IT RUNS. Only on Windows or macOS where the real font is installed;
 * elsewhere — a Linux CI runner, whose fontconfig would answer for the name
 * with a look-alike — the case is skipped with that reason, because there is
 * no real font to compare against. No network: the page
 * is served from an intercepted, reserved origin and the fonts are inline.
 */

const ORIGIN = 'https://pdf-fonts.test'

const SENTENCES = [
  'Responsable de la conception et du déploiement de services numériques pour une clientèle internationale exigeante.',
  'Pilotage d’équipes pluridisciplinaires, coordination des priorités et suivi budgétaire rigoureux sur plusieurs exercices.',
  'Verantwortlich für die Weiterentwicklung der Plattform, Qualitätssicherung und Schulung neuer Kolleginnen und Kollegen.',
  'Led the migration of legacy billing systems to a modular architecture, reducing monthly incidents by forty-two percent.',
  'Négociation de partenariats stratégiques à Zürich, Genève et Lyon ; rédaction de rapports trimestriels détaillés.',
  'Analyse fonctionnelle, ateliers utilisateurs, recette et accompagnement au changement — méthodes agiles (Scrum, Kanban).',
]

/** The weights a template can request. 300 is left out where the real font has a light face the stand-in lacks. */
function documentHtml(family: string, weights: readonly number[], withNormalLeading: boolean): string {
  const paragraphs = (count: number, offset: number) =>
    Array.from({ length: count }, (_, i) => SENTENCES[(i + offset) % SENTENCES.length]).join(' ')
  const sizes = [9, 10, 11, 12, 14, 16]
  const blocks: string[] = []
  sizes.forEach((size, i) => {
    weights.forEach((weight, j) => {
      const italic = (i + j) % 3 === 0 ? 'italic' : 'normal'
      blocks.push(
        `<p style="font-size:${size}px;font-weight:${weight};font-style:${italic}">${paragraphs(2 + ((i + j) % 3), i + j)}</p>`,
      )
    })
  })
  const sidebar = sizes
    .map(
      (size, i) =>
        `<h3 style="font-size:${size + 2}px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Compétences ${i + 1}</h3>` +
        `<p style="font-size:${size}px">${paragraphs(1, i)}</p>`,
    )
    .join('')
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    body { margin: 0; font-family: '${family}', monospace; line-height: 1.5; color: #111; }
    .grid { display: flex; gap: 6mm; }
    aside { width: 55mm; flex: none; }
    main { flex: 1; }
    h1 { font-size: 26px; font-weight: 700; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    h2 { font-size: 16px; font-weight: 600; margin: 10px 0 4px; }
    .normal-leading p { line-height: normal; }
    p { margin: 0 0 6px; }
  </style></head><body>
    <div class="grid"><aside>${sidebar}</aside><main>
      <h1>Camille Dupont-Lefèvre</h1>
      <h2>Expérience professionnelle</h2>${blocks.join('')}
      ${withNormalLeading ? `<div class="normal-leading"><h2>Formation</h2>${blocks.slice(0, 6).join('')}</div>` : ''}
    </main></div>
  </body></html>`
}

/**
 * Where the main column starts, in points from the page's left edge: the
 * 12 mm page margin, the 55 mm sidebar and half its 6 mm gap. Lines are
 * grouped per column, so a sidebar line and a main-column line that happen to
 * share a baseline are not read as one line.
 */
const MAIN_COLUMN_X_PT = ((12 + 55 + 3) * 72) / 25.4

interface PdfLine {
  column: 'sidebar' | 'main'
  /** Baseline height on the page, in points. */
  y: number
  /**
   * The line's characters with all whitespace removed. pdf.js splits a line
   * into text items wherever the glyph positioning breaks the run, which
   * differs between two fonts even when the lines are identical, and its
   * joins then add spaces inside words. Without whitespace, two lines are
   * equal exactly when they hold the same characters, so a line break moved by
   * even one word still fails.
   */
  text: string
}

/** Every page of the PDF as its lines of text: the sidebar's top to bottom, then the main column's. */
async function pdfLines(pdf: Buffer): Promise<PdfLine[][]> {
  const pages: PdfLine[][] = []
  await pdfParse(pdf, {
    version: 'v2.0.550',
    pagerender: async (pageData: unknown) => {
      const content = await (pageData as { getTextContent(): Promise<{ items: { str: string; transform: number[] }[] }> }).getTextContent()
      const rows = new Map<string, { column: PdfLine['column']; y: number; parts: { x: number; str: string }[] }>()
      for (const item of content.items) {
        const column = item.transform[4] < MAIN_COLUMN_X_PT ? 'sidebar' : 'main'
        const y = Math.round(item.transform[5] * 2) / 2
        const key = `${column}:${y}`
        const row = rows.get(key) ?? { column, y, parts: [] }
        row.parts.push({ x: item.transform[4], str: item.str })
        rows.set(key, row)
      }
      const lines = [...rows.values()]
        .sort((a, b) => (a.column === b.column ? b.y - a.y : a.column === 'sidebar' ? -1 : 1))
        .map(({ column, y, parts: row }) => ({
          column,
          y,
          text: row
            .sort((a, b) => a.x - b.x)
            .map((part) => part.str)
            .join('')
            .replace(/\s+/g, ''),
        }))
        .filter((line) => line.text !== '')
      pages.push(lines)
      return ''
    },
  })
  return pages
}

/** Print the document in a fresh context, optionally with the substitute faces registered. */
async function printDocument(browser: Browser, html: string, faces: readonly SubstituteFontFace[] | null): Promise<Buffer> {
  const context = await browser.newContext()
  try {
    await context.route('**/*', (route) =>
      route.request().url() === `${ORIGIN}/`
        ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
        : route.abort('blockedbyclient'),
    )
    if (faces) await context.addInitScript(registerFontSubstitutes, { origin: ORIGIN, faces })
    const page = await context.newPage()
    await page.goto(`${ORIGIN}/`)
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      await document.fonts.ready
    })
    if (faces) {
      const loaded = await page.evaluate(() =>
        Array.from(document.fonts).filter((face) => face.status === 'loaded').map((face) => face.family),
      )
      expect(loaded.length, 'substitute faces actually used').toBeGreaterThan(0)
    }
    await page.emulateMedia({ media: 'print' })
    return await page.pdf({ preferCSSPageSize: true, displayHeaderFooter: false })
  } finally {
    await context.close()
  }
}

/** Whether `family` is installed here: text in it measures differently from both generic fallbacks. */
async function isInstalled(browser: Browser, family: string): Promise<boolean> {
  const page = await browser.newPage()
  try {
    return await page.evaluate((name) => {
      const canvas = document.createElement('canvas').getContext('2d')
      if (!canvas) return false
      const sample = 'mmmmmmmmmmlliWWQ@#0123456789'
      return ['monospace', 'serif'].every((generic) => {
        canvas.font = `40px ${generic}`
        const fallback = canvas.measureText(sample).width
        canvas.font = `40px '${name}', ${generic}`
        return canvas.measureText(sample).width !== fallback
      })
    }, family)
  } finally {
    await page.close()
  }
}

let faces: SubstituteFontFace[] = []
test.beforeAll(async () => {
  faces = await loadFontSubstitutes(path.join(process.cwd(), 'node_modules', '@fontsource'))
})

/**
 * The two measured exceptions, recorded rather than tested away
 * (docs/engineering/pdf-export-runtime.md):
 *
 *   - Calibri on Windows also has a Light face (300), which Carlito lacks:
 *     text set in `font-light` prints in Carlito Regular on the server. 300 is
 *     left out for Calibri only.
 *   - Gelasio's vertical metrics are close to Georgia's but not identical. In a
 *     fixed line height (every resume template: Tailwind's 1.5 base, its text
 *     sizes' line heights, `leading-relaxed`) each line box is the same height
 *     and only the baseline inside it moves, by up to 1 pt, without
 *     accumulating, so lines and pages are unchanged. Under
 *     `line-height: normal`, which no template uses, Gelasio's lines are
 *     shorter and the difference accumulates. The `line-height: normal` block
 *     is left out for Georgia only, and its baselines are allowed 1 pt.
 */
const CASES = FONT_SUBSTITUTES.map(({ family, fontsourcePackage }) => ({
  family,
  fontsourcePackage,
  weights: family === 'Calibri' ? [400, 500, 600, 700] : [300, 400, 500, 600, 700],
  withNormalLeading: family !== 'Georgia',
  baselineTolerancePt: family === 'Georgia' ? 1 : 0.5,
}))

for (const { family, fontsourcePackage, weights, withNormalLeading, baselineTolerancePt } of CASES) {
  test(`${fontsourcePackage} prints the same pages and lines as the installed ${family}`, async ({ browser }) => {
    // On Linux, fontconfig answers for "Arial" or "Georgia" with whatever
    // look-alike is installed, so a reference there would not be the real font.
    test.skip(process.platform === 'linux', `On Linux, ${family} is resolved by fontconfig to a look-alike: no real reference`)
    test.skip(!(await isInstalled(browser, family)), `${family} is not installed on this machine: nothing to compare with`)

    const html = documentHtml(family, weights, withNormalLeading)
    const own = faces.filter((face) => face.family === family)
    expect(own.length).toBeGreaterThan(0)

    const reference = await pdfLines(await printDocument(browser, html, null))
    const substitute = await pdfLines(await printDocument(browser, html, own))

    expect(reference.length, 'the document spans several pages').toBeGreaterThanOrEqual(2)
    expect(substitute.length, 'page count').toBe(reference.length)
    reference.forEach((lines, index) => {
      const text = (page: PdfLine[]) => page.map((line) => `${line.column}: ${line.text}`)
      expect(text(substitute[index]), `lines of page ${index + 1}`).toEqual(text(lines))
      substitute[index].forEach((line, i) => {
        expect(Math.abs(line.y - lines[i].y), `height of line ${i + 1} on page ${index + 1}`).toBeLessThanOrEqual(baselineTolerancePt)
      })
    })
    test.info().annotations.push({
      type: 'compared',
      description: `${reference.length} pages, ${reference.flat().length} lines`,
    })
  })
}
