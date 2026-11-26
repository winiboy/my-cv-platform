import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import {
  TEMPLATE_APPLIED_SIZE_KEYS,
  TEMPLATE_DRAWS_PHOTO,
  TEMPLATE_EDITOR_SECTIONS,
  TEMPLATE_LAYOUT_CONTROLS,
  listedEditorSections,
  templateEditorSections,
  templateOffersLayoutControl,
  type EditorMainId,
  type EditorSidebarId,
} from '@/lib/layout-settings'
import { PREVIEW_PALETTE } from '@/lib/resume-palette'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { interTextWidthPx } from '@/test/inter-advance-widths'
import {
  SWISS_ENGINEERING_COLUMN_TEXT_WIDTH,
  SWISS_ENGINEERING_GEOMETRY,
  SWISS_ENGINEERING_MAIN_COLUMN,
  SWISS_ENGINEERING_MAIN_SECTIONS,
  SWISS_ENGINEERING_SIDEBAR_SECTIONS,
  SWISS_ENGINEERING_SIDE_COLUMN,
  SWISS_ENGINEERING_SIZES,
  swissEngineeringCertificateLine,
  swissEngineeringDates,
  swissEngineeringEducationLines,
  swissEngineeringProject,
  swissEngineeringSections,
  swissEngineeringSkillContent,
} from '@/lib/swiss-engineering-template'

const DICTS = { fr, en, de, it: it_ } as const

describe('swissEngineering in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: no user colour, no size input, no stored font (FR-4, FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissEngineering).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissEngineering', 'sidebarSections')).toBe(true)
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissEngineering).toEqual([])
  })

  it('draws the photo, so the Contact tab offers its photo row (FR-5, FR-14)', () => {
    expect(TEMPLATE_DRAWS_PHOTO.swissEngineering).toBe(true)
  })

  it('lists every section it can hide, the projects (keyAchievements) included, each fixed, in the order it draws them', () => {
    const sections = templateEditorSections('swissEngineering')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissEngineering)
    expect([...sections.main]).toEqual(['summary', 'experience', 'education'])
    // The one Swiss template that draws the projects: their row is offered.
    expect([...sections.sidebar]).toEqual(['keyAchievements', 'skills', 'languages', 'training'])
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
    expect([...sections.main]).toEqual([...SWISS_ENGINEERING_MAIN_SECTIONS])
    expect([...sections.sidebar]).toEqual([...SWISS_ENGINEERING_SIDEBAR_SECTIONS])
  })

  it('offers exactly the rows it draws: every id of its two columns, and no other', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissEngineering
    expect([...SWISS_ENGINEERING_MAIN_COLUMN, ...SWISS_ENGINEERING_SIDE_COLUMN].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
  })

  it('lists its rows in the order the template draws them, whatever order is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissEngineering
    const sidebarOrders: EditorSidebarId[][] = [
      ['keyAchievements', 'skills', 'languages', 'training'],
      ['training', 'languages', 'skills', 'keyAchievements'],
    ]
    const mainOrders: EditorMainId[][] = [
      ['summary', 'experience', 'education'],
      ['education', 'summary', 'experience'],
    ]
    for (const order of sidebarOrders) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['keyAchievements', 'skills', 'languages', 'training'])
    }
    for (const order of mainOrders) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'experience', 'education'])
    }
  })
})

describe('swissEngineeringSections', () => {
  it('draws the mockup order: summary, key achievements, experience; then education, skills, languages, certifications', () => {
    expect(swissEngineeringSections([], [])).toEqual({
      main: ['summary', 'keyAchievements', 'experience'],
      side: ['education', 'skills', 'languages', 'training'],
    })
  })

  it('leaves out summary, experience and education hidden through hiddenMainSections', () => {
    expect(swissEngineeringSections(['summary', 'education'], [])).toEqual({
      main: ['keyAchievements', 'experience'],
      side: ['skills', 'languages', 'training'],
    })
  })

  it('leaves out the projects, skills, languages and certifications hidden through hiddenSidebarSections', () => {
    expect(swissEngineeringSections([], ['keyAchievements', 'training'])).toEqual({
      main: ['summary', 'experience'],
      side: ['education', 'skills', 'languages'],
    })
  })

  it('ignores an id hidden through the other panel', () => {
    expect(swissEngineeringSections(['keyAchievements', 'skills'], ['summary', 'education'])).toEqual(swissEngineeringSections([], []))
  })
})

describe('swissEngineering joined text', () => {
  it('prints dates as MM.YYYY, "present" only for a current entry, and nothing for an undated one (FR-1)', () => {
    expect(swissEngineeringDates('2014-09', '2017-06', false, fr)).toBe('09.2014 – 06.2017')
    expect(swissEngineeringDates('2020-01', undefined, true, fr)).toBe(`01.2020 – ${fr.resumes.template.present}`)
    expect(swissEngineeringDates(undefined, undefined, true, de)).toBe(de.resumes.template.present)
    expect(swissEngineeringDates(undefined, undefined, false, en)).toBe('')
    expect(swissEngineeringDates(' ', '', false, en)).toBe('')
  })

  it('draws an education as its bold degree, then "school, field, dates"', () => {
    expect(swissEngineeringEducationLines({ degree: 'Bachelor HES en génie civil', school: 'HEIG-VD', dates: '09.2014 – 06.2017' })).toEqual({
      lead: 'Bachelor HES en génie civil',
      detail: 'HEIG-VD, 09.2014 – 06.2017',
    })
    expect(swissEngineeringEducationLines({ degree: 'MSc', school: 'EPFL', field: 'Structures', dates: '' })).toEqual({
      lead: 'MSc',
      detail: 'EPFL, Structures',
    })
  })

  it('leads with the school when there is no degree, and leaves no dangling separator or empty line (FR-2)', () => {
    expect(swissEngineeringEducationLines({ degree: ' ', school: 'CPNV', field: '', dates: '09.2010 – 06.2014' })).toEqual({
      lead: 'CPNV',
      detail: '09.2010 – 06.2014',
    })
    expect(swissEngineeringEducationLines({ degree: 'CFC', dates: '' })).toEqual({ lead: 'CFC', detail: '' })
    expect(swissEngineeringEducationLines({ dates: '' })).toEqual({ lead: '', detail: '' })
  })

  it('draws a certificate as "name, issuer, month", each only when stored', () => {
    expect(swissEngineeringCertificateLine('Registre REG A', '', '05.2022')).toBe('Registre REG A, 05.2022')
    expect(swissEngineeringCertificateLine('Registre REG A', 'Fondation REG', '05.2022')).toBe('Registre REG A, Fondation REG, 05.2022')
    expect(swissEngineeringCertificateLine(' ', undefined, '')).toBe('')
  })
})

describe('swissEngineeringProject: what a key-achievement card draws', () => {
  it('draws the name, the description, the technologies joined by ", " and the link', () => {
    expect(
      swissEngineeringProject({
        name: ' Pont de la Broye ',
        description: 'Dimensionnement et suivi du chantier.',
        technologies: ['SIA 262', ' ', 'Revit '],
        url: ' exemple.ch/broye ',
      }),
    ).toEqual({ name: 'Pont de la Broye', description: 'Dimensionnement et suivi du chantier.', technologies: 'SIA 262, Revit', url: 'exemple.ch/broye' })
  })

  it('draws a project with no name as its description alone', () => {
    expect(swissEngineeringProject({ name: '', description: '<p>Structure bois-béton.</p>' })).toEqual({
      name: '',
      description: '<p>Structure bois-béton.</p>',
      technologies: '',
      url: '',
    })
  })

  it('draws no card for a project that stores nothing it draws', () => {
    expect(swissEngineeringProject({ name: ' ', description: '<p></p>', technologies: [' '], url: '' })).toBeNull()
  })
})

describe('swissEngineeringSkillContent', () => {
  it('lists legacy items one per line when there is no rich text', () => {
    expect(swissEngineeringSkillContent({ items: ['Normes SIA', ' ', 'Revit / BIM '] })).toEqual({ kind: 'lines', lines: ['Normes SIA', 'Revit / BIM'] })
  })

  it('lists a comma-separated rich-text paragraph one skill per line, entities decoded, the rich text winning over items', () => {
    expect(swissEngineeringSkillContent({ items: ['Old'], skillsHtml: '<p>Calcul aux éléments finis, R&amp;D</p>' })).toEqual({
      kind: 'lines',
      lines: ['Calcul aux éléments finis', 'R&D'],
    })
  })

  it('keeps formatting, lists and line breaks as rich text, and draws nothing for an empty category', () => {
    for (const skillsHtml of ['<p><strong>SIA</strong>, BIM</p>', '<ul><li>SIA</li></ul>', 'SIA\nBIM']) {
      expect(swissEngineeringSkillContent({ items: [], skillsHtml }), skillsHtml).toEqual({ kind: 'html', html: skillsHtml })
    }
    expect(swissEngineeringSkillContent({ items: [] })).toBeNull()
  })
})

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('swissEngineering text colours meet WCAG AA (4.5:1) on every background they are drawn on', () => {
  const palette = PREVIEW_PALETTE.swissEngineering
  const WHITE = '#ffffff'
  const COLUMN = palette.column.css
  const CARD = palette.card.css

  it.each([
    // The CV title and the headings of the main column; the headings of the light column.
    ['accent', WHITE],
    ['accent', COLUMN],
    // The name, an experience's first line, a project's name; an education's lead and a skill caption.
    ['ink', WHITE],
    ['ink', CARD],
    ['ink', COLUMN],
    // Dates and company lines on white; a project's technologies and link on its card.
    ['muted', WHITE],
    ['muted', CARD],
    // Running text on white, a project's description on its card, every plain line of the light column.
    ['body', WHITE],
    ['body', CARD],
    ['body', COLUMN],
  ] as const)('%s on %s', (name, background) => {
    expect(contrast(palette[name].css, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('never draws the muted grey on the light column, where it would fail AA', () => {
    expect(contrast(palette.muted.css, COLUMN)).toBeLessThan(4.5)
  })

  it('draws title and headings in blue-700, with a wider margin over AA than the mockup’s lighter title blue', () => {
    expect(palette.accent.css).toBe('#1d4ed8')
    expect(contrast(palette.accent.css, COLUMN)).toBeGreaterThan(6)
    expect(contrast('#2563eb', COLUMN)).toBeLessThan(contrast(palette.accent.css, COLUMN))
  })
})

/**
 * The owner's rule: no word is ever cut, in any locale, in any output. The
 * light column is the narrow one: every word of these lists — the longest of
 * what each locale writes there: headings, level names, degrees, skills —
 * fits one of its lines whole, measured with Inter's own advance widths, at
 * the Preview's size and at Word's (whole half-points), bold where it is
 * drawn bold, the headings in their spaced capitals.
 */
describe('swissEngineering: every word of the light column fits it whole', () => {
  const room = SWISS_ENGINEERING_COLUMN_TEXT_WIDTH
  const px = SWISS_ENGINEERING_SIZES.column
  /** Word draws a run in whole half-points; 12px is 9pt exactly, 13px rounds to 10pt. */
  const wordPx = (cssPx: number) => Math.round(cssPx * 1.5) / 1.5

  const LONG_WORDS = {
    de: ['Kommunikationsfähigkeiten', 'Projektleitungserfahrung', 'Bauingenieurwesen', 'Tragwerksplanung', 'Grundkenntnisse', 'Elektrotechnik'],
    fr: ['Dimensionnement', 'Électrotechnique', 'Infrastructures', 'Professionnel', 'Intermédiaire'],
    it: ['Progettazione', 'Elettrotecnica', 'Infrastrutture', 'Professionale', 'Madrelingua'],
    en: ['Telecommunications', 'Infrastructure', 'Professional', 'Intermediate'],
  } as const

  it('leaves the light column 202px of text: wide enough, and the width every output uses', () => {
    expect(room).toBe(SWISS_ENGINEERING_GEOMETRY.columnWidth - SWISS_ENGINEERING_GEOMETRY.columnBar - 2 * SWISS_ENGINEERING_GEOMETRY.columnPaddingX)
    expect(room).toBe(202)
  })

  it.each(Object.entries(LONG_WORDS))('%s: each long word fits a line, bold, at the Preview’s and at Word’s size', (_locale, words) => {
    for (const word of words) {
      for (const size of [px, wordPx(px)]) {
        expect(interTextWidthPx(word, 700, size), `${word} at ${size}px`).toBeLessThanOrEqual(room)
      }
    }
  })

  it.each(Object.entries(DICTS))('%s: every heading of the light column fits on one line, in its spaced capitals', (_locale, dict) => {
    const tracking = PREVIEW_TRACKING.swissEngineering.caps
    const labels = [
      dict.resumes.editor.sections.contact,
      dict.resumes.template.education,
      dict.resumes.template.skills,
      dict.resumes.template.languages,
      dict.resumes.template.training,
    ]
    for (const label of labels) {
      for (const size of [SWISS_ENGINEERING_SIZES.heading, wordPx(SWISS_ENGINEERING_SIZES.heading)]) {
        const caps = label.toLocaleUpperCase()
        const width = interTextWidthPx(caps, 700, size) + tracking * size * [...caps].length
        expect(width, `${label} at ${size}px`).toBeLessThanOrEqual(room)
      }
    }
  })

  it.each(Object.entries(DICTS))('%s: every language level fits after a long language name', (_locale, dict) => {
    for (const level of Object.values(dict.resumes.editor.levels)) {
      expect(interTextWidthPx(level, 400, px), level).toBeLessThanOrEqual(room)
    }
  })

  it('cannot hold a single token wider than the whole column: the documented last resort', () => {
    // No wrapping at spaces can hold this one word; both outputs break it at
    // the column's edge rather than let it run off the page.
    expect(interTextWidthPx('Finanzdienstleistungsaufsichtskompetenz', 700, px)).toBeGreaterThan(room)
  })
})
