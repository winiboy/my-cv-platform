import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import { ResumePreview } from '@/components/dashboard/resume-preview'
import type { Locale } from '@/lib/i18n'
import { resolveResumeLayout } from '@/lib/layout-settings'
import { CONTACT_LABEL_KEYS, contactLabel, presentLabel } from '@/lib/resume-template-strings'
import type { Resume, ResumeLanguage, ResumeTemplate } from '@/types/database'
import { generateClassicDocx } from './docx-classic'
import { generateCreativeDocx } from './docx-creative'
import type { DocxGeneratorSettings } from './docx-helpers'
import { generateMinimalDocx } from './docx-minimal'
import { generateModernDocx } from './docx-modern'
import { generateProfessionalDocx } from './docx-professional'

/**
 * The localized words a template draws that are not resume content: the
 * "present" end of a date range, Modern's contact labels and the language
 * levels. For every template and locale, the Word file (the text of the
 * unzipped `word/document.xml`) must draw each of them exactly as often as the
 * Preview does, in the same spelling, and draw no English one in its place.
 *
 * PDF is `window.print()` of the Preview, so the Preview stands for it.
 *
 * The Preview is the real `ResumePreview`, rendered with `react-dom/server`
 * from the same row and dictionary the preview page passes; the Word file is
 * the generator `route.ts` dispatches to, with the settings it builds. The
 * fixture is plain text, because rich text renders empty outside a browser.
 */

type Generator = (resume: unknown, settings: DocxGeneratorSettings) => Promise<Buffer>

const GENERATORS: Readonly<Record<ResumeTemplate, Generator>> = {
  modern: generateModernDocx,
  classic: generateClassicDocx,
  minimal: generateMinimalDocx,
  creative: generateCreativeDocx,
  professional: generateProfessionalDocx,
}
const TEMPLATES = Object.keys(GENERATORS) as ResumeTemplate[]

/** The locale files differ in keys this test does not read, so they share no one JSON type. */
interface LevelsDict {
  resumes: { editor: { levels: Record<string, string> } }
}

const DICTS: Record<Locale, LevelsDict> = { fr, en, de, it: it_ }
const LOCALES = Object.keys(DICTS) as Locale[]

/** Only Modern labels its contact entries. */
const DRAWS_CONTACT_LABELS: ReadonlySet<ResumeTemplate> = new Set(['modern'])
/** Creative draws a language level as filled bars, on both surfaces, not as a word. */
const DRAWS_LEVEL_WORDS: ReadonlySet<ResumeTemplate> = new Set(['modern', 'classic', 'minimal', 'professional'])

const STORED_LEVELS = ['Native', 'Fluent', 'Professional', 'Intermediate', 'Basic'] as const satisfies readonly ResumeLanguage['level'][]

/** The spelling Word wrote for de "present" before every generator read the dictionary. */
const RETIRED_DE_PRESENT = 'Gegenwart'

function resumeRow(template: ResumeTemplate) {
  return {
    id: 'localized-words',
    title: 'Quillwright Engineer',
    template,
    contact: {
      name: 'Robin Halvorsen',
      email: 'robin@halvorsen.test',
      phone: '+41 00 000 0007',
      location: 'Oxbridge',
      linkedin: 'in/robin-halvorsen',
      github: 'robin-halvorsen',
      website: 'https://halvorsen.test',
    },
    summary: 'Kilnwright of documentation toolchains.',
    experience: [
      {
        company: 'Tessellate Freight',
        position: 'Kilnwright',
        location: 'Oxbridge',
        startDate: '2021-03',
        current: true,
        achievements: ['Tessellated the export pipeline.'],
        visible: true,
      },
    ],
    education: [
      { school: 'Halvorsen Institute', degree: 'Magister', field: 'Chromatics', startDate: '2019-09', visible: true },
    ],
    skills: [{ category: 'Toolchain', items: ['Zanzibarscript'], visible: true }],
    projects: [],
    languages: STORED_LEVELS.map((level, i) => ({
      language: ['Esperanto', 'Interlingua', 'Volapuk', 'Ido', 'Novial'][i],
      level,
      visible: true,
    })),
    certifications: [],
    custom_sections: {},
    layout_settings: null,
  }
}

type Row = ReturnType<typeof resumeRow>

function settingsFor(row: Row, locale: Locale): DocxGeneratorSettings {
  const layout = resolveResumeLayout(row, null)
  return {
    fontFamily: layout.fontFamily,
    fontScale: layout.fontScale,
    titleFontSize: layout.titleFontSize,
    contactFontSize: layout.contactFontSize,
    sectionTitleFontSize: layout.sectionTitleFontSize,
    sectionDescFontSize: layout.sectionDescFontSize,
    locale,
    sidebarHue: layout.sidebarHue,
    sidebarSaturation: layout.sidebarSaturation,
    sidebarBrightness: layout.sidebarBrightness,
    sidebarWidth: layout.sidebarWidth,
    sidebarTopMargin: layout.sidebarTopMargin,
    mainContentTopMargin: layout.mainContentTopMargin,
    sidebarOrder: [...layout.sidebarOrder],
    mainContentOrder: [...layout.mainContentOrder],
    hiddenSidebarSections: [...layout.hiddenSidebarSections],
    hiddenMainSections: [...layout.hiddenMainSections],
  }
}

function decode(text: string): string {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** One drawn surface: its text nodes, and for the Preview the markup, to read a node's styling. */
interface Surface {
  nodes: string[]
  markup: string
}

function previewOf(row: Row, locale: Locale): Surface {
  const markup = renderToStaticMarkup(
    createElement(ResumePreview, { resume: row as unknown as Resume, locale, dict: DICTS[locale] }),
  )
  const nodes = markup
    .split(/<[^>]*>/)
    .map(decode)
    .filter((node) => node !== '')
  return { nodes, markup }
}

async function wordOf(row: Row, locale: Locale): Promise<Surface> {
  const zip = await JSZip.loadAsync(await GENERATORS[row.template](row, settingsFor(row, locale)))
  const part = zip.file('word/document.xml')
  if (part === null) throw new Error(`The ${row.template} artifact has no word/document.xml`)
  const markup = await part.async('string')
  const nodes = [...markup.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, text]) => decode(text))
  return { nodes, markup }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Occurrences of `word` as a whole word inside any node: how a date range carries "present". */
function inRunCount(surface: Surface, word: string): number {
  const pattern = new RegExp(`(?<!\\p{L})${escapeRegExp(word)}(?!\\p{L})`, 'gu')
  return surface.nodes.reduce((sum, node) => sum + (node.match(pattern)?.length ?? 0), 0)
}

/** Nodes that are `word` and nothing else, ignoring the tabs and spaces a layout puts around it. */
function wholeNodeCount(surface: Surface, word: string): number {
  return surface.nodes.filter((node) => node.trim() === word).length
}

/**
 * A contact label as each surface shows it: the Preview draws the dictionary
 * word in an element styled `text-transform: uppercase`, Word writes the word
 * already uppercased. Both are counted as the uppercase word the reader sees.
 */
function shownContactLabelCount(surface: Surface, word: string, kind: 'preview' | 'word'): number {
  if (kind === 'word') return wholeNodeCount(surface, word.toUpperCase())
  const styled = new RegExp(`text-transform:uppercase[^>]*>${escapeRegExp(word)}<`, 'g')
  return surface.markup.match(styled)?.length ?? 0
}

interface Vocabulary {
  present: string
  contact: string[]
  levels: string[]
}

function vocabularyOf(locale: Locale): Vocabulary {
  const dict = DICTS[locale]
  const levels = dict.resumes.editor.levels
  return {
    present: presentLabel(dict),
    contact: CONTACT_LABEL_KEYS.map((key) => contactLabel(dict, key)),
    levels: STORED_LEVELS.map((level) => levels[level.toLowerCase()]),
  }
}

/** Every count this test compares, for one surface. */
function countsOf(surface: Surface, kind: 'preview' | 'word', vocabulary: Vocabulary) {
  return {
    present: inRunCount(surface, vocabulary.present),
    contact: vocabulary.contact.map((word) => shownContactLabelCount(surface, word, kind)),
    levels: vocabulary.levels.map((word) => wholeNodeCount(surface, word)),
  }
}

/** The en words a locale spells differently, which its surfaces must not draw. */
function englishOnly(locale: Locale): Vocabulary {
  const local = vocabularyOf(locale)
  const english = vocabularyOf('en')
  return {
    present: local.present === english.present ? '' : english.present,
    contact: english.contact.filter((word, i) => word !== local.contact[i]),
    levels: english.levels.filter((word, i) => word !== local.levels[i]),
  }
}

describe.each(TEMPLATES)('%s: the localized words of Preview and Word', (template) => {
  const row = resumeRow(template)

  describe.each(LOCALES)('in %s', (locale) => {
    const vocabulary = vocabularyOf(locale)

    it('are the same words, drawn the same number of times', async () => {
      const preview = countsOf(previewOf(row, locale), 'preview', vocabulary)
      const word = countsOf(await wordOf(row, locale), 'word', vocabulary)

      expect(word).toEqual(preview)
    })

    it('are the dictionary words the template draws', async () => {
      for (const counts of [
        countsOf(previewOf(row, locale), 'preview', vocabulary),
        countsOf(await wordOf(row, locale), 'word', vocabulary),
      ]) {
        expect(counts.present, `"${vocabulary.present}" ends the current role's date range`).toBeGreaterThan(0)
        expect(counts.contact).toEqual(CONTACT_LABEL_KEYS.map(() => (DRAWS_CONTACT_LABELS.has(template) ? 1 : 0)))
        expect(counts.levels).toEqual(STORED_LEVELS.map(() => (DRAWS_LEVEL_WORDS.has(template) ? 1 : 0)))
      }
    })

    if (locale !== 'en') {
      it('draw no English word in their place', async () => {
        const english = englishOnly(locale)
        for (const [kind, surface] of [
          ['preview', previewOf(row, locale)],
          ['word', await wordOf(row, locale)],
        ] as const) {
          if (english.present !== '') expect(inRunCount(surface, english.present), `${kind}: "${english.present}"`).toBe(0)
          for (const label of english.contact) {
            expect(shownContactLabelCount(surface, label, kind), `${kind}: "${label}"`).toBe(0)
          }
          for (const level of english.levels) {
            expect(wholeNodeCount(surface, level), `${kind}: "${level}"`).toBe(0)
          }
        }
      })
    }
  })

  it(`no longer writes "${RETIRED_DE_PRESENT}" in de Word`, async () => {
    expect(inRunCount(await wordOf(row, 'de'), RETIRED_DE_PRESENT)).toBe(0)
  })
})
