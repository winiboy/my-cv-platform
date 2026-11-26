import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
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
import {
  SWISS_TRADES_MAIN_SECTIONS,
  SWISS_TRADES_SIDEBAR_SECTIONS,
  swissTradesCertificateDetail,
  swissTradesContactHeading,
  swissTradesLanguageLine,
  swissTradesSections,
  swissTradesSkillContent,
} from '@/lib/swiss-trades-template'

describe('swissTrades in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: no user colour, no size input, no stored font (FR-4, FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissTrades).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissTrades', 'sidebarSections')).toBe(true)
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissTrades).toEqual([])
  })

  it('draws the photo, so the Contact tab offers its photo row (FR-5, FR-14)', () => {
    expect(TEMPLATE_DRAWS_PHOTO.swissTrades).toBe(true)
  })

  it('lists every section it can hide, each fixed, in the order it draws them', () => {
    const sections = templateEditorSections('swissTrades')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissTrades)
    expect([...sections.main]).toEqual(['summary', 'experience', 'education'])
    // keyAchievements is not drawn, so it is not listed.
    expect([...sections.sidebar]).toEqual(['skills', 'training', 'languages'])
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
    // The panels' rows are the template's own sequences.
    expect([...sections.main]).toEqual([...SWISS_TRADES_MAIN_SECTIONS])
    expect([...sections.sidebar]).toEqual([...SWISS_TRADES_SIDEBAR_SECTIONS])
  })

  it('lists its rows in the order the template draws them, whatever order is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissTrades
    const sidebarOrders: EditorSidebarId[][] = [
      ['keyAchievements', 'skills', 'languages', 'training'],
      ['languages', 'training', 'keyAchievements', 'skills'],
    ]
    const mainOrders: EditorMainId[][] = [['education', 'summary', 'experience']]
    for (const order of sidebarOrders) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['skills', 'training', 'languages'])
    }
    for (const order of mainOrders) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'experience', 'education'])
    }
  })
})

describe('swissTradesSections', () => {
  it('draws the mockup order: summary, experience, education; skills, certificates, languages', () => {
    expect(swissTradesSections([], [])).toEqual({
      main: ['summary', 'experience', 'education'],
      sidebar: ['skills', 'training', 'languages'],
    })
  })

  it('leaves out main sections hidden through hiddenMainSections', () => {
    expect(swissTradesSections(['summary', 'education'], []).main).toEqual(['experience'])
  })

  it('leaves out skills, certificates and languages hidden through hiddenSidebarSections, each on its own', () => {
    expect(swissTradesSections([], ['training']).sidebar).toEqual(['skills', 'languages'])
    expect(swissTradesSections([], ['skills', 'languages']).sidebar).toEqual(['training'])
  })

  it('ignores keyAchievements, which it does not draw, and a sidebar id hidden as main', () => {
    expect(swissTradesSections([], ['keyAchievements']).sidebar).toEqual([...SWISS_TRADES_SIDEBAR_SECTIONS])
    expect(swissTradesSections(['skills'], []).sidebar).toEqual([...SWISS_TRADES_SIDEBAR_SECTIONS])
  })
})

describe('swissTrades labels', () => {
  it('labels a language with its level, as the mockup does (FR-7)', () => {
    expect(swissTradesLanguageLine('Français', 'Langue maternelle')).toBe('Français — Langue maternelle')
  })

  it('joins a certificate’s issuer and month, leaving out what is not stored', () => {
    expect(swissTradesCertificateDetail('SUVA', '05.2021')).toBe('SUVA, 05.2021')
    expect(swissTradesCertificateDetail('', '05.2021')).toBe('05.2021')
    expect(swissTradesCertificateDetail(' SUVA ', '')).toBe('SUVA')
    expect(swissTradesCertificateDetail(undefined, '')).toBe('')
  })

  it('reads the Contact heading from the editor’s own section name in every locale', () => {
    for (const dict of [fr, en, de, it_]) {
      expect(swissTradesContactHeading(dict)).toBe(dict.resumes.editor.sections.contact)
    }
    expect(() => swissTradesContactHeading({})).toThrow(/resumes\.editor\.sections\.contact/)
  })
})

describe('swissTradesSkillContent', () => {
  it('draws legacy items as tags when there is no rich text', () => {
    expect(swissTradesSkillContent({ items: ['Soudure MIG/MAG', ' ', 'Fraisage '] })).toEqual({
      kind: 'tags',
      tags: ['Soudure MIG/MAG', 'Fraisage'],
    })
  })

  it('draws a comma-separated rich-text paragraph as tags, entities decoded', () => {
    expect(swissTradesSkillContent({ items: [], skillsHtml: '<p>Lecture de plans, Tournage CNC,&nbsp;R&amp;D</p>' })).toEqual({
      kind: 'tags',
      tags: ['Lecture de plans', 'Tournage CNC', 'R&D'],
    })
  })

  it('draws comma-separated plain text as tags, read literally as formatText reads it', () => {
    expect(swissTradesSkillContent({ items: [], skillsHtml: 'Fraisage, Maintenance' })).toEqual({
      kind: 'tags',
      tags: ['Fraisage', 'Maintenance'],
    })
  })

  it('prefers the rich text to stale items, as every template does', () => {
    expect(swissTradesSkillContent({ items: ['Old skill'], skillsHtml: '<p>New skill</p>' })).toEqual({ kind: 'tags', tags: ['New skill'] })
  })

  it('keeps formatting, lists and line breaks as rich text, so nothing is lost', () => {
    for (const skillsHtml of [
      '<p><strong>CNC</strong>, Fraisage</p>',
      '<ul><li>CNC</li><li>Fraisage</li></ul>',
      '<p>CNC</p><p>Fraisage</p>',
      'CNC\nFraisage',
      '- CNC, Fraisage',
      '1. CNC',
    ]) {
      expect(swissTradesSkillContent({ items: [], skillsHtml }), skillsHtml).toEqual({ kind: 'html', html: skillsHtml })
    }
  })

  it('draws nothing for a category with no skills', () => {
    expect(swissTradesSkillContent({ items: [] })).toBeNull()
    expect(swissTradesSkillContent({ items: ['  '], skillsHtml: '<p></p>' })).toBeNull()
  })
})
