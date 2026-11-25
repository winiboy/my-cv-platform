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
import { PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { interTextWidthPx } from '@/test/inter-advance-widths'
import { SWISS_IT_CONTACT_DOT } from '@/lib/swiss-it-template'
import {
  SWISS_EXECUTIVE_CARD_TEXT_WIDTH,
  SWISS_EXECUTIVE_CONTENT_WIDTH,
  SWISS_EXECUTIVE_GEOMETRY,
  SWISS_EXECUTIVE_MAIN_SECTIONS,
  SWISS_EXECUTIVE_SECTIONS,
  SWISS_EXECUTIVE_SIDEBAR_SECTIONS,
  SWISS_EXECUTIVE_SIZES,
  swissExecutiveCertificate,
  swissExecutiveContactValues,
  swissExecutiveLastHeading,
  swissExecutiveVisibility,
} from '@/lib/swiss-executive-template'

const DICTS = { fr, en, de, it: it_ } as const

describe('swissExecutive in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: no user colour, no size input, no stored font (FR-4, FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissExecutive).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissExecutive', 'font')).toBe(false)
    expect(templateOffersLayoutControl('swissExecutive', 'sidebarColour')).toBe(false)
    expect(templateOffersLayoutControl('swissExecutive', 'perPropertySize')).toBe(false)
    expect(templateOffersLayoutControl('swissExecutive', 'sidebarSections')).toBe(true)
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissExecutive).toEqual([])
  })

  it('draws the photo, so the Contact tab offers its photo row (FR-5, FR-14)', () => {
    expect(TEMPLATE_DRAWS_PHOTO.swissExecutive).toBe(true)
  })

  it('lists every section it can hide, each fixed, in the order it draws them, and no skills row: it draws no skills', () => {
    const sections = templateEditorSections('swissExecutive')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissExecutive)
    expect([...sections.main]).toEqual(['summary', 'experience', 'education'])
    expect([...sections.sidebar]).toEqual(['keyAchievements', 'languages', 'training'])
    expect([...sections.sidebar]).not.toContain('skills')
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
    expect([...sections.main]).toEqual([...SWISS_EXECUTIVE_MAIN_SECTIONS])
    expect([...sections.sidebar]).toEqual([...SWISS_EXECUTIVE_SIDEBAR_SECTIONS])
  })

  it('offers exactly the rows it draws, and no other', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissExecutive
    const drawn = SWISS_EXECUTIVE_SECTIONS.flatMap((id) => (id === 'languagesAndCertifications' ? ['languages', 'training'] : [id]))
    expect(drawn.sort()).toEqual([...sections.main, ...sections.sidebar].sort())
  })

  it('lists its rows in the order the template draws them, whatever order is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissExecutive
    const sidebarOrders: EditorSidebarId[][] = [
      ['keyAchievements', 'languages', 'training'],
      ['training', 'skills', 'languages', 'keyAchievements'],
    ]
    const mainOrders: EditorMainId[][] = [
      ['summary', 'experience', 'education'],
      ['education', 'summary', 'experience'],
    ]
    for (const order of sidebarOrders) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['keyAchievements', 'languages', 'training'])
    }
    for (const order of mainOrders) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'experience', 'education'])
    }
  })

  it('spaces the CV title’s capitals as Tailwind’s tracking-widest', () => {
    expect(PREVIEW_TRACKING.swissExecutive).toEqual({ caps: 0.1 })
  })
})

describe('swissExecutiveVisibility', () => {
  it('draws the mockup order: summary, key achievements, experience, education, then languages and certifications', () => {
    expect(swissExecutiveVisibility([], [])).toEqual({
      sections: ['summary', 'keyAchievements', 'experience', 'education', 'languagesAndCertifications'],
      languages: true,
      certifications: true,
    })
  })

  it('leaves out summary, experience and education hidden through hiddenMainSections', () => {
    expect(swissExecutiveVisibility(['summary', 'education'], []).sections).toEqual(['keyAchievements', 'experience', 'languagesAndCertifications'])
  })

  it('leaves out the projects hidden through hiddenSidebarSections, and is unaffected by a hidden skills row', () => {
    expect(swissExecutiveVisibility([], ['keyAchievements', 'skills']).sections).toEqual(['summary', 'experience', 'education', 'languagesAndCertifications'])
  })

  it('keeps the last section while either of its parts is shown, and drops it with both', () => {
    expect(swissExecutiveVisibility([], ['languages'])).toMatchObject({ languages: false, certifications: true })
    expect(swissExecutiveVisibility([], ['training'])).toMatchObject({ languages: true, certifications: false })
    expect(swissExecutiveVisibility([], ['languages', 'training']).sections).not.toContain('languagesAndCertifications')
  })
})

describe('swissExecutive joined text', () => {
  it('joins the contact details on one line in the mockup’s order, GitHub and website after LinkedIn, a dot after all but the last', () => {
    expect(
      swissExecutiveContactValues({
        name: 'Catherine',
        email: 'catherine@exemple.ch',
        phone: '+41 79 890 12 34',
        location: 'Genève',
        linkedin: 'linkedin.com/in/catherine',
        github: '',
        website: ' catherine.ch ',
      }),
    ).toEqual([
      `Genève${SWISS_IT_CONTACT_DOT}`,
      `+41 79 890 12 34${SWISS_IT_CONTACT_DOT}`,
      `catherine@exemple.ch${SWISS_IT_CONTACT_DOT}`,
      `linkedin.com/in/catherine${SWISS_IT_CONTACT_DOT}`,
      'catherine.ch',
    ])
    expect(swissExecutiveContactValues({ name: 'Catherine', email: ' ', phone: '', location: '' })).toEqual([])
  })

  it('draws a certificate as "name, issuer (MM.YYYY)", each part only when stored', () => {
    expect(swissExecutiveCertificate('Administratrice indépendante', 'Association romande medtech', '05.2020')).toBe(
      'Administratrice indépendante, Association romande medtech (05.2020)',
    )
    expect(swissExecutiveCertificate('Board member', '', '05.2020')).toBe('Board member (05.2020)')
    expect(swissExecutiveCertificate('Board member', 'Association', '')).toBe('Board member, Association')
    expect(swissExecutiveCertificate(' ', undefined, '05.2020')).toBe('05.2020')
    expect(swissExecutiveCertificate('', ' ', '')).toBe('')
  })

  it.each(Object.entries(DICTS))('%s: heads the last section from the existing labels only (FR-6)', (_locale, dict) => {
    const t = dict.resumes.template
    expect(swissExecutiveLastHeading(t.languages, t.training, true, true)).toBe(`${t.languages} & ${t.training}`)
    expect(swissExecutiveLastHeading(t.languages, t.training, true, false)).toBe(t.languages)
    expect(swissExecutiveLastHeading(t.languages, t.training, false, true)).toBe(t.training)
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

describe('swissExecutive text colours meet WCAG AA (4.5:1) on every background they are drawn on', () => {
  const palette = PREVIEW_PALETTE.swissExecutive
  const WHITE = '#ffffff'
  const CREAM = palette.cream.css

  it.each([
    // The name, the bold leads; the CV title and the headings; running text, dates and second lines.
    ['ink', WHITE],
    ['accent', WHITE],
    ['body', WHITE],
    ['muted', WHITE],
    // The summary in its cream box.
    ['body', CREAM],
  ] as const)('%s on %s', (name, background) => {
    expect(contrast(palette[name].css, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('draws the burgundy with a wide margin over AA, also on the cream box', () => {
    expect(contrast(palette.accent.css, WHITE)).toBeGreaterThan(7)
    expect(contrast(palette.accent.css, CREAM)).toBeGreaterThan(7)
  })
})

/**
 * The owner's rule: no word is ever cut, in any locale, in any output. The
 * achievement cards are the narrow boxes: every word of these lists — long
 * words of each locale, as a key achievement may hold them — fits one line of
 * a card whole, measured with Inter's own advance widths, at the Preview's
 * size and at Word's (whole half-points), bold where it is drawn bold.
 */
describe('swissExecutive: every word of an achievement card fits it whole', () => {
  const room = SWISS_EXECUTIVE_CARD_TEXT_WIDTH
  /** Word draws a run in whole half-points: 13px rounds to 10pt. */
  const wordPx = (cssPx: number) => Math.round(cssPx * 1.5) / 1.5

  const LONG_WORDS = {
    de: ['Kommunikationsfähigkeiten', 'Unternehmensentwicklung', 'Restrukturierungsprogramme', 'Geschäftsleitungsmitglied', 'Verwaltungsratsmandat'],
    fr: ['Restructuration', 'Internationalisation', 'Transformation', 'Administratrice'],
    it: ['Internazionalizzazione', 'Ristrutturazione', 'Amministrazione'],
    en: ['Internationalisation', 'Transformation', 'Restructuring'],
  } as const

  it('leaves a card 323px of text: half the content less half the gap', () => {
    expect(SWISS_EXECUTIVE_CONTENT_WIDTH).toBe(PAGE_WIDTH_PX - 2 * SWISS_EXECUTIVE_GEOMETRY.paddingX)
    expect(room).toBe(323)
  })

  it.each(Object.entries(LONG_WORDS))('%s: each long word fits a card’s line, bold, at the Preview’s and at Word’s size', (_locale, words) => {
    for (const word of words) {
      for (const size of [SWISS_EXECUTIVE_SIZES.body, wordPx(SWISS_EXECUTIVE_SIZES.body)]) {
        expect(interTextWidthPx(word, 700, size), `${word} at ${size}px`).toBeLessThanOrEqual(room)
      }
    }
  })
})
