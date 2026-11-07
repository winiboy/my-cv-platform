import {
  AlignmentType,
  Document,
  FrameAnchorType,
  FrameWrap,
  HeightRule,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
  type IFrameOptions,
  type ILevelsOptions,
} from 'docx'
import type { CoverLetterPdfFields } from '@/lib/cover-letter-pdf-html'
import type { CoverLetterLanguage } from '@/lib/cover-letter-language'
import type { CoverLetterSenderDetails } from '@/lib/cover-letter-sender'
import {
  SWISS_LETTER_FONT_SIZE_PT,
  SWISS_LETTER_GEOMETRY_MM,
  SWISS_LETTER_LINE_HEIGHT,
  SWISS_LETTER_SPACE_BEFORE_LINES,
  SWISS_LETTER_WINDOW_MAX_LINES,
  swissLetterParts,
  type SwissLetterPart,
  type SwissLetterPartKind,
} from '@/lib/cover-letter-swiss-letter'
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
 * library: the Swiss A4 letter of `swissLetterParts`
 * (cover-letter-swiss-format, US-004), the same parts in the same order with
 * the same text as the editor preview and the PDF (`buildCoverLetterPdfHtml`,
 * the reference this file follows), at the FR-2 positions of
 * `SWISS_LETTER_GEOMETRY_MM`.
 *
 * The page is A4 with the FR-2 margins, in Georgia 11 pt, colour #1F2937, at
 * the letter's 1.3 line height. Every part is a real paragraph; rich text
 * keeps its bold, italic, underline, inline sizes and fonts, its alignment
 * (left unless the text asks otherwise, as the PDF's `text-align: left`), and
 * its lists as Word lists, numbered or bulleted.
 *
 * POSITIONS, as Microsoft Word 16 lays them out (measured on Word's own PDF
 * export, not assumed). The sender block is the flow's first paragraph, at the
 * top margin and the left margin, its right indent keeping it the FR-2
 * clearance left of the window zone. The recipient block is a Word frame
 * anchored to the PAGE at the window zone's top-left corner (50 mm, 110 mm),
 * as wide as the window: its position does not depend on anything above it,
 * so its first line's top is at 50 mm however many lines the sender has. The
 * flow ignores the frame (`through`); the sender (left of 105 mm) and the
 * frame (right of 110 mm) never share a column, so they cannot overlap.
 *
 * The place-and-date line is at the left margin, its space before taking it
 * from the sender block's last line to one line below the window zone, six
 * lines tall, as the PDF's header does; below a recipient block longer than
 * that, one line below the block.
 *
 * A letter without a sender block has the recipient block in the flow
 * instead, as its first paragraph, placed by its space before and its left
 * indent: Word drops the space before of a paragraph that follows a frame at
 * the top of the page (measured: the place-and-date line rose to the top
 * margin), but keeps it on the document's first paragraph.
 *
 * Gaps are the PDF's CSS margins, collapsed as a browser collapses them: the
 * space between two paragraphs is the larger of the first one's bottom margin
 * and the second one's top margin, written as the second one's space before.
 *
 * DELIBERATE DIFFERENCES FROM THE PDF, each where Word cannot follow CSS:
 *   - Lines are "at least" the letter's line height, where the PDF's line
 *     boxes are exact: an exact Word line clips a larger inline size, which a
 *     CSS line box does not.
 *   - The place-and-date line's space before counts written lines: the
 *     sender's and the recipient's own lines (fields, the address's line
 *     breaks). Word does not report the lines it wraps, so:
 *       - a sender line Word wraps at 80 mm (a long e-mail address) moves the
 *         place-and-date line, and all below it, one line down per wrap; the
 *         recipient frame stays where it is and nothing overlaps;
 *       - a recipient line Word wraps inside the 80 mm window makes the frame
 *         taller, which the flow ignores. Up to six printed lines in all, the
 *         block stays inside the window zone and nothing changes; a seventh
 *         printed line touches the place-and-date line, and more would overlap
 *         it. A recipient block that prints more than six lines is exactly
 *         what the editor's envelope-window warning reports.
 *   - Word puts an "at least" line's extra height above the text, where CSS
 *     splits it above and below: a line's text sits about 0.3 to 0.4 mm lower
 *     than in the PDF (Georgia 11 pt needs 250 of the line's 286 twips), its
 *     box at the same place. In Word the recipient's first baseline is at
 *     54.3 mm, its line box from 50 mm.
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
  /** The sender details as printed: `effectiveSenderDetails(letter, linked CV contact)`, as the PDF uses them. */
  senderDetails: CoverLetterSenderDetails
  /** The date of the place-and-date line, pre-formatted (`formatCoverLetterDate`) in `language`, as the PDF prints it. */
  currentDate: string
  /** The letter's display language (`coverLetterLanguage`), as the PDF uses it. */
  language: CoverLetterLanguage
}

const MM_PER_INCH = 25.4
const TWIPS_PER_INCH = 1440
const TWIPS_PER_PT = 20
const HALF_POINTS_PER_PT = 2

/** Millimetres as twips, rounded: Word stores whole twips. */
const mmToTwips = (mm: number): number => Math.round((mm * TWIPS_PER_INCH) / MM_PER_INCH)

/** One line of the letter's text: 11 pt × 1.3 = 286 twips. */
export const COVER_LETTER_DOCX_LINE_TWIPS = Math.round(SWISS_LETTER_FONT_SIZE_PT * SWISS_LETTER_LINE_HEIGHT * TWIPS_PER_PT)

const geometry = SWISS_LETTER_GEOMETRY_MM
const windowRightMm =
  geometry.windowLeft + Math.min(geometry.windowMaxWidth, geometry.pageWidth - geometry.marginRight - geometry.windowLeft)

/**
 * The FR-2 geometry in twips. Offsets inside the text area are differences of
 * page positions each rounded once, so the positions on the page are exactly
 * the rounded FR-2 ones (the window's top at 2835, its left at 6236).
 */
export const COVER_LETTER_DOCX_GEOMETRY_TWIPS = Object.freeze({
  pageWidth: mmToTwips(geometry.pageWidth),
  pageHeight: mmToTwips(geometry.pageHeight),
  marginTop: mmToTwips(geometry.marginTop),
  marginRight: mmToTwips(geometry.marginRight),
  marginBottom: mmToTwips(geometry.marginBottom),
  marginLeft: mmToTwips(geometry.marginLeft),
  /** The sender block's right indent: its right edge the clearance left of the window zone. */
  senderRightIndent:
    mmToTwips(geometry.pageWidth - geometry.marginRight) - mmToTwips(geometry.windowLeft - geometry.senderWindowGap),
  /** The window zone's top-left corner, on the page. */
  windowTopOnPage: mmToTwips(geometry.windowTop),
  windowLeftOnPage: mmToTwips(geometry.windowLeft),
  /** The window zone's width: at most `windowMaxWidth`, never past the right margin. */
  windowWidth: mmToTwips(windowRightMm) - mmToTwips(geometry.windowLeft),
  /** The window zone's top, left and right edges, from the top, left and right margins. */
  windowTop: mmToTwips(geometry.windowTop) - mmToTwips(geometry.marginTop),
  windowLeft: mmToTwips(geometry.windowLeft) - mmToTwips(geometry.marginLeft),
  windowRight: mmToTwips(geometry.pageWidth - geometry.marginRight) - mmToTwips(windowRightMm),
  /** The bottom of the window zone (six lines), from the top margin. */
  windowBottom:
    mmToTwips(geometry.windowTop) - mmToTwips(geometry.marginTop) + SWISS_LETTER_WINDOW_MAX_LINES * COVER_LETTER_DOCX_LINE_TWIPS,
})

const twips = COVER_LETTER_DOCX_GEOMETRY_TWIPS

/** The space above `kind`, in twips: `SWISS_LETTER_SPACE_BEFORE_LINES` lines, as the PDF's margin-top. */
function spaceBeforeTwips(kind: SwissLetterPartKind): number {
  return Math.round(SWISS_LETTER_SPACE_BEFORE_LINES[kind] * COVER_LETTER_DOCX_LINE_TWIPS)
}

const LETTER_FONT = 'Georgia'
const LETTER_COLOR = '1F2937'

/** `ul, ol { margin: 0.5rem 0; padding-left: 2rem; }` in the PDF's print stylesheet. */
const LIST_MARGIN_TWIPS = pxToTwips(8)
const LIST_INDENT_TWIPS = pxToTwips(32)

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
const LINE_BREAK = /\r\n|\r|\n/

/** Plain text as a browser lays out one line of it: whitespace collapsed, ends trimmed. */
function collapseWhitespace(text: string): string {
  return text.replace(COLLAPSIBLE_WHITESPACE, ' ').trim()
}

/** Text with the characters XML cannot carry removed. */
const xmlText = (text: string): string => text.replace(XML_INVALID, '')

/** A paragraph before its space before is known. */
interface PendingParagraph {
  build: (spacingBeforeTwips: number) => Paragraph
  topTwips: number
  bottomTwips: number
}

/**
 * The letter's line height, "at least": an exact Word line clips a larger
 * inline size in rich text, which a CSS line box does not.
 */
const LINE_SPACING = { line: COVER_LETTER_DOCX_LINE_TWIPS, lineRule: LineRuleType.AT_LEAST } as const

/**
 * The lines of a plain-text part as the PDF lays them out: each line's
 * whitespace collapsed (a `white-space: pre-line` block keeps only its line
 * breaks), the characters XML cannot carry removed, empty lines at either end
 * dropped. Empty when nothing is left.
 */
function plainLines(lines: string[]): string[] {
  const cleaned = lines.map((line) => collapseWhitespace(xmlText(line)))
  while (cleaned.length > 0 && cleaned[0] === '') cleaned.shift()
  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '') cleaned.pop()
  return cleaned
}

/** Text that keeps its own line breaks (`white-space: pre-line`), as lines. */
const preLineLines = (text: string): string[] => text.split(LINE_BREAK)

interface PlainParagraphOptions {
  bold?: boolean
  /** Left and right indents, from the margins. */
  indent?: { left: number; right: number }
  frame?: IFrameOptions
}

/** A paragraph of `lines` (already `plainLines`), joined by line breaks; `null` when there are none. */
function plainParagraph(lines: string[], options: PlainParagraphOptions = {}): PendingParagraph | null {
  if (lines.length === 0) return null
  const { bold, indent, frame } = options
  const runs = lines.flatMap((line, index) => [
    ...(index > 0 ? [new TextRun({ break: 1, bold })] : []),
    ...(line ? [new TextRun({ text: line, bold })] : []),
  ])
  return {
    topTwips: 0,
    bottomTwips: 0,
    build: (before) => new Paragraph({ children: runs, indent, frame, spacing: { before, after: 0, ...LINE_SPACING } }),
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
 * inline size outside them is clamped once, here, so a run can never be
 * written out of range.
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

/** Whether `other` is an item of the same list element as `block`, so no list margin lies between them. */
const sameList = (block: Extract<RichBlock, { type: 'listItem' }>, other: RichBlock | undefined): boolean =>
  other?.type === 'listItem' && other.list === block.list

/**
 * A rich-text field's paragraphs, left-aligned as the PDF's are unless the
 * text asks otherwise; `[]` when it has no visible text. Spends its
 * paragraphs and runs from `budget` before building any.
 *
 * Spacing inside the field is the print stylesheet's: paragraphs have no
 * margin, and every list element, nested ones included, has its 0.5rem above
 * and below it, collapsed with whatever margin it meets.
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
    const alignment = WORD_ALIGNMENT[block.alignment ?? 'left']
    const children = richRuns(block.inlines)

    if (block.type === 'paragraph') {
      return {
        topTwips: 0,
        bottomTwips: 0,
        build: (before) => new Paragraph({ children, alignment, spacing: { before, after: 0, ...LINE_SPACING } }),
      }
    }

    // Now, not when the paragraph is built: the next field reuses list numbers.
    const instance = lists.instanceOf(block.list)
    return {
      topTwips: sameList(block, blocks[index - 1]) ? 0 : LIST_MARGIN_TWIPS,
      bottomTwips: sameList(block, blocks[index + 1]) ? 0 : LIST_MARGIN_TWIPS,
      build: (before) =>
        new Paragraph({
          children,
          alignment,
          spacing: { before, after: 0, ...LINE_SPACING },
          numbering: {
            reference: block.ordered ? NUMBERED_LIST : BULLET_LIST,
            level: Math.min(block.level, LIST_LEVELS - 1),
            instance,
          },
        }),
    }
  })
}

const compact = (paragraphs: (PendingParagraph | null)[]): PendingParagraph[] =>
  paragraphs.filter((paragraph): paragraph is PendingParagraph => paragraph !== null)

/** The sender block: at the left margin, its right edge the FR-2 clearance left of the window zone. */
const SENDER_INDENT = { left: 0, right: twips.senderRightIndent }

/** The recipient block in the flow (a letter without a sender block): the window zone's left and right edges. */
const RECIPIENT_INDENT = { left: twips.windowLeft, right: twips.windowRight }

/**
 * The recipient frame: anchored to the page at the window zone's top-left
 * corner, as wide as the window, its height its content's. The flow ignores
 * it (`through`): with any other wrapping Word moves the paragraph after it
 * below the frame and then adds that paragraph's space before on top, which
 * pushed the letter about 30 mm down in Word 16. The flow keeps clear of it
 * by its own spacing instead.
 */
const RECIPIENT_FRAME: IFrameOptions = {
  type: 'absolute',
  position: { x: twips.windowLeftOnPage, y: twips.windowTopOnPage },
  width: twips.windowWidth,
  height: 0,
  rule: HeightRule.AUTO,
  anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
  wrap: FrameWrap.THROUGH,
}

type FlowPart = Exclude<SwissLetterPart, { kind: 'sender' | 'recipient' }>

/** The paragraphs of a part below the window zone. A rich part spends from `budget`; plain parts are bounded by the PDF guard. */
function flowPartParagraphs(part: FlowPart, lists: ListInstances, budget: DocxBudget): PendingParagraph[] {
  switch (part.kind) {
    case 'opening':
    case 'body':
    case 'closing':
      return richParagraphs(part.html, lists, budget)
    case 'annexes':
      return compact([plainParagraph(plainLines([part.label])), plainParagraph(plainLines(preLineLines(part.text)))])
    case 'subject':
      return compact([plainParagraph(plainLines([part.text]), { bold: true })])
    case 'placeDate':
    case 'greeting':
    case 'signOff':
    case 'signature':
      return compact([plainParagraph(plainLines([part.text]))])
  }
}

/** The recipient block's lines: each field on its own line, the address with its own line breaks. */
function recipientLines(part: Extract<SwissLetterPart, { kind: 'recipient' }>): string[] {
  return part.lines.flatMap((line) => plainLines(line.multiline ? preLineLines(line.text) : [line.text]))
}

/**
 * The letter's paragraphs, in `swissLetterParts` order: the sender block, the
 * recipient frame, then the rest of the flow, each flow paragraph with its
 * space before (the larger of the previous one's bottom margin and its own top
 * margin).
 *
 * Throws `CoverLetterDocxTooLargeError` beyond `COVER_LETTER_DOCX_LIMITS`,
 * before the parts past the limit are built.
 */
export function coverLetterDocxParagraphs({ coverLetter, senderDetails, currentDate, language }: CoverLetterDocxInput): Paragraph[] {
  const lists = new ListInstances()
  const budget: DocxBudget = { ...COVER_LETTER_DOCX_LIMITS }
  // In document order. The recipient frame is positioned on the page and
  // takes no part in the flow's spacing.
  const ordered: (PendingParagraph | Paragraph)[] = []
  const flow: PendingParagraph[] = []
  // How far the flow's written lines reach below the top margin, and how far
  // the recipient block reaches: the place-and-date line is spaced from them.
  let flowBottom = 0
  let recipientBottom = twips.windowBottom

  for (const part of swissLetterParts(coverLetter, { senderDetails, date: currentDate, language })) {
    switch (part.kind) {
      case 'sender': {
        const lines = plainLines(part.lines)
        const sender = plainParagraph(lines, { indent: SENDER_INDENT })
        if (sender) {
          flowBottom = lines.length * COVER_LETTER_DOCX_LINE_TWIPS
          ordered.push(sender)
          flow.push(sender)
        }
        break
      }
      case 'recipient': {
        const lines = recipientLines(part)
        const blockBottom = twips.windowTop + lines.length * COVER_LETTER_DOCX_LINE_TWIPS
        recipientBottom = Math.max(twips.windowBottom, blockBottom)
        if (flow.length > 0) {
          const recipient = plainParagraph(lines, { frame: RECIPIENT_FRAME })
          if (recipient) ordered.push(recipient.build(0))
        } else {
          // No sender block: Word drops the space before of a paragraph that
          // follows a frame at the top of the page, so the recipient is the
          // flow's first paragraph instead, whose space before Word keeps.
          const recipient = plainParagraph(lines, { indent: RECIPIENT_INDENT })
          if (recipient) {
            recipient.topTwips = twips.windowTop
            flowBottom = blockBottom
            ordered.push(recipient)
            flow.push(recipient)
          }
        }
        break
      }
      default: {
        const paragraphs = flowPartParagraphs(part, lists, budget)
        if (paragraphs.length === 0) break
        const first = paragraphs[0]
        first.topTwips = Math.max(first.topTwips, spaceBeforeTwips(part.kind))
        // One line below the window zone, or below a longer recipient block.
        if (part.kind === 'placeDate') first.topTwips += Math.max(0, recipientBottom - flowBottom)
        ordered.push(...paragraphs)
        flow.push(...paragraphs)
      }
    }
  }

  const built = new Map<PendingParagraph, Paragraph>(
    flow.map((paragraph, index) => [paragraph, paragraph.build(Math.max(flow[index - 1]?.bottomTwips ?? 0, paragraph.topTwips))]),
  )
  return ordered.map((item) => (item instanceof Paragraph ? item : built.get(item)!))
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
        indent: { left: LIST_INDENT_TWIPS * (level + 1), hanging: LIST_INDENT_TWIPS / 2 },
      },
    },
  }))
}

/** The letter's Word document. */
export function buildCoverLetterDocument(input: CoverLetterDocxInput): Document {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: LETTER_FONT, size: SWISS_LETTER_FONT_SIZE_PT * HALF_POINTS_PER_PT, color: LETTER_COLOR },
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
            size: { width: twips.pageWidth, height: twips.pageHeight },
            margin: { top: twips.marginTop, right: twips.marginRight, bottom: twips.marginBottom, left: twips.marginLeft },
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
