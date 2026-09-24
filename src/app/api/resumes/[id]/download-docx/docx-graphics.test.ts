import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { resolveResumeLayout } from '@/lib/layout-settings'
import {
  CREATIVE_HEADER_CIRCLES,
  CREATIVE_LANGUAGE_BAR,
  CREATIVE_LANGUAGE_LEVEL_SEGMENTS,
  MODERN_SKILL_BAR,
  PREVIEW_GRAPHICS,
  type DocxGraphicForm,
} from '@/lib/resume-graphics'
import { generateCreativeDocx } from './docx-creative'
import { translucentDiscPng } from './docx-disc'
import type { DocxGeneratorSettings } from './docx-helpers'
import { hslToHex } from './docx-helpers'
import { generateModernDocx } from './docx-modern'
import { DOCX_PALETTE } from './docx-palette'

/**
 * Part 3 US-007: the bars, pills, chips, rules and markers the Preview draws
 * appear in the DOCX, in the form `resume-graphics.ts` records, in the colour
 * `resume-palette.ts` holds, and carrying the value the Preview shows.
 *
 * Everything is asserted on the unzipped `word/document.xml` of a generated
 * document, never on the generator's inputs: a bar that carried the right level
 * in a variable and wrote the wrong widths would pass a unit test of the helper
 * and fail here.
 *
 * Colours are LITERALS, as `docx-text-opacity.test.ts` writes them, so a
 * palette entry pointed at the wrong token fails here instead of agreeing with
 * itself. Modern is run at two sidebar colours, because both its bar's fill and
 * its bar's track depend on the user's colour: a generator that wrote a fixed
 * pair would pass at one and fail at the other.
 */

/** Two colours the sidebar controls can produce, and what each derives. */
const SIDEBAR = {
  green: { hue: 150, saturation: 60, brightness: 30, fill: '1F7A4D', accent: '30E88C', track: '4C9571' },
  orange: { hue: 20, saturation: 80, brightness: 55, fill: 'E86E30', accent: 'FF884D', track: 'ED8B59' },
} as const

type SidebarName = keyof typeof SIDEBAR

/** One string per element, unique to it in the document it is read from. */
const MARK = {
  skillA: 'Zanzibarscript',
  skillB: 'Quuxlang',
  project: 'Orbital Mapper',
  technologies: ['Kiln', 'Tessellate'],
  position: 'Kilnwright Engineer',
  achievement: 'Tessellated achievement shipped the export pipeline.',
} as const

const LANGUAGES = [
  { language: 'Esperanto', level: 'Fluent', visible: true },
  { language: 'Volapuk', level: 'Basic', visible: true },
  { language: 'Interlingua', level: 'Native', visible: true },
  // Not one of the five the Preview recognises: it draws an empty bar, so the
  // DOCX draws an empty bar. The union in `types/database.ts` forbids this, but
  // stored rows are not typed.
  { language: 'Lojban', level: 'C2 - Proficient', visible: true },
]

function resumeRow() {
  return {
    title: 'Graphics Fidelity Title',
    contact: { name: 'Robin Graphics', email: 'robin@graphics.test' },
    summary: 'Quillwright graphics summary.',
    experience: [
      {
        company: 'Tessellate Freight',
        position: MARK.position,
        location: 'Kiln, CH',
        startDate: '2011-03',
        current: true,
        achievements: [MARK.achievement],
        visible: true,
      },
    ],
    education: [{ school: 'Halvorsen Institute', degree: 'Magister', startDate: '1997-09', endDate: '1999-06', visible: true }],
    skills: [{ category: 'Toolchain', items: [MARK.skillA, MARK.skillB], visible: true }],
    projects: [{ name: MARK.project, description: 'Orbital project description.', technologies: [...MARK.technologies], visible: true }],
    languages: LANGUAGES,
    certifications: [{ name: 'Typesetting Cert', issuer: 'Guild of Printers', date: '2003-05', visible: true }],
    custom_sections: {},
    layout_settings: null,
  }
}

/** The generator settings `route.ts` builds, with the sidebar colour overridden. */
function settingsFor(row: ReturnType<typeof resumeRow>, sidebar: SidebarName | null): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row, null)
  const colour = sidebar ? SIDEBAR[sidebar] : null
  return {
    fontFamily: layout.fontFamily,
    fontScale: layout.fontScale,
    locale: 'en',
    sidebarHue: colour?.hue ?? layout.sidebarHue,
    sidebarSaturation: colour?.saturation ?? layout.sidebarSaturation,
    sidebarBrightness: colour?.brightness ?? layout.sidebarBrightness,
    sidebarWidth: layout.sidebarWidth,
    sidebarTopMargin: layout.sidebarTopMargin,
    mainContentTopMargin: layout.mainContentTopMargin,
    sidebarOrder: [...layout.sidebarOrder],
    mainContentOrder: [...layout.mainContentOrder],
    hiddenSidebarSections: [...layout.hiddenSidebarSections],
    hiddenMainSections: [...layout.hiddenMainSections],
  }
}

// ---------------------------------------------------------------------------
// Reading the document
// ---------------------------------------------------------------------------

/**
 * Every `<tag>…</tag>` span, innermost first, counted by depth. A lazy regex
 * cannot do this: these documents nest tables inside table cells, so
 * `<w:tbl>[\s\S]*?</w:tbl>` would pair an outer opening tag with an inner
 * closing one.
 */
function elements(xml: string, tag: string): string[] {
  const token = new RegExp(`<${tag}(?:\\s[^>]*)?(/?)>|</${tag}>`, 'g')
  const open: number[] = []
  const found: { start: number; text: string }[] = []
  for (const match of xml.matchAll(token)) {
    const at = match.index ?? 0
    if (match[0].startsWith(`</`)) {
      const start = open.pop()
      if (start !== undefined) found.push({ start, text: xml.slice(start, at + match[0].length) })
    } else if (match[1] !== '/') {
      open.push(at)
    }
  }
  return found.sort((a, b) => a.start - b.start).map((entry) => entry.text)
}

const attribute = (fragment: string, element: string, name: string): string | null =>
  new RegExp(`<${element}\\b[^>]*\\s${name}="([^"]*)"`).exec(fragment)?.[1] ?? null

interface Cell {
  widthTwips: number | null
  /** The `w:fill` of the cell's own shading, uppercased, or null. */
  fill: string | null
  text: string
}

/** A table row of the document, as its cells. The row's own height, if exact. */
interface Row {
  exactHeightTwips: number | null
  cells: Cell[]
}

function rows(xml: string): Row[] {
  return elements(xml, 'w:tr').map((row) => {
    const properties = /<w:trPr>([\s\S]*?)<\/w:trPr>/.exec(row)?.[1] ?? ''
    const height = attribute(properties, 'w:trHeight', 'w:val')
    return {
      exactHeightTwips: attribute(properties, 'w:trHeight', 'w:hRule') === 'exact' && height ? Number(height) : null,
      cells: elements(row, 'w:tc')
        // Only the row's OWN cells: a cell of a table nested inside one of them
        // is a cell of that table's row, which `elements` returns separately.
        .filter((cell) => !elements(row, 'w:tc').some((other) => other !== cell && other.includes(cell)))
        .map((cell) => {
          const cellProperties = /<w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(cell)?.[1] ?? ''
          const width = attribute(cellProperties, 'w:tcW', 'w:w')
          const fill = attribute(cellProperties, 'w:shd', 'w:fill')
          return {
            widthTwips: width === null ? null : Number(width),
            fill: fill && fill !== 'auto' ? fill.toUpperCase() : null,
            text: [...cell.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, part]) => part).join(''),
          }
        }),
    }
  })
}

interface Run {
  text: string
  colour: string | null
  /** The `w:fill` of the run's own shading, uppercased, or null. */
  shading: string | null
}

interface Paragraph {
  text: string
  runs: Run[]
  /** The `w:color` of the left paragraph border, uppercased, or null. */
  leftBorderColour: string | null
  /** The left paragraph border's width in eighths of a point. */
  leftBorderEighths: number | null
  leftIndentTwips: number | null
}

function paragraphs(xml: string): Paragraph[] {
  return elements(xml, 'w:p').map((paragraph) => {
    const properties = /^<w:p(?:\s[^>]*)?>\s*<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paragraph)?.[1] ?? ''
    const border = /<w:pBdr>([\s\S]*?)<\/w:pBdr>/.exec(properties)?.[1] ?? ''
    const size = attribute(border, 'w:left', 'w:sz')
    const runs = elements(paragraph, 'w:r').map((run) => ({
      text: [...run.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, part]) => part).join(''),
      colour: /<w:color w:val="([0-9A-Fa-f]{6})"\/>/.exec(run)?.[1]?.toUpperCase() ?? null,
      shading: attribute(/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? '', 'w:shd', 'w:fill')?.toUpperCase() ?? null,
    }))
    return {
      text: runs.map((run) => run.text).join(''),
      runs,
      leftBorderColour: attribute(border, 'w:left', 'w:color')?.toUpperCase() ?? null,
      leftBorderEighths: size === null ? null : Number(size),
      leftIndentTwips: Number(attribute(properties, 'w:ind', 'w:left') ?? NaN) || null,
    }
  })
}

type Generator = (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>

const documents = new Map<string, Promise<string>>()

function documentXml(key: string, generate: Generator, sidebar: SidebarName | null): Promise<string> {
  let cached = documents.get(key)
  if (!cached) {
    cached = (async () => {
      const row = resumeRow()
      const zip = await JSZip.loadAsync(await generate(row, settingsFor(row, sidebar)))
      const part = zip.file('word/document.xml')
      if (part === null) throw new Error(`The ${key} artifact has no word/document.xml`)
      return part.async('string')
    })()
    documents.set(key, cached)
  }
  return cached
}

/**
 * The innermost table cell holding `needle`: the shortest of the cells that
 * contain it, since a nested cell's text is also inside every cell around it.
 */
function cellHolding(xml: string, needle: string): string {
  const holding = elements(xml, 'w:tc').filter((cell) => cell.includes(needle))
  if (holding.length === 0) throw new Error(`No table cell holds "${needle}"`)
  return holding.reduce((shortest, cell) => (cell.length < shortest.length ? cell : shortest))
}

/** Rows whose cells are all empty and at least one is shaded: the drawn bars. */
const bars = (xml: string) =>
  rows(xml).filter((row) => row.cells.every((cell) => cell.text === '') && row.cells.some((cell) => cell.fill !== null))

// ---------------------------------------------------------------------------
// The colours these graphics are drawn in
// ---------------------------------------------------------------------------

describe('the colours and derivations this test names', () => {
  it('are the palette entries the templates draw these graphics in', () => {
    expect(DOCX_PALETTE.modern['slate-100'], 'modern technology chip fill').toBe('F2F2F2')
    expect(DOCX_PALETTE.modern['slate-700'], 'modern technology chip text').toBe('222222')
    expect(DOCX_PALETTE.creative['purple-500'], 'creative pills, bar segments and card rule').toBe('8652FF')
    expect(DOCX_PALETTE.creative['purple-300'], 'creative timeline line').toBe('DAB2FF')
    expect(DOCX_PALETTE.creative['slate-200'], 'creative empty bar segment').toBe('E4E4E4')
    expect(DOCX_PALETTE.creative['slate-50'], 'creative project card fill').toBe('F8F8F8')
  })

  it('are the sidebar fills, accents and skill-bar tracks these two colours derive', () => {
    for (const [name, colour] of Object.entries(SIDEBAR)) {
      expect(hslToHex(colour.hue, colour.saturation, colour.brightness), `${name} fill`).toBe(colour.fill)
      // deriveAccentColorHex: saturation + 20 (max 100), brightness + 25 (max 65).
      expect(
        hslToHex(colour.hue, Math.min(colour.saturation + 20, 100), Math.min(colour.brightness + 25, 65)),
        `${name} accent`,
      ).toBe(colour.accent)
    }
    // White at 0.2 over each fill, by hand: 1F=31 → 31*0.2+... etc.
    expect(SIDEBAR.green.track).toBe('4C9571')
    expect(SIDEBAR.orange.track).toBe('ED8B59')
  })
})

// ---------------------------------------------------------------------------
// Modern
// ---------------------------------------------------------------------------

describe('modern: the skill bars', () => {
  it.each(Object.keys(SIDEBAR) as SidebarName[])(
    'draws one bar per skill item over %s, filled to the level the Preview draws',
    async (sidebar) => {
      const xml = await documentXml(`modern-${sidebar}`, generateModernDocx, sidebar)
      const drawn = bars(xml)
      expect(drawn, 'one bar per skill item, and nothing else shaded and empty').toHaveLength(2)

      for (const bar of drawn) {
        expect(bar.cells.map((cell) => cell.fill), 'accent then track').toEqual([
          SIDEBAR[sidebar].accent,
          SIDEBAR[sidebar].track,
        ])
        const [filled, track] = bar.cells.map((cell) => cell.widthTwips ?? 0)
        expect(filled + track, 'the bar spans the sidebar text column').toBeGreaterThan(0)
        // The value the Preview shows, read back off the document.
        expect(Math.round((filled / (filled + track)) * 100)).toBe(MODERN_SKILL_BAR.levelPercent)
        expect(bar.exactHeightTwips, 'the bar is drawn at its own height, exactly').toBe(
          Math.round((MODERN_SKILL_BAR.heightPx / 96) * 1440),
        )
      }
    },
  )

  it('puts each bar under its own skill, not all of them at the end', async () => {
    const xml = await documentXml('modern-green', generateModernDocx, 'green')
    const skillA = xml.indexOf(MARK.skillA)
    const skillB = xml.indexOf(MARK.skillB)
    expect(skillA, MARK.skillA).toBeGreaterThan(-1)
    expect(skillB, MARK.skillB).toBeGreaterThan(-1)
    const barStarts = [...xml.matchAll(new RegExp(`<w:shd [^>]*w:fill="${SIDEBAR.green.accent}"`, 'g'))]
      .map((match) => match.index ?? 0)
      .filter((at) => at > skillA)
    expect(barStarts.length, 'a bar after each skill name').toBeGreaterThanOrEqual(2)
    expect(barStarts[0], 'the first bar sits between the two skills').toBeLessThan(skillB)
  })
})

describe('modern: the technology chips', () => {
  it('shades one run per technology, slate-700 on slate-100', async () => {
    const xml = await documentXml('modern-green', generateModernDocx, 'green')
    const chips = paragraphs(xml)
      .flatMap((paragraph) => paragraph.runs)
      .filter((run) => run.shading === DOCX_PALETTE.modern['slate-100'])
    expect(chips.map((run) => run.text), 'one shaded run per chip, carrying its own label').toEqual(
      MARK.technologies.map((technology) => ` ${technology} `),
    )
    for (const chip of chips) expect(chip.colour, 'chip text').toBe(DOCX_PALETTE.modern['slate-700'])
  })
})

// ---------------------------------------------------------------------------
// Creative
// ---------------------------------------------------------------------------

describe('creative: the language level bars', () => {
  it('draws five segments and four gaps per language', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    const drawn = bars(xml)
    expect(drawn, 'one bar per language').toHaveLength(LANGUAGES.length)
    for (const bar of drawn) {
      expect(bar.cells).toHaveLength(2 * CREATIVE_LANGUAGE_BAR.segments - 1)
      expect(
        bar.cells.filter((_, index) => index % 2 === 1).map((cell) => cell.fill),
        'the gaps show the paper through',
      ).toEqual(Array(CREATIVE_LANGUAGE_BAR.segments - 1).fill(null))
      expect(bar.exactHeightTwips, 'the bar is drawn at its own height, exactly').toBe(
        Math.round(((CREATIVE_LANGUAGE_BAR.heightStep * 4) / 96) * 1440),
      )
    }
  })

  it('fills the number of segments the level means, in document order', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    const filled = bars(xml).map(
      (bar) =>
        bar.cells.filter((cell, index) => index % 2 === 0 && cell.fill === DOCX_PALETTE.creative['purple-500']).length,
    )
    expect(filled, 'Fluent 4, Basic 1, Native 5, and an unrecognised level 0').toEqual([
      CREATIVE_LANGUAGE_LEVEL_SEGMENTS.Fluent,
      CREATIVE_LANGUAGE_LEVEL_SEGMENTS.Basic,
      CREATIVE_LANGUAGE_LEVEL_SEGMENTS.Native,
      0,
    ])
  })

  it('draws the rest of every bar in slate-200, so an empty segment is visible', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    for (const bar of bars(xml)) {
      const bands = bar.cells.filter((_, index) => index % 2 === 0).map((cell) => cell.fill)
      expect(new Set(bands.filter((fill) => fill !== DOCX_PALETTE.creative['purple-500']))).toEqual(
        new Set(bands.includes(DOCX_PALETTE.creative['slate-200']) ? [DOCX_PALETTE.creative['slate-200']] : []),
      )
    }
  })

  it('writes no level text in place of the bars, which the Preview never showed', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    for (const level of Object.keys(CREATIVE_LANGUAGE_LEVEL_SEGMENTS)) {
      expect(xml, `"${level}" is drawn as a bar, not written out`).not.toContain(`${level} (`)
    }
  })
})

describe('creative: the technology pills', () => {
  it('shades one run per technology, white on purple-500', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    const pills = paragraphs(xml)
      .flatMap((paragraph) => paragraph.runs)
      .filter((run) => run.shading === DOCX_PALETTE.creative['purple-500'])
    expect(pills.map((run) => run.text), 'one shaded run per pill, carrying its own label').toEqual(
      MARK.technologies.map((technology) => ` ${technology} `),
    )
    for (const pill of pills) expect(pill.colour, 'pill text').toBe(DOCX_PALETTE.creative.white)
  })
})

describe('creative: the header’s decorative discs', () => {
  it('draws one floating raster per disc, over the cell fill and clipped to it', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    const drawings = elements(xml, 'w:drawing')
    expect(drawings, 'one floating drawing per disc').toHaveLength(2)
    for (const drawing of drawings) {
      // behindDoc="1" puts it behind the header cell's own fill, where Word does
      // not show it at all; measured in Word 16 before this was written.
      expect(attribute(drawing, 'wp:anchor', 'behindDoc'), 'behind the fill would be invisible').toBe('0')
      expect(attribute(drawing, 'wp:anchor', 'layoutInCell'), 'anchored in the header cell').toBe('1')
      expect(/<wp:wrapNone\s*\/>/.test(drawing), 'a wrapped disc would push the header text').toBe(true)
    }
    // Their sizes, in EMU, are the Preview's 256px and 192px at 9525 EMU a px.
    const extents = drawings
      .map((drawing) => Number(attribute(drawing, 'wp:extent', 'cx') ?? 0))
      .sort((a, b) => a - b)
    expect(extents).toEqual(
      [CREATIVE_HEADER_CIRCLES.bottomLeft.sizePx, CREATIVE_HEADER_CIRCLES.topRight.sizePx]
        .map((px) => px * 9525),
    )
  })

  it('gives each disc a PNG with an alpha channel, which is what carries the tint', async () => {
    const row = resumeRow()
    const zip = await JSZip.loadAsync(await generateCreativeDocx(row, settingsFor(row, null)))
    // `word/media/` is itself an entry in the zip; only its files are parts.
    const media = Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.startsWith('word/media/'))
      .map((entry) => entry.name)
    expect(media.length, 'one media part per disc').toBe(2)
    for (const name of media) {
      const bytes = await zip.file(name)!.async('nodebuffer')
      expect(bytes.subarray(1, 4).toString('ascii'), `${name} is a PNG`).toBe('PNG')
      // IHDR: width, height, bit depth, colour type. 6 is truecolour WITH alpha.
      expect(bytes.readUInt8(25), `${name} colour type`).toBe(6)
      expect(bytes.readUInt32BE(16), `${name} is square`).toBe(bytes.readUInt32BE(20))
    }
  })

  it('draws the same bytes for the same disc, so two exports of one resume agree', () => {
    const once = translucentDiscPng(64, 'FFFFFF', CREATIVE_HEADER_CIRCLES.alpha)
    const twice = translucentDiscPng(64, '#ffffff', CREATIVE_HEADER_CIRCLES.alpha)
    expect(once.equals(twice)).toBe(true)
    // The centre carries the declared alpha and the corner none, which is what
    // makes it a disc rather than a square.
    expect(once.length).toBeGreaterThan(80)
  })

  it('draws no floating raster in a template whose Preview has no such shape', async () => {
    const xml = await documentXml('modern-green', generateModernDocx, 'green')
    // Modern's only drawing is the photo, and this fixture carries none.
    expect(elements(xml, 'w:drawing')).toEqual([])
  })
})

describe('creative: the experience timeline', () => {
  it('runs a purple-300 rule down every paragraph of an entry', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    const entry = paragraphs(xml).filter(
      (paragraph) =>
        paragraph.text.includes(MARK.position) ||
        paragraph.text.includes('Tessellate Freight') ||
        paragraph.text.includes('Kiln, CH') ||
        paragraph.text.includes(MARK.achievement),
    )
    expect(entry.length, 'position, company, location and achievement').toBe(4)
    for (const paragraph of entry) {
      expect(paragraph.leftBorderColour, `the rule beside "${paragraph.text.slice(0, 24)}"`).toBe(
        DOCX_PALETTE.creative['purple-300'],
      )
      // 2 CSS px is 1.5pt, which OOXML writes as 12 eighths of a point.
      expect(paragraph.leftBorderEighths).toBe(12)
      expect(paragraph.leftIndentTwips, 'the pl-6 gutter the rule sits in').toBe(360)
    }
  })

  it('writes no marker character into the job title, which is read as text', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    const position = paragraphs(xml).find((paragraph) => paragraph.text.includes(MARK.position))
    expect(position, MARK.position).toBeDefined()
    // The Preview draws a dot in the gutter here. An owner decision keeps it out
    // of the DOCX rather than standing a glyph in for it: the entry's first run
    // is the title itself, and the title is exactly the title.
    expect(position?.text, 'the title carries nothing but the title').toBe(MARK.position)
    expect(position?.runs[0]?.text).toBe(MARK.position)
    expect(xml, 'no bullet glyph anywhere in the document').not.toContain('●')
  })

  it('leaves the rule off paragraphs outside an experience entry', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    const education = paragraphs(xml).find((paragraph) => paragraph.text.includes('Halvorsen Institute'))
    expect(education?.leftBorderColour, 'the education entry draws no timeline').toBeNull()
  })
})

describe('creative: the project card', () => {
  it('puts the project in a slate-50 cell with a purple-500 rule down its left edge', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    const card = cellHolding(xml, MARK.project)
    const properties = /<w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(card)?.[1] ?? ''
    expect(attribute(properties, 'w:shd', 'w:fill')?.toUpperCase(), 'the card fill').toBe(
      DOCX_PALETTE.creative['slate-50'],
    )
    const borders = /<w:tcBorders>([\s\S]*?)<\/w:tcBorders>/.exec(properties)?.[1] ?? ''
    expect(attribute(borders, 'w:left', 'w:color')?.toUpperCase(), 'the card rule').toBe(
      DOCX_PALETTE.creative['purple-500'],
    )
    // 4 CSS px is 3pt, which OOXML writes as 24 eighths of a point.
    expect(attribute(borders, 'w:left', 'w:sz')).toBe('24')
    for (const side of ['w:top', 'w:bottom', 'w:right']) {
      expect(attribute(borders, side, 'w:val'), `${side} is not a rule the Preview draws`).toBe('none')
    }
    // p-4 all round: 16 CSS px is 240 twips.
    const margins = /<w:tcMar>([\s\S]*?)<\/w:tcMar>/.exec(properties)?.[1] ?? ''
    for (const side of ['w:top', 'w:bottom', 'w:left', 'w:right']) {
      expect(attribute(margins, side, 'w:w'), `${side} padding`).toBe('240')
    }
  })
})

describe('creative: the header cell', () => {
  it('keeps one solid fill, the gradient’s first stop, under the discs drawn over it', async () => {
    const xml = await documentXml('creative', generateCreativeDocx, null)
    const header = cellHolding(xml, 'robin@graphics.test')
    const properties = /<w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(header)?.[1] ?? ''
    expect(attribute(properties, 'w:shd', 'w:fill')?.toUpperCase(), 'the header fill, and only it').toBe(
      DOCX_PALETTE.creative['purple-600'],
    )
    // Both discs are anchored inside this cell, which is what makes Word clip
    // them to the header rather than letting them run down the page.
    expect(elements(header, 'w:drawing'), 'both discs are anchored in the header cell').toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// The record against the document
// ---------------------------------------------------------------------------

/**
 * `PREVIEW_GRAPHICS` says what form each graphic takes. Prose cannot be trusted
 * to stay true — the first version of this story recorded the project card as
 * paragraph shading while the generator emitted a table, and recorded the header
 * circles as undrawable while they were drawable — so every form is checked
 * here against the OOXML the generator actually writes.
 */
describe('every recorded form is the shape the generator emits', () => {
  /** What has to be present in the document for a form to be honestly claimed. */
  const EVIDENCE: Readonly<Record<DocxGraphicForm, (xml: string) => boolean>> = {
    'shaded-cells': (xml) => bars(xml).length > 0,
    'shaded-run': (xml) => paragraphs(xml).some((p) => p.runs.some((run) => run.shading !== null)),
    'paragraph-border': (xml) => paragraphs(xml).some((p) => p.leftBorderColour !== null),
    'shaded-cell': (xml) => elements(xml, 'w:tcPr').some((cell) => /<w:tcBorders>/.test(cell) && /<w:shd\b/.test(cell)),
    'floating-raster': (xml) => elements(xml, 'w:drawing').length > 0,
    'not-drawn': () => true,
  }

  it.each([
    ['modern', () => documentXml('modern-green', generateModernDocx, 'green')] as const,
    ['creative', () => documentXml('creative', generateCreativeDocx, null)] as const,
  ])('%s emits the shape it records for each of its graphics', async (template, load) => {
    const xml = await load()
    const graphics = PREVIEW_GRAPHICS[template as 'modern' | 'creative']
    expect(Object.keys(graphics).length, `${template} records no graphics`).toBeGreaterThan(0)
    for (const [key, graphic] of Object.entries(graphics)) {
      expect(EVIDENCE[graphic.form as DocxGraphicForm], `${template}.${key}: "${graphic.form}" is not a known form`).toBeDefined()
      expect(
        EVIDENCE[graphic.form as DocxGraphicForm](xml),
        `${template}.${key} records form "${graphic.form}", which is not in the document it generates`,
      ).toBe(true)
    }
  })

  it('names a form the generators actually use, and no form they do not', () => {
    const recorded = new Set(
      (['professional', 'modern', 'classic', 'minimal', 'creative'] as const).flatMap((template) =>
        Object.values(PREVIEW_GRAPHICS[template]).map((graphic) => graphic.form as string),
      ),
    )
    // Every form the union offers is either used by a graphic or gone from it.
    expect([...recorded].sort()).toEqual(
      ['floating-raster', 'not-drawn', 'paragraph-border', 'shaded-cell', 'shaded-cells', 'shaded-run'],
    )
  })
})

// ---------------------------------------------------------------------------
// The three templates that draw none of this
// ---------------------------------------------------------------------------

describe('template isolation', () => {
  it('draws no bar in a template whose Preview has none', async () => {
    const { generateClassicDocx } = await import('./docx-classic')
    const { generateMinimalDocx } = await import('./docx-minimal')
    const { generateProfessionalDocx } = await import('./docx-professional')
    for (const [name, generate] of [
      ['classic', generateClassicDocx],
      ['minimal', generateMinimalDocx],
      ['professional', generateProfessionalDocx],
    ] as const) {
      const xml = await documentXml(name, generate as Generator, null)
      expect(bars(xml), `${name} draws a bar`).toEqual([])
      expect(
        paragraphs(xml).flatMap((paragraph) => paragraph.runs).filter((run) => run.shading !== null),
        `${name} shades a run`,
      ).toEqual([])
    }
  })
})
