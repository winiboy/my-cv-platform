import {
  AlignmentType,
  Document,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
  type ILevelsOptions,
} from 'docx'
import {
  coverLetterParts,
  type CoverLetterPart,
  type CoverLetterPdfFields,
} from '@/lib/cover-letter-pdf-html'
import type { CoverLetterLanguage } from '@/lib/cover-letter-language'
import { pxToHalfPoints, pxToTwips } from '@/app/api/resumes/[id]/download-docx/docx-helpers'
import {
  RichTextTooLargeError,
  richTextToBlocks,
  type RichBlock,
  type RichInline,
  type RichTextAlignment,
} from './rich-text-blocks'

/**
 * A cover letter as a Word document, built server-side with the `docx`
 * library from `coverLetterParts`: sender; date; recipient and company block;
 * subject; greeting; opening; each body paragraph; closing; sign-off;
 * signature name.
 *
 * TRANSITIONAL (cover-letter-swiss-format): the layout is the US Letter
 * template the PDF printed before it moved to the Swiss A4 letter in US-003,
 * kept as it was until US-004 moves this file to `swissLetterParts` too: a US
 * Letter page with 64 px margins, Georgia 14 px at a 1.625 line height, its
 * colors, weights and gaps. Every part is a real paragraph; rich text keeps its bold,
 * italic, underline, inline sizes and fonts, its alignment, and its lists as
 * Word lists, numbered or bulleted.
 *
 * Gaps are the template's CSS margins, collapsed as a browser collapses them:
 * the space between two paragraphs is the larger of the first one's bottom
 * margin and the second one's top margin, written as the first one's space
 * after.
 */

/**
 * The most paragraphs, and runs (formatted pieces of text and line breaks), a
 * letter's Word file may hold. A RESOURCE BOUND, NOT A CONTENT RULE, like
 * `COVER_LETTER_PDF_GUARD`: a real letter has well under 200 paragraphs and a
 * few hundred runs, but a row within that guard can still hold tens of
 * thousands of either, and building them would hold the server's event loop
 * for seconds (SEC-016). Paragraphs are counted while the letter is read and
 * reading stops at the limit; runs are counted before any is built.
 */
export const COVER_LETTER_DOCX_LIMITS = Object.freeze({ paragraphs: 1_000, runs: 5_000 })

/** The letter would exceed `COVER_LETTER_DOCX_LIMITS`; nothing was built. */
export class CoverLetterDocxTooLargeError extends Error {
  constructor() {
    super('Cover letter exceeds the Word export limits')
    this.name = 'CoverLetterDocxTooLargeError'
  }
}

/** What is left of `COVER_LETTER_DOCX_LIMITS` while a letter is read. */
interface DocxBudget {
  paragraphs: number
  runs: number
}

/** Takes `paragraphs` and `runs` from the budget, or throws once either is spent. */
function spend(budget: DocxBudget, paragraphs: number, runs: number): void {
  budget.paragraphs -= paragraphs
  budget.runs -= runs
  if (budget.paragraphs < 0 || budget.runs < 0) throw new CoverLetterDocxTooLargeError()
}

export interface CoverLetterDocxInput {
  coverLetter: CoverLetterPdfFields
  /** The date line, pre-formatted (`formatCoverLetterDate`) in `language`, as the PDF prints it. */
  currentDate: string
  /** The letter's display language (`coverLetterLanguage`), as the PDF uses it. */
  language: CoverLetterLanguage
}

/** The US Letter template's metrics, in CSS px, as the PDF drew them before US-003. */
const TEMPLATE = {
  pageWidthPx: 816,
  pageHeightPx: 1056,
  paddingPx: 64,
  font: 'Georgia',
  fontSizePx: 14,
  lineHeight: 1.625,
  color: '1F2937',
  senderFontSizePx: 20,
  senderColor: '111827',
  dateColor: '4B5563',
  /** `ul, ol { margin: 0.5rem 0; padding-left: 2rem; }` in the print stylesheet. */
  listMarginPx: 8,
  listIndentPx: 32,
} as const

/** Each part's CSS margins, top and bottom. */
const PART_MARGINS_PX: Record<CoverLetterPart['kind'], { top: number; bottom: number }> = {
  sender: { top: 0, bottom: 4 },
  date: { top: 0, bottom: 24 },
  recipient: { top: 0, bottom: 24 },
  subject: { top: 0, bottom: 24 },
  greeting: { top: 0, bottom: 16 },
  opening: { top: 0, bottom: 16 },
  body: { top: 0, bottom: 16 },
  closing: { top: 0, bottom: 24 },
  // The sign-off block's own top margin.
  signOff: { top: 32, bottom: 32 },
  signature: { top: 0, bottom: 0 },
}

const BULLET_LIST = 'cover-letter-bullet'
const NUMBERED_LIST = 'cover-letter-number'

/** The nesting depths a Word list definition holds. */
const LIST_LEVELS = 9

/**
 * Characters XML 1.0 cannot carry: C0 controls other than tab, line feed and
 * carriage return, U+FFFE/U+FFFF, and unpaired surrogates. One of them in
 * `document.xml` and Word refuses to open the file.
 */
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

const COLLAPSIBLE_WHITESPACE = /[ \t\n\r\f]+/g

/** Plain text as a browser lays out one line of it: whitespace collapsed, ends trimmed. */
function collapseWhitespace(text: string): string {
  return text.replace(COLLAPSIBLE_WHITESPACE, ' ').trim()
}

/** Text with the characters XML cannot carry removed. */
const xmlText = (text: string): string => text.replace(XML_INVALID, '')

/** A paragraph before its space after is known. */
interface PendingParagraph {
  build: (spacingAfterTwips: number) => Paragraph
  topPx: number
  bottomPx: number
}

/** Exact CSS line boxes can clip a larger inline size, so lines are "at least" the template's. */
function lineSpacing(fontSizePx: number) {
  return { line: pxToTwips(fontSizePx * TEMPLATE.lineHeight), lineRule: LineRuleType.AT_LEAST }
}

interface PlainRunStyle {
  bold?: boolean
  fontSizePx?: number
  color?: string
}

/** A paragraph of plain text, `lines` joined by line breaks; `null` when it has no text. */
function plainParagraph(lines: string[], style: PlainRunStyle = {}): PendingParagraph | null {
  const cleaned = lines.map((line) => collapseWhitespace(xmlText(line)))
  while (cleaned.length > 0 && cleaned[0] === '') cleaned.shift()
  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '') cleaned.pop()
  if (cleaned.length === 0) return null

  const size = style.fontSizePx === undefined ? undefined : pxToHalfPoints(style.fontSizePx)
  const runs = cleaned.flatMap((line, index) => [
    ...(index > 0 ? [new TextRun({ break: 1, size, bold: style.bold, color: style.color })] : []),
    ...(line ? [new TextRun({ text: line, size, bold: style.bold, color: style.color })] : []),
  ])
  return {
    topPx: 0,
    bottomPx: 0,
    build: (after) =>
      new Paragraph({
        children: runs,
        spacing: { before: 0, after, ...lineSpacing(style.fontSizePx ?? TEMPLATE.fontSizePx) },
      }),
  }
}

const WORD_ALIGNMENT: Record<RichTextAlignment, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

/**
 * Word's own bounds on a run's size (2 to 3,276 half-points), in CSS px. An
 * inline size outside them is clamped once, here, for the run and for the
 * line it sets, so neither can be written out of range.
 */
const MIN_FONT_SIZE_PX = 2 / 1.5
const MAX_FONT_SIZE_PX = 3276 / 1.5

export function clampFontSizePx(px: number): number {
  return Math.min(MAX_FONT_SIZE_PX, Math.max(MIN_FONT_SIZE_PX, px))
}

function richRuns(inlines: RichInline[]): TextRun[] {
  return inlines.map((inline) => {
    if (inline.type === 'break') return new TextRun({ break: 1 })
    const { format } = inline
    const size = format.fontSizePx === undefined ? undefined : pxToHalfPoints(clampFontSizePx(format.fontSizePx))
    return new TextRun({
      text: inline.text,
      bold: format.bold || undefined,
      italics: format.italic || undefined,
      underline: format.underline ? {} : undefined,
      size,
      font: format.fontFamily,
    })
  })
}

/** The largest inline size a block uses, for its line height. */
function largestFontSizePx(inlines: RichInline[]): number {
  return inlines.reduce<number>(
    (largest, inline) =>
      inline.type === 'text' && inline.format.fontSizePx ? Math.max(largest, clampFontSizePx(inline.format.fontSizePx)) : largest,
    TEMPLATE.fontSizePx,
  )
}

/** Hands out a Word list instance per list, so each numbered list starts at 1. */
class ListInstances {
  private next = 0
  private readonly byList = new Map<number, number>()

  /** Call once per field, before its blocks. */
  startField(): void {
    this.byList.clear()
  }

  instanceOf(list: number): number {
    let instance = this.byList.get(list)
    if (instance === undefined) {
      instance = this.next++
      this.byList.set(list, instance)
    }
    return instance
  }
}

/**
 * A rich-text field's paragraphs, justified as the template's paragraphs are
 * unless the text asks otherwise; `[]` when it has no visible text. Spends
 * its paragraphs and runs from `budget` before building any.
 */
function richParagraphs(html: string, lists: ListInstances, budget: DocxBudget): PendingParagraph[] {
  let blocks: RichBlock[]
  try {
    // Before layout, so a dropped character never leaves a doubled space.
    blocks = richTextToBlocks(xmlText(html), { maxBlocks: Math.max(0, budget.paragraphs) })
  } catch (error) {
    if (error instanceof RichTextTooLargeError) throw new CoverLetterDocxTooLargeError()
    throw error
  }
  spend(budget, blocks.length, blocks.reduce((runs, block) => runs + block.inlines.length, 0))
  if (!blocks.some((block) => block.inlines.some((inline) => inline.type === 'text' && inline.text.trim() !== ''))) return []

  lists.startField()
  return blocks.map((block, index): PendingParagraph => {
    const alignment = WORD_ALIGNMENT[block.alignment ?? 'justify']
    const spacing = lineSpacing(largestFontSizePx(block.inlines))
    const children = richRuns(block.inlines)

    if (block.type === 'paragraph') {
      return {
        topPx: 0,
        bottomPx: 0,
        build: (after) => new Paragraph({ children, alignment, spacing: { before: 0, after, ...spacing } }),
      }
    }

    // Now, not when the paragraph is built: the next field reuses list numbers.
    const instance = lists.instanceOf(block.list)
    // A top-level list is spaced from the paragraphs around it.
    const previous = blocks[index - 1]
    const following = blocks[index + 1]
    const sameList = (other: RichBlock | undefined) => other?.type === 'listItem' && sameListTree(other, block)
    return {
      topPx: block.level === 0 && !sameList(previous) ? TEMPLATE.listMarginPx : 0,
      bottomPx: block.level === 0 && !sameList(following) ? TEMPLATE.listMarginPx : 0,
      build: (after) =>
        new Paragraph({
          children,
          alignment,
          spacing: { before: 0, after, ...spacing },
          numbering: {
            reference: block.ordered ? NUMBERED_LIST : BULLET_LIST,
            level: Math.min(block.level, LIST_LEVELS - 1),
            instance,
          },
        }),
    }
  })
}

/**
 * Whether two neighbouring items belong to one top-level list, so the list's
 * spacing goes around it as a whole: they are in the same list, or one of
 * them is nested, and a nested item always sits inside the top-level list
 * around it. Two top-level lists side by side are spaced apart.
 */
function sameListTree(a: Extract<RichBlock, { type: 'listItem' }>, b: Extract<RichBlock, { type: 'listItem' }>): boolean {
  if (a.list === b.list) return true
  return a.level > 0 || b.level > 0
}

/** The paragraphs of one letter part. A rich part spends from `budget`; plain parts are few and short. */
function partParagraphs(part: CoverLetterPart, lists: ListInstances, budget: DocxBudget): PendingParagraph[] {
  switch (part.kind) {
    case 'sender':
      return compact([
        plainParagraph([part.text], { bold: true, fontSizePx: TEMPLATE.senderFontSizePx, color: TEMPLATE.senderColor }),
      ])
    case 'date':
      return compact([plainParagraph([part.text], { color: TEMPLATE.dateColor })])
    case 'recipient':
      // The address is `white-space: pre-line`: its own line breaks stay.
      return compact(part.lines.map((line) => plainParagraph(line.multiline ? line.text.split(/\r\n|\r|\n/) : [line.text])))
    case 'subject':
    case 'signature':
      return compact([plainParagraph([part.text], { bold: true })])
    case 'greeting':
    case 'signOff':
      return compact([plainParagraph([part.text])])
    case 'opening':
    case 'body':
    case 'closing':
      return richParagraphs(part.html, lists, budget)
  }
}

const compact = (paragraphs: (PendingParagraph | null)[]): PendingParagraph[] =>
  paragraphs.filter((paragraph): paragraph is PendingParagraph => paragraph !== null)

/**
 * Every paragraph of the letter, in order, each with its space after: the
 * larger of its bottom margin and the next one's top margin. The first has no
 * space before (the page margin is the template's padding) and the last none
 * after.
 *
 * Throws `CoverLetterDocxTooLargeError` beyond `COVER_LETTER_DOCX_LIMITS`,
 * before the parts past the limit are built.
 */
export function coverLetterDocxParagraphs({ coverLetter, currentDate, language }: CoverLetterDocxInput): Paragraph[] {
  const lists = new ListInstances()
  const pending: PendingParagraph[] = []
  const budget: DocxBudget = { ...COVER_LETTER_DOCX_LIMITS }

  for (const part of coverLetterParts(coverLetter, currentDate, language)) {
    const paragraphs = partParagraphs(part, lists, budget)
    if (paragraphs.length === 0) continue
    const margins = PART_MARGINS_PX[part.kind]
    paragraphs[0].topPx = Math.max(paragraphs[0].topPx, margins.top)
    const last = paragraphs[paragraphs.length - 1]
    last.bottomPx = Math.max(last.bottomPx, margins.bottom)
    pending.push(...paragraphs)
  }

  return pending.map((paragraph, index) => {
    const next = pending[index + 1]
    return paragraph.build(next ? pxToTwips(Math.max(paragraph.bottomPx, next.topPx)) : 0)
  })
}

/** One list definition, the same marker at every depth, as the print stylesheet draws it. */
function listLevels(format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (level: number) => string): ILevelsOptions[] {
  return Array.from({ length: LIST_LEVELS }, (_, level) => ({
    level,
    format,
    text: text(level),
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: { left: pxToTwips(TEMPLATE.listIndentPx * (level + 1)), hanging: pxToTwips(TEMPLATE.listIndentPx / 2) },
      },
    },
  }))
}

/** The letter's Word document. */
export function buildCoverLetterDocument(input: CoverLetterDocxInput): Document {
  const pagePadding = pxToTwips(TEMPLATE.paddingPx)
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: TEMPLATE.font, size: pxToHalfPoints(TEMPLATE.fontSizePx), color: TEMPLATE.color },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      },
    },
    numbering: {
      config: [
        { reference: BULLET_LIST, levels: listLevels(LevelFormat.BULLET, () => '•') },
        { reference: NUMBERED_LIST, levels: listLevels(LevelFormat.DECIMAL, (level) => `%${level + 1}.`) },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: pxToTwips(TEMPLATE.pageWidthPx), height: pxToTwips(TEMPLATE.pageHeightPx) },
            margin: { top: pagePadding, right: pagePadding, bottom: pagePadding, left: pagePadding },
          },
        },
        children: coverLetterDocxParagraphs(input),
      },
    ],
  })
}

/** The letter's `.docx` file. */
export async function buildCoverLetterDocx(input: CoverLetterDocxInput): Promise<Buffer> {
  return Packer.toBuffer(buildCoverLetterDocument(input))
}
