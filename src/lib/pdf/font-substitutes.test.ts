import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FONT_SUBSTITUTES,
  SUBSTITUTE_FACE_STYLES,
  SUBSTITUTE_FAMILIES,
  fontsourceStylesheetName,
  loadFontSubstitutes,
  parseFontsourceStylesheet,
  registerFontSubstitutes,
  type SubstituteFontFace,
} from './font-substitutes'

const FONTSOURCE_ROOT = path.join(process.cwd(), 'node_modules', '@fontsource')

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

  it('reads the weight, style, WOFF2 file and unicode-range of every rule, ignoring the WOFF fallback', () => {
    expect(parseFontsourceStylesheet(`${RULE}\n\n${RULE.replace(/latin/g, 'latin-ext')}`)).toEqual([
      {
        weight: 700,
        style: 'italic',
        woff2: 'files/arimo-latin-700-italic.woff2',
        unicodeRange: 'U+0000-00FF,U+0131,U+2000-206F,U+FEFF,U+FFFD',
      },
      {
        weight: 700,
        style: 'italic',
        woff2: 'files/arimo-latin-ext-700-italic.woff2',
        unicodeRange: 'U+0000-00FF,U+0131,U+2000-206F,U+FEFF,U+FFFD',
      },
    ])
  })

  it.each([
    ['no weight', RULE.replace(/font-weight: 700;/, '')],
    ['no style', RULE.replace(/font-style: italic;/, '')],
    ['no unicode-range', RULE.replace(/unicode-range:[^;]*;/, '')],
    ['no WOFF2 source', RULE.replace(/url\(\.\/files\/arimo-latin-700-italic\.woff2\) format\('woff2'\), /, '')],
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
      // "wOF2", the WOFF2 signature, in base64.
      expect(face.source).toMatch(/^url\(data:font\/woff2;base64,d09GMg[A-Za-z0-9+/=]+\) format\('woff2'\)$/)
    }
  })

  it('fails when a package is missing, rather than printing without it', async () => {
    await expect(loadFontSubstitutes(path.join(FONTSOURCE_ROOT, 'does-not-exist'))).rejects.toThrow()
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
    registerFontSubstitutes({ origin: ORIGIN, faces: [FACE, { ...FACE, family: 'Georgia', weight: 400, style: 'normal' }] })
    expect(added).toEqual([
      { family: 'Arial', source: FACE.source, descriptors: { weight: '700', style: 'italic', unicodeRange: 'U+0000-00FF' } },
      { family: 'Georgia', source: FACE.source, descriptors: { weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF' } },
    ])
  })

  it.each(['null', 'https://evil.example.test'])('adds nothing to a document of another origin: %s', (origin) => {
    const added = fakePage(origin)
    registerFontSubstitutes({ origin: ORIGIN, faces: [FACE] })
    expect(added).toEqual([])
  })
})
