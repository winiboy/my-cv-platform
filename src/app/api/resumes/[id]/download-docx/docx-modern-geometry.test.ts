import { readFileSync } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { resolveResumeLayout } from '@/lib/layout-settings'
import type { DocxGeneratorSettings } from './docx-helpers'
import { FONT_SIZES, generateModernDocx, UNSCALED_FONT_SIZES } from './docx-modern'
import { solidColourPng } from './docx-disc'
import { baselineRaise, PREVIEW_FONT_METRICS, resolvePreviewFont } from './docx-preview-metrics'

/**
 * The Modern DOCX's geometry, pinned on the document Word opens.
 *
 * Each number below was measured against the Modern Preview in Word's own
 * render (Word → PDF, compared line by line with the Preview's Chromium layout;
 * method in `docs/engineering/docx-word-parity.md`) and is derived here from the Preview's CSS
 * (`modern-template.tsx`) and the Windows font files, so a change that moves
 * one has to explain the new number. Px are CSS px at 96dpi: 1px is 15 twips
 * and 1.5 half-points. The default layout draws Arial at scale 1, a 24px name,
 * 14px running text, a 30% sidebar, sidebarTopMargin 64 and
 * mainContentTopMargin 24, on an A4 page of 11908 × 16838 twips (sidebar 3572).
 */

const MARK = {
  title: 'Geometry Title',
  name: 'Robin Geometry',
  plainAchievement: 'Plain achievement text.',
  formattedAchievement: 'Formatted achievement',
  linkedin: 'linkedin.com/in/robin-geo',
} as const

const SUMMARY = '<p>First <strong>bold</strong> paragraph.</p><p>Second paragraph.</p><ul><li>Listed <em>item</em></li></ul>'

function resumeRow() {
  return {
    title: MARK.title,
    contact: { name: MARK.name, email: 'robin@geometry.test', linkedin: MARK.linkedin, location: 'Leadville' },
    summary: SUMMARY,
    experience: [
      {
        company: 'Tessellate Freight',
        position: 'Kilnwright Engineer',
        location: 'Oxbridge',
        startDate: '2011-03',
        current: true,
        achievements: [MARK.plainAchievement, `<p>${MARK.formattedAchievement} <strong>halved</strong> it.</p>`],
        visible: true,
      },
    ],
    education: [
      { school: 'Halvorsen Institute', degree: 'Magister', field: 'Chromatics', startDate: '1997-09', endDate: '1999-06', visible: true },
    ],
    skills: [{ category: 'Toolchain', items: ['Zanzibarscript', 'Rust'], visible: true }],
    projects: [{ name: 'Orbital Mapper', description: 'Orbital survey.', technologies: ['Go', 'Rust'], visible: true }],
    languages: [{ language: 'Esperanto', level: 'Fluent', visible: true }],
    certifications: [{ name: 'Typesetting Cert', issuer: 'Guild of Printers', date: '2003-05', visible: true }],
    custom_sections: {},
    layout_settings: null,
  }
}

interface Options {
  fontFamily?: string
  fontScale?: number
  sidebarTopMargin?: number
  mainContentTopMargin?: number
  photoBase64?: string
  sidebarWidth?: number
  /** `false` drops the contact's address line. */
  location?: false
  /** Replaces the formatted summary. */
  summary?: string
}

/** The generator settings `route.ts` builds from the resolved (default) layout, with the options applied. */
function settingsFor(row: ReturnType<typeof resumeRow>, options: Options): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row, null)
  return {
    fontFamily: options.fontFamily ?? layout.fontFamily,
    fontScale: options.fontScale ?? layout.fontScale,
    titleFontSize: layout.titleFontSize,
    contactFontSize: layout.contactFontSize,
    sectionTitleFontSize: layout.sectionTitleFontSize,
    sectionDescFontSize: layout.sectionDescFontSize,
    locale: 'en',
    sidebarHue: layout.sidebarHue,
    sidebarSaturation: layout.sidebarSaturation,
    sidebarBrightness: layout.sidebarBrightness,
    sidebarWidth: options.sidebarWidth ?? layout.sidebarWidth,
    sidebarTopMargin: options.sidebarTopMargin ?? layout.sidebarTopMargin,
    mainContentTopMargin: options.mainContentTopMargin ?? layout.mainContentTopMargin,
    sidebarOrder: [...layout.sidebarOrder],
    mainContentOrder: [...layout.mainContentOrder],
    hiddenSidebarSections: [...layout.hiddenSidebarSections],
    hiddenMainSections: [...layout.hiddenMainSections],
    photoBase64: options.photoBase64,
  }
}

interface Artifact {
  document: string
  settings: string
  header: string
  media: Buffer[]
}

const artifacts = new Map<string, Promise<Artifact>>()

function artifact(options: Options = {}): Promise<Artifact> {
  const key = JSON.stringify(options)
  let found = artifacts.get(key)
  if (!found) {
    found = (async () => {
      const row = resumeRow()
      if (options.location === false) row.contact = { ...row.contact, location: '' }
      if (options.summary !== undefined) row.summary = options.summary
      const zip = await JSZip.loadAsync(await generateModernDocx(row, settingsFor(row, options)))
      const read = async (name: string) => {
        const part = zip.file(name)
        if (part === null) throw new Error(`The artifact has no ${name}`)
        return part.async('string')
      }
      // `word/media/` is itself an entry in the zip; only its files are parts.
      const media = await Promise.all(
        Object.values(zip.files)
          .filter((entry) => !entry.dir && entry.name.startsWith('word/media/'))
          .map((entry) => entry.async('nodebuffer'))
      )
      return {
        document: await read('word/document.xml'),
        settings: await read('word/settings.xml'),
        header: await read('word/header1.xml'),
        media,
      }
    })()
    artifacts.set(key, found)
  }
  return found
}

const textOf = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, text]) => text).join('')
const attribute = (fragment: string, element: string, name: string) =>
  new RegExp(`<${element}\\b[^>]*\\s${name}="([^"]*)"`).exec(fragment)?.[1] ?? null

interface Run {
  text: string
  properties: string
  xml: string
}

interface Paragraph {
  text: string
  /** The paragraph properties, without the paragraph mark's own run properties. */
  properties: string
  runs: Run[]
}

function paragraphsOf(documentXml: string): Paragraph[] {
  return [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(([, content]) => ({
    text: textOf(content),
    properties: (/^<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(content)?.[1] ?? '').replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, ''),
    runs: [...content.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map(([, run]) => ({
      text: textOf(run),
      properties: /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? '',
      xml: run,
    })),
  }))
}

/** The one paragraph whose text satisfies `match`. */
function paragraph(documentXml: string, match: (text: string) => boolean): Paragraph {
  const found = paragraphsOf(documentXml).filter((p) => match(p.text))
  expect(found.map((p) => p.text), 'paragraphs matched').toHaveLength(1)
  return found[0]
}

const exactly = (text: string) => (t: string) => t === text
const containing = (text: string) => (t: string) => t.includes(text)

/** The properties of the innermost table cell holding `text`. */
function cellOf(documentXml: string, text: string): string {
  const at = documentXml.indexOf(`>${text}<`)
  expect(at, `"${text}" is in the document`).toBeGreaterThan(-1)
  const cell = documentXml.lastIndexOf('<w:tc>', at)
  return /^<w:tc><w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(documentXml.slice(cell))?.[1] ?? ''
}

/** The `<w:tr>` holding `text`, from its start to the text. */
function rowOf(documentXml: string, text: string): string {
  const at = documentXml.indexOf(`>${text}<`)
  return documentXml.slice(documentXml.lastIndexOf('<w:tr>', at), at)
}

const margin = (cellProperties: string, side: 'top' | 'bottom' | 'left' | 'right') =>
  Number(attribute(/<w:tcMar>([\s\S]*?)<\/w:tcMar>/.exec(cellProperties)?.[1] ?? '', `w:${side}`, 'w:w'))

const spacing = (p: Paragraph, name: 'before' | 'after' | 'line') => {
  const value = attribute(p.properties, 'w:spacing', `w:${name}`)
  return value === null ? null : Number(value)
}
const runProperty = (run: Run, element: string) => attribute(run.properties, element, 'w:val')

const PAGE_TWIPS = 11908
const SIDEBAR_TWIPS = 3572

describe('modern DOCX geometry', () => {
  it('lays out in Word 2010 mode, so justified lines break where the browser breaks them', async () => {
    const { settings } = await artifact()
    expect(settings).toContain('<w:compatSetting w:val="14" w:name="compatibilityMode"')
  })

  it('gives both cells of the row a top margin of 0, the main cell p-8 at the sides and no bottom margin', async () => {
    const { document } = await artifact()
    expect(document).toContain(`<w:gridCol w:w="${SIDEBAR_TWIPS}"/><w:gridCol w:w="${PAGE_TWIPS - SIDEBAR_TWIPS}"/>`)
    const sidebar = /<w:tcW w:type="dxa" w:w="3572"\/>[\s\S]*?<w:tcMar>([\s\S]*?)<\/w:tcMar>/.exec(document)?.[1] ?? ''
    const main = /<w:tcW w:type="dxa" w:w="8336"\/>[\s\S]*?<w:tcMar>([\s\S]*?)<\/w:tcMar>/.exec(document)?.[1] ?? ''
    for (const side of ['top', 'left', 'bottom', 'right']) {
      expect(attribute(sidebar, `w:${side}`, 'w:w'), `sidebar ${side}`).toBe('0')
    }
    expect([...['top', 'left', 'bottom', 'right'].map((side) => attribute(main, `w:${side}`, 'w:w'))]).toEqual(['0', '480', '0', '480'])
  })

  it('starts the main column at its top padding: mainContentTopMargin, or p-8 when it is not positive', async () => {
    const name = paragraph((await artifact()).document, exactly(MARK.name.toUpperCase()))
    expect([spacing(name, 'before'), spacing(name, 'line'), spacing(name, 'after')]).toEqual([24 * 15, 432, 8 * 15])
    const padded = paragraph((await artifact({ mainContentTopMargin: -10 })).document, exactly(MARK.name.toUpperCase()))
    expect(spacing(padded, 'before')).toBe(32 * 15)
  })

  it('starts the sidebar text below the 220px photo zone plus its top padding, in one paragraph', async () => {
    const first = (document: string) =>
      paragraphsOf(document.slice(document.indexOf('<w:tcW w:type="dxa" w:w="3572"/>')))[0]
    // 220 + 64 = 284px = 4260 twips, less the paragraph's own 1-twip line.
    const zone = first((await artifact()).document)
    expect([spacing(zone, 'after'), spacing(zone, 'line')]).toEqual([4259, 1])
    // sidebarTopMargin 0 falls back to p-8: 220 + 32 = 252px.
    expect(spacing(first((await artifact({ sidebarTopMargin: 0 })).document), 'after')).toBe(3779)
  })

  it('anchors a photo at the top-left of the sidebar cell, as wide as the sidebar and 220px tall', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const { document } = await artifact({ photoBase64: png })
    expect(document).toContain('<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>')
    // The sidebar cell's 3572 twips (238.13px), 635 EMU each; 220px at 9525 EMU each.
    expect(document).toContain(`<wp:extent cx="${SIDEBAR_TWIPS * 635}" cy="${220 * 9525}"/>`)
  })

  it('draws a real photo as wide as the sidebar cell at any sidebar width, cover-cropped to the zone', async () => {
    // 300 × 400 (3:4): the zone is wider than the photo, so cover keeps the full
    // width and trims top and bottom. Before PR #88 the zone was sized on an
    // 8.5in page, and Word drew the photo 7px past the sidebar's edge on A4.
    const photo = readFileSync(path.join(process.cwd(), 'e2e/fixtures/photo-portrait.jpg'))
    const photoBase64 = `data:image/jpeg;base64,${photo.toString('base64')}`
    for (const sidebarWidth of [25, 30, 40]) {
      const { document } = await artifact({ photoBase64, sidebarWidth })
      const cellTwips = Math.round(PAGE_TWIPS * (sidebarWidth / 100))
      expect(document).toContain(`<w:tcW w:type="dxa" w:w="${cellTwips}"/>`)
      const anchor = /<wp:anchor\b[\s\S]*?<\/wp:anchor>/.exec(document)?.[0] ?? ''
      expect(anchor).toContain('<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>')
      const cx = Number(attribute(anchor, 'wp:extent', 'cx'))
      const cy = Number(attribute(anchor, 'wp:extent', 'cy'))
      // Exactly the cell: a width rounded up to whole px ran past it.
      expect(cx, `${sidebarWidth}%`).toBe(cellTwips * 635)
      expect(cy).toBe(220 * 9525)
      // Cover: scaled to the zone's width, 220px of the scaled height kept, centred.
      const keptRows = (220 * 300) / (cellTwips / 15)
      const trim = Math.round(((400 - keptRows) / 2 / 400) * 100_000)
      expect(anchor, `${sidebarWidth}%`).toContain(`<a:srcRect l="0" t="${trim}" r="0" b="${trim}"/>`)
    }
  })

  it('draws a sidebar heading as a full-width shaded cell padded 6px 12px, then a 12px gap', async () => {
    const { document } = await artifact()
    const cell = cellOf(document, 'SKILLS')
    expect(attribute(cell, 'w:tcW', 'w:w')).toBe(String(SIDEBAR_TWIPS))
    expect(['top', 'bottom', 'left', 'right'].map((side) => margin(cell, side as 'top'))).toEqual([90, 90, 180, 180])
    expect(cell).toMatch(/<w:shd w:fill="[0-9A-F]{6}" w:color="auto" w:val="clear"\/>/)
    const heading = paragraph(document, exactly('SKILLS'))
    expect(spacing(heading, 'line'), '13px × 1.4').toBe(273)
    // The first whole paragraph after the heading's text: the gap after the banner table, carried before.
    const after = paragraphsOf(document.slice(document.indexOf('>SKILLS<')))[0]
    expect([after.text, spacing(after, 'before'), spacing(after, 'after'), spacing(after, 'line')]).toEqual(['', 12 * 15 - 1, 0, 1])
  })

  it('underlines a main heading with a 2px rule 6px below its line, then 12px', async () => {
    const heading = paragraph((await artifact()).document, exactly('SUMMARY'))
    expect(spacing(heading, 'line'), '16px × 1.4').toBe(336)
    expect([attribute(heading.properties, 'w:bottom', 'w:sz'), attribute(heading.properties, 'w:bottom', 'w:space')]).toEqual(['12', '4'])
    // 6 + 2 + 12px = 300 twips, less the 4pt (80) border space and the 1.5pt (30) rule.
    expect(spacing(heading, 'after')).toBe(190)
  })

  it('draws the job title as an inline box: shaded runs with 12px of padding, in a 24 + 8px line', async () => {
    const bar = paragraph((await artifact()).document, containing(MARK.title.toUpperCase()))
    expect(bar.properties, 'no paragraph shading: the box is as wide as its text').not.toContain('<w:shd')
    expect(spacing(bar, 'line')).toBe(32 * 15)
    expect(bar.runs.map((run) => run.text)).toEqual([' ', MARK.title.toUpperCase(), ' '])
    for (const run of bar.runs) expect(run.properties).toMatch(/<w:shd w:fill="[0-9A-F]{6}" w:color="auto" w:val="clear"\/>/)
    // 12px less Arial's 16px space (569/2048 em = 4.45px): 7.55px = 113 twips.
    expect(runProperty(bar.runs[0], 'w:spacing')).toBe('113')
    // Preview baseline 4 + floor(14 + (24 − 14 − 3) / 2) = 21px; Word's 0.8 × 32 = 25.6px; 4.6px = 3.5pt.
    expect(runProperty(bar.runs[1], 'w:position')).toBe('3.5pt')
  })

  it('writes the contact items as right-aligned text beside a 32px icon cell, centred, 10px apart', async () => {
    const { document } = await artifact()
    expect(document).toContain(`<w:gridCol w:w="${SIDEBAR_TWIPS - 960}"/><w:gridCol w:w="960"/>`)
    const text = cellOf(document, 'EMAIL')
    expect(attribute(text, 'w:vAlign', 'w:val')).toBe('center')
    expect([margin(text, 'left'), margin(text, 'right')]).toEqual([480, 150])
    expect(rowOf(document, 'EMAIL')).toContain('<w:trHeight w:val="480" w:hRule="atLeast"/>')
    expect(document).toContain('<w:trHeight w:val="150" w:hRule="exact"/>')
    const label = paragraph(document, exactly('EMAIL'))
    expect([attribute(label.properties, 'w:jc', 'w:val'), spacing(label, 'line')]).toEqual(['right', 210])
    const value = paragraph(document, exactly('robin@geometry.test'))
    expect([attribute(value.properties, 'w:jc', 'w:val'), spacing(value, 'line')]).toEqual(['right', 231])
  })

  it('keeps a contact value one word, so Word char-wraps it like break-all', async () => {
    const value = paragraph((await artifact()).document, exactly('linkedin.com/in/robingeo'))
    expect(value.runs[0].xml).toContain(
      '<w:t xml:space="preserve">linkedin.com/in/robin</w:t><w:noBreakHyphen/><w:t xml:space="preserve">geo</w:t>'
    )
  })

  it('sets a language row on one line, the level centred in it and tabbed to the sidebar text edge', async () => {
    const { document } = await artifact()
    const row = paragraph(document, containing('Esperanto'))
    expect(attribute(row.properties, 'w:tab', 'w:pos')).toBe(String(SIDEBAR_TWIPS - 480))
    expect(spacing(row, 'line'), '12px × 1.4').toBe(252)
    // The languages section's own 24px margin, not mb-8, carried before the next block.
    expect(spacing(row, 'after')).toBe(0)
    const gap = paragraphsOf(document.slice(document.indexOf('>\tFluent<')))[0]
    expect([gap.text, spacing(gap, 'before'), spacing(gap, 'line')]).toEqual(['', 24 * 15 - 1, 1])
    // Name: floor(11 + (16.8 − 14) / 2) = 12px vs 13.44px → 1pt. Level (11px, centred 0.7px lower):
    // 0.7 + floor(10 + (15.4 − 12) / 2) = 11.7px vs 13.44px → 1.5pt.
    expect(row.runs.map((run) => runProperty(run, 'w:position'))).toEqual(['1pt', '1.5pt'])
  })

  it('splits an experience row 40% + the 16px gap / the rest of the 491.7px text width', async () => {
    const { document } = await artifact()
    // 7376 twips of text; 40% is 2950, the left cell carries the gap as its right margin.
    expect(document).toContain('<w:gridCol w:w="3190"/><w:gridCol w:w="4186"/>')
    expect(margin(cellOf(document, 'KILNWRIGHT ENGINEER'), 'right')).toBe(240)
  })

  it('writes an experience date in years, as the Preview does', async () => {
    paragraph((await artifact()).document, exactly('2011 - Present'))
  })

  it('hangs an achievement after its bullet plus 6px; plain text justified, HTML left at its own line', async () => {
    const { document } = await artifact()
    const plain = paragraph(document, containing(MARK.plainAchievement))
    // Arial "•" at 14px is 717/2048 × 14 = 4.90px, + 6px = 10.90px = 164 twips.
    expect([attribute(plain.properties, 'w:ind', 'w:left'), attribute(plain.properties, 'w:ind', 'w:hanging')]).toEqual(['164', '164'])
    expect([attribute(plain.properties, 'w:jc', 'w:val'), spacing(plain, 'line')]).toEqual(['both', 315])
    expect(plain.runs[0].text).toBe('•\t')
    const formatted = paragraph(document, containing(MARK.formattedAchievement))
    expect([attribute(formatted.properties, 'w:jc', 'w:val'), spacing(formatted, 'line')]).toEqual(['left', 294])
    for (const run of formatted.runs.slice(1)) expect(run.properties, run.text).toContain('<w:i/>')
  })

  it('writes every block of a formatted summary, justified like its container, the list item indented', async () => {
    const { document } = await artifact()
    for (const text of ['First bold paragraph.', 'Second paragraph.']) {
      const block = paragraph(document, exactly(text))
      expect([attribute(block.properties, 'w:jc', 'w:val'), spacing(block, 'line'), spacing(block, 'after')]).toEqual(['both', 294, 0])
    }
    const item = paragraph(document, containing('Listed item'))
    // 20px list indent; the marker hangs 13/11 em of 14px = 16.5px.
    expect([attribute(item.properties, 'w:ind', 'w:left'), attribute(item.properties, 'w:ind', 'w:hanging')]).toEqual(['300', '248'])
    expect(spacing(item, 'after'), 'the section margin').toBe(24 * 15)
  })

  it('draws the project name and chips at their unscaled text-lg / text-xs sizes, at any font scale', async () => {
    for (const fontScale of [1, 1.2]) {
      const { document } = await artifact({ fontScale })
      const name = paragraph(document, containing('Orbital Mapper'))
      expect(spacing(name, 'line'), 'text-lg: 28px').toBe(28 * 15)
      expect(runProperty(name.runs[1], 'w:sz'), '18px').toBe('27')
      const chips = paragraph(document, containing('Go'))
      expect(spacing(chips, 'line'), 'text-xs 16px + py-1').toBe(24 * 15)
      expect(runProperty(chips.runs[1], 'w:sz'), '12px').toBe('18')
      // The project's pl-4 for every line.
      expect(attribute(chips.properties, 'w:ind', 'w:left')).toBe('240')
    }
  })

  it('scales each run back to the Preview advance (w:w) and raises it to the Preview baseline (w:position)', async () => {
    const { document } = await artifact()
    // 11px is 16.5 half-points, written 17: 97%. 13px → 19.5, written 20: 98%. 24px → 36: 100%.
    const skill = paragraph(document, exactly('Zanzibarscript')).runs[0]
    expect([runProperty(skill, 'w:sz'), runProperty(skill, 'w:w')]).toEqual(['17', '97'])
    const position = paragraph(document, exactly('KILNWRIGHT ENGINEER')).runs[0]
    expect([runProperty(position, 'w:sz'), runProperty(position, 'w:w')]).toEqual(['20', '98'])
    const name = paragraph(document, exactly(MARK.name.toUpperCase())).runs[0]
    // floor(22 + (28.8 − 27) / 2) = 22px vs 0.8 × 28.8 = 23.04px → 1pt.
    expect([runProperty(name, 'w:w'), runProperty(name, 'w:position')]).toEqual(['100', '1pt'])
  })

  it('scales and raises a plain-text list exactly like plain running text', async () => {
    // At scale 1.2 the 16.8px body is 25.2 half-points written as 25, so the scale is not the identity.
    const plain = paragraph((await artifact({ fontScale: 1.2, summary: 'Plain summary.' })).document, exactly('Plain summary.'))
    const reference = plain.runs[0].properties
    expect(runProperty(plain.runs[0], 'w:w')).toBe('101')
    expect(reference).toContain('<w:position ')
    const { document } = await artifact({ fontScale: 1.2, summary: 'Opening line\n\n- Alpha item\n- Beta item' })
    const list = [exactly('Opening line'), exactly('• Alpha item'), exactly('• Beta item')].map((match) => paragraph(document, match))
    for (const { runs } of list) {
      for (const run of runs) expect(run.properties, run.text).toBe(reference)
    }
  })

  it('writes the family the raise is computed for, and lays out a family it does not know as Arial throughout', async () => {
    const system = await artifact({ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' })
    expect(system.document).not.toContain('-apple-system')
    expect(system.document).toContain('w:ascii="Segoe UI"')
    // Raises, padding spaces and bullet hangs all come from one face's metrics:
    // the unknown family's document differs from Arial's in the family name only.
    const unknown = await artifact({ fontFamily: '"Unheard Of Sans", serif' })
    const arial = await artifact({ fontFamily: 'Arial, sans-serif' })
    expect(unknown.document).toContain('w:ascii="Unheard Of Sans"')
    expect(unknown.document.replaceAll('Unheard Of Sans', 'Arial')).toBe(arial.document)
    expect(unknown.document).toContain('<w:position w:val="1pt"/>')
  })

  it('carries the gap between two sidebar blocks before the lower one, so a block whose box fits stays on its page', async () => {
    const { document } = await artifact()
    // A skill name, then its 3px margin above the bar: the name has no space after.
    expect(spacing(paragraph(document, exactly('Zanzibarscript')), 'after')).toBe(0)
    const gap = paragraphsOf(document.slice(document.indexOf('>Zanzibarscript<')))[0]
    expect([gap.text, spacing(gap, 'before'), spacing(gap, 'after'), spacing(gap, 'line')]).toEqual(['', 3 * 15 - 1, 0, 1])
    // No sidebar text paragraph carries a space after: every gap is a gap paragraph's space before.
    const sidebar = document.slice(
      document.indexOf(`<w:tcW w:type="dxa" w:w="${SIDEBAR_TWIPS}"/>`),
      document.indexOf(`<w:tcW w:type="dxa" w:w="${PAGE_TWIPS - SIDEBAR_TWIPS}"/>`)
    )
    const spacedText = paragraphsOf(sidebar).filter((p) => p.text !== '' && (spacing(p, 'after') ?? 0) > 0)
    expect(spacedText.map((p) => p.text)).toEqual([])
  })

  it('keeps the header’s mb-6 after the title bar’s own space when there is no address line', async () => {
    // Word collapses a space after and the next paragraph's space before into the larger.
    const { document } = await artifact({ location: false })
    expect(spacing(paragraph(document, containing(MARK.title.toUpperCase())), 'after')).toBe(8 * 15)
    const gap = paragraphsOf(document.slice(document.indexOf(`>${MARK.title.toUpperCase()}<`)))[0]
    expect([gap.text, spacing(gap, 'before'), spacing(gap, 'after')]).toEqual(['', 0, 24 * 15 - 1])
  })

  it('is an A4 page of 16838 twips, the height of the page the product PDF is printed on', async () => {
    expect((await artifact()).document).toContain(`<w:pgSz w:w="${PAGE_TWIPS}" w:h="16838" w:orient="portrait"/>`)
  })

  it('fills the sidebar to the foot of every page with a drawing behind the text, in the header', async () => {
    const { document, header, media } = await artifact()
    expect(document).toMatch(/<w:headerReference w:type="default" r:id="[^"]+"\/>/)
    expect(attribute(header, 'wp:anchor', 'behindDoc')).toBe('1')
    expect(header).toContain('<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>')
    expect(header).toContain('<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>')
    // The sidebar's width and the page's height, at 635 EMU a twip.
    expect(header).toContain(`<wp:extent cx="${SIDEBAR_TWIPS * 635}" cy="${16838 * 635}"/>`)
    // In the sidebar cell's own colour.
    const fill = new RegExp(`<w:tcW w:type="dxa" w:w="${SIDEBAR_TWIPS}"/><w:shd w:fill="([0-9A-F]{6})"`).exec(document)?.[1]
    expect(fill, 'the sidebar cell fill').toBeDefined()
    expect(media.some((png) => png.equals(solidColourPng(fill ?? '')))).toBe(true)
  })
})

/**
 * The spacing tests pin the Preview's sizes as literals; this keeps the
 * generator's own tables from drifting away from the template they stand for.
 * `modern-template.tsx` writes each size inline (`${13 * activeScale}px`), so
 * each element is found in its source by what it renders, after `from` when
 * that text alone is not unique, and its size read from its own opening tag.
 */
describe('modern DOCX font sizes', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/components/dashboard/resume-templates/modern-template.tsx'), 'utf8')

  interface Element {
    renders: string
    from?: string
  }

  /** The opening tag that holds `renders`, from `<` to the text, and where it is in the source. */
  const openingTag = ({ renders, from }: Element) => {
    if (from !== undefined) expect(source.split(from), `"${from}" is unique`).toHaveLength(2)
    else expect(source.split(renders), `"${renders}" is unique`).toHaveLength(2)
    const start = from === undefined ? 0 : source.indexOf(from)
    const at = source.indexOf(renders, start)
    expect(at, `"${renders}" is drawn`).toBeGreaterThan(-1)
    const tagStart = source.lastIndexOf('<', at)
    const tag = source.slice(tagStart, at)
    expect(tag, `"${renders}" is the first content of its own element`).not.toMatch(/^<\//)
    return { tag, at: tagStart }
  }

  const SCALED_SIZE = /fontSize: `\$\{([\d.]+) \* (?:fontScale|activeScale)\}px`/g

  const SCALED: Record<keyof typeof FONT_SIZES, Element[]> = {
    JOB_TITLE_BAR: [{ renders: '{resume.title}' }],
    LOCATION: [{ from: '{/* Address line', renders: '{contact.location}' }],
    MAIN_SECTION_TITLE: [{ from: 'function MainSectionHeader', renders: '{title}' }],
    SIDEBAR_SECTION_TITLE: [{ from: 'function SidebarSectionHeader', renders: '{title}' }],
    EXPERIENCE_POSITION: [{ renders: '{exp.position}' }],
    EXPERIENCE_DATE: [{ from: '{exp.position}', renders: '{exp.startDate &&' }],
    EXPERIENCE_COMPANY: [{ renders: '{exp.company}' }],
    EXPERIENCE_LOCATION: [{ renders: '{exp.location}' }],
    CONTACT_LABEL: [{ from: 'function ContactItem', renders: '{label}' }],
    CONTACT_VALUE: [{ from: 'function ContactItem', renders: '{value}' }],
    EDUCATION_DEGREE: [{ renders: '{edu.degree}' }],
    EDUCATION_SCHOOL: [{ renders: '{edu.school}' }],
    SKILL_CATEGORY: [{ renders: '{skillCategory.category}' }],
    // A category's items, drawn one per line or as the rich text it was saved as.
    SKILL_ITEM: [{ renders: '{skillName}' }, { renders: '{renderFormattedText(skillCategory.skillsHtml)}' }],
    LANGUAGE_NAME: [{ renders: '{lang.language}' }],
    LANGUAGE_LEVEL: [{ from: '{lang.language}', renders: '{dict.resumes?.editor?.levels?.[lang.level' }],
    CERT_NAME: [{ renders: '{cert.name}' }],
    CERT_ISSUER: [{ renders: '{cert.issuer}' }],
    CERT_DATE: [{ from: '{cert.issuer}', renders: "{new Date(cert.date + '-01')" }],
  }

  it('are the sizes modern-template.tsx draws, and every scaled literal size it draws is one of them', () => {
    const claimed = new Set<number>()
    for (const [key, elements] of Object.entries(SCALED) as [keyof typeof FONT_SIZES, Element[]][]) {
      for (const element of elements) {
        const { tag, at } = openingTag(element)
        const sizes = [...tag.matchAll(SCALED_SIZE)]
        expect(sizes, `${key}: one scaled size on the element drawing ${element.renders}`).toHaveLength(1)
        expect(Number(sizes[0][1]), key).toBe(FONT_SIZES[key])
        claimed.add(at + (sizes[0].index ?? 0))
      }
    }
    // Where each size sits in the source: every one the template draws is claimed above.
    const drawn = [...source.matchAll(SCALED_SIZE)].map((m) => m.index)
    expect(drawn).toEqual([...claimed].sort((a, b) => a - b))
  })

  it('are the Tailwind sizes of the elements that set no inline size', () => {
    // Tailwind's default type scale, in px.
    const TAILWIND_FONT_PX: Readonly<Record<string, number>> = { 'text-xs': 12, 'text-sm': 14, 'text-base': 16, 'text-lg': 18, 'text-xl': 20 }
    const UNSCALED: Record<keyof typeof UNSCALED_FONT_SIZES, Element> = {
      PROJECT_NAME: { renders: '{project.name}' },
      TECHNOLOGY: { renders: '{tech}' },
    }
    for (const [key, element] of Object.entries(UNSCALED) as [keyof typeof UNSCALED_FONT_SIZES, Element][]) {
      const { tag } = openingTag(element)
      expect(tag, `${key}: no inline size`).not.toMatch(/fontSize/)
      const classes = [...tag.matchAll(/\b(text-(?:xs|sm|base|lg|xl))\b/g)].map(([, name]) => name)
      expect(classes, `${key}: one Tailwind size class`).toHaveLength(1)
      expect(TAILWIND_FONT_PX[classes[0]], key).toBe(UNSCALED_FONT_SIZES[key])
    }
  })
})

describe('baselineRaise', () => {
  it('is Word’s 0.8-of-the-line baseline less the browser’s, in whole half-points', () => {
    const arial = PREVIEW_FONT_METRICS.arial
    // 11px at 1.4 in a 231-twip line: browser floor(10 + 1.7) = 11px, Word 12.32px → 1.32px → 1pt.
    expect(baselineRaise(arial, 11, 1.4, 231)).toBe('1pt')
    // An offset moves the browser's baseline down by as much: 4px into a 480-twip line → 3.5pt (above).
    expect(baselineRaise(arial, 16, 1.5, 480, 4)).toBe('3.5pt')
    expect(baselineRaise(null, 11, 1.4, 231)).toBe('0pt')
  })

  it('resolves a stack to the first family Windows draws', () => {
    expect(resolvePreviewFont('Georgia, "Times New Roman", serif').name).toBe('Georgia')
    expect(resolvePreviewFont('-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif').name).toBe('Segoe UI')
    expect(resolvePreviewFont('"Unheard Of Sans", serif')).toEqual({ name: 'Unheard Of Sans', metrics: null })
  })
})
