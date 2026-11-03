import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { advanceWidth, dataUrlBytes, parseSfnt, woff2UntransformedTables } from '@/test/font-tables'
import postcss from 'postcss'
import postcssNextFontPlugin from 'next/dist/build/webpack/loaders/next-font-loader/postcss-next-font'
import {
  FONT_SUBSTITUTES,
  INTER_FACE_STYLES,
  INTER_FONTSOURCE_PACKAGE,
  MAX_FONT_FAMILY_LENGTH,
  NEXT_FONT_INTER_FAMILY,
  SUBSTITUTE_FACE_STYLES,
  SUBSTITUTE_FAMILIES,
  SUPPLEMENTED_HYPHENS,
  excludeFromUnicodeRange,
  fontsourceStylesheetName,
  formatUnicodeRange,
  hyphenSupplement,
  loadFontSubstitutes,
  loadInterHyphenSupplements,
  nextFontInterFallbackFamily,
  parseFontFamilyList,
  parseFontsourceStylesheet,
  parseUnicodeRange,
  registerFontSubstitutes,
  unicodeRangeIncludes,
  type SubstituteFontFace,
} from './font-substitutes'
import { buildCmap, cmapGlyphId, decodeWoff, tableChecksum } from './sfnt'

const FONTSOURCE_ROOT = path.join(process.cwd(), 'node_modules', '@fontsource')

function readStylesheet(fontsourcePackage: string, stylesheet: string): string {
  return readFileSync(path.join(FONTSOURCE_ROOT, fontsourcePackage, stylesheet), 'utf8')
}

const HYPHEN_MINUS = 0x2d

describe('FONT_SUBSTITUTES', () => {
  it('stands in for exactly Arial, Calibri and Georgia, each with its metric-compatible family', () => {
    expect(FONT_SUBSTITUTES).toEqual([
      { family: 'Arial', fontsourcePackage: 'arimo' },
      { family: 'Calibri', fontsourcePackage: 'carlito' },
      { family: 'Georgia', fontsourcePackage: 'gelasio' },
    ])
    expect(SUBSTITUTE_FAMILIES).toEqual(['Arial', 'Calibri', 'Georgia'])
  })

  it('registers only the faces the replaced fonts have: 400 and 700, regular and italic', () => {
    expect(SUBSTITUTE_FACE_STYLES).toEqual([
      { weight: 400, style: 'normal' },
      { weight: 400, style: 'italic' },
      { weight: 700, style: 'normal' },
      { weight: 700, style: 'italic' },
    ])
    expect(SUBSTITUTE_FACE_STYLES.map(fontsourceStylesheetName)).toEqual([
      '400.css',
      '400-italic.css',
      '700.css',
      '700-italic.css',
    ])
  })

  it("is the package list next.config.js traces for the PDF route's function", () => {
    const config = readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8')
    const packages = FONT_SUBSTITUTES.map(({ fontsourcePackage }) => fontsourcePackage).join(',')
    expect(config).toContain(`./node_modules/@fontsource/{${packages}}/{400,400-italic,700,700-italic}.css`)
    expect(config).toContain(`./node_modules/@fontsource/{${packages}}/files/*-{400,700}-{normal,italic}.woff2`)
    expect(config).toContain(`./node_modules/@fontsource/{${packages}}/files/*-latin-{400,700}-{normal,italic}.woff`)
  })

  it("traces exactly the Inter stylesheets and latin WOFF files its supplements are built from", () => {
    const config = readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8')
    expect(INTER_FACE_STYLES.every(({ style }) => style === 'normal')).toBe(true)
    const weights = INTER_FACE_STYLES.map(({ weight }) => weight).join(',')
    expect(config).toContain(`./node_modules/@fontsource/${INTER_FONTSOURCE_PACKAGE}/{${weights}}.css`)
    expect(config).toContain(`./node_modules/@fontsource/${INTER_FONTSOURCE_PACKAGE}/files/inter-latin-{${weights}}-normal.woff`)
    for (const faceStyle of INTER_FACE_STYLES) {
      const faces = parseFontsourceStylesheet(readStylesheet(INTER_FONTSOURCE_PACKAGE, fontsourceStylesheetName(faceStyle)))
      const hyphenFaces = faces.filter((face) => unicodeRangeIncludes(face.unicodeRange, 0x2d))
      expect(hyphenFaces.map(({ woff }) => woff)).toEqual([`files/inter-latin-${faceStyle.weight}-normal.woff`])
    }
  })

  it('builds each hyphen supplement from a WOFF that trace list includes: the latin subset', () => {
    for (const { fontsourcePackage } of FONT_SUBSTITUTES) {
      for (const faceStyle of SUBSTITUTE_FACE_STYLES) {
        const faces = parseFontsourceStylesheet(readStylesheet(fontsourcePackage, fontsourceStylesheetName(faceStyle)))
        const hyphenFaces = faces.filter((face) => unicodeRangeIncludes(face.unicodeRange, 0x2d))
        expect(hyphenFaces.map(({ woff }) => woff)).toEqual([
          `files/${fontsourcePackage}-latin-${faceStyle.weight}-${faceStyle.style}.woff`,
        ])
      }
    }
  })
})

describe('parseFontsourceStylesheet', () => {
  const RULE = `/* arimo-latin-700-italic */
@font-face {
  font-family: 'Arimo';
  font-style: italic;
  font-display: swap;
  font-weight: 700;
  src: url(./files/arimo-latin-700-italic.woff2) format('woff2'), url(./files/arimo-latin-700-italic.woff) format('woff');
  unicode-range: U+0000-00FF,U+0131,U+2000-206F,U+FEFF,U+FFFD;
}`

  it('reads the weight, style, WOFF2 and WOFF files and unicode-range of every rule', () => {
    expect(parseFontsourceStylesheet(`${RULE}\n\n${RULE.replace(/latin/g, 'latin-ext')}`)).toEqual([
      {
        weight: 700,
        style: 'italic',
        woff2: 'files/arimo-latin-700-italic.woff2',
        woff: 'files/arimo-latin-700-italic.woff',
        unicodeRange: 'U+0000-00FF,U+0131,U+2000-206F,U+FEFF,U+FFFD',
      },
      {
        weight: 700,
        style: 'italic',
        woff2: 'files/arimo-latin-ext-700-italic.woff2',
        woff: 'files/arimo-latin-ext-700-italic.woff',
        unicodeRange: 'U+0000-00FF,U+0131,U+2000-206F,U+FEFF,U+FFFD',
      },
    ])
  })

  it.each([
    ['no weight', RULE.replace(/font-weight: 700;/, '')],
    ['no style', RULE.replace(/font-style: italic;/, '')],
    ['no unicode-range', RULE.replace(/unicode-range:[^;]*;/, '')],
    ['no WOFF2 source', RULE.replace(/url\(\.\/files\/arimo-latin-700-italic\.woff2\) format\('woff2'\), /, '')],
    ['no WOFF source', RULE.replace(/, url\(\.\/files\/arimo-latin-700-italic\.woff\) format\('woff'\)/, '')],
    ['a WOFF source outside the package files', RULE.replace('./files/arimo-latin-700-italic.woff)', '../../evil.woff)')],
    ['a source outside the package files', RULE.replace('./files/arimo-latin-700-italic.woff2', '../../evil.woff2')],
  ])('refuses a rule with %s rather than skipping it', (_label, css) => {
    expect(() => parseFontsourceStylesheet(css)).toThrow()
  })

  it('reads nothing from a stylesheet with no rule', () => {
    expect(parseFontsourceStylesheet('/* empty */')).toEqual([])
  })
})

describe('loadFontSubstitutes, from the installed packages', () => {
  it('returns every face of every substitute, latin subset included, as an inline WOFF2', async () => {
    const faces = await loadFontSubstitutes(FONTSOURCE_ROOT)

    for (const { family } of FONT_SUBSTITUTES) {
      for (const { weight, style } of SUBSTITUTE_FACE_STYLES) {
        const own = faces.filter((face) => face.family === family && face.weight === weight && face.style === style)
        expect(own.length, `${family} ${weight} ${style}`).toBeGreaterThan(0)
        // The subset holding Basic Latin and Latin-1: every CV in fr, en, de and it uses it.
        expect(own.some((face) => face.unicodeRange.startsWith('U+0000-00FF'))).toBe(true)
      }
    }
    for (const face of faces) {
      expect([400, 700]).toContain(face.weight)
      expect(['normal', 'italic']).toContain(face.style)
      if (face.unicodeRange === 'U+2010-2012') {
        // 00 01 00 00, the TrueType sfnt version, in base64.
        expect(face.source).toMatch(/^url\(data:font\/ttf;base64,AAEAA[A-Za-z0-9+/=]+\) format\('truetype'\)$/)
      } else {
        // "wOF2", the WOFF2 signature, in base64.
        expect(face.source).toMatch(/^url\(data:font\/woff2;base64,d09GMg[A-Za-z0-9+/=]+\) format\('woff2'\)$/)
      }
    }
  })

  it('serves each subset from its own WOFF2 file, with its range less only the supplemented hyphens', async () => {
    const faces = await loadFontSubstitutes(FONTSOURCE_ROOT)

    for (const { family, fontsourcePackage } of FONT_SUBSTITUTES) {
      for (const faceStyle of SUBSTITUTE_FACE_STYLES) {
        const stylesheetFaces = parseFontsourceStylesheet(readStylesheet(fontsourcePackage, fontsourceStylesheetName(faceStyle)))
        const own = faces.filter((face) => face.family === family && face.weight === faceStyle.weight && face.style === faceStyle.style)
        const subsets = own.filter((face) => face.source.startsWith('url(data:font/woff2;'))

        expect(subsets).toHaveLength(stylesheetFaces.length)
        stylesheetFaces.forEach(({ woff2 }, index) => {
          const file = readFileSync(path.join(FONTSOURCE_ROOT, fontsourcePackage, woff2))
          // Buffer.equals: a deep toEqual over every byte of every file is slow enough to time out.
          expect(dataUrlBytes(subsets[index].source).data.equals(file), woff2).toBe(true)
        })
        expect(subsets.map(({ unicodeRange }) => unicodeRange)).toEqual(
          stylesheetFaces.map(({ unicodeRange }) => excludeFromUnicodeRange(unicodeRange, SUPPLEMENTED_HYPHENS)),
        )
        // The latin subset gives up exactly the three hyphens; nothing else changes.
        expect(subsets.map(({ unicodeRange }) => unicodeRange)).toContain(
          'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-200F,U+2013-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
        )
        expect(own).toHaveLength(stylesheetFaces.length + 1)
      }
    }
  })

  it('fails when a package is missing, rather than printing without it', async () => {
    await expect(loadFontSubstitutes(path.join(FONTSOURCE_ROOT, 'does-not-exist'))).rejects.toThrow()
  })
})

describe('unicode-range helpers', () => {
  it('formats code points as terms, merging consecutive ones', () => {
    expect(formatUnicodeRange([0x2012, 0x2010, 0x2011])).toBe('U+2010-2012')
    expect(formatUnicodeRange([0x2010, 0x2012, 0xad])).toBe('U+00AD,U+2010,U+2012')
  })

  it('removes code points from the terms that hold them and keeps every other term as written', () => {
    expect(excludeFromUnicodeRange('U+0000-00FF,U+2000-206F,U+FEFF', SUPPLEMENTED_HYPHENS)).toBe('U+0000-00FF,U+2000-200F,U+2013-206F,U+FEFF')
    expect(excludeFromUnicodeRange('U+0307-0308,U+200C-2010,U+20AA', SUPPLEMENTED_HYPHENS)).toBe('U+0307-0308,U+200C-200F,U+20AA')
    expect(excludeFromUnicodeRange('U+2011,U+2013', SUPPLEMENTED_HYPHENS)).toBe('U+2013')
    expect(excludeFromUnicodeRange('U+20??', [0x2011])).toBe('U+2000-2010,U+2012-20FF')
    expect(excludeFromUnicodeRange('U+0000-00FF, U+0131', SUPPLEMENTED_HYPHENS)).toBe('U+0000-00FF, U+0131')
  })

  it('refuses to leave a face with an empty range', () => {
    expect(() => excludeFromUnicodeRange('U+2010-2012', SUPPLEMENTED_HYPHENS)).toThrow()
  })

  it('tells whether a range includes a code point', () => {
    expect(unicodeRangeIncludes('U+0000-00FF,U+2000-206F', 0x2011)).toBe(true)
    expect(unicodeRangeIncludes('U+0000-00FF,U+2000-200F,U+2013-206F', 0x2011)).toBe(false)
    expect(unicodeRangeIncludes('U+20??', 0x20ff)).toBe(true)
    expect(() => unicodeRangeIncludes('U+20G0', 0x2011)).toThrow()
  })

  it('refuses a wildcard term with an end, which CSS does not allow', () => {
    expect(() => parseUnicodeRange('U+2?-30')).toThrow('wildcard')
    expect(parseUnicodeRange('U+2010-2012,U+20??')).toEqual([
      { first: 0x2010, last: 0x2012 },
      { first: 0x2000, last: 0x20ff },
    ])
  })
})

/** A WOFF 1.0 file of these tables, stored uncompressed, which the format allows. */
function woffOf(tables: ReadonlyMap<string, Buffer>): Buffer {
  const tags = [...tables.keys()].sort()
  const directoryEnd = 44 + tags.length * 20
  const parts: Buffer[] = []
  const directory = Buffer.alloc(directoryEnd)
  directory.write('wOFF', 0, 'latin1')
  directory.writeUInt32BE(0x00010000, 4)
  directory.writeUInt16BE(tags.length, 12)
  let offset = directoryEnd
  tags.forEach((tag, index) => {
    const data = tables.get(tag) as Buffer
    const entry = 44 + index * 20
    directory.write(tag, entry, 4, 'latin1')
    directory.writeUInt32BE(offset, entry + 4)
    directory.writeUInt32BE(data.length, entry + 8)
    directory.writeUInt32BE(data.length, entry + 12)
    directory.writeUInt32BE(tableChecksum(tag, data), entry + 16)
    const paddedData = Buffer.alloc((data.length + 3) & ~3)
    data.copy(paddedData)
    parts.push(paddedData)
    offset += paddedData.length
  })
  const woff = Buffer.concat([directory, ...parts])
  woff.writeUInt32BE(woff.length, 8)
  return woff
}

describe('hyphenSupplement', () => {
  const GELASIO_WOFF = readFileSync(path.join(FONTSOURCE_ROOT, 'gelasio', 'files', 'gelasio-latin-400-normal.woff'))
  const source = decodeWoff(GELASIO_WOFF)
  const sourceCmap = source.get('cmap') as Buffer
  const hyphenGlyph = cmapGlyphId(sourceCmap, HYPHEN_MINUS)

  function withCmap(mapping: [number, number][]): Buffer {
    const tables = new Map(source)
    // The font's own mappings for the Latin letters and the hyphen, plus the given ones.
    const cmap = new Map<number, number>(mapping)
    for (let codePoint = 0x20; codePoint <= 0x7e; codePoint++) {
      const glyphId = cmapGlyphId(sourceCmap, codePoint)
      if (glyphId !== 0) cmap.set(codePoint, glyphId)
    }
    tables.set('cmap', buildCmap(cmap))
    return woffOf(tables)
  }

  it('maps each hyphen the font lacks to its U+002D glyph, and leaves every other table as it is', () => {
    const supplement = hyphenSupplement(GELASIO_WOFF)
    expect(supplement?.codePoints).toEqual([0x2010, 0x2011, 0x2012])
    const parsed = parseSfnt(supplement?.font as Buffer)
    const cmap = parsed.tables.find(({ tag }) => tag === 'cmap')?.data as Buffer
    for (const codePoint of SUPPLEMENTED_HYPHENS) expect(cmapGlyphId(cmap, codePoint)).toBe(hyphenGlyph)
    // Nothing else is mapped, so the face can draw nothing but those three.
    for (const codePoint of [HYPHEN_MINUS, 0x41, 0x2013, 0x2014]) expect(cmapGlyphId(cmap, codePoint)).toBe(0)

    expect(parsed.tables.map(({ tag }) => tag).sort()).toEqual([...source.keys()].sort())
    for (const { tag, data, checksum } of parsed.tables) {
      expect(checksum, tag).toBe(tableChecksum(tag, data))
      const original = source.get(tag) as Buffer
      if (tag === 'cmap') continue
      if (tag === 'head') {
        expect(data.subarray(0, 8).equals(original.subarray(0, 8))).toBe(true)
        expect(data.subarray(12).equals(original.subarray(12))).toBe(true)
      } else {
        expect(data.equals(original), tag).toBe(true)
      }
    }
  })

  it('adds only the hyphens the font lacks, leaving a mapping the font has alone', () => {
    const ownHyphenGlyph = hyphenGlyph + 1
    const supplement = hyphenSupplement(withCmap([[0x2010, ownHyphenGlyph]]))
    expect(supplement?.codePoints).toEqual([0x2011, 0x2012])
    const cmap = parseSfnt(supplement?.font as Buffer).tables.find(({ tag }) => tag === 'cmap')?.data as Buffer
    expect(cmapGlyphId(cmap, 0x2010)).toBe(0)
    expect(cmapGlyphId(cmap, 0x2011)).toBe(hyphenGlyph)
  })

  it('returns no supplement for a font that has all three hyphens', () => {
    expect(hyphenSupplement(withCmap([[0x2010, hyphenGlyph], [0x2011, hyphenGlyph], [0x2012, hyphenGlyph]]))).toBeNull()
  })

  it('fails for a font without a U+002D glyph, rather than registering no supplement', () => {
    const tables = new Map(source)
    tables.set('cmap', buildCmap(new Map([[0x41, cmapGlyphId(sourceCmap, 0x41)]])))
    expect(() => hyphenSupplement(woffOf(tables))).toThrow('U+002D')
  })
})

/**
 * FR-2 of tasks/prds/pdf-missing-hyphen-glyph.md (the verification set and
 * its controls), each looked up in every face registered for it.
 */
const VERIFICATION_SET = [0x00ad, 0x2010, 0x2011, 0x2012, 0x2015, 0x2020, 0x2021, 0x2030, 0x2032, 0x202f]
const CONTROLS = [0x002d, 0x2013, 0x2014, 0x2022, 0x00a0]

/**
 * The FR-2 code points a substitute's latin subset is registered for but has
 * no glyph for, which print correctly anyway on the serverless runtime
 * (reproduction of 2026-11-02): Chromium draws U+2015, U+2021, U+2030 and
 * U+2032 from another font, U+2020 from the latin-ext subset, U+202F with the
 * shaper's space fallback, and U+00AD is invisible. Pinned, so that a
 * Fontsource update changing a substitute's coverage fails here and is
 * checked on that runtime again, instead of printing boxes unnoticed.
 */
const DRAWN_BY_FALLBACK: Record<string, number[]> = {
  Arial: [0x2015, 0x2020, 0x2021, 0x202f, 0x2030],
  Calibri: [0x00ad, 0x2015, 0x2020, 0x2021, 0x202f, 0x2030, 0x2032],
  Georgia: [0x00ad, 0x2015, 0x2020, 0x2021, 0x202f, 0x2030],
}

/**
 * Every code point some face of the family is registered for (after the
 * supplement's exclusion) and no face registered for it can draw, the same
 * for all four face styles of a family. Controls, format characters and
 * spaces the shaper synthesises are among them. Any coverage change in a
 * Fontsource update, gained or lost, fails here: re-check the serverless
 * print before updating the snapshot.
 */
const UNDRAWN_SNAPSHOT: Record<string, string> = {
  Arial:
    'U+0001-000C,U+000E-001F,U+007F-009F,U+0590,U+05C8-05CF,U+05EB-05EF,U+05F5-05FF,U+1C89-1C8A,U+1F16-1F17,U+1F1E-1F1F,' +
    'U+1F46-1F47,U+1F4E-1F4F,U+1F58,U+1F5A,U+1F5C,U+1F5E,U+1F7E-1F7F,U+1FB5,U+1FC5,U+1FD4-1FD5,U+1FDC,U+1FF0-1FF1,U+1FF5,' +
    'U+1FFF-2001,U+2003-2008,U+200A,U+2015-2017,U+201B,U+201F,U+2021,U+2023-2025,U+2027-2031,U+2034-2038,U+203B-2043,' +
    'U+2045-206F,U+20BF-20C0,U+A7AF,U+A7B8-A7F6,U+FB37,U+FB3D,U+FB3F,U+FB42,U+FB45',
  Calibri:
    'U+0001-000C,U+000E-001F,U+007F-009F,U+00AD,U+02BA,U+02C9-02CA,U+02F4,U+02F6,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,' +
    'U+0370-0373,U+0376-0377,U+037F,U+03CF,U+0476,U+0487,U+0514-052F,U+1C80-1C8A,U+1D08,U+1D59,U+1E9C-1E9D,U+1E9F,' +
    'U+1EFA-1EFF,U+1F16-1F17,U+1F1E-1F1F,U+1F46-1F47,U+1F4E-1F4F,U+1F58,U+1F5A,U+1F5C,U+1F5E,U+1F7E-1F7F,U+1FB5,U+1FBE,' +
    'U+1FC5,U+1FD4-1FD5,U+1FDC,U+1FF0-1FF1,U+1FF5,U+1FFF-2001,U+2003-2008,U+200A,U+200C-200F,U+2015-2017,U+201B,U+201F,' +
    'U+2021,U+2023-2025,U+2027-2032,U+2034-2038,U+203B-2043,U+2045-206F,U+20B6-20B7,U+20BA-20C0,U+2C6D-2C73,U+2C78-2C7F,' +
    'U+2DE0-2DFF,U+A640-A69F,U+A722-A7FF,U+FE2E-FE2F,U+FFFD',
  Georgia:
    'U+0000-000C,U+000E-001F,U+007F-009F,U+00AD,U+0149,U+0180,U+0182-0185,U+0187-0188,U+018B-018D,U+0191,U+0193-0196,' +
    'U+019B,U+019E-019F,U+01A2-01A8,U+01AA-01AE,U+01B2,U+01B5-01B6,U+01B8-01C3,U+01F6-01F7,U+021C-021D,U+0220-0225,' +
    'U+0234-0236,U+0238-0239,U+023F-0240,U+0243,U+0248-0252,U+0255,U+0258,U+025A,U+025C-0264,U+0266-0267,U+0269-026E,' +
    'U+0270-0271,U+0273-0274,U+0276-0282,U+0284-0288,U+028B,U+028D-0291,U+0293,U+0296-0297,U+0299-02B8,U+02C1-02C5,' +
    'U+02CE-02D7,U+02DE-02FF,U+1D00-1DBF,U+1E98-1E9D,U+1E9F,U+1EFA-1EFF,U+2000-2001,U+2003-2008,U+200A,U+200C-200F,' +
    'U+2015-2017,U+201B,U+201F,U+2021,U+2023-2025,U+2027-2031,U+2034-2038,U+203B-2043,U+2045-206F,U+20A0,U+20A2,U+20A5,' +
    'U+20A8,U+20AA,U+20AE-20B0,U+20B3,U+20B6-20B7,U+20BB,U+20BE-20C0,U+2C60-2C64,U+2C67-2C7F,U+A720-A78A,U+A78D-A7AD,' +
    'U+A7AF-A7FF,U+FEFF,U+FFFD',
}

function faceTables(face: SubstituteFontFace): Map<string, Buffer> {
  const { mediaType, data } = dataUrlBytes(face.source)
  if (mediaType === 'font/woff2') return woff2UntransformedTables(data)
  if (mediaType === 'font/ttf') return new Map(parseSfnt(data).tables.map(({ tag, data: table }) => [tag, table]))
  throw new Error(`Unexpected font media type ${mediaType}`)
}

/** The font revision, em size and vertical metrics: what places and sizes a line of text. */
function fontMetrics(tables: Map<string, Buffer>) {
  const head = tables.get('head') as Buffer
  const hhea = tables.get('hhea') as Buffer
  const os2 = tables.get('OS/2') as Buffer
  return {
    fontRevision: head.readUInt32BE(4),
    unitsPerEm: head.readUInt16BE(18),
    hheaAscender: hhea.readInt16BE(4),
    hheaDescender: hhea.readInt16BE(6),
    hheaLineGap: hhea.readInt16BE(8),
    fsSelection: os2.readUInt16BE(62),
    typoAscender: os2.readInt16BE(68),
    typoDescender: os2.readInt16BE(70),
    typoLineGap: os2.readInt16BE(72),
    winAscent: os2.readUInt16BE(74),
    winDescent: os2.readUInt16BE(76),
  }
}

describe('glyph coverage of the registered faces (FR-5), from the installed packages', async () => {
  const faces = await loadFontSubstitutes(FONTSOURCE_ROOT)

  it('leaves exactly the pinned code points undrawn among all those its faces are registered for', () => {
    for (const { family } of FONT_SUBSTITUTES) {
      for (const { weight, style } of SUBSTITUTE_FACE_STYLES) {
        const registered = new Set<number>()
        const drawn = new Set<number>()
        for (const face of faces.filter((own) => own.family === family && own.weight === weight && own.style === style)) {
          const cmap = faceTables(face).get('cmap') as Buffer
          for (const { first, last } of parseUnicodeRange(face.unicodeRange)) {
            for (let codePoint = first; codePoint <= last; codePoint++) {
              registered.add(codePoint)
              if (cmapGlyphId(cmap, codePoint) !== 0) drawn.add(codePoint)
            }
          }
        }
        const undrawn = formatUnicodeRange([...registered].filter((codePoint) => !drawn.has(codePoint)))
        expect(undrawn, `${family} ${weight} ${style}`).toBe(UNDRAWN_SNAPSHOT[family])
      }
    }
  })

  it('registers no face for a hyphen it cannot draw, and no other FR-2 gap than the pinned ones', () => {
    for (const { family } of FONT_SUBSTITUTES) {
      for (const { weight, style } of SUBSTITUTE_FACE_STYLES) {
        const label = `${family} ${weight} ${style}`
        const missing = new Set<number>()
        for (const face of faces.filter((own) => own.family === family && own.weight === weight && own.style === style)) {
          const cmap = faceTables(face).get('cmap') as Buffer
          for (const codePoint of [...VERIFICATION_SET, ...CONTROLS]) {
            if (unicodeRangeIncludes(face.unicodeRange, codePoint) && cmapGlyphId(cmap, codePoint) === 0) missing.add(codePoint)
          }
        }
        expect([...missing].sort((a, b) => a - b), label).toEqual(DRAWN_BY_FALLBACK[family])
      }
    }
  })

  it('gives each face exactly one face for every supplemented hyphen: its supplement', () => {
    for (const { family } of FONT_SUBSTITUTES) {
      for (const { weight, style } of SUBSTITUTE_FACE_STYLES) {
        const own = faces.filter((face) => face.family === family && face.weight === weight && face.style === style)
        for (const codePoint of SUPPLEMENTED_HYPHENS) {
          const registered = own.filter((face) => unicodeRangeIncludes(face.unicodeRange, codePoint))
          expect(registered.map(({ unicodeRange }) => unicodeRange), `${family} ${weight} ${style}`).toEqual(['U+2010-2012'])
        }
      }
    }
  })

  it("draws the supplemented hyphens with the latin subset's own U+002D glyph, advance and metrics", () => {
    for (const { family } of FONT_SUBSTITUTES) {
      for (const { weight, style } of SUBSTITUTE_FACE_STYLES) {
        const label = `${family} ${weight} ${style}`
        const own = faces.filter((face) => face.family === family && face.weight === weight && face.style === style)
        const latin = own.filter((face) => unicodeRangeIncludes(face.unicodeRange, HYPHEN_MINUS))
        const supplements = own.filter((face) => face.unicodeRange === 'U+2010-2012')
        expect(latin, label).toHaveLength(1)
        expect(supplements, label).toHaveLength(1)

        const main = faceTables(latin[0])
        const supplement = faceTables(supplements[0])
        const mainCmap = main.get('cmap') as Buffer
        const hyphenGlyph = cmapGlyphId(mainCmap, HYPHEN_MINUS)
        expect(hyphenGlyph, label).toBeGreaterThan(0)

        // The supplement adds exactly the hyphens the registered latin subset lacks.
        expect(SUPPLEMENTED_HYPHENS.filter((codePoint) => cmapGlyphId(mainCmap, codePoint) === 0), label).toEqual(SUPPLEMENTED_HYPHENS)

        // Fontsource encodes the WOFF and the WOFF2 separately, so tables an
        // encoder recomputes (maxp, hhea maxima, hinting) differ byte for byte.
        // What decides how the text prints must not.
        expect(fontMetrics(supplement), label).toEqual(fontMetrics(main))

        // The registered WOFF2 stores hmtx untransformed, so its advances can be compared directly.
        expect(main.has('hmtx'), label).toBe(true)
        const mainHyphenAdvance = advanceWidth(main.get('hhea') as Buffer, main.get('hmtx') as Buffer, hyphenGlyph)
        for (const codePoint of SUPPLEMENTED_HYPHENS) {
          const glyphId = cmapGlyphId(supplement.get('cmap') as Buffer, codePoint)
          expect(glyphId, label).toBe(hyphenGlyph)
          expect(advanceWidth(supplement.get('hhea') as Buffer, supplement.get('hmtx') as Buffer, glyphId), label).toBe(mainHyphenAdvance)
        }
      }
    }
  })
})

/**
 * The latin subset's `unicode-range`, as next/font declares it for Inter's
 * latin face in this app's build (`u+00??` there): the same subset the
 * supplements are built from, so the same gaps.
 */
const INTER_LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,' +
  'U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

/**
 * The FR-2 code points (and controls) Inter's latin subset claims but has no
 * glyph for, for every weight; identical in the next/font file of the build
 * (2026-11-03). The hyphens are the supplements'; Chromium draws the rest as
 * for the substitutes (`DRAWN_BY_FALLBACK`). Pinned, so that a change of
 * Inter's coverage, the hyphens or U+002D included, fails here.
 */
const INTER_UNDRAWN_FR2 = [0x00ad, 0x2010, 0x2011, 0x2012, 0x2015, 0x2020, 0x2021, 0x202f, 0x2030]

describe("Inter's hyphen supplements, from the installed package", async () => {
  const supplements = await loadInterHyphenSupplements(FONTSOURCE_ROOT)

  function latinWoff2(weight: number): Map<string, Buffer> {
    return woff2UntransformedTables(
      readFileSync(path.join(FONTSOURCE_ROOT, INTER_FONTSOURCE_PACKAGE, 'files', `inter-latin-${weight}-normal.woff2`)),
    )
  }

  it('builds one upright supplement for every weight of the variable Inter, 100 to 900', () => {
    expect(INTER_FACE_STYLES).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => ({ weight, style: 'normal' })))
    expect(supplements.map(({ weight, style }) => ({ weight, style }))).toEqual(INTER_FACE_STYLES)
    for (const face of supplements) {
      expect(face).not.toHaveProperty('family')
      expect(face.unicodeRange).toBe('U+2010-2012')
      expect(face.source).toMatch(/^url\(data:font\/ttf;base64,AAEAA[A-Za-z0-9+/=]+\) format\('truetype'\)$/)
    }
  })

  it('round-trips into a font whose only mappings are the three hyphens, on the U+002D glyph', () => {
    for (const face of supplements) {
      const parsed = parseSfnt(dataUrlBytes(face.source).data)
      for (const { tag, data, checksum } of parsed.tables) expect(checksum, `${face.weight} ${tag}`).toBe(tableChecksum(tag, data))
      const cmap = parsed.tables.find(({ tag }) => tag === 'cmap')?.data as Buffer
      const hyphenGlyph = cmapGlyphId(latinWoff2(face.weight).get('cmap') as Buffer, HYPHEN_MINUS)
      for (const codePoint of SUPPLEMENTED_HYPHENS) expect(cmapGlyphId(cmap, codePoint), `${face.weight}`).toBe(hyphenGlyph)
      for (const codePoint of [HYPHEN_MINUS, 0x41, 0x2013, 0x2014]) expect(cmapGlyphId(cmap, codePoint)).toBe(0)
    }
  })

  it("draws the hyphens with Inter's own U+002D glyph, advance and metrics, weight by weight", () => {
    for (const face of supplements) {
      const label = `Inter ${face.weight}`
      const main = latinWoff2(face.weight)
      const supplement = new Map(parseSfnt(dataUrlBytes(face.source).data).tables.map(({ tag, data }) => [tag, data]))
      const hyphenGlyph = cmapGlyphId(main.get('cmap') as Buffer, HYPHEN_MINUS)
      expect(hyphenGlyph, label).toBeGreaterThan(0)
      expect(fontMetrics(supplement), label).toEqual(fontMetrics(main))
      expect(main.has('hmtx'), label).toBe(true)
      const ownAdvance = advanceWidth(main.get('hhea') as Buffer, main.get('hmtx') as Buffer, hyphenGlyph)
      for (const codePoint of SUPPLEMENTED_HYPHENS) {
        const glyphId = cmapGlyphId(supplement.get('cmap') as Buffer, codePoint)
        expect(glyphId, label).toBe(hyphenGlyph)
        expect(advanceWidth(supplement.get('hhea') as Buffer, supplement.get('hmtx') as Buffer, glyphId), label).toBe(ownAdvance)
      }
    }
  })

  it("pins the latin subset's range and its FR-2 gaps (FR-5): the three hyphens missing, U+002D present", () => {
    for (const faceStyle of INTER_FACE_STYLES) {
      const label = `Inter ${faceStyle.weight}`
      const faces = parseFontsourceStylesheet(readStylesheet(INTER_FONTSOURCE_PACKAGE, fontsourceStylesheetName(faceStyle)))
      const latin = faces.filter((face) => unicodeRangeIncludes(face.unicodeRange, HYPHEN_MINUS))
      expect(latin.map(({ unicodeRange }) => unicodeRange), label).toEqual([INTER_LATIN_RANGE])

      const cmap = latinWoff2(faceStyle.weight).get('cmap') as Buffer
      const undrawn = [...VERIFICATION_SET, ...CONTROLS].filter((codePoint) => cmapGlyphId(cmap, codePoint) === 0)
      expect(undrawn.sort((a, b) => a - b), label).toEqual(INTER_UNDRAWN_FR2)
      expect(SUPPLEMENTED_HYPHENS.every((codePoint) => unicodeRangeIncludes(INTER_LATIN_RANGE, codePoint))).toBe(true)
    }
  })

  it('fails when the package is missing, rather than printing without it', async () => {
    await expect(loadInterHyphenSupplements(path.join(FONTSOURCE_ROOT, 'does-not-exist'))).rejects.toThrow()
  })
})

describe("nextFontInterFallbackFamily: the family Inter's supplements are registered under", () => {
  it("returns next/font's fallback family from the body's computed font-family", () => {
    expect(nextFontInterFallbackFamily('Inter, "Inter Fallback"')).toBe('Inter Fallback')
    expect(nextFontInterFallbackFamily("'Inter', 'Inter Fallback', sans-serif")).toBe('Inter Fallback')
  })

  it.each([
    ['another font first', 'Arial, "Inter Fallback"'],
    ['no fallback family', 'Inter'],
    ['another fallback family', 'Inter, Arial'],
    ['the pair in another order', '"Inter Fallback", Inter'],
    ['a hashed family', '__Inter_d65c78, __Inter_Fallback_d65c78'],
    ['nothing', ''],
  ])('fails for a body with %s, rather than registering under a name no text uses', (_label, value) => {
    expect(() => nextFontInterFallbackFamily(value)).toThrow('next/font')
  })

  it.each([
    ['an unterminated quote', 'Inter, "Inter Fallback'],
    ['text after a quoted name', 'Inter, "Inter Fallback"x'],
    ['an empty entry', 'Inter,, "Inter Fallback"'],
    ['a trailing comma', 'Inter, "Inter Fallback",'],
    ['a value longer than the bound', `Inter, "Inter Fallback", ${'a'.repeat(MAX_FONT_FAMILY_LENGTH)}`],
  ])('fails for a body with %s', (_label, value) => {
    expect(() => nextFontInterFallbackFamily(value)).toThrow('next/font')
  })

  it.each([
    ['spaces then an unterminated quote', `${' '.repeat(10_000)}"`],
    ['Inter, then spaces and an unterminated quote', `Inter, ${' '.repeat(10_000)}"`],
    ['an unterminated quote over spaces', `"${' '.repeat(10_000)}`],
  ])('rejects %s, page-controlled and 10,000 long, in linear time (SEC-001)', (_label, value) => {
    const started = performance.now()
    expect(() => nextFontInterFallbackFamily(value)).toThrow('next/font')
    // The parser itself, past the length bound, must be linear too.
    expect(() => parseFontFamilyList(value)).toThrow()
    expect(performance.now() - started).toBeLessThan(100)
  })

  it('accepts the stack at the length bound, and refuses it one character past', () => {
    const atBound = `Inter, "Inter Fallback", ${'a'.repeat(MAX_FONT_FAMILY_LENGTH - 'Inter, "Inter Fallback", '.length)}`
    expect(atBound).toHaveLength(MAX_FONT_FAMILY_LENGTH)
    expect(nextFontInterFallbackFamily(atBound)).toBe('Inter Fallback')
    expect(() => nextFontInterFallbackFamily(`${atBound}a`)).toThrow('next/font')
  })

  it('reads quoted, escaped and bare family names', () => {
    expect(parseFontFamilyList(`Inter, "Inter Fallback", 'Open  Sans' , Open   Sans, "a\\"b", sans-serif`)).toEqual([
      'Inter',
      'Inter Fallback',
      'Open  Sans',
      'Open Sans',
      'a"b',
      'sans-serif',
    ])
  })

  it("matches the class next/font's own postcss plugin writes for Inter, so a Next.js change of the naming fails here", async () => {
    const exports: { name: string; value: { fontFamily: string } }[] = []
    const result = await postcss([
      postcssNextFontPlugin({
        exports,
        adjustFontFallback: { fallbackFont: 'Arial', sizeAdjust: '107.12%' },
      }),
    ]).process(`@font-face { font-family: '${NEXT_FONT_INTER_FAMILY}'; src: url(inter.woff2) format('woff2'); }`, {
      from: undefined,
    })
    let classFontFamily = ''
    result.root.walkRules('.className', (rule) => {
      rule.walkDecls('font-family', (declaration) => {
        classFontFamily = declaration.value
      })
    })
    expect(classFontFamily).toBe("'Inter', 'Inter Fallback'")
    expect(exports.find(({ name }) => name === 'style')?.value.fontFamily).toBe(classFontFamily)
    expect(nextFontInterFallbackFamily(classFontFamily)).toBe('Inter Fallback')
    // The fallback family is a face of its own, which the supplements join.
    expect(result.css).toMatch(/@font-face\s*\{\s*font-family: 'Inter Fallback';\s*src: local\("Arial"\)/)
  })
})

describe('registerFontSubstitutes, as the page runs it', () => {
  const ORIGIN = 'https://cv.example.test'
  const FACE: SubstituteFontFace = {
    family: 'Arial',
    weight: 700,
    style: 'italic',
    unicodeRange: 'U+0000-00FF',
    source: "url(data:font/woff2;base64,d09GMg==) format('woff2')",
  }

  function fakePage(origin: string) {
    const added: { family: string; source: string; descriptors: Record<string, string> }[] = []
    class FakeFontFace {
      constructor(
        readonly family: string,
        readonly source: string,
        readonly descriptors: Record<string, string>,
      ) {}
    }
    vi.stubGlobal('window', { location: { origin } })
    vi.stubGlobal('document', { fonts: { add: (face: FakeFontFace) => added.push({ ...face }) } })
    vi.stubGlobal('FontFace', FakeFontFace)
    return added
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("adds each face under the replaced font's name, with its weight, style and range", () => {
    const added = fakePage(ORIGIN)
    const returned = registerFontSubstitutes({ origin: ORIGIN, faces: [FACE, { ...FACE, family: 'Georgia', weight: 400, style: 'normal' }] })
    // The faces added are returned, so a caller can check exactly those later.
    expect(returned.map((face) => ({ ...face }))).toEqual(added)
    expect(added).toEqual([
      { family: 'Arial', source: FACE.source, descriptors: { weight: '700', style: 'italic', unicodeRange: 'U+0000-00FF' } },
      { family: 'Georgia', source: FACE.source, descriptors: { weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF' } },
    ])
  })

  it.each(['null', 'https://evil.example.test'])('adds nothing to a document of another origin: %s', (origin) => {
    const added = fakePage(origin)
    expect(registerFontSubstitutes({ origin: ORIGIN, faces: [FACE] })).toEqual([])
    expect(added).toEqual([])
  })
})
