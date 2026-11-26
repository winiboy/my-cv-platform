import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSfnt } from '@/test/font-tables'
import { SUPPLEMENTED_HYPHENS } from '@/lib/pdf/font-substitutes'
import { TRUETYPE_SFNT_VERSION, cmapGlyphId, decodeWoff } from '@/lib/pdf/sfnt'
import { INTER_DOCX_FACES, embedFontsSetting, interDocxFonts, loadInterDocxFonts, pairInterFaceEntries, wordTrueType } from './docx-fonts'

const FONTSOURCE_ROOT = path.join(process.cwd(), 'node_modules', '@fontsource')
const woffOf = (file: string) => readFileSync(path.join(FONTSOURCE_ROOT, 'inter', 'files', file))

/** The OS/2 weight class of a TrueType file. */
const weightClass = (font: Buffer) => (parseSfnt(font).tables.find(({ tag }) => tag === 'OS/2') as { data: Buffer }).data.readUInt16BE(4)

describe('wordTrueType, on the installed Inter faces', () => {
  it.each(INTER_DOCX_FACES.map(({ file }) => file))('%s becomes a TrueType (glyf) font with every table kept, but the cmap', (file) => {
    const source = decodeWoff(woffOf(file))
    const font = parseSfnt(wordTrueType(woffOf(file)))
    expect(font.sfntVersion).toBe(TRUETYPE_SFNT_VERSION)
    expect(font.tables.map(({ tag }) => tag)).toEqual([...source.keys()].sort())
    expect(font.tables.some(({ tag }) => tag === 'glyf')).toBe(true)
    for (const { tag, data } of font.tables) {
      if (tag === 'cmap' || tag === 'head') continue
      expect(data.equals(source.get(tag) as Buffer), tag).toBe(true)
    }
  })

  it.each(INTER_DOCX_FACES.map(({ file }) => file))('%s maps every code point it mapped, and the hyphens it lacked to its own hyphen', (file) => {
    const sourceCmap = decodeWoff(woffOf(file)).get('cmap') as Buffer
    const cmap = (parseSfnt(wordTrueType(woffOf(file))).tables.find(({ tag }) => tag === 'cmap') as { data: Buffer }).data
    const hyphen = cmapGlyphId(sourceCmap, 0x2d)
    expect(hyphen).toBeGreaterThan(0)
    // The subset lacks them: what this conversion exists for.
    for (const codePoint of SUPPLEMENTED_HYPHENS) expect(cmapGlyphId(sourceCmap, codePoint)).toBe(0)
    const disagreements: number[] = []
    for (let codePoint = 0; codePoint < 0xffff; codePoint++) {
      const expected = SUPPLEMENTED_HYPHENS.includes(codePoint) ? hyphen : cmapGlyphId(sourceCmap, codePoint)
      if (cmapGlyphId(cmap, codePoint) !== expected) disagreements.push(codePoint)
    }
    expect(disagreements).toEqual([])
  })

  it('refuses a font Word cannot embed: a WOFF holding CFF outlines', () => {
    const cff = Buffer.from(woffOf(INTER_DOCX_FACES[0].file))
    cff.writeUInt32BE(0x4f54544f, 4) // 'OTTO'
    expect(() => wordTrueType(cff)).toThrow()
  })
})

describe('loadInterDocxFonts', () => {
  it('gives Inter regular (400) then bold (700), both named Inter', async () => {
    const fonts = await loadInterDocxFonts(FONTSOURCE_ROOT)
    expect(fonts.map(({ name }) => name)).toEqual(['Inter', 'Inter'])
    expect(fonts.map(({ data }) => weightClass(data))).toEqual([400, 700])
  })

  it('is read once per server instance', async () => {
    expect(await interDocxFonts()).toBe(await interDocxFonts())
  })

  it('reads only files the Word route traces for its serverless bundle (next.config.js)', () => {
    const config = readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8')
    const traced = /"\/api\/resumes\/\*\/download-docx": \["\.\/node_modules\/@fontsource\/inter\/files\/inter-latin-\{([\d,]+)\}-normal\.woff"\]/.exec(config)
    expect(traced, 'the download-docx entry of outputFileTracingIncludes').not.toBeNull()
    const files = (traced as RegExpExecArray)[1].split(',').map((weight) => `inter-latin-${weight}-normal.woff`)
    expect(files).toEqual(INTER_DOCX_FACES.map(({ file }) => file))
  })
})

describe('pairInterFaceEntries', () => {
  const entry = (id: string, key: string) =>
    `<w:font w:name="Inter"><w:family w:val="auto"/><w:pitch w:val="variable"/><w:embedRegular r:id="${id}" w:fontKey="{${key}}"/></w:font>`
  const table = (...entries: string[]) => `<?xml version="1.0"?><w:fonts xmlns:w="w" xmlns:r="r">${entries.join('')}</w:fonts>`

  it('makes the second Inter entry the first one\'s bold face', () => {
    const paired = pairInterFaceEntries(table(entry('rId1', 'aaaa'), entry('rId2', 'bbbb')))
    expect(paired).toBe(
      table(
        '<w:font w:name="Inter"><w:family w:val="auto"/><w:pitch w:val="variable"/><w:embedRegular r:id="rId1" w:fontKey="{aaaa}"/>' +
          '<w:embedBold r:id="rId2" w:fontKey="{bbbb}"/></w:font>',
      ),
    )
  })

  it('keeps every other font entry as it is', () => {
    const georgia = '<w:font w:name="Georgia"><w:family w:val="roman"/></w:font>'
    const paired = pairInterFaceEntries(table(georgia, entry('rId1', 'a'), georgia, entry('rId2', 'b'), georgia))
    expect(paired.split(georgia)).toHaveLength(4)
    expect(paired.match(/<w:font w:name="Inter">/g)).toHaveLength(1)
  })

  it.each([
    ['no Inter entry', table()],
    ['one Inter entry', table(entry('rId1', 'a'))],
    ['three Inter entries', table(entry('rId1', 'a'), entry('rId2', 'b'), entry('rId3', 'c'))],
    ['an entry without a regular face', table(entry('rId1', 'a'), '<w:font w:name="Inter"><w:family w:val="auto"/></w:font>')],
  ])('refuses a font table with %s', (_label, xml) => {
    expect(() => pairInterFaceEntries(xml)).toThrow()
  })
})

describe('embedFontsSetting', () => {
  const settings = (children: string) => `<?xml version="1.0"?><w:settings xmlns:w="w" mc:Ignorable="w14">${children}</w:settings>`

  it('turns on "Embed fonts in the file" where the schema puts it: after the display settings, before the rest', () => {
    expect(embedFontsSetting(settings('<w:displayBackgroundShape/><w:evenAndOddHeaders w:val="false"/><w:compat/>'))).toBe(
      settings('<w:displayBackgroundShape/><w:embedTrueTypeFonts/><w:evenAndOddHeaders w:val="false"/><w:compat/>'),
    )
    expect(embedFontsSetting(settings('<w:zoom w:percent="100"/><w:compat/>'))).toBe(settings('<w:zoom w:percent="100"/><w:embedTrueTypeFonts/><w:compat/>'))
    expect(embedFontsSetting(settings('<w:compat/>'))).toBe(settings('<w:embedTrueTypeFonts/><w:compat/>'))
  })

  it('embeds whole faces: it does not ask Word to keep only the characters used', () => {
    expect(embedFontsSetting(settings('<w:compat/>'))).not.toContain('saveSubsetFonts')
  })

  it('refuses settings that already set it, or that are not settings', () => {
    expect(() => embedFontsSetting(settings('<w:embedTrueTypeFonts/>'))).toThrow()
    expect(() => embedFontsSetting('<w:document/>')).toThrow()
  })
})
