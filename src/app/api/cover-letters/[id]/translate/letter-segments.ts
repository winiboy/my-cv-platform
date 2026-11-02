import type { TranslationLanguage } from '@/lib/ai/prompts'
import { coverLetterBodyParagraphs, type CoverLetterPdfFields } from '@/lib/cover-letter-pdf-html'
import { COVER_LETTER_FIELD_LIMITS, COVER_LETTER_PDF_GUARD } from '@/lib/cover-letter-limits'
import { escapeHtml } from '@/lib/escape-html'
import { sanitizeUntrustedPlainText, sanitizeUntrustedRichText } from '@/lib/resume-from-job/untrusted-text'
import {
  RichTextTooLargeError,
  richTextToBlocks,
  type RichBlock,
  type RichInline,
  type RichTextFormat,
} from '../download-docx/rich-text-blocks'

/**
 * A stored cover letter as the segments the AI translates, and the AI's
 * translations back as storable letter columns (cover-letter-export-translate,
 * US-003).
 *
 * MARKUP IS NEVER TRANSLATED, ONLY REBUILT
 * A stored paragraph is rich HTML. It is read with the editor sanitizer's
 * allowlist (`richTextToBlocks`, shared with the Word export) into blocks:
 * paragraphs and list items made of formatted runs. Each block with text
 * becomes ONE segment, its runs written in a fixed mini-markup (`<b>`, `<i>`,
 * `<u>`, `<br>`, text with `&`, `<` and `>` escaped), so a sentence is
 * translated whole and its emphasis can move with the words that carry it.
 *
 * The reply is untrusted AI output and is never stored as written:
 *   1. it is read again by `richTextToBlocks`, so only bold, italic, underline
 *      and line breaks survive from it, as data, and every other element is
 *      reduced to its text;
 *   2. each run's text goes through `sanitizeUntrustedPlainText`, the rule
 *      cover-letter-from-job applies to AI text (markup, `<`, `>` and
 *      unstorable characters removed, whitespace collapsed), then is escaped;
 *   3. the paragraph or list structure comes from the ORIGINAL letter, never
 *      from the reply: the same number of paragraphs, the same lists, the same
 *      nesting;
 *   4. the HTML written from that is passed through `sanitizeUntrustedRichText`,
 *      the DOM-free allowlist sanitizer AI rich text is stored through
 *      (`p`, `br`, `strong`, `em`, `u`, `ul`, `ol`, `li`, no attributes).
 *
 * NOTHING IS CUT
 * A translation is longer than its original as a rule (German and Italian
 * often by half). No step above is allowed to shorten it: a part that would
 * be over its column's limit (a rich field over
 * `COVER_LETTER_PDF_GUARD.richTextField` once written, a greeting or sign-off
 * over `COVER_LETTER_FIELD_LIMITS`) makes the whole translation incomplete,
 * and no letter is created, rather than a letter whose ending is missing.
 * Inline font size, font family and alignment are therefore not carried into
 * the copy: that allowlist has no attributes.
 *
 * Greeting and sign-off are plain-text columns: one segment each, stored as
 * plain text through `sanitizeUntrustedPlainText`.
 */

/**
 * What one letter may send to the AI. 12,000 characters is half again
 * `AI_TEXT_LIMITS.COVER_LETTER_TEXT` (8,000, already "beyond any letter
 * anyone should send"), room for the mini-markup and escaping; 120 segments
 * is a dozen pages of short paragraphs. Above either, the letter is refused
 * (422) before any AI call.
 */
export const COVER_LETTER_TRANSLATION_LIMITS = Object.freeze({
  segments: 120,
  totalCharacters: 12_000,
})

/** The letter is over `COVER_LETTER_TRANSLATION_LIMITS`. */
export class CoverLetterTranslationTooLargeError extends Error {
  constructor() {
    super('The cover letter is too large to translate')
    this.name = 'CoverLetterTranslationTooLargeError'
  }
}

/** The stored columns a translation reads. */
export type TranslatableLetter = Pick<
  CoverLetterPdfFields,
  'greeting' | 'opening_paragraph' | 'body_paragraphs' | 'closing_paragraph' | 'sign_off'
>

/** The translated columns, ready to insert. */
export interface TranslatedLetterContent {
  greeting: string
  opening_paragraph: string | null
  body_paragraphs: string[]
  closing_paragraph: string | null
  sign_off: string
}

export interface LetterTranslationPlan {
  /** What the AI translates, in letter order. Empty when the letter has no text. */
  readonly segments: readonly string[]
  /**
   * The letter's columns from one translation per segment, sanitized; `null`
   * when any translation has no text once sanitized, or would not fit its
   * column whole, so a reply never yields a letter missing a part or the end
   * of one.
   */
  rebuild(translations: readonly string[]): TranslatedLetterContent | null
}

/** The characters a segment escapes: what would otherwise read as markup. */
function escapeSegmentText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A formatted run as the mini-markup a segment is written in. */
function runToSegment(text: string, format: RichTextFormat): string {
  let segment = escapeSegmentText(text)
  if (format.underline) segment = `<u>${segment}</u>`
  if (format.italic) segment = `<i>${segment}</i>`
  if (format.bold) segment = `<b>${segment}</b>`
  return segment
}

function inlinesToSegment(inlines: readonly RichInline[]): string {
  return inlines.map((inline) => (inline.type === 'break' ? '<br>' : runToSegment(inline.text, inline.format))).join('')
}

const hasText = (inlines: readonly RichInline[]): boolean =>
  inlines.some((inline) => inline.type === 'text' && inline.text.trim() !== '')

/**
 * Untrusted text by the cover-letter-from-job rule (`sanitizeUntrustedPlainText`)
 * and never cut: its limit is the input's own length, and sanitizing only ever
 * shortens (markup and unstorable characters removed, entities decoded,
 * whitespace collapsed). The caller judges the length against its column.
 */
function sanitizeWhole(text: string): string {
  return sanitizeUntrustedPlainText(text, Math.max(text.length, 1))
}

/**
 * One run's translated text, sanitized whole, keeping a single space where the
 * run began or ended with one: runs are cut at formatting changes, often
 * between two words.
 */
function sanitizeRunText(text: string): string {
  const core = sanitizeWhole(text)
  const leading = /^\s/.test(text) ? ' ' : ''
  const trailing = /\s$/.test(text) ? ' ' : ''
  if (!core) return leading || trailing
  return `${leading}${escapeHtml(core)}${trailing}`
}

/** Stored inline HTML for runs: escaped text in `strong`/`em`/`u`, `<br>` for breaks. */
function inlinesToHtml(inlines: readonly RichInline[]): string {
  return inlines
    .map((inline) => {
      if (inline.type === 'break') return '<br>'
      let html = sanitizeRunText(inline.text)
      if (!html) return ''
      if (inline.format.underline) html = `<u>${html}</u>`
      if (inline.format.italic) html = `<em>${html}</em>`
      if (inline.format.bold) html = `<strong>${html}</strong>`
      return html
    })
    .join('')
}

/**
 * The runs of one translated segment. The reply is read with the same
 * allowlist; if it split the segment into several blocks, they are kept as
 * lines of the one block the original had.
 */
function translatedInlines(translation: string): RichInline[] | null {
  let blocks: RichBlock[]
  try {
    blocks = richTextToBlocks(translation, { maxBlocks: COVER_LETTER_TRANSLATION_LIMITS.segments })
  } catch (error) {
    if (error instanceof RichTextTooLargeError) return null
    throw error
  }
  const inlines = blocks.flatMap((block, index): RichInline[] =>
    index === 0 ? block.inlines : [{ type: 'break' }, ...block.inlines]
  )
  return hasText(inlines) ? inlines : null
}

/** Whether stored inline HTML shows any text: its tags removed, something but whitespace is left. */
function hasVisibleHtmlText(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim() !== ''
}

/** Writes blocks as HTML, rebuilding lists and their nesting from the original's structure. */
function blocksToHtml(blocks: readonly RichBlock[], contentOf: (index: number) => string): string {
  let html = ''
  /** Open lists, outermost first; each has an open `<li>`. */
  const lists: { list: number; tag: 'ul' | 'ol' }[] = []
  const closeList = () => {
    const closed = lists.pop()
    if (closed) html += `</li></${closed.tag}>`
  }

  blocks.forEach((block, index) => {
    const content = contentOf(index)
    if (block.type === 'paragraph') {
      while (lists.length > 0) closeList()
      html += `<p>${content || '<br>'}</p>`
      return
    }

    const tag = block.ordered ? 'ol' : 'ul'
    while (lists.length > block.level + 1) closeList()
    if (lists.length === block.level + 1 && lists[block.level].list !== block.list) closeList()
    if (lists.length === block.level + 1) {
      html += '</li><li>'
    } else {
      // A nested list opens inside the item still open around it.
      while (lists.length < block.level + 1) {
        lists.push({ list: block.list, tag })
        html += `<${tag}><li>`
      }
    }
    html += content
  })
  while (lists.length > 0) closeList()
  return html
}

type FieldPlan =
  | { kind: 'plain'; segment: number | null }
  | { kind: 'rich'; blocks: RichBlock[]; segments: (number | null)[] }

/**
 * The segments of a letter and how to put its translation back.
 *
 * @throws CoverLetterTranslationTooLargeError when the letter is over `COVER_LETTER_TRANSLATION_LIMITS`.
 */
export function planLetterTranslation(letter: TranslatableLetter): LetterTranslationPlan {
  const segments: string[] = []
  const limits = COVER_LETTER_TRANSLATION_LIMITS

  const addSegment = (segment: string): number => {
    segments.push(segment)
    if (segments.length > limits.segments) throw new CoverLetterTranslationTooLargeError()
    return segments.length - 1
  }

  const planPlain = (value: string | null): FieldPlan => {
    const text = value?.trim() ?? ''
    return { kind: 'plain', segment: text ? addSegment(escapeSegmentText(text)) : null }
  }

  const planRich = (html: string): FieldPlan => {
    let blocks: RichBlock[]
    try {
      blocks = richTextToBlocks(html, { maxBlocks: limits.segments })
    } catch (error) {
      if (error instanceof RichTextTooLargeError) throw new CoverLetterTranslationTooLargeError()
      throw error
    }
    return {
      kind: 'rich',
      blocks,
      segments: blocks.map((block) => (hasText(block.inlines) ? addSegment(inlinesToSegment(block.inlines)) : null)),
    }
  }

  const greeting = planPlain(letter.greeting)
  const opening = letter.opening_paragraph === null ? null : planRich(letter.opening_paragraph)
  const body = coverLetterBodyParagraphs(letter.body_paragraphs).map(planRich)
  const closing = letter.closing_paragraph === null ? null : planRich(letter.closing_paragraph)
  const signOff = planPlain(letter.sign_off)

  const totalCharacters = segments.reduce((sum, segment) => sum + segment.length, 0)
  if (totalCharacters > limits.totalCharacters) throw new CoverLetterTranslationTooLargeError()

  return {
    segments,
    rebuild(translations) {
      if (translations.length !== segments.length) return null
      let complete = true

      const plain = (plan: FieldPlan, maxLength: number): string => {
        if (plan.kind !== 'plain' || plan.segment === null) return ''
        const text = sanitizeWhole(translations[plan.segment])
        if (!text || text.length > maxLength) complete = false
        return text
      }

      const rich = (plan: FieldPlan): string => {
        if (plan.kind !== 'rich') return ''
        const html = blocksToHtml(plan.blocks, (index) => {
          const segment = plan.segments[index]
          if (segment === null) return ''
          const inlines = translatedInlines(translations[segment])
          const content = inlines === null ? '' : inlinesToHtml(inlines)
          // Judged on what is stored: a run whose text sanitizing removed
          // (only markup, only control characters) leaves the part empty.
          if (!hasVisibleHtmlText(content)) complete = false
          return content
        })
        // Over the PDF guard's per-field bound, the copy could not be exported;
        // the final pass below would also cut it. Refused instead.
        if (html.length > COVER_LETTER_PDF_GUARD.richTextField) {
          complete = false
          return ''
        }
        // The final allowlist pass. Within the bound, it cuts nothing.
        return sanitizeUntrustedRichText(html, COVER_LETTER_PDF_GUARD.richTextField)
      }

      const content: TranslatedLetterContent = {
        greeting: plain(greeting, COVER_LETTER_FIELD_LIMITS.greeting),
        opening_paragraph: opening === null ? null : rich(opening),
        body_paragraphs: body.map(rich),
        closing_paragraph: closing === null ? null : rich(closing),
        sign_off: plain(signOff, COVER_LETTER_FIELD_LIMITS.sign_off),
      }
      return complete ? content : null
    },
  }
}

/**
 * The original's title with the language suffix, the original cut so the
 * whole title stays within the title limit.
 */
export function translatedTitle(title: string, targetLanguage: TranslationLanguage): string {
  const suffix = ` (${targetLanguage.toUpperCase()})`
  const base = Array.from(title.trim())
    .slice(0, COVER_LETTER_FIELD_LIMITS.title - suffix.length)
    .join('')
  return `${base}${suffix}`.trim()
}
