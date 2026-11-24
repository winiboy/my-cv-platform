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
import {
  SWISS_IT_CARD_TEXT_WIDTH,
  SWISS_IT_CARD_WIDTH,
  SWISS_IT_CONTACT_DOT,
  SWISS_IT_CONTENT_WIDTH,
  SWISS_IT_GEOMETRY,
  SWISS_IT_MAIN_SECTIONS,
  SWISS_IT_MONO_FONT,
  SWISS_IT_MONO_FONT_DOCX,
  SWISS_IT_SECTIONS,
  SWISS_IT_SEPARATOR,
  SWISS_IT_SIDEBAR_SECTIONS,
  SWISS_IT_SIZES,
  swissItCardRows,
  swissItCertificate,
  swissItCertificationsLine,
  swissItContactLines,
  swissItDates,
  swissItEntryLines,
  swissItHeading,
  swissItLanguagesLine,
  swissItLastHeading,
  swissItLinkParts,
  swissItProject,
  swissItSkillContent,
  swissItSkillLabel,
  swissItTitle,
  swissItUnbreakable,
  swissItVisibility,
} from '@/lib/swiss-it-template'

const DICTS = { fr, en, de, it: it_ } as const

describe('swissIt in the template x control registries (FR-3)', () => {
  it('offers only the sections panel: no user colour, no size input, no stored font (FR-4, FR-12)', () => {
    expect(TEMPLATE_LAYOUT_CONTROLS.swissIt).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl('swissIt', 'font')).toBe(false)
    expect(templateOffersLayoutControl('swissIt', 'sidebarColour')).toBe(false)
    expect(templateOffersLayoutControl('swissIt', 'perPropertySize')).toBe(false)
    expect(templateOffersLayoutControl('swissIt', 'sidebarSections')).toBe(true)
    expect(TEMPLATE_APPLIED_SIZE_KEYS.swissIt).toEqual([])
  })

  it('draws the photo, so the Contact tab offers its photo row (FR-5, FR-14)', () => {
    expect(TEMPLATE_DRAWS_PHOTO.swissIt).toBe(true)
  })

  it('lists every section it can hide, the projects (keyAchievements) included, each fixed, in the order it draws them', () => {
    const sections = templateEditorSections('swissIt')
    expect(sections).toBe(TEMPLATE_EDITOR_SECTIONS.swissIt)
    expect([...sections.main]).toEqual(['summary', 'experience', 'education'])
    expect([...sections.sidebar]).toEqual(['skills', 'keyAchievements', 'languages', 'training'])
    expect([...sections.fixed].sort()).toEqual([...sections.main, ...sections.sidebar].sort())
    expect([...sections.main]).toEqual([...SWISS_IT_MAIN_SECTIONS])
    expect([...sections.sidebar]).toEqual([...SWISS_IT_SIDEBAR_SECTIONS])
  })

  it('offers exactly the rows it draws, and no other', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissIt
    const drawn = SWISS_IT_SECTIONS.flatMap((id) => (id === 'languagesAndCertifications' ? ['languages', 'training'] : [id]))
    expect(drawn.sort()).toEqual([...sections.main, ...sections.sidebar].sort())
  })

  it('lists its rows in the order the template draws them, whatever order is stored', () => {
    const sections = TEMPLATE_EDITOR_SECTIONS.swissIt
    const sidebarOrders: EditorSidebarId[][] = [
      ['skills', 'keyAchievements', 'languages', 'training'],
      ['training', 'languages', 'keyAchievements', 'skills'],
    ]
    const mainOrders: EditorMainId[][] = [
      ['summary', 'experience', 'education'],
      ['education', 'summary', 'experience'],
    ]
    for (const order of sidebarOrders) {
      expect(listedEditorSections(order, sections.sidebar, sections.fixed)).toEqual(['skills', 'keyAchievements', 'languages', 'training'])
    }
    for (const order of mainOrders) {
      expect(listedEditorSections(order, sections.main, sections.fixed)).toEqual(['summary', 'experience', 'education'])
    }
  })

  it('draws no letter spacing', () => {
    expect(PREVIEW_TRACKING.swissIt).toEqual({})
  })
})

describe('swissItVisibility', () => {
  it('draws the mockup order: summary, skills, experience, projects, education, then languages and certifications', () => {
    expect(swissItVisibility([], [])).toEqual({
      sections: ['summary', 'skills', 'experience', 'keyAchievements', 'education', 'languagesAndCertifications'],
      languages: true,
      certifications: true,
    })
  })

  it('leaves out summary, experience and education hidden through hiddenMainSections', () => {
    expect(swissItVisibility(['summary', 'education'], []).sections).toEqual(['skills', 'experience', 'keyAchievements', 'languagesAndCertifications'])
  })

  it('leaves out the skills and the projects hidden through hiddenSidebarSections', () => {
    expect(swissItVisibility([], ['skills', 'keyAchievements']).sections).toEqual(['summary', 'experience', 'education', 'languagesAndCertifications'])
  })

  it('keeps the last section while either of its parts is shown, and drops it with both', () => {
    expect(swissItVisibility([], ['languages'])).toMatchObject({ languages: false, certifications: true })
    expect(swissItVisibility([], ['languages']).sections).toContain('languagesAndCertifications')
    expect(swissItVisibility([], ['training'])).toMatchObject({ languages: true, certifications: false })
    expect(swissItVisibility([], ['languages', 'training']).sections).not.toContain('languagesAndCertifications')
  })

  it('ignores an id hidden through the other panel', () => {
    expect(swissItVisibility(['skills', 'languages'], ['summary', 'education'])).toEqual(swissItVisibility([], []))
  })
})

describe('swissIt joined text', () => {
  it('draws each heading as "// label" in lower case, with the locale’s own rules (FR-6)', () => {
    expect(swissItHeading('Expérience', 'fr')).toBe('// expérience')
    expect(swissItHeading('Berufserfahrung', 'de')).toBe('// berufserfahrung')
    expect(swissItHeading('Projekte', 'de')).toBe('// projekte')
    expect(swissItHeading('İş', 'tr')).toBe('// iş')
  })

  it.each(Object.entries(DICTS))('%s: draws every heading from the existing labels and the new projects label', (locale, dict) => {
    const t = dict.resumes.template
    for (const label of [t.summary, t.skills, t.experience, t.projects, t.education, t.languages, t.training]) {
      expect(label, 'a label in every locale').toBeTruthy()
      expect(swissItHeading(label, locale)).toBe(`// ${label.toLocaleLowerCase(locale)}`)
    }
  })

  it('joins the last heading from the two existing labels, or the one it holds alone', () => {
    expect(swissItLastHeading('Langues', 'Formation / Cours', true, true, 'fr')).toBe('// langues & formation / cours')
    expect(swissItLastHeading('Langues', 'Formation / Cours', true, false, 'fr')).toBe('// langues')
    expect(swissItLastHeading('Langues', 'Formation / Cours', false, true, 'fr')).toBe('// formation / cours')
  })

  it('draws the CV title behind a terminal prompt', () => {
    expect(swissItTitle('Développeuse full-stack')).toBe('> Développeuse full-stack')
  })

  it('splits the contact details into the mockup’s two lines, each value whole, a dot after all but the last', () => {
    const lines = swissItContactLines({
      name: 'Aline',
      email: 'aline@example.test',
      phone: '+41 79 000 00 00',
      location: 'Berne',
      linkedin: '',
      github: 'github.com/aline',
      website: ' aline.test ',
    })
    expect(lines).toEqual([
      [`Berne${SWISS_IT_CONTACT_DOT}`, `+41 79 000 00 00${SWISS_IT_CONTACT_DOT}`, 'aline@example.test'],
      [`github.com/aline${SWISS_IT_CONTACT_DOT}`, 'aline.test'],
    ])
    expect(SWISS_IT_CONTACT_DOT).toBe('\u00A0\u00B7')
  })

  it('draws no empty contact line, and nothing when no detail is filled (FR-2)', () => {
    expect(swissItContactLines({ name: 'Aline', email: '', phone: ' ', location: '' })).toEqual([])
    expect(swissItContactLines({ name: 'Aline', email: '', phone: '', location: '', website: 'aline.test' })).toEqual([['aline.test']])
  })

  it('holds a value together for Word with no-break spaces, and leaves the text otherwise as stored', () => {
    expect(swissItUnbreakable(' Spring  Boot ')).toBe('Spring\u00A0Boot')
    expect(swissItUnbreakable('React')).toBe('React')
  })

  it('prints dates as MM.YYYY, "present" only for a current entry, and nothing for an undated one (FR-1)', () => {
    expect(swissItDates('2021-03', undefined, true, en)).toBe(`03.2021 – ${en.resumes.template.present}`)
    expect(swissItDates('2016-08', '2021-02', false, en)).toBe('08.2016 – 02.2021')
    expect(swissItDates(undefined, undefined, false, en)).toBe('')
  })

  it('draws an entry as its bold lead and a grey second line, or its second line alone as the lead (FR-2)', () => {
    expect(swissItEntryLines('Developer', ['Swiss Digital AG', 'Berne'])).toEqual({ lead: 'Developer', detail: 'Swiss Digital AG, Berne' })
    expect(swissItEntryLines('Developer', ['', undefined])).toEqual({ lead: 'Developer', detail: '' })
    expect(swissItEntryLines(' ', ['Swiss Digital AG', 'Berne'])).toEqual({ lead: 'Swiss Digital AG, Berne', detail: '' })
    expect(swissItEntryLines(undefined, [undefined])).toEqual({ lead: '', detail: '' })
  })

  it('labels a skill category with its stored name and a colon, as swissCommerce does', () => {
    expect(swissItSkillLabel('Langages')).toBe('Langages:')
  })

  it('reads a skill category as tags, or as rich text when it is not a list of skills', () => {
    expect(swissItSkillContent({ items: ['React', ' ', 'Next.js'] })).toEqual({ kind: 'tags', tags: ['React', 'Next.js'] })
    expect(swissItSkillContent({ items: ['stale'], skillsHtml: '<p>Docker, Kubernetes</p>' })).toEqual({ kind: 'tags', tags: ['Docker', 'Kubernetes'] })
    expect(swissItSkillContent({ skillsHtml: '<ul><li>Docker</li></ul>' })).toEqual({ kind: 'html', html: '<ul><li>Docker</li></ul>' })
    expect(swissItSkillContent({ items: [], skillsHtml: '<p></p>' })).toBeNull()
  })

  it('joins the languages, each "language — level", and the certifications, on one line each', () => {
    expect(SWISS_IT_SEPARATOR).toBe('\u00A0\u00B7 ')
    expect(swissItLanguagesLine([{ language: 'Français', level: 'Langue maternelle' }, { language: 'Allemand', level: 'Courant' }])).toBe(
      `Français — Langue maternelle${SWISS_IT_SEPARATOR}Allemand — Courant`,
    )
    expect(swissItCertificationsLine(['A (05.2023)', 'B'])).toBe(`A (05.2023)${SWISS_IT_SEPARATOR}B`)
  })

  it('draws a certificate as "name – issuer (MM.YYYY)", each part only when stored', () => {
    expect(swissItCertificate('AWS Certified Developer', 'Amazon', '05.2023')).toBe('AWS Certified Developer – Amazon (05.2023)')
    expect(swissItCertificate('AWS Certified Developer', '', '05.2023')).toBe('AWS Certified Developer (05.2023)')
    expect(swissItCertificate('AWS Certified Developer', 'Amazon', '')).toBe('AWS Certified Developer – Amazon')
    expect(swissItCertificate(' ', undefined, '05.2023')).toBe('05.2023')
    expect(swissItCertificate('', ' ', '')).toBe('')
  })
})

describe('swissItProject and swissItCardRows: what the project cards draw', () => {
  it('draws the name, the description, the link and each technology as a tag', () => {
    expect(swissItProject({ name: ' Booking tool ', description: 'Rooms for clubs.', url: ' example.test ', technologies: ['Next.js', ' ', 'Supabase'] })).toEqual({
      name: 'Booking tool',
      description: 'Rooms for clubs.',
      url: 'example.test',
      technologies: ['Next.js', 'Supabase'],
    })
  })

  it('draws a project with no name as its description alone, and no card for one that stores nothing', () => {
    expect(swissItProject({ name: '', description: 'Only a description.' })).toMatchObject({ name: '', description: 'Only a description.' })
    expect(swissItProject({ name: ' ', description: '<p></p>', url: '', technologies: [' '] })).toBeNull()
  })

  it('lays the cards two to a row, an odd last card alone in the left column', () => {
    expect(swissItCardRows(['a', 'b', 'c'])).toEqual([
      ['a', 'b'],
      ['c', null],
    ])
    expect(swissItCardRows(['a', 'b'])).toEqual([['a', 'b']])
    expect(swissItCardRows([])).toEqual([])
  })
})

describe('swissIt monospace face', () => {
  it('uses the system monospace stack on the Preview, so no font is downloaded, and Consolas in Word', () => {
    expect(SWISS_IT_MONO_FONT).toBe('ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace')
    expect(SWISS_IT_MONO_FONT).toContain(SWISS_IT_MONO_FONT_DOCX)
    expect(SWISS_IT_MONO_FONT_DOCX).toBe('Consolas')
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

describe('swissIt text colours meet WCAG AA (4.5:1) on every background they are drawn on', () => {
  const palette = PREVIEW_PALETTE.swissIt
  const WHITE = '#ffffff'
  const BAND = palette.ink.css
  const TAG = palette.tagFill.css

  it.each([
    // On the band: the name, the CV title, the contact lines.
    ['name', BAND],
    ['prompt', BAND],
    ['contact', BAND],
    // On white: the headings, the bold leads, running text, dates and second lines.
    ['heading', WHITE],
    ['ink', WHITE],
    ['body', WHITE],
    ['muted', WHITE],
    // A tag's text on its own fill.
    ['tagText', TAG],
    ['tagText', WHITE],
  ] as const)('%s on %s', (name, background) => {
    expect(contrast(palette[name].css, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('darkens the mockup’s bright green for text on white, which fails AA', () => {
    const MOCKUP_GREEN = '#16a34a'
    expect(contrast(MOCKUP_GREEN, WHITE)).toBeLessThan(4.5)
    expect(palette.heading.css).toBe('#15803d')
    expect(contrast(palette.heading.css, WHITE)).toBeGreaterThan(contrast(MOCKUP_GREEN, WHITE))
    // The bright green stays only where it passes: the title on the band.
    expect(contrast(palette.prompt.css, BAND)).toBeGreaterThan(7)
  })
})

/**
 * The owner's rule: no word is ever cut, in any locale, in any output. The
 * project cards are the narrow boxes: every word of these lists — long
 * compound words of each locale, as a project name, a description or a
 * technology may hold them — fits one line of a card whole, and a tag holding
 * a long technology fits a card's line whole, measured with Inter's own
 * advance widths, at the Preview's size and at Word's (whole half-points),
 * bold where it is drawn bold.
 */
describe('swissIt: every word of a project card fits it whole', () => {
  const room = SWISS_IT_CARD_TEXT_WIDTH
  /** Word draws a run in whole half-points: 13px rounds to 10pt, 12px is 9pt exactly. */
  const wordPx = (cssPx: number) => Math.round(cssPx * 1.5) / 1.5

  const LONG_WORDS = {
    de: ['Kommunikationsfähigkeiten', 'Datenbankadministration', 'Softwareentwicklungsprojekt', 'Verwaltungsdigitalisierung', 'Reservierungsplattform'],
    fr: ['Développement', 'Infrastructures', 'Microservices', 'Interopérabilité', 'Réservation'],
    it: ['Programmazione', 'Infrastrutture', 'Interoperabilità', 'Amministrazione'],
    en: ['Infrastructure', 'Interoperability', 'Containerization', 'Administration'],
  } as const

  const LONG_TAGS = ['Spring Boot Microservices', 'Infrastructure as Code', 'Kubernetes Operator SDK', 'Datenbankadministration']

  it('leaves a card 313px of text: half the content less the gap, the border and the padding', () => {
    expect(SWISS_IT_CONTENT_WIDTH).toBe(PAGE_WIDTH_PX - 2 * SWISS_IT_GEOMETRY.paddingX)
    expect(SWISS_IT_CARD_WIDTH).toBe((SWISS_IT_CONTENT_WIDTH - SWISS_IT_GEOMETRY.cardGap) / 2)
    expect(room).toBe(313)
  })

  it.each(Object.entries(LONG_WORDS))('%s: each long word fits a card’s line, bold, at the Preview’s and at Word’s size', (_locale, words) => {
    for (const word of words) {
      for (const size of [SWISS_IT_SIZES.body, wordPx(SWISS_IT_SIZES.body)]) {
        expect(interTextWidthPx(word, 700, size), `${word} at ${size}px`).toBeLessThanOrEqual(room)
      }
    }
  })

  it('fits a long technology tag on one line of a card, padding and outline included', () => {
    const padding = 2 * (SWISS_IT_GEOMETRY.tagPaddingX + SWISS_IT_GEOMETRY.tagBorder)
    for (const tag of LONG_TAGS) {
      for (const size of [SWISS_IT_SIZES.tag, wordPx(SWISS_IT_SIZES.tag)]) {
        expect(interTextWidthPx(tag, 400, size) + padding, `${tag} at ${size}px`).toBeLessThanOrEqual(room)
      }
    }
  })

  it('wraps a link wider than a whole card only at its own boundaries, each part fitting a line whole', () => {
    const link = 'https://github.com/alineberset/energieverbrauchsueberwachungsplattform-backend-service'
    // No wrapping at spaces can hold it…
    expect(interTextWidthPx(link, 400, SWISS_IT_SIZES.body)).toBeGreaterThan(room)
    // …so it wraps between its parts, and every part fits a card's line.
    for (const part of swissItLinkParts(link)) {
      for (const size of [SWISS_IT_SIZES.body, wordPx(SWISS_IT_SIZES.body)]) {
        expect(interTextWidthPx(part, 400, size), `${part} at ${size}px`).toBeLessThanOrEqual(room)
      }
    }
  })
})

describe('swissItLinkParts: where a link may wrap', () => {
  it('cuts after a "/" and before ".", "-", "?", "#" and "=", and the parts join back to the text', () => {
    const link = 'https://github.com/aline-berset/repo?tab=readme#install'
    const parts = swissItLinkParts(link)
    expect(parts).toEqual(['https://', 'github', '.com/', 'aline', '-berset/', 'repo', '?tab', '=readme', '#install'])
    expect(parts.join('')).toBe(link)
  })

  it('never cuts between the two slashes of a scheme, nor before a first character', () => {
    expect(swissItLinkParts('//example')).toEqual(['//', 'example'])
    expect(swissItLinkParts('.profile')).toEqual(['.profile'])
  })

  it('leaves a value with no such boundary whole: a word is never cut', () => {
    expect(swissItLinkParts('Energieverbrauchsüberwachung')).toEqual(['Energieverbrauchsüberwachung'])
    expect(swissItLinkParts('+41 21 555 0142')).toEqual(['+41 21 555 0142'])
  })
})

describe('swissIt printed page margins', () => {
  it('keeps every page’s foot and every later page’s top at 48px, in the PDF and in Word', () => {
    expect(SWISS_IT_GEOMETRY.pageTop).toBe(48)
    expect(SWISS_IT_GEOMETRY.pageBottom).toBe(48)
  })
})
