import { readFileSync } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { resolveResumeLayout } from '@/lib/layout-settings'
import type { DocxGeneratorSettings } from './docx-helpers'
import { FONT_SIZES, generateProfessionalDocx } from './docx-professional'

/**
 * The Professional DOCX's geometry, pinned on the document Word opens.
 *
 * Each number below was measured against the Preview in Word's own render
 * (Word → PDF, compared line by line with the Preview's Chromium layout) and is
 * derived here from the Preview's CSS and the Windows font files, so a change
 * that moves one has to explain the new number. Px are CSS px at 96dpi: 1px is
 * 15 twips and 1.5 half-points.
 */

const SYSTEM_DEFAULT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

const MARK = {
  title: 'Geometry Title',
  name: 'Robin Geometry',
  plainAchievement: 'Plain achievement text.',
  formattedAchievement: 'Formatted achievement',
} as const

const SUMMARY = '<p>First <strong>bold</strong> paragraph.</p><p>Second paragraph.</p><ul><li>Listed <em>item</em></li></ul>'

function resumeRow(summary: string = SUMMARY) {
  return {
    title: MARK.title,
    contact: { name: MARK.name, email: 'robin@geometry.test', phone: '+41 00 000 0007' },
    summary,
    experience: [
      {
        company: 'Tessellate Freight',
        position: 'Kilnwright Engineer',
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
    projects: [{ name: 'Orbital Mapper', description: 'Orbital survey.', visible: true }],
    languages: [{ language: 'Esperanto', level: 'Fluent', visible: true }],
    certifications: [{ name: 'Typesetting Cert', issuer: 'Guild of Printers', date: '2003-05', visible: true }],
    custom_sections: {},
    layout_settings: null,
  }
}

interface Options {
  summary?: string
  fontFamily?: string
  fontScale?: number
  locale?: string
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
    locale: options.locale ?? 'en',
    sidebarHue: layout.sidebarHue,
    sidebarSaturation: layout.sidebarSaturation,
    sidebarBrightness: layout.sidebarBrightness,
    sidebarWidth: layout.sidebarWidth,
    sidebarTopMargin: layout.sidebarTopMargin,
    mainContentTopMargin: layout.mainContentTopMargin,
    sidebarOrder: [...layout.sidebarOrder],
    mainContentOrder: [...layout.mainContentOrder],
    hiddenSidebarSections: [...layout.hiddenSidebarSections],
    hiddenMainSections: [...layout.hiddenMainSections],
  }
}

interface Artifact {
  document: string
  styles: string
  settings: string
}

const artifacts = new Map<string, Promise<Artifact>>()

function artifact(options: Options = {}): Promise<Artifact> {
  const key = JSON.stringify(options)
  let found = artifacts.get(key)
  if (!found) {
    found = (async () => {
      const row = resumeRow(options.summary)
      const zip = await JSZip.loadAsync(await generateProfessionalDocx(row, settingsFor(row, options)))
      const read = async (name: string) => {
        const part = zip.file(name)
        if (part === null) throw new Error(`The artifact has no ${name}`)
        return part.async('string')
      }
      return {
        document: await read('word/document.xml'),
        styles: await read('word/styles.xml'),
        settings: await read('word/settings.xml'),
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
    })),
  }))
}

/** The one paragraph whose text satisfies `match`. */
function paragraph(documentXml: string, match: (text: string) => boolean): Paragraph {
  const found = paragraphsOf(documentXml).filter((p) => match(p.text))
  expect(found.map((p) => p.text), 'paragraphs matched').toHaveLength(1)
  return found[0]
}

const starting = (prefix: string) => (text: string) => text.startsWith(prefix)

/** The one run whose text satisfies `match`, in the paragraph that holds it. */
function run(documentXml: string, match: (text: string) => boolean): Run {
  const found = paragraphsOf(documentXml).flatMap((p) => p.runs).filter((r) => match(r.text))
  expect(found.map((r) => r.text), 'runs matched').toHaveLength(1)
  return found[0]
}

const positionOf = (properties: string) => attribute(properties, 'w:position', 'w:val')
const runDefaults = (styles: string) => /<w:rPrDefault>([\s\S]*?)<\/w:rPrDefault>/.exec(styles)?.[1] ?? ''
const isBold = (properties: string) => /<w:b\/>/.test(properties)

describe('professional DOCX geometry', () => {
  it('writes Word 2010 layout, which stretches justified lines but never shrinks their spaces as the browser does', async () => {
    const { settings } = await artifact()
    expect(attribute(settings, 'w:compatSetting', 'w:val')).toBe('14')
    expect(attribute(settings, 'w:compatSetting', 'w:name')).toBe('compatibilityMode')
  })

  describe('baseline raise: Word sets the baseline 0.8 of an exact line down, the browser centres the font', () => {
    it('raises body text, by default, for its 1.35 line (Arial 11px)', async () => {
      // Word line 1.35 × 16.5 half-points = 223 twips = 14.87px, baseline 0.8 × 14.87 = 11.89px.
      // Preview: ascent round(1854/2048 × 11) = 10, descent round(434/2048 × 11) = 2,
      // floor(10 + (14.85 − 12) / 2) = 11px. Raise 0.89px = 1.34 half-points → 1 → 0.5pt.
      const { styles, document } = await artifact()
      expect(positionOf(runDefaults(styles))).toBe('0.5pt')
      expect(positionOf(run(document, (t) => t === MARK.plainAchievement).properties), 'plain text inherits it').toBeNull()
    })

    it('raises formatted (HTML) text for its own 1.4 line, bullet included', async () => {
      // Word line 1.4 × 16.5 = 231 twips = 15.4px → 12.32px; Preview floor(10 + (15.4 − 12) / 2) = 11.
      // Raise 1.32px = 1.98 half-points → 2 → 1pt.
      const { document } = await artifact()
      const achievement = paragraph(document, (t) => t.includes(MARK.formattedAchievement))
      expect(achievement.runs.map((r) => [r.text, positionOf(r.properties)])).toEqual([
        ['•\t', '1pt'],
        [`${MARK.formattedAchievement} `, '1pt'],
        ['halved', '1pt'],
        [' it.', '1pt'],
      ])
      expect(positionOf(run(document, (t) => t === 'Second paragraph.').properties)).toBe('1pt')
    })

    it('raises the 22px name for its heading line', async () => {
      // Word line 1.2 × 33 = 396 twips = 26.4px → 21.12px; Preview ascent 20, descent 5,
      // floor(20 + (26.4 − 25) / 2) = 20. Raise 1.12px = 1.68 half-points → 2 → 1pt.
      const { document } = await artifact()
      expect(positionOf(run(document, (t) => t === MARK.name).properties)).toBe('1pt')
    })
  })

  describe('font resolution', () => {
    it('writes and measures Segoe UI for "System Default", the family the browser draws on Windows', async () => {
      const { styles, document } = await artifact({ fontFamily: SYSTEM_DEFAULT })
      expect(attribute(runDefaults(styles), 'w:rFonts', 'w:ascii')).toBe('Segoe UI')
      expect(document).not.toMatch(/apple-system|BlinkMacSystemFont/)
      expect(attribute(run(document, (t) => t === MARK.name).properties, 'w:rFonts', 'w:ascii')).toBe('Segoe UI')
      // Segoe UI's own metrics: ascent round(2210/2048 × 22) = 24, descent round(514/2048 × 22) = 6,
      // floor(24 + (26.4 − 30) / 2) = 22 against Word's 21.12px. Raise −0.88px → −1 half-point.
      expect(positionOf(run(document, (t) => t === MARK.name).properties)).toBe('-0.5pt')
    })

    it('keeps an unknown family as written and raises nothing rather than by another font', async () => {
      const { styles, document } = await artifact({ fontFamily: '"Comic Sans MS", cursive' })
      expect(attribute(runDefaults(styles), 'w:rFonts', 'w:ascii')).toBe('Comic Sans MS')
      const positions = [...`${styles}${document}`.matchAll(/<w:position w:val="([^"]*)"\/>/g)].map(([, value]) => value)
      expect(positions.length).toBeGreaterThan(0)
      expect(new Set(positions)).toEqual(new Set(['0pt']))
    })
  })

  describe('width scale (w:w): each rounded run drawn at the Preview px size', () => {
    it('scales 11px body text, written as 17 half-points, to 16.5', async () => {
      const { styles, document } = await artifact()
      expect(attribute(runDefaults(styles), 'w:sz', 'w:val')).toBe('17')
      expect(attribute(runDefaults(styles), 'w:w', 'w:val')).toBe('97') // 100 × 16.5 / 17
      expect(attribute(run(document, (t) => t === MARK.name).properties, 'w:w', 'w:val')).toBe('100') // 33 / 33
      expect(attribute(run(document, (t) => t === 'Key Achievements').properties, 'w:w', 'w:val')).toBe('99') // 21.75 / 22
    })

    it('writes the body scale on every run of a formatted (HTML) block, list marker included', async () => {
      const { styles, document } = await artifact()
      const body = attribute(runDefaults(styles), 'w:w', 'w:val')
      const blocks = ['First bold paragraph.', 'Second paragraph.', '•\tListed item'].map((text) => paragraph(document, (t) => t === text))
      const scales = blocks.flatMap((block) => block.runs.map((r) => attribute(r.properties, 'w:w', 'w:val')))
      expect(scales.length).toBeGreaterThan(blocks.length)
      expect(new Set(scales)).toEqual(new Set([body]))
    })

    it('follows the font scale', async () => {
      const { styles } = await artifact({ fontScale: 1.1 })
      // 12.1px = 18.15 half-points, written 18: 100 × 18.15 / 18 = 100.8.
      expect(attribute(runDefaults(styles), 'w:sz', 'w:val')).toBe('18')
      expect(attribute(runDefaults(styles), 'w:w', 'w:val')).toBe('101')
    })
  })

  it('draws each heading rule as 2pt of space and a size-6 rule, the rest of pb-1 + 1px in the space after', async () => {
    // pb-1 + border = 5px = 75 twips; Word: 2pt = 40 twips of border space + a 6/8pt = 15-twip rule. 75 − 55 = 20.
    const { document } = await artifact()
    const sidebar = paragraph(document, (t) => t === 'Key Achievements')
    const main = paragraph(document, (t) => t === 'Experience')
    for (const heading of [sidebar, main]) {
      expect(attribute(heading.properties, 'w:bottom', 'w:sz')).toBe('6')
      expect(attribute(heading.properties, 'w:bottom', 'w:space')).toBe('2')
    }
    expect(attribute(sidebar.properties, 'w:spacing', 'w:after')).toBe(String(16 * 15 + 20)) // mb-4
    expect(attribute(main.properties, 'w:spacing', 'w:after')).toBe(String(12 * 15 + 20)) // SECTION_GAP 12px
  })

  it('lays the contact row as flex-wrap with gap-x-4, gap-1.5 and gap-y-1', async () => {
    const { document } = await artifact()
    const row = paragraph(document, (t) => t.includes('robin@geometry.test'))
    // Each line: 1.35 × 15.75 half-points = 213 twips, + the 4px row gap; the gap is taken back once from the
    // space after: pb-6 (24px) + mainContentTopMargin (24px) = 720 twips − 60.
    expect(attribute(row.properties, 'w:spacing', 'w:line')).toBe(String(213 + 60))
    expect(attribute(row.properties, 'w:spacing', 'w:after')).toBe(String(720 - 60))
    // Arial 10.5px space = 569/2048 × 10.5 = 2.92px: 16px gap → 13.08px = 196 twips; 6px → 3.08px = 46 twips.
    const between = row.runs.filter((r) => r.text === ' ')
    expect(between.map((r) => attribute(r.properties, 'w:spacing', 'w:val'))).toEqual(['196'])
    const iconGaps = row.runs.filter((r) => r.text === '\u00A0')
    expect(iconGaps.map((r) => attribute(r.properties, 'w:spacing', 'w:val'))).toEqual(['46', '46'])
    expect(textOf(row.runs.map((r) => `<w:t>${r.text}</w:t>`).join(''))).toContain('+41\u00A000\u00A0000\u00A00007')
  })

  it('gives both cells the sidebar top margin and turns the main column extra p-8 into space before', async () => {
    const { document } = await artifact()
    const margins = [...document.matchAll(/<w:tcMar>([\s\S]*?)<\/w:tcMar>/g)].map(([, m]) => m)
    expect(margins).toHaveLength(2)
    expect(margins.map((m) => attribute(m, 'w:top', 'w:w'))).toEqual(['360', '360']) // p-6 = 24px
    expect(['left', 'right', 'bottom'].map((side) => attribute(margins[1], `w:${side}`, 'w:w'))).toEqual(['480', '480', '480']) // p-8
    expect(attribute(paragraph(document, (t) => t === MARK.title).properties, 'w:spacing', 'w:before')).toBe(String(480 - 360))
  })

  it('ends right-aligned dates and language levels on their column text edge', async () => {
    const { document } = await artifact()
    const [sidebarWidth, mainWidth] = [...document.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(([, w]) => Number(w))
    const tabOf = (match: (text: string) => boolean) => Number(attribute(paragraph(document, match).properties, 'w:tab', 'w:pos'))
    expect(tabOf(starting('Kilnwright Engineer'))).toBe(mainWidth - 2 * 480)
    expect(tabOf(starting('Magister in Chromatics'))).toBe(mainWidth - 2 * 480)
    expect(tabOf(starting('Esperanto'))).toBe(sidebarWidth - 2 * 360)
  })

  it('hangs experience bullets: the text starts at the bullet advance + gap-2, on every line', async () => {
    // Arial "•" advance 717/2048 × 11px = 3.85px, + 8px = 11.85px = 178 twips.
    const { document } = await artifact()
    const plain = paragraph(document, (t) => t.includes(MARK.plainAchievement))
    const formatted = paragraph(document, (t) => t.includes(MARK.formattedAchievement))
    for (const p of [plain, formatted]) {
      expect(attribute(p.properties, 'w:ind', 'w:left')).toBe('178')
      expect(attribute(p.properties, 'w:ind', 'w:hanging')).toBe('178')
      expect(p.runs[0].text).toBe('•\t')
    }
    // Plain text renders through formatText's justified div, HTML through .formatted-content (start).
    expect(attribute(plain.properties, 'w:jc', 'w:val')).toBe('both')
    expect(attribute(formatted.properties, 'w:jc', 'w:val')).toBe('left')
  })

  it('keeps every paragraph and list item of formatted HTML, at 1.4 with no gap between them', async () => {
    const { document } = await artifact()
    const first = paragraph(document, (t) => t === 'First bold paragraph.')
    const second = paragraph(document, (t) => t === 'Second paragraph.')
    const item = paragraph(document, (t) => t === '•\tListed item')
    for (const p of [first, second, item]) {
      expect(attribute(p.properties, 'w:spacing', 'w:line')).toBe('231')
      expect(attribute(p.properties, 'w:jc', 'w:val'), 'the summary is text-justify').toBe('both')
    }
    expect([first, second].map((p) => attribute(p.properties, 'w:spacing', 'w:after'))).toEqual(['0', '0'])
    expect(attribute(item.properties, 'w:spacing', 'w:after'), 'mb-8 after the section').toBe(String(32 * 15))
    // `.formatted-content ul { margin-left: 1.25rem }`; the marker hangs 13/11 em (13px at 11px) before the text.
    expect(attribute(item.properties, 'w:ind', 'w:left')).toBe('300')
    expect(attribute(item.properties, 'w:ind', 'w:hanging')).toBe('195')
    expect(isBold(first.runs.find((r) => r.text === 'bold')?.properties ?? ''), '<strong> is bold').toBe(true)
    expect(/<w:i\/>/.test(item.runs.find((r) => r.text === 'item')?.properties ?? ''), '<em> is italic').toBe(true)
  })

  it('splits formatted HTML as the browser lays it out: inherited alignment, <br> lines, tags with attributes', async () => {
    const { document } = await artifact({
      summary:
        '<div style="text-align: center"><p>Centred line</p><p style="text-align: right">Right line</p></div>' +
        '<p>After<br><br>gap</p><ul><li><b class="x">Classed</b> bold</li></ul>',
    })
    const alignmentOf = (text: string) => attribute(paragraph(document, (t) => t === text).properties, 'w:jc', 'w:val')
    expect(alignmentOf('Centred line'), 'a <p> inherits its <div>').toBe('center')
    expect(alignmentOf('Right line'), 'its own text-align wins').toBe('right')
    expect(alignmentOf('After'), 'outside the <div>: the summary is text-justify').toBe('both')
    // `After<br><br>gap`: the second <br> ends an empty line, which the browser draws one line tall.
    const texts = paragraphsOf(document).map((p) => p.text)
    const after = texts.indexOf('After')
    expect(texts.slice(after, after + 3)).toEqual(['After', '', 'gap'])
    expect(attribute(paragraphsOf(document)[after + 1].properties, 'w:spacing', 'w:line')).toBe('231')
    expect(isBold(run(document, (t) => t === 'Classed').properties), 'a <b> with attributes is still bold').toBe(true)
  })

  it('keeps unbalanced HTML from mis-aligning the blocks after it, as the browser parser does', async () => {
    const { document } = await artifact({
      summary:
        '<div style="text-align: center"><p>Centred</div><p>After the div</p></div>' +
        '<p>Unclosed paragraph<p style="text-align: right">Right after it<ul><li>One<li>Two</ul><p>Tail</p>',
    })
    const p = (text: string) => paragraph(document, (t) => t === text)
    const alignmentOf = (text: string) => attribute(p(text).properties, 'w:jc', 'w:val')
    expect(alignmentOf('Centred'), 'inside the div').toBe('center')
    // </div> closes the unclosed <p> with it; the second </div> has nothing open and is ignored.
    expect(alignmentOf('After the div')).toBe('both')
    expect(alignmentOf('Unclosed paragraph')).toBe('both')
    // The next <p> closes the unclosed one instead of nesting in it; <ul> closes the right-aligned <p>.
    expect(alignmentOf('Right after it')).toBe('right')
    for (const item of ['•\tOne', '•\tTwo']) {
      expect(alignmentOf(item), `${item}: the list is not inside the right-aligned <p>`).toBe('both')
      expect(attribute(p(item).properties, 'w:ind', 'w:left'), `${item}: one list deep, not nested in "One"`).toBe('300')
    }
    expect(alignmentOf('Tail')).toBe('both')
    expect(attribute(p('Tail').properties, 'w:ind', 'w:left'), 'the list is closed').toBeNull()
  })

  it('draws the education field bold, skill lists left-aligned and headings capitalized, as the Preview does', async () => {
    const { document } = await artifact()
    expect(isBold(run(document, (t) => t === ' in Chromatics').properties)).toBe(true)
    expect(attribute(paragraph(document, (t) => t === 'Zanzibarscript • Rust').properties, 'w:jc', 'w:val')).toBe('left')
    const fr = await artifact({ locale: 'fr' })
    // fr "Réalisations clés", drawn by `text-transform: capitalize`.
    expect(paragraph(fr.document, (t) => t.startsWith('Réalisations')).text).toBe('Réalisations Clés')
  })
})

/**
 * The spacing tests pin the Preview's sizes as literals; this keeps the
 * generator's own table from drifting away from the template it stands for.
 * The template's constants are module-private, so they are read from its source.
 */
describe('professional DOCX font sizes', () => {
  it('are the sizes professional-template.tsx draws', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/dashboard/resume-templates/professional-template.tsx'),
      'utf8',
    )
    // Every `X_FONT_SIZE * fontScale` the template draws with, and the value it declares.
    const used = [...source.matchAll(/=\s*([A-Z_]+)_FONT_SIZE \* fontScale/g)].map(([, name]) => name)
    expect(used.length).toBeGreaterThan(0)
    const declared = Object.fromEntries(
      used.map((name) => {
        const value = new RegExp(`const ${name}_FONT_SIZE = ([\\d.]+)`).exec(source)?.[1]
        expect(value, `${name}_FONT_SIZE is declared as a number`).toBeDefined()
        return [name, Number(value)]
      }),
    )
    expect(FONT_SIZES).toEqual(declared)
  })
})
