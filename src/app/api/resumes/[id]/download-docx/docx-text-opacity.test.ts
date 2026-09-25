import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { PREVIEW_TEXT_ALPHA } from '@/lib/resume-text-opacity'
import { generateCreativeDocx } from './docx-creative'
import type { DocxGeneratorSettings } from './docx-helpers'
import { generateModernDocx } from './docx-modern'
import { DOCX_PALETTE } from './docx-palette'
import { generateProfessionalDocx } from './docx-professional'

/**
 * Part 3 US-006: every run whose Preview counterpart is translucent white is
 * written in the opaque colour that tint composites to over the colour the
 * DOCX draws behind it.
 *
 * Each expected colour below is a LITERAL, computed by hand from the alpha and
 * the backdrop rather than by calling the code under test, so a change to the
 * compositing — a different space, a dropped rounding step, the wrong backdrop
 * — fails here instead of agreeing with itself. `resume-text-opacity.test.ts`
 * holds the arithmetic and its agreement with the parity check's converter.
 *
 * Professional and modern are run at TWO sidebar colours, because their
 * backdrop is the user's: a generator that composited over a fixed colour, or
 * went back to opaque white, would pass at one colour and fail at the other.
 * Creative's backdrop is the header fill, which is the same for every user.
 */

/** Two colours the sidebar controls can produce, and the fills they resolve to. */
const SIDEBAR = {
  green: { hue: 150, saturation: 60, brightness: 30, fill: '1F7A4D' },
  orange: { hue: 20, saturation: 80, brightness: 55, fill: 'E86E30' },
} as const

type SidebarName = keyof typeof SIDEBAR

/** The fill creative's header paragraphs carry: its gradient's first stop. */
const CREATIVE_HEADER_FILL = '693AD4'

/** One string per element, unique to it in the document it is read from. */
const MARK = {
  title: 'Opacity Fidelity Title',
  name: 'Robin Opacity',
  email: 'robin@opacity.test',
  linkedin: 'linkedin.com/in/opacity',
  website: 'opacity.test/robin',
  summary: 'Quillwright opacity summary.',
  school: 'Halvorsen Institute',
  skillItem: 'Zanzibarscript',
  project: 'Orbital Mapper',
  projectDescription: 'Orbital project description.',
  language: 'Esperanto',
  level: 'Fluent',
  certificate: 'Typesetting Cert',
  issuer: 'Guild of Printers',
} as const

function resumeRow() {
  return {
    title: MARK.title,
    contact: { name: MARK.name, email: MARK.email, linkedin: MARK.linkedin, website: MARK.website },
    summary: MARK.summary,
    experience: [
      {
        company: 'Tessellate Freight',
        position: 'Kilnwright Engineer',
        startDate: '2011-03',
        current: true,
        achievements: ['Tessellated achievement shipped the export pipeline.'],
        visible: true,
      },
    ],
    education: [
      { school: MARK.school, degree: 'Magister', field: 'Chromatics', startDate: '1997-09', endDate: '1999-06', visible: true },
    ],
    skills: [{ category: 'Toolchain', items: [MARK.skillItem, 'Rust'], visible: true }],
    projects: [{ name: MARK.project, description: MARK.projectDescription, technologies: ['Quuxlang'], visible: true }],
    languages: [{ language: MARK.language, level: MARK.level, visible: true }],
    certifications: [{ name: MARK.certificate, issuer: MARK.issuer, date: '2003-05', visible: true }],
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

type Generator = (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>

interface Run {
  text: string
  colour: string | null
}

const documents = new Map<string, Promise<Run[]>>()

/** Every text run of one template's document, generated once per sidebar colour. */
function runs(key: string, generate: Generator, sidebar: SidebarName | null): Promise<Run[]> {
  let document = documents.get(key)
  if (!document) {
    document = (async () => {
      const row = resumeRow()
      const zip = await JSZip.loadAsync(await generate(row, settingsFor(row, sidebar)))
      const part = zip.file('word/document.xml')
      if (part === null) throw new Error(`The ${key} artifact has no word/document.xml`)
      const xml = await part.async('string')
      return [...xml.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].flatMap(([, run]) => {
        const text = [...run.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(([, part]) => part).join('')
        if (text === '') return []
        return [{ text, colour: /<w:color w:val="([0-9A-Fa-f]{6})"\/>/.exec(run)?.[1]?.toUpperCase() ?? null }]
      })
    })()
    documents.set(key, document)
  }
  return document
}

/** Every run whose text contains `needle` carries `colour`, and there is at least one. */
async function expectRunColour(document: Promise<Run[]>, needle: string, colour: string, label: string) {
  const matching = (await document).filter((run) => run.text.includes(needle))
  expect(matching.length, `${label}: no run contains "${needle}"`).toBeGreaterThan(0)
  for (const run of matching) expect(run.colour, `${label} ("${run.text}")`).toBe(colour)
}

describe('the backdrops these composites are computed against', () => {
  it('are the sidebar fills and the creative header fill this test names', async () => {
    const { hslToHex } = await import('./docx-helpers')
    for (const [name, colour] of Object.entries(SIDEBAR)) {
      expect(hslToHex(colour.hue, colour.saturation, colour.brightness), name).toBe(colour.fill)
    }
    expect(DOCX_PALETTE.creative['purple-600']).toBe(CREATIVE_HEADER_FILL)
  })

  it('are composited against white, the colour each template draws the text in', () => {
    expect(DOCX_PALETTE.professional.white).toBe('FFFFFF')
    expect(DOCX_PALETTE.modern.white).toBe('FFFFFF')
    expect(DOCX_PALETTE.creative.white).toBe('FFFFFF')
  })
})

describe('professional: opacity-80 sidebar text over the user’s colour', () => {
  /** White at 0.8 over 1F7A4D and over E86E30. */
  const EXPECTED: Readonly<Record<SidebarName, string>> = { green: 'D2E4DB', orange: 'FAE2D6' }

  it('declares one alpha, 0.8, for all three elements', () => {
    expect(PREVIEW_TEXT_ALPHA.professional.sidebarSecondary.alpha).toBe(0.8)
  })

  it.each(Object.keys(SIDEBAR) as SidebarName[])(
    'writes the key achievement, skills and language level composited over %s',
    async (sidebar) => {
      const document = runs(`professional-${sidebar}`, generateProfessionalDocx, sidebar)
      const colour = EXPECTED[sidebar]
      await expectRunColour(document, MARK.projectDescription, colour, `professional ${sidebar} key achievement`)
      await expectRunColour(document, MARK.skillItem, colour, `professional ${sidebar} skill items`)
      await expectRunColour(document, MARK.level, colour, `professional ${sidebar} language level`)
    },
  )

  it('leaves the opaque sidebar text white, so the two are not conflated', async () => {
    const document = runs('professional-green', generateProfessionalDocx, 'green')
    await expectRunColour(document, MARK.project, 'FFFFFF', 'professional key achievement title')
    await expectRunColour(document, MARK.language, 'FFFFFF', 'professional language name')
    await expectRunColour(document, MARK.certificate, 'FFFFFF', 'professional certification name')
  })
})

describe('modern: translucent sidebar text over the user’s colour', () => {
  /** White at each element's own alpha over 1F7A4D and over E86E30. */
  const EXPECTED: Readonly<Record<SidebarName, Readonly<Record<string, string>>>> = {
    green: { 0.6: 'A5CAB8', 0.7: 'BCD7CA', 0.8: 'D2E4DB' },
    orange: { 0.6: 'F6C5AC', 0.7: 'F8D4C1', 0.8: 'FAE2D6' },
  }

  it('declares one alpha per element', () => {
    expect(Object.fromEntries(
      Object.entries(PREVIEW_TEXT_ALPHA.modern).map(([key, entry]) => [key, entry.alpha]),
    )).toEqual({ contactLabel: 0.6, educationSchool: 0.8, languageLevel: 0.7, certIssuer: 0.7, certDate: 0.6 })
  })

  it.each(Object.keys(SIDEBAR) as SidebarName[])(
    'writes each sidebar element at its own tint over %s',
    async (sidebar) => {
      const document = runs(`modern-${sidebar}`, generateModernDocx, sidebar)
      const tint = EXPECTED[sidebar]
      await expectRunColour(document, 'EMAIL', tint[0.6], `modern ${sidebar} contact label`)
      await expectRunColour(document, MARK.school, tint[0.8], `modern ${sidebar} education school`)
      await expectRunColour(document, MARK.level, tint[0.7], `modern ${sidebar} language level`)
      await expectRunColour(document, MARK.issuer, tint[0.7], `modern ${sidebar} certification issuer`)
      await expectRunColour(document, 'May 2003', tint[0.6], `modern ${sidebar} certification date`)
    },
  )

  it('leaves the opaque sidebar text white, so the two are not conflated', async () => {
    const document = runs('modern-green', generateModernDocx, 'green')
    await expectRunColour(document, MARK.email, 'FFFFFF', 'modern contact value')
    await expectRunColour(document, MARK.language, 'FFFFFF', 'modern language name')
    await expectRunColour(document, MARK.certificate, 'FFFFFF', 'modern certification name')
  })
})

describe('creative: translucent header text over the header fill', () => {
  it('declares 0.9 for the summary and 0.8 for the second contact row', () => {
    expect(PREVIEW_TEXT_ALPHA.creative.headerSummary.alpha).toBe(0.9)
    expect(PREVIEW_TEXT_ALPHA.creative.headerLinks.alpha).toBe(0.8)
  })

  it('writes the summary at white 0.9 and the links at white 0.8 over 693AD4', async () => {
    const document = runs('creative', generateCreativeDocx, null)
    await expectRunColour(document, MARK.summary, 'F0ECFB', 'creative header summary')
    await expectRunColour(document, MARK.linkedin, 'E1D8F6', 'creative header links')
    await expectRunColour(document, MARK.website, 'E1D8F6', 'creative header links')
  })

  it('leaves the opaque header text white, so the two are not conflated', async () => {
    const document = runs('creative', generateCreativeDocx, null)
    await expectRunColour(document, MARK.title.toUpperCase(), 'FFFFFF', 'creative header title')
    await expectRunColour(document, MARK.email, 'FFFFFF', 'creative first contact row')
  })

  it('does not change with the sidebar colour, which creative renders nowhere', async () => {
    const green = runs('creative-green', generateCreativeDocx, 'green')
    const orange = runs('creative-orange', generateCreativeDocx, 'orange')
    expect(await green).toEqual(await orange)
  })
})
