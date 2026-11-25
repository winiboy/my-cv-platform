import { describe, expect, it } from 'vitest'
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
import { georgiaTextWidthPx } from '@/lib/georgia-advance-widths'
import {
  SWISS_FINANCE_GEOMETRY,
  SWISS_FINANCE_LABEL_MAX_PX,
  SWISS_FINANCE_MIN_VALUE_PX,
  SWISS_FINANCE_TEXT_WIDTH,
  swissFinanceLabelColumnPx,
  SWISS_FINANCE_MAIN_SECTIONS,
  SWISS_FINANCE_SECTIONS,
  SWISS_FINANCE_SIDEBAR_SECTIONS,
  swissFinanceFirstLine,
  swissFinanceLanguage,
  swissFinanceLanguagesLine,
  swissFinanceSections,
  swissFinanceSkillContent,
  swissFinanceSkillsHeading,
} from '@/lib/swiss-finance-template'

describe('swissFinance in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: no user colour, no size input, no stored font (FR-4, FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissFinance).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissFinance', 'font')).toBe(false)
    expect(templateOffersLayoutControl('swissFinance', 'sidebarColour')).toBe(false)
    expect(templateOffersLayoutControl('swissFinance', 'perPropertySize')).toBe(false)
    expect(templateOffersLayoutControl('swissFinance', 'sidebarSections')).toBe(true)
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissFinance).toEqual([])
  })

  it('draws the photo, so the Contact tab offers its photo row (FR-5, FR-14)', () => {
    expect(TEMPLATE_DRAWS_PHOTO.swissFinance).toBe(true)
  })

  it('lists every section it can hide, each fixed, in the order it draws them', () => {
    const sections = templateEditorSections('swissFinance')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissFinance)
    expect([...sections.main]).toEqual(['summary', 'experience', 'education'])
    // keyAchievements is not drawn, so it is not listed.
    expect([...sections.sidebar]).toEqual(['training', 'skills', 'languages'])
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
    expect([...sections.main]).toEqual([...SWISS_FINANCE_MAIN_SECTIONS])
    expect([...sections.sidebar]).toEqual([...SWISS_FINANCE_SIDEBAR_SECTIONS])
  })

  it('lists its rows in the order the template draws them, whatever order is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissFinance
    const sidebarOrders: EditorSidebarId[][] = [
      ['keyAchievements', 'skills', 'languages', 'training'],
      ['languages', 'skills', 'keyAchievements', 'training'],
    ]
    const mainOrders: EditorMainId[][] = [
      ['education', 'experience', 'summary'],
      ['experience', 'summary', 'education'],
    ]
    for (const order of sidebarOrders) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['training', 'skills', 'languages'])
    }
    for (const order of mainOrders) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'experience', 'education'])
    }
  })
})

describe('swissFinanceSections', () => {
  it('draws the mockup order: summary, experience, education, certifications, then skills and languages', () => {
    expect(SWISS_FINANCE_SECTIONS).toEqual(['summary', 'experience', 'education', 'training', 'skills', 'languages'])
    expect(swissFinanceSections([], [])).toEqual([...SWISS_FINANCE_SECTIONS])
  })

  it('leaves out main sections hidden through hiddenMainSections', () => {
    expect(swissFinanceSections(['summary', 'education'], [])).toEqual(['experience', 'training', 'skills', 'languages'])
  })

  it('leaves out certifications, skills and languages hidden through hiddenSidebarSections, each on its own', () => {
    expect(swissFinanceSections([], ['training'])).toEqual(['summary', 'experience', 'education', 'skills', 'languages'])
    expect(swissFinanceSections([], ['skills'])).toEqual(['summary', 'experience', 'education', 'training', 'languages'])
    expect(swissFinanceSections([], ['languages'])).toEqual(['summary', 'experience', 'education', 'training', 'skills'])
  })

  it('ignores keyAchievements, which it does not draw, and an id hidden through the other panel', () => {
    expect(swissFinanceSections([], ['keyAchievements'])).toEqual([...SWISS_FINANCE_SECTIONS])
    expect(swissFinanceSections(['skills', 'training'], ['summary', 'education'])).toEqual([...SWISS_FINANCE_SECTIONS])
  })
})

describe('swissFinanceFirstLine', () => {
  it('draws the first stored part in bold and joins the rest after it with ", "', () => {
    expect(swissFinanceFirstLine(['Senior Credit Analyst', 'Banque Limmat SA', 'Zurich'])).toEqual({
      lead: 'Senior Credit Analyst',
      rest: ', Banque Limmat SA, Zurich',
    })
  })

  it('leads with the employer when there is no position, and leaves no dangling comma for an empty part', () => {
    expect(swissFinanceFirstLine(['', 'Banque Limmat SA', 'Zurich'])).toEqual({ lead: 'Banque Limmat SA', rest: ', Zurich' })
    expect(swissFinanceFirstLine([' Analyst ', '  ', undefined])).toEqual({ lead: 'Analyst', rest: '' })
    expect(swissFinanceFirstLine([null, undefined, ' '])).toEqual({ lead: '', rest: '' })
  })
})

describe('swissFinance labels', () => {
  it('labels a language with its level in brackets, as the mockup does (FR-7)', () => {
    expect(swissFinanceLanguage('Allemand', 'Langue maternelle')).toBe('Allemand (Langue maternelle)')
    expect(
      swissFinanceLanguagesLine([
        { language: 'Allemand', level: 'Langue maternelle' },
        { language: 'Français', level: 'Courant' },
      ]),
    ).toBe('Allemand (Langue maternelle), Français (Courant)')
    expect(swissFinanceLanguagesLine([])).toBe('')
  })

  it('heads the table with the existing labels: both joined when it holds both, else the one it holds (FR-6)', () => {
    expect(swissFinanceSkillsHeading('Compétences', 'Langues', true, true)).toBe('Compétences & Langues')
    expect(swissFinanceSkillsHeading('Compétences', 'Langues', true, false)).toBe('Compétences')
    expect(swissFinanceSkillsHeading('Compétences', 'Langues', false, true)).toBe('Langues')
  })
})

describe('swissFinanceSkillContent', () => {
  it('joins legacy items with ", " when there is no rich text', () => {
    expect(swissFinanceSkillContent({ items: ['Bilans', ' ', 'Cash-flow '] })).toEqual({ kind: 'text', text: 'Bilans, Cash-flow' })
  })

  it('reads a comma-separated rich-text paragraph back as one line, entities decoded', () => {
    expect(swissFinanceSkillContent({ items: [], skillsHtml: '<p>Avaloq, Excel avancé,&nbsp;M&amp;A</p>' })).toEqual({
      kind: 'text',
      text: 'Avaloq, Excel avancé, M&A',
    })
  })

  it('prefers the rich text to stale items, as every template does', () => {
    expect(swissFinanceSkillContent({ items: ['Old skill'], skillsHtml: '<p>New skill</p>' })).toEqual({ kind: 'text', text: 'New skill' })
  })

  it('keeps formatting, lists and line breaks as rich text, so nothing is lost', () => {
    for (const skillsHtml of ['<p><strong>Bilans</strong>, notation</p>', '<ul><li>Bilans</li></ul>', '<p>Bilans</p><p>Notation</p>', 'Bilans\nNotation']) {
      expect(swissFinanceSkillContent({ items: [], skillsHtml }), skillsHtml).toEqual({ kind: 'html', html: skillsHtml })
    }
  })

  it('draws nothing for a category with no skills', () => {
    expect(swissFinanceSkillContent({ items: [] })).toBeNull()
    expect(swissFinanceSkillContent({ items: ['  '], skillsHtml: '<p></p>' })).toBeNull()
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

describe('swissFinance text colours meet WCAG AA (4.5:1) on the white page', () => {
  const palette = PREVIEW_PALETTE.swissFinance
  const WHITE = '#ffffff'

  it.each(['accent', 'ink', 'muted', 'body'] as const)('%s on white', (name) => {
    expect(contrast(palette[name].css, WHITE)).toBeGreaterThanOrEqual(4.5)
  })

  it('draws only these four as text: the rule and the photo fill carry none', () => {
    expect(Object.keys(palette).sort()).toEqual(['accent', 'body', 'ink', 'muted', 'photoFill', 'rule'])
  })
})

describe('swissFinanceLabelColumnPx: the label column rule, fit-content of the cap', () => {
  const cap = SWISS_FINANCE_GEOMETRY.labelMaxFraction * SWISS_FINANCE_TEXT_WIDTH
  const bold = (text: string) => georgiaTextWidthPx(text, 'bold', 13)

  it('is as wide as the widest label when that fits under the cap', () => {
    const labels = ['HR Fachkenntnisse', 'Kommunikationsfähigkeiten', 'Tools & Systeme']
    expect(swissFinanceLabelColumnPx(labels, 13)).toBe(Math.ceil(bold('Kommunikationsfähigkeiten')))
  })

  it('stops at the cap for a long label of several words, but never below its widest word', () => {
    const label = 'Kenntnisse der Rechnungslegung nach internationalen Standards'
    expect(swissFinanceLabelColumnPx([label], 13)).toBe(Math.ceil(cap))
    const word = 'Finanzdienstleistungsaufsichtskompetenz'
    expect(swissFinanceLabelColumnPx([word], 13)).toBe(Math.ceil(bold(word)))
  })

  it('never passes the hard maximum, even for a word wider than it', () => {
    const label = 'SAP/Avaloq/Bloomberg/Finnova/Abacus/Excel/PowerBI/Tableau/Python/SQL/VBA/Murex/Calypso/Summit/Kondor/Reuters/FactSet/Morningstar'
    expect(label.length).toBeGreaterThanOrEqual(120)
    expect(swissFinanceLabelColumnPx([label], 13)).toBe(SWISS_FINANCE_LABEL_MAX_PX)
    expect(SWISS_FINANCE_LABEL_MAX_PX).toBe(Math.floor(0.5 * SWISS_FINANCE_TEXT_WIDTH))
    expect(SWISS_FINANCE_MIN_VALUE_PX).toBe(SWISS_FINANCE_TEXT_WIDTH - SWISS_FINANCE_LABEL_MAX_PX - SWISS_FINANCE_GEOMETRY.labelGap)
    expect(SWISS_FINANCE_MIN_VALUE_PX).toBeGreaterThan(0)
  })

  it('wraps at ASCII whitespace only: a no-break space holds its words together', () => {
    const label = 'Rechnungslegung\u00a0Konzernabschluss'
    expect(swissFinanceLabelColumnPx([label], 13)).toBe(Math.ceil(bold(label)))
    expect(swissFinanceLabelColumnPx(['Rechnungslegung Konzernabschluss'], 13)).toBe(Math.ceil(bold('Rechnungslegung Konzernabschluss')))
    const wide = 'Kenntnisse\u00a0der\u00a0Rechnungslegung\u00a0nach\u00a0Standards'
    expect(bold(wide)).toBeGreaterThan(cap)
    expect(swissFinanceLabelColumnPx([wide], 13)).toBe(Math.min(SWISS_FINANCE_LABEL_MAX_PX, Math.ceil(bold(wide))))
  })

  it('is nothing for no labels, and caps at a share of the text width', () => {
    expect(swissFinanceLabelColumnPx([], 13)).toBe(0)
    expect(SWISS_FINANCE_TEXT_WIDTH).toBe(794 - 2 * SWISS_FINANCE_GEOMETRY.paddingX)
  })
})
