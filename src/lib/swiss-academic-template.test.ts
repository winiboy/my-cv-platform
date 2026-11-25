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
  templateDrawsPhoto,
  templateEditorSections,
  templateOffersLayoutControl,
  type EditorMainId,
  type EditorSidebarId,
} from '@/lib/layout-settings'
import { PREVIEW_PALETTE } from '@/lib/resume-palette'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { georgiaTextWidthPx } from '@/lib/georgia-advance-widths'
import { SWISS_IT_CONTACT_DOT, swissItDates } from '@/lib/swiss-it-template'
import {
  SWISS_ACADEMIC_CONTENT_WIDTH,
  SWISS_ACADEMIC_GEOMETRY,
  SWISS_ACADEMIC_MAIN_SECTIONS,
  SWISS_ACADEMIC_SECTIONS,
  SWISS_ACADEMIC_SIDEBAR_SECTIONS,
  SWISS_ACADEMIC_SIZES,
  swissAcademicContactValues,
  SWISS_ACADEMIC_DATE_COLUMN_MAX_PX,
  SWISS_ACADEMIC_DATE_SAFETY_PX,
  swissAcademicDate,
  swissAcademicDateColumnPx,
  swissAcademicEntryLine,
  swissAcademicLanguagesText,
  swissAcademicLastHeading,
  swissAcademicVisibility,
} from '@/lib/swiss-academic-template'

const DICTS = { fr, en, de, it: it_ } as const

describe('swissAcademic in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: no user colour, no size input, no stored font (FR-4, FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissAcademic).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissAcademic', 'font')).toBe(false)
    expect(templateOffersLayoutControl('swissAcademic', 'sidebarColour')).toBe(false)
    expect(templateOffersLayoutControl('swissAcademic', 'perPropertySize')).toBe(false)
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissAcademic).toEqual([])
  })

  it('draws no photo, so the Contact tab offers neither the photo row nor its tick (PRD FR-5 exception, FR-3)', () => {
    expect(TEMPLATE_DRAWS_PHOTO.swissAcademic).toBe(false)
    expect(templateDrawsPhoto('swissAcademic')).toBe(false)
  })

  it('lists every section it can hide, each fixed, in the order it draws them', () => {
    const sections = templateEditorSections('swissAcademic')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissAcademic)
    expect([...sections.main]).toEqual(['summary', 'education', 'experience'])
    expect([...sections.sidebar]).toEqual(['keyAchievements', 'training', 'skills', 'languages'])
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
    expect([...sections.main]).toEqual([...SWISS_ACADEMIC_MAIN_SECTIONS])
    expect([...sections.sidebar]).toEqual([...SWISS_ACADEMIC_SIDEBAR_SECTIONS])
  })

  it('offers exactly the rows it draws, and no other', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissAcademic
    const drawn = SWISS_ACADEMIC_SECTIONS.flatMap((id) => (id === 'skillsAndLanguages' ? ['skills', 'languages'] : [id]))
    expect(drawn.sort()).toEqual([...sections.main, ...sections.sidebar].sort())
  })

  it('lists its rows in the order the template draws them, whatever order is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissAcademic
    const sidebarOrders: EditorSidebarId[][] = [
      ['keyAchievements', 'training', 'skills', 'languages'],
      ['languages', 'skills', 'training', 'keyAchievements'],
    ]
    const mainOrders: EditorMainId[][] = [
      ['summary', 'experience', 'education'],
      ['education', 'summary', 'experience'],
    ]
    for (const order of sidebarOrders) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['keyAchievements', 'training', 'skills', 'languages'])
    }
    for (const order of mainOrders) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'education', 'experience'])
    }
  })

  it('spaces the headings’ small capitals as Tailwind’s tracking-widest', () => {
    expect(PREVIEW_TRACKING.swissAcademic).toEqual({ caps: 0.1 })
  })
})

describe('swissAcademicVisibility', () => {
  it('draws the mockup order: summary, education, experience, publications, distinctions, then skills and languages', () => {
    expect(swissAcademicVisibility([], [])).toEqual({
      sections: ['summary', 'education', 'experience', 'keyAchievements', 'training', 'skillsAndLanguages'],
      skills: true,
      languages: true,
    })
  })

  it('leaves out the sections hidden through either panel', () => {
    expect(swissAcademicVisibility(['summary', 'experience'], ['keyAchievements', 'training']).sections).toEqual(['education', 'skillsAndLanguages'])
  })

  it('keeps the last section while either of its parts is shown, and drops it with both', () => {
    expect(swissAcademicVisibility([], ['skills'])).toMatchObject({ skills: false, languages: true })
    expect(swissAcademicVisibility([], ['languages'])).toMatchObject({ skills: true, languages: false })
    expect(swissAcademicVisibility([], ['skills', 'languages']).sections).not.toContain('skillsAndLanguages')
  })
})

describe('swissAcademic joined text', () => {
  it('draws an entry as "lead — place", each part only when stored, never breaking before the dash', () => {
    expect(swissAcademicEntryLine('Doctorat en neurosciences', ['Université de Genève'])).toEqual({ lead: 'Doctorat en neurosciences', rest: '\u00A0\u2014 Université de Genève' })
    expect(swissAcademicEntryLine('Chercheuse', ['Biozentrum', 'Bâle'])).toEqual({ lead: 'Chercheuse', rest: '\u00A0\u2014 Biozentrum, Bâle' })
    expect(swissAcademicEntryLine('Chercheuse', ['', ' '])).toEqual({ lead: 'Chercheuse', rest: '' })
    expect(swissAcademicEntryLine(' ', ['Biozentrum'])).toEqual({ lead: '', rest: 'Biozentrum' })
  })

  it('joins the languages as "language (level)", the levels as handed', () => {
    expect(swissAcademicLanguagesText([{ language: 'Italien', level: 'Langue maternelle' }, { language: ' Anglais ', level: 'Courant' }])).toBe(
      'Italien (Langue maternelle), Anglais (Courant)',
    )
  })

  it('draws the contact line in the mockup’s order, its ORCID link a stored website value', () => {
    expect(swissAcademicContactValues({ name: 'Elena', location: 'Bâle', email: 'elena@exemple.ch', website: 'orcid.org/0000-0000-0000-0000' })).toEqual([
      `Bâle${SWISS_IT_CONTACT_DOT}`,
      `elena@exemple.ch${SWISS_IT_CONTACT_DOT}`,
      'orcid.org/0000-0000-0000-0000',
    ])
  })

  it.each(Object.entries(DICTS))('%s: heads the last section from the existing labels, and has the two new labels (FR-6)', (_locale, dict) => {
    const t = dict.resumes.template
    expect(swissAcademicLastHeading(t.skills, t.languages, true, true)).toBe(`${t.skills} & ${t.languages}`)
    expect(swissAcademicLastHeading(t.skills, t.languages, false, true)).toBe(t.languages)
    expect(t.publications).toBeTruthy()
    expect(t.distinctions).toBeTruthy()
  })
})

describe('swissAcademicDateColumnPx: the date column, as wide as the widest date', () => {
  it('measures the dates as drawn, in Georgia at Word’s size (whole half-points), with the safety margin, rounded up', () => {
    const dates = ['09.2015 – 06.2019', '09.2010 – 06.2013', `09.2020 – ${fr.resumes.template.present}`]
    const wordPx = Math.round(SWISS_ACADEMIC_SIZES.date * 1.5) / 1.5
    expect(wordPx).toBeGreaterThan(SWISS_ACADEMIC_SIZES.date)
    const widest = Math.max(...dates.map((date) => georgiaTextWidthPx(swissAcademicDate(date), 'regular', wordPx)))
    expect(swissAcademicDateColumnPx(dates)).toBe(Math.ceil(widest + SWISS_ACADEMIC_DATE_SAFETY_PX))
  })

  it('writes every space of a date as a no-break space, free text included, so a date never wraps inside', () => {
    expect(swissAcademicDate('09.2010 – 06.2013')).toBe('09.2010\u00A0\u2013\u00A006.2013')
    expect(swissAcademicDate('05.2023')).toBe('05.2023')
    expect(swissAcademicDate(' Hiver  2019 à été 2021 ')).toBe('Hiver\u00A02019\u00A0à\u00A0été\u00A02021')
    expect(swissAcademicDate('Hiver 2019 à été 2021')).not.toMatch(/ /)
  })

  it.each(Object.entries(DICTS))('%s: holds a current entry’s date with the localized "present" under the cap', (_locale, dict) => {
    const date = swissItDates('2020-09', undefined, true, dict)
    expect(swissAcademicDateColumnPx([date])).toBeLessThan(160)
  })

  it('grows with a free-text date wider than the old 160px, measured as drawn', () => {
    const freeText = 'Semestre d’hiver 2019 à été 2021'
    const wordPx = Math.round(SWISS_ACADEMIC_SIZES.date * 1.5) / 1.5
    const width = georgiaTextWidthPx(swissAcademicDate(freeText), 'regular', wordPx)
    expect(width).toBeGreaterThan(160)
    expect(width + SWISS_ACADEMIC_DATE_SAFETY_PX).toBeLessThan(SWISS_ACADEMIC_DATE_COLUMN_MAX_PX)
    expect(swissAcademicDateColumnPx(['09.2010 – 06.2013', freeText])).toBe(Math.ceil(width + SWISS_ACADEMIC_DATE_SAFETY_PX))
  })

  it('bounds the column so the entries keep at least 60% of the content width, and is 0 with no date', () => {
    expect(SWISS_ACADEMIC_DATE_COLUMN_MAX_PX).toBe(Math.floor(SWISS_ACADEMIC_CONTENT_WIDTH * 0.4 - SWISS_ACADEMIC_GEOMETRY.dateGap))
    expect(SWISS_ACADEMIC_CONTENT_WIDTH - SWISS_ACADEMIC_DATE_COLUMN_MAX_PX - SWISS_ACADEMIC_GEOMETRY.dateGap).toBeGreaterThanOrEqual(SWISS_ACADEMIC_CONTENT_WIDTH * 0.6)
    expect(swissAcademicDateColumnPx(['A date written as a very long free text that nobody types into the date field of a CV'])).toBe(SWISS_ACADEMIC_DATE_COLUMN_MAX_PX)
    expect(swissAcademicDateColumnPx(['', ''])).toBe(0)
    expect(swissAcademicDateColumnPx([])).toBe(0)
  })
})

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('swissAcademic text colours meet WCAG AA (4.5:1) on the white page', () => {
  const palette = PREVIEW_PALETTE.swissAcademic
  it.each(['ink', 'body', 'muted'] as const)('%s on white', (name) => {
    expect(contrast(palette[name].css, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('draws the muted grey with a wide margin over AA, the rule carrying no text', () => {
    expect(contrast(palette.muted.css, '#ffffff')).toBeGreaterThan(7)
  })
})

/**
 * The owner's rule: no word is ever cut, in any locale, in any output. The
 * narrowest text here is an entry's, beside the date column: every word of
 * these lists fits it whole, measured with Georgia's own advance widths, bold,
 * at the Preview's size and at Word's (whole half-points).
 */
describe('swissAcademic: every word of an entry fits beside the date column', () => {
  const room = SWISS_ACADEMIC_CONTENT_WIDTH - SWISS_ACADEMIC_DATE_COLUMN_MAX_PX - SWISS_ACADEMIC_GEOMETRY.dateGap
  const wordPx = (cssPx: number) => Math.round(cssPx * 1.5) / 1.5
  const LONG_WORDS = {
    de: ['Kommunikationsfähigkeiten', 'Neurowissenschaftlerin', 'Forschungsstipendium', 'Wissenschaftspreis'],
    fr: ['Neuroscientifique', 'Électrophysiologie', 'Postdoctorale'],
    it: ['Neuroscienziata', 'Elettrofisiologia', 'Ricercatrice'],
    en: ['Neuroscientist', 'Electrophysiology', 'Postdoctoral'],
  } as const

  it.each(Object.entries(LONG_WORDS))('%s: each long word fits an entry’s line, bold, at both sizes', (_locale, words) => {
    for (const word of words) {
      for (const size of [SWISS_ACADEMIC_SIZES.body, wordPx(SWISS_ACADEMIC_SIZES.body)]) {
        expect(georgiaTextWidthPx(word, 'bold', size), `${word} at ${size}px`).toBeLessThanOrEqual(room)
      }
    }
  })
})
