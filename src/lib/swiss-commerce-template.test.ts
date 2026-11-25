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
import {
  SWISS_COMMERCE_SECTIONS,
  swissCommerceLanguagePill,
  swissCommerceSections,
  swissCommerceSkillLabel,
} from '@/lib/swiss-commerce-template'

describe('swissCommerce in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: no user colour, no size input, no stored font (FR-4, FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissCommerce).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissCommerce', 'font')).toBe(false)
    expect(templateOffersLayoutControl('swissCommerce', 'sidebarColour')).toBe(false)
    expect(templateOffersLayoutControl('swissCommerce', 'perPropertySize')).toBe(false)
    expect(templateOffersLayoutControl('swissCommerce', 'sidebarSections')).toBe(true)
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissCommerce).toEqual([])
  })

  it('draws the photo, so the Contact tab offers its photo row (FR-5, FR-14)', () => {
    expect(TEMPLATE_DRAWS_PHOTO.swissCommerce).toBe(true)
  })

  it('lists every section it can hide, each fixed, in the order it draws them', () => {
    const sections = templateEditorSections('swissCommerce')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissCommerce)
    expect([...sections.main]).toEqual(['summary', 'experience', 'education'])
    // keyAchievements is not drawn, so it is not listed.
    expect([...sections.sidebar]).toEqual(['skills', 'languages', 'training'])
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
    // The panels' rows, main then sidebar, are the template's own sequence.
    expect([...sections.main, ...sections.sidebar]).toEqual([...SWISS_COMMERCE_SECTIONS])
  })

  it('lists its rows in the order the template draws them, whatever order is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissCommerce
    const sidebarOrders: EditorSidebarId[][] = [
      ['keyAchievements', 'skills', 'languages', 'training'],
      ['training', 'languages', 'keyAchievements', 'skills'],
    ]
    const mainOrders: EditorMainId[][] = [['education', 'summary', 'experience']]
    for (const order of sidebarOrders) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['skills', 'languages', 'training'])
    }
    for (const order of mainOrders) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'experience', 'education'])
    }
  })
})

describe('swissCommerceSections', () => {
  it('draws the mockup order: summary, experience, education, skills, languages, training', () => {
    expect(swissCommerceSections([], [])).toEqual(['summary', 'experience', 'education', 'skills', 'languages', 'training'])
  })

  it('leaves out main sections hidden through hiddenMainSections', () => {
    expect(swissCommerceSections(['summary', 'education'], [])).toEqual(['experience', 'skills', 'languages', 'training'])
  })

  it('leaves out skills, languages and training hidden through hiddenSidebarSections, each on its own', () => {
    expect(swissCommerceSections([], ['languages'])).toEqual(['summary', 'experience', 'education', 'skills', 'training'])
    expect(swissCommerceSections([], ['skills', 'training'])).toEqual(['summary', 'experience', 'education', 'languages'])
  })

  it('ignores keyAchievements, which it does not draw, and a sidebar id hidden as main', () => {
    expect(swissCommerceSections([], ['keyAchievements'])).toEqual([...SWISS_COMMERCE_SECTIONS])
    expect(swissCommerceSections(['skills'], [])).toEqual([...SWISS_COMMERCE_SECTIONS])
  })
})

describe('swissCommerce labels', () => {
  it('labels a language pill with the language and its level, as the mockup does', () => {
    expect(swissCommerceLanguagePill('Français', 'Langue maternelle')).toBe('Français — Langue maternelle')
  })

  it('ends a skill category label with a colon, the same in every locale', () => {
    expect(swissCommerceSkillLabel('Bureautique')).toBe('Bureautique:')
  })
})
