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
import {
  SWISS_HEALTH_MAIN_SECTIONS,
  SWISS_HEALTH_SECTIONS,
  SWISS_HEALTH_SIDEBAR_SECTIONS,
  swissHealthLanguageLine,
  swissHealthSections,
  swissHealthSkillContent,
} from '@/lib/swiss-health-template'

describe('swissHealth in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: no user colour, no size input, no stored font (FR-4, FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissHealth).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissHealth', 'font')).toBe(false)
    expect(templateOffersLayoutControl('swissHealth', 'sidebarColour')).toBe(false)
    expect(templateOffersLayoutControl('swissHealth', 'perPropertySize')).toBe(false)
    expect(templateOffersLayoutControl('swissHealth', 'sidebarSections')).toBe(true)
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissHealth).toEqual([])
  })

  it('draws the photo, so the Contact tab offers its photo row (FR-5, FR-14)', () => {
    expect(TEMPLATE_DRAWS_PHOTO.swissHealth).toBe(true)
  })

  it('lists every section it can hide, each fixed, in the order it draws them', () => {
    const sections = templateEditorSections('swissHealth')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissHealth)
    // Education before experience, as the template draws them.
    expect([...sections.main]).toEqual(['summary', 'education', 'experience'])
    // keyAchievements is not drawn, so it is not listed.
    expect([...sections.sidebar]).toEqual(['training', 'skills', 'languages'])
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
    expect([...sections.main]).toEqual([...SWISS_HEALTH_MAIN_SECTIONS])
    expect([...sections.sidebar]).toEqual([...SWISS_HEALTH_SIDEBAR_SECTIONS])
  })

  it('lists its rows in the order the template draws them, whatever order is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissHealth
    const sidebarOrders: EditorSidebarId[][] = [
      ['keyAchievements', 'skills', 'languages', 'training'],
      ['languages', 'skills', 'keyAchievements', 'training'],
    ]
    const mainOrders: EditorMainId[][] = [
      ['summary', 'experience', 'education'],
      ['experience', 'education', 'summary'],
    ]
    for (const order of sidebarOrders) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['training', 'skills', 'languages'])
    }
    for (const order of mainOrders) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'education', 'experience'])
    }
  })
})

describe('swissHealthSections', () => {
  it('draws the mockup order: summary, education, experience, continuing education, skills, languages', () => {
    expect(SWISS_HEALTH_SECTIONS).toEqual(['summary', 'education', 'experience', 'training', 'skills', 'languages'])
    expect(swissHealthSections([], [])).toEqual([...SWISS_HEALTH_SECTIONS])
  })

  it('leaves out main sections hidden through hiddenMainSections', () => {
    expect(swissHealthSections(['summary', 'experience'], [])).toEqual(['education', 'training', 'skills', 'languages'])
  })

  it('leaves out certifications, skills and languages hidden through hiddenSidebarSections, each on its own', () => {
    expect(swissHealthSections([], ['training'])).toEqual(['summary', 'education', 'experience', 'skills', 'languages'])
    expect(swissHealthSections([], ['skills', 'languages'])).toEqual(['summary', 'education', 'experience', 'training'])
  })

  it('ignores keyAchievements, which it does not draw, and an id hidden through the other panel', () => {
    expect(swissHealthSections([], ['keyAchievements'])).toEqual([...SWISS_HEALTH_SECTIONS])
    expect(swissHealthSections(['skills', 'training'], ['summary', 'education'])).toEqual([...SWISS_HEALTH_SECTIONS])
  })
})

describe('swissHealth labels', () => {
  it('labels a language with its level, as the mockup does (FR-7)', () => {
    expect(swissHealthLanguageLine('Italien', 'Langue maternelle')).toBe('Italien — Langue maternelle')
  })
})

describe('swissHealthSkillContent', () => {
  it('joins legacy items with " · " as running text when there is no rich text', () => {
    expect(swissHealthSkillContent({ items: ['Soins aigus', ' ', 'Gériatrie '] })).toEqual({ kind: 'text', text: 'Soins aigus · Gériatrie' })
  })

  it('joins a comma-separated rich-text paragraph with " · ", entities decoded', () => {
    expect(swissHealthSkillContent({ items: [], skillsHtml: '<p>Soins de plaies, Dossier patient,&nbsp;R&amp;D</p>' })).toEqual({
      kind: 'text',
      text: 'Soins de plaies · Dossier patient · R&D',
    })
    expect(swissHealthSkillContent({ items: [], skillsHtml: 'Gériatrie, Éducation thérapeutique' })).toEqual({
      kind: 'text',
      text: 'Gériatrie · Éducation thérapeutique',
    })
  })

  it('prefers the rich text to stale items, as every template does', () => {
    expect(swissHealthSkillContent({ items: ['Old skill'], skillsHtml: '<p>New skill</p>' })).toEqual({ kind: 'text', text: 'New skill' })
  })

  it('keeps formatting, lists and line breaks as rich text, so nothing is lost', () => {
    for (const skillsHtml of ['<p><strong>BLS</strong>, Gériatrie</p>', '<ul><li>BLS</li></ul>', '<p>BLS</p><p>AED</p>', 'BLS\nAED']) {
      expect(swissHealthSkillContent({ items: [], skillsHtml }), skillsHtml).toEqual({ kind: 'html', html: skillsHtml })
    }
  })

  it('draws nothing for a category with no skills', () => {
    expect(swissHealthSkillContent({ items: [] })).toBeNull()
    expect(swissHealthSkillContent({ items: ['  '], skillsHtml: '<p></p>' })).toBeNull()
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

describe('swissHealth text colours meet WCAG AA (4.5:1) on what they are drawn on', () => {
  const palette = PREVIEW_PALETTE.swissHealth
  const WHITE = '#ffffff'

  it.each([
    ['heading', WHITE],
    ['heading', palette.pill.css],
    ['accent', WHITE],
    ['ink', WHITE],
    ['muted', WHITE],
    ['contact', WHITE],
    ['body', WHITE],
  ] as const)('%s on %s', (name, background) => {
    expect(contrast(palette[name].css, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('draws the title and the dates darker than the mockup’s teal, which fails AA on white', () => {
    expect(palette.accent.css).toBe('#0f766e')
    expect(contrast('#14a39a', WHITE)).toBeLessThan(4.5)
  })
})
