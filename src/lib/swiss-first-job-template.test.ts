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
import { interLinkWidthPx } from '@/lib/inter-link-widths'
import {
  SWISS_FIRST_JOB_EMAIL_MIN_HALF_POINTS,
  SWISS_FIRST_JOB_EMAIL_SAFETY_PX,
  SWISS_FIRST_JOB_GEOMETRY,
  SWISS_FIRST_JOB_MAIN_SECTIONS,
  SWISS_FIRST_JOB_SIDEBAR_SECTIONS,
  SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH,
  SWISS_FIRST_JOB_SIZES,
  swissFirstJobCertificate,
  swissFirstJobContactLines,
  swissFirstJobEmailFit,
  swissFirstJobEmailWidthPx,
  swissFirstJobLanguageDots,
  swissFirstJobSections,
} from '@/lib/swiss-first-job-template'

const DICTS = { fr, en, de, it: it_ } as const

describe('swissFirstJob in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: no user colour, no size input, no stored font (FR-4, FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissFirstJob).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissFirstJob', 'font')).toBe(false)
    expect(templateOffersLayoutControl('swissFirstJob', 'sidebarColour')).toBe(false)
    expect(templateOffersLayoutControl('swissFirstJob', 'perPropertySize')).toBe(false)
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissFirstJob).toEqual([])
  })

  it('draws the photo, so the Contact tab offers its photo row (FR-5, FR-14)', () => {
    expect(TEMPLATE_DRAWS_PHOTO.swissFirstJob).toBe(true)
  })

  it('lists every section it can hide, each fixed, in the order it draws them, and no projects row: it draws none', () => {
    const sections = templateEditorSections('swissFirstJob')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissFirstJob)
    expect([...sections.main]).toEqual(['summary', 'experience', 'education'])
    expect([...sections.sidebar]).toEqual(['skills', 'languages', 'training'])
    expect([...sections.sidebar]).not.toContain('keyAchievements')
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
    expect([...sections.main]).toEqual([...SWISS_FIRST_JOB_MAIN_SECTIONS])
    expect([...sections.sidebar]).toEqual([...SWISS_FIRST_JOB_SIDEBAR_SECTIONS])
  })

  it('lists its rows in the order the template draws them, whatever order is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissFirstJob
    const sidebarOrders: EditorSidebarId[][] = [
      ['skills', 'languages', 'training'],
      ['training', 'keyAchievements', 'languages', 'skills'],
    ]
    const mainOrders: EditorMainId[][] = [
      ['summary', 'experience', 'education'],
      ['education', 'summary', 'experience'],
    ]
    for (const order of sidebarOrders) expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['skills', 'languages', 'training'])
    for (const order of mainOrders) expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'experience', 'education'])
  })

  it('spaces the sidebar headings’ capitals as Tailwind’s tracking-widest', () => {
    expect(PREVIEW_TRACKING.swissFirstJob).toEqual({ caps: 0.1 })
  })
})

describe('swissFirstJobSections', () => {
  it('draws the mockup order: summary, experience, education; then skills, languages, certificates', () => {
    expect(swissFirstJobSections([], [])).toEqual({ main: ['summary', 'experience', 'education'], sidebar: ['skills', 'languages', 'training'] })
  })

  it('leaves out the sections hidden through either panel', () => {
    expect(swissFirstJobSections(['summary'], ['languages'])).toEqual({ main: ['experience', 'education'], sidebar: ['skills', 'training'] })
  })
})

describe('swissFirstJob language dots (PRD FR-7)', () => {
  it.each([
    ['Native', 5],
    ['Fluent', 4],
    ['Professional', 3],
    ['Intermediate', 2],
    ['Basic', 1],
  ] as const)('fills %s with %i of five dots', (level, filled) => {
    expect(swissFirstJobLanguageDots(level)).toEqual({ filled, empty: 5 - filled })
  })

  it('fills none for a value outside the five levels, an inherited name included', () => {
    expect(swissFirstJobLanguageDots('C2')).toEqual({ filled: 0, empty: 5 })
    expect(swissFirstJobLanguageDots('toString')).toEqual({ filled: 0, empty: 5 })
    expect(swissFirstJobLanguageDots(undefined)).toEqual({ filled: 0, empty: 5 })
  })
})

describe('swissFirstJob joined text', () => {
  it('lists the contact details one per line, GitHub and website after LinkedIn, empty ones left out', () => {
    expect(
      swissFirstJobContactLines({ name: 'Kevin', location: 'Yverdon-les-Bains', phone: ' ', email: 'kevin@exemple.ch', website: 'kevin.ch', github: 'github.com/kevin' }).map(
        ({ value }) => value,
      ),
    ).toEqual(['Yverdon-les-Bains', 'kevin@exemple.ch', 'github.com/kevin', 'kevin.ch'])
  })

  const ROOM = SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH - SWISS_FIRST_JOB_EMAIL_SAFETY_PX

  it('keeps an email that fits the sidebar at the sidebar’s size, whole', () => {
    for (const email of ['kevin@gomes.test', 'jean.dupont@gmail.com', 'kevin.gomes-lab@exemple.test']) {
      expect(interLinkWidthPx(email, SWISS_FIRST_JOB_SIZES.sidebar)).toBeLessThanOrEqual(ROOM)
      expect(swissFirstJobEmailFit(email)).toEqual({ halfPoints: SWISS_FIRST_JOB_SIZES.sidebar * 1.5, px: SWISS_FIRST_JOB_SIZES.sidebar, parts: [email] })
    }
  })

  it('measures an email at its size rounded up to a whole pixel, as Chromium on Linux lays it out', () => {
    // The PR #130 Linux CI drew this address 216px wide when asked for 9.33px: the 10px width.
    const email = 'maximilian.mustermann-gomes@hotmail.com'
    expect(interLinkWidthPx(email, 14 / 1.5)).toBeCloseTo(201.3, 1)
    expect(swissFirstJobEmailWidthPx(email, 14 / 1.5)).toBeCloseTo(215.7, 1)
    expect(swissFirstJobEmailWidthPx(email, 14 / 1.5)).toBe(interLinkWidthPx(email, 10))
    // A whole-pixel size is measured as it is.
    expect(swissFirstJobEmailWidthPx(email, 12)).toBe(interLinkWidthPx(email, 12))
  })

  it('shrinks an email wider than the sidebar to the largest whole half-point size that fits it, never altered', () => {
    for (const email of ['maximilian.mustermann@hotmail.com', 'anne-sophie.vuilleumier@bluewin.ch', 'max.mustermann-gomes@hotmail.com']) {
      expect(swissFirstJobEmailWidthPx(email, SWISS_FIRST_JOB_SIZES.sidebar), email).toBeGreaterThan(ROOM)
      const fit = swissFirstJobEmailFit(email)
      expect(fit.parts, email).toEqual([email])
      expect(Number.isInteger(fit.halfPoints)).toBe(true)
      expect(fit.px).toBe(fit.halfPoints / 1.5)
      expect(fit.halfPoints).toBeGreaterThanOrEqual(SWISS_FIRST_JOB_EMAIL_MIN_HALF_POINTS)
      expect(fit.halfPoints).toBeLessThan(SWISS_FIRST_JOB_SIZES.sidebar * 1.5)
      // It fits at its whole-pixel layout, and half a point more would not.
      expect(swissFirstJobEmailWidthPx(email, fit.px), email).toBeLessThanOrEqual(ROOM)
      expect(swissFirstJobEmailWidthPx(email, (fit.halfPoints + 1) / 1.5), email).toBeGreaterThan(ROOM)
    }
    expect(SWISS_FIRST_JOB_EMAIL_MIN_HALF_POINTS / 2).toBe(7)
    // The 33-character address: 8pt, laid out at 11px.
    expect(swissFirstJobEmailFit('maximilian.mustermann@hotmail.com').halfPoints).toBe(16)
  })

  it('cuts only an email too wide even at 7pt, and only after its "@" and before a "." or "-" (a recorded limit)', () => {
    const cuts = {
      'maximilian.mustermann-gomes@hotmail.com': ['maximilian', '.mustermann', '-gomes@', 'hotmail', '.com'],
      'maximilian.mustermann.ausbildung@hotmail.com': ['maximilian', '.mustermann', '.ausbildung@', 'hotmail', '.com'],
      'anne-sophie.vuilleumier-ochsenbein.ausbildung@bluewin.ch': ['anne', '-sophie', '.vuilleumier', '-ochsenbein', '.ausbildung@', 'bluewin', '.ch'],
    }
    for (const [email, parts] of Object.entries(cuts)) {
      expect(swissFirstJobEmailWidthPx(email, SWISS_FIRST_JOB_EMAIL_MIN_HALF_POINTS / 1.5)).toBeGreaterThan(ROOM)
      const fit = swissFirstJobEmailFit(email)
      expect(fit.halfPoints).toBe(SWISS_FIRST_JOB_EMAIL_MIN_HALF_POINTS)
      expect(fit.parts.join('')).toBe(email)
      expect(fit.parts).toEqual(parts)
      for (const part of fit.parts) expect(swissFirstJobEmailWidthPx(part, fit.px), part).toBeLessThanOrEqual(SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH)
    }
  })

  it('draws a certificate as "name \u00B7 issuer \u00B7 MM.YYYY", each part only when stored', () => {
    expect(swissFirstJobCertificate('Permis cariste R1', '', '05.2024')).toBe('Permis cariste R1 \u00B7 05.2024')
    expect(swissFirstJobCertificate('Permis B', 'SAN', '')).toBe('Permis B \u00B7 SAN')
    expect(swissFirstJobCertificate(' ', undefined, '')).toBe('')
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

describe('swissFirstJob text colours meet WCAG AA (4.5:1) on every background they are drawn on', () => {
  const palette = PREVIEW_PALETTE.swissFirstJob
  const WHITE = '#ffffff'
  const SIDEBAR = palette.sidebar.css
  it.each([
    ['name', WHITE],
    ['accent', WHITE],
    ['accent', SIDEBAR],
    ['ink', WHITE],
    ['ink', SIDEBAR],
    ['body', WHITE],
    ['body', SIDEBAR],
    ['muted', WHITE],
    ['muted', SIDEBAR],
  ] as const)('%s on %s', (name, background) => {
    expect(contrast(palette[name].css, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the mockup’s lighter violet and grey only where they pass, or as decoration', () => {
    // The mockup's title violet fails AA on white; the title is drawn in violet-700.
    expect(contrast('#8b5cf6', WHITE)).toBeLessThan(4.5)
    // slate-500 fails on the sidebar; the muted grey is slate-600 everywhere.
    expect(contrast('#64748b', SIDEBAR)).toBeLessThan(4.5)
  })
})

/**
 * The owner's rule: no word is ever cut, in any locale, in any output. The
 * sidebar is the narrow column: every word of these lists — long skills and
 * labels of each locale — fits one of its lines whole, measured with Inter's
 * own advance widths at the Preview's size and at Word's (whole half-points),
 * bold where it is drawn bold, after a skill's check mark.
 */
describe('swissFirstJob: every word of the sidebar fits it whole', () => {
  const room = SWISS_FIRST_JOB_SIDEBAR_TEXT_WIDTH
  const wordPx = (cssPx: number) => Math.round(cssPx * 1.5) / 1.5
  const LONG = {
    de: ['Kommunikationsfähigkeiten', 'Lagerbewirtschaftung', 'Kommissionierung', 'Muttersprache', 'Grundkenntnisse', 'Staplerfahrausweis'],
    fr: ['Manutention', 'Préparation', 'Ponctualité', 'Intermédiaire'],
    it: ['Magazzinaggio', 'Madrelingua', 'Intermedio'],
    en: ['Warehousing', 'Intermediate', 'Professional'],
  } as const

  it('leaves the sidebar 212px of text', () => {
    expect(room).toBe(SWISS_FIRST_JOB_GEOMETRY.sidebarWidth - 2 * SWISS_FIRST_JOB_GEOMETRY.sidebarPaddingX)
    expect(room).toBe(212)
  })

  it.each(Object.entries(LONG))('%s: each long word fits a sidebar line after a check mark, bold, at both sizes', (_locale, words) => {
    for (const word of words) {
      for (const size of [SWISS_FIRST_JOB_SIZES.sidebar, wordPx(SWISS_FIRST_JOB_SIZES.sidebar)]) {
        expect(interTextWidthPx(word, 700, size) + SWISS_FIRST_JOB_GEOMETRY.checkIndent, `${word} at ${size}px`).toBeLessThanOrEqual(room)
      }
    }
  })

  it.each(Object.entries(DICTS))('%s: every sidebar heading fits a line in its spaced capitals', (_locale, dict) => {
    const tracking = PREVIEW_TRACKING.swissFirstJob.caps
    for (const label of [dict.resumes.editor.sections.contact, dict.resumes.template.skills, dict.resumes.template.languages, dict.resumes.template.training]) {
      const caps = label.toLocaleUpperCase()
      const size = wordPx(SWISS_FIRST_JOB_SIZES.sidebarHeading)
      expect(interTextWidthPx(caps, 700, size) + tracking * size * [...caps].length, label).toBeLessThanOrEqual(room)
    }
  })
})
