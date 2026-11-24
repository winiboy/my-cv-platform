import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import type { Locale } from '@/lib/i18n'
import type { ResumeTemplate } from '@/types/database'
import {
  DEFAULT_RESUME_LAYOUT,
  TEMPLATE_APPLIED_SIZE_KEYS,
  TEMPLATE_EDITOR_SECTIONS,
  TEMPLATE_LAYOUT_CONTROLS,
  templateEditorSections,
  listedEditorSections,
  type EditorMainId,
  type EditorSidebarId,
  templateOffersLayoutControl,
} from '@/lib/layout-settings'
import {
  formatSwissDateRange,
  formatSwissMonth,
  swissContactEntries,
  swissHasText,
  swissSkillContent,
  swissHeading,
  swissLanguageLevel,
  swissVocationalVisibility,
} from '@/lib/swiss-vocational-template'

const DICTS: Record<Locale, unknown> = { fr, en, de, it: it_ }

const ORIGINAL = ['professional', 'modern', 'classic', 'minimal', 'creative'] as const

/** The Swiss templates the schema accepts whose story has not landed. */
const UNBUILT: readonly ResumeTemplate[] = [
  'swissExecutive',
  'swissAcademic',
  'swissFirstJob',
]

describe('swissVocational in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: it paints no user colour, draws no size input and applies no stored font (FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissVocational).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissVocational', 'font')).toBe(false)
    expect(templateOffersLayoutControl('swissVocational', 'sidebarColour')).toBe(false)
    expect(templateOffersLayoutControl('swissVocational', 'perPropertySize')).toBe(false)
    expect(templateOffersLayoutControl('swissVocational', 'sidebarSections')).toBe(true)
  })

  it('applies no per-property size: its sizes are its design (FR-4)', () => {
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissVocational).toEqual([])
  })

  it('lists every section it can hide, each fixed in place, since its order is not reorderable', () => {
    const sections = templateEditorSections('swissVocational')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissVocational)
    expect([...sections.main]).toEqual(['summary', 'experience', 'education'])
    // keyAchievements is not drawn, so it is not listed.
    expect([...sections.sidebar]).toEqual(['training', 'skills', 'languages'])
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
  })

  it('has no registry entry for an unbuilt Swiss id: the editor resolves one as modern, the template it draws', () => {
    for (const id of UNBUILT) {
      expect(Object.keys(TEMPLATE_LAYOUT_CONTROLS), id).not.toContain(id)
      expect(Object.keys(TEMPLATE_APPLIED_SIZE_KEYS), id).not.toContain(id)
      expect(Object.keys(TEMPLATE_EDITOR_SECTIONS), id).not.toContain(id)
      expect(templateEditorSections(id)).toBe(TEMPLATE_EDITOR_SECTIONS.modern)
      expect(templateOffersLayoutControl(id, 'sidebarColour')).toBe(templateOffersLayoutControl('modern', 'sidebarColour'))
    }
  })
})

describe('the order the sections panels list their rows in', () => {
  const SIDEBAR_ORDERS: readonly EditorSidebarId[][] = [
    ['keyAchievements', 'skills', 'languages', 'training'],
    ['languages', 'training', 'keyAchievements', 'skills'],
    ['skills', 'keyAchievements', 'training', 'languages'],
  ]
  const MAIN_ORDERS: readonly EditorMainId[][] = [
    ['summary', 'experience', 'education'],
    ['education', 'summary', 'experience'],
  ]

  it.each(ORIGINAL)('keeps the stored order for %s, exactly as before', (template) => {
    const sections = TEMPLATE_EDITOR_SECTIONS[template]
    for (const order of SIDEBAR_ORDERS) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(order.filter((id) => sections.sidebar.includes(id)))
    }
    for (const order of MAIN_ORDERS) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(order.filter((id) => sections.main.includes(id)))
    }
  })

  it('lists swissVocational rows in the order the template draws them, whatever is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissVocational
    for (const order of SIDEBAR_ORDERS) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['training', 'skills', 'languages'])
    }
    for (const order of MAIN_ORDERS) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'experience', 'education'])
    }
  })
})

describe('swissVocationalVisibility', () => {
  const none = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections

  it('draws the five sections in the fixed order of the mockup', () => {
    expect(swissVocationalVisibility(DEFAULT_RESUME_LAYOUT.hiddenMainSections, none)).toEqual({
      sections: ['summary', 'experience', 'education', 'training', 'skillsAndLanguages'],
      skills: true,
      languages: true,
    })
  })

  it('drops each main section the layout model hides', () => {
    expect(swissVocationalVisibility(['summary', 'education'], none).sections).toEqual([
      'experience',
      'training',
      'skillsAndLanguages',
    ])
  })

  it('drops training, skills and languages through the sidebar visibility, whatever template hid them', () => {
    expect(swissVocationalVisibility([], ['training']).sections).toEqual([
      'summary',
      'experience',
      'education',
      'skillsAndLanguages',
    ])
    expect(swissVocationalVisibility([], ['skills'])).toMatchObject({ skills: false, languages: true })
    expect(swissVocationalVisibility([], ['languages'])).toMatchObject({ skills: true, languages: false })
    // The block goes only when both of its columns are hidden.
    expect(swissVocationalVisibility([], ['skills']).sections).toContain('skillsAndLanguages')
    expect(swissVocationalVisibility([], ['skills', 'languages']).sections).not.toContain('skillsAndLanguages')
  })

  it('is unmoved by keyAchievements, which it does not draw', () => {
    expect(swissVocationalVisibility([], ['keyAchievements'])).toEqual(swissVocationalVisibility([], none))
  })
})

describe('dates', () => {
  it('prints a stored month as MM.YYYY, the Swiss convention, whatever the locale', () => {
    expect(formatSwissMonth('2022-03')).toBe('03.2022')
    expect(formatSwissMonth('2019-12')).toBe('12.2019')
  })

  it('reads the month from the string, so no time zone can move it to the previous month', () => {
    // `new Date('2022-01-01')` is UTC midnight: west of Greenwich it is still December.
    expect(formatSwissMonth('2022-01')).toBe('01.2022')
    expect(formatSwissMonth('2022-01-31')).toBe('01.2022')
  })

  it('prints a value that is not a stored month as stored, not as "Invalid Date"', () => {
    expect(formatSwissMonth('2022')).toBe('2022')
  })

  it('ends a current or open-ended range with the localized "present"', () => {
    expect(formatSwissDateRange('2022-03', undefined, true, fr)).toBe(`03.2022 – ${fr.resumes.template.present}`)
    expect(formatSwissDateRange('2022-03', '2024-01', true, de)).toBe(`03.2022 – ${de.resumes.template.present}`)
    expect(formatSwissDateRange('2019-08', undefined, false, it_)).toBe(`08.2019 – ${it_.resumes.template.present}`)
  })

  it('prints a closed range from start to end', () => {
    expect(formatSwissDateRange('2019-08', '2022-07', false, de)).toBe('08.2019 – 07.2022')
  })

  it('prints the end alone when there is no start date', () => {
    expect(formatSwissDateRange(undefined, '2022-07', false, de)).toBe('07.2022')
  })
})

describe('empty rich text (FR-2)', () => {
  it.each(['', '   ', '<p></p>', '<p><br></p>', '<p>&nbsp;</p>', '<ul><li></li></ul>', ' '])('%j draws nothing', (value) => {
    expect(swissHasText(value)).toBe(false)
  })

  it('counts text inside markup as text', () => {
    expect(swissHasText('<p><strong>Word</strong></p>')).toBe(true)
    expect(swissHasText('Plain')).toBe(true)
  })

  it('draws a skill row from its rich text, else its items, else not at all', () => {
    expect(swissSkillContent({ items: ['Old'], skillsHtml: '<p>New</p>' })).toEqual({ kind: 'html', html: '<p>New</p>' })
    expect(swissSkillContent({ items: ['Abacus', ' ', 'SAP'], skillsHtml: '<p><br></p>' })).toEqual({ kind: 'items', text: 'Abacus, SAP' })
    expect(swissSkillContent({ items: [], skillsHtml: '<p></p>' })).toBeNull()
    expect(swissSkillContent({ items: [] })).toBeNull()
  })
})

describe('words that are not resume content', () => {
  it.each(Object.keys(DICTS) as Locale[])('uses the existing resumes.template headings in %s (FR-6)', (locale) => {
    const dict = DICTS[locale] as { resumes: { template: Record<string, string> } }
    for (const key of ['summary', 'experience', 'education', 'training', 'skills', 'languages'] as const) {
      expect(swissHeading(dict, key)).toBe(dict.resumes.template[key])
    }
  })

  it('throws on a missing heading rather than showing another language', () => {
    expect(() => swissHeading({ resumes: { template: {} } }, 'summary')).toThrow(/resumes\.template\.summary/)
  })

  it.each(Object.keys(DICTS) as Locale[])('names each language level with the existing level words in %s (FR-7)', (locale) => {
    const dict = DICTS[locale] as { resumes: { editor: { levels: Record<string, string> } } }
    for (const level of ['Native', 'Fluent', 'Professional', 'Intermediate', 'Basic'] as const) {
      expect(swissLanguageLevel(dict, level)).toBe(dict.resumes.editor.levels[level.toLowerCase()])
    }
  })

  it('lists only the filled contact fields, labelled in the locale, in the grid order', () => {
    const entries = swissContactEntries(
      { name: 'Ignored', email: 'lea@example.test', phone: '+41 00 000 00 00', location: 'Lausanne', linkedin: '', github: '  ' },
      fr,
    )
    expect(entries).toEqual([
      { key: 'location', label: fr.resumes.editor.location, value: 'Lausanne' },
      { key: 'phone', label: fr.resumes.editor.phone, value: '+41 00 000 00 00' },
      { key: 'email', label: fr.resumes.editor.email, value: 'lea@example.test' },
    ])
  })
})
