import { AlignmentType, type UniversalMeasure } from 'docx'
import { extractAlignment, extractPrimaryFont } from './docx-helpers'

/**
 * What a generator needs to know about how the Preview's browser lays text
 * out, to draw the same lines in Microsoft Word: the metrics of the fonts the
 * picker offers, where each engine puts a baseline inside a line, and how
 * `.formatted-content` splits rich text into blocks.
 *
 * Every value here was measured against Word's own render (Word → PDF) and
 * Chromium's on Windows; see `docs/engineering/docx-word-parity.md` for the
 * method. They hold for Microsoft Word on Windows only.
 */

/**
 * Metrics of the families the font picker offers, as the Preview's browser
 * lays them out, in em: OS/2 winAscent and winDescent, and the advance widths
 * of "•" (U+2022) and the space, over unitsPerEm (2048 for every one of them),
 * read from the Windows font files. Helvetica is not a Windows font; the
 * browser and Word both draw it as Arial.
 */
export interface PreviewFontMetrics {
  ascent: number
  descent: number
  bullet: number
  space: number
}

export const PREVIEW_FONT_METRICS: Readonly<Record<string, PreviewFontMetrics>> = {
  arial: { ascent: 1854 / 2048, descent: 434 / 2048, bullet: 717 / 2048, space: 569 / 2048 },
  helvetica: { ascent: 1854 / 2048, descent: 434 / 2048, bullet: 717 / 2048, space: 569 / 2048 },
  'times new roman': { ascent: 1825 / 2048, descent: 443 / 2048, bullet: 717 / 2048, space: 512 / 2048 },
  georgia: { ascent: 1878 / 2048, descent: 449 / 2048, bullet: 804 / 2048, space: 494 / 2048 },
  'courier new': { ascent: 1705 / 2048, descent: 615 / 2048, bullet: 1229 / 2048, space: 1229 / 2048 },
  verdana: { ascent: 2059 / 2048, descent: 430 / 2048, bullet: 1117 / 2048, space: 720 / 2048 },
  tahoma: { ascent: 2049 / 2048, descent: 423 / 2048, bullet: 931 / 2048, space: 640 / 2048 },
  calibri: { ascent: 1950 / 2048, descent: 550 / 2048, bullet: 1020 / 2048, space: 463 / 2048 },
  'segoe ui': { ascent: 2210 / 2048, descent: 514 / 2048, bullet: 832 / 2048, space: 561 / 2048 },
}

/**
 * The family a generator writes and measures, from a CSS font stack: the first
 * family the metric table knows, which is the one the Preview's browser draws
 * on Windows — it passes over names Windows has no font for, as "System
 * Default" (`-apple-system, BlinkMacSystemFont, "Segoe UI", …`) shows: it
 * draws Segoe UI. Writing that same family keeps Word from substituting a font
 * of its own for `-apple-system` while the raise is computed for Segoe UI. A
 * stack naming no family the table knows keeps its first family, unmeasured.
 */
export function resolvePreviewFont(fontFamily: string): { name: string; metrics: PreviewFontMetrics | null } {
  for (const family of fontFamily.split(',')) {
    const name = family.trim().replace(/['"]/g, '')
    const metrics = PREVIEW_FONT_METRICS[name.toLowerCase()]
    if (metrics) return { name, metrics }
  }
  return { name: extractPrimaryFont(fontFamily), metrics: null }
}

/**
 * The raise (`w:position`) that puts a run's baseline in Word where the Preview
 * draws it.
 *
 * - Word, in an exact line, sets the baseline 0.8 of the line below its top.
 * - The browser centres the font's ascent + descent, each rounded to a whole
 *   px, in the line box, and the baseline lands on a whole px of the box.
 *
 * `previewOffsetPx` is how far below the Word line's top the Preview's line box
 * starts (a box's padding, or a flex item centred in a taller row). Word
 * honours a raise in whole half-points only, so the result is rounded to them.
 * A family the metric table does not know gets no raise rather than another
 * font's.
 *
 * @param px the Preview's font size, in px.
 * @param lineHeight the Preview's unitless CSS line height.
 * @param wordLineTwips the exact line the run is drawn in, in twips.
 */
export function baselineRaise(
  metrics: PreviewFontMetrics | null,
  px: number,
  lineHeight: number,
  wordLineTwips: number,
  previewOffsetPx = 0
): UniversalMeasure {
  if (!metrics) return '0pt'
  const ascent = Math.round(metrics.ascent * px)
  const descent = Math.round(metrics.descent * px)
  const previewBaseline = previewOffsetPx + Math.floor(ascent + (px * lineHeight - ascent - descent) / 2)
  const wordBaseline = (0.8 * wordLineTwips) / 15
  return `${Math.round((wordBaseline - previewBaseline) * 1.5) / 2}pt`
}

/**
 * One line-level block of formatted (HTML) text as `.formatted-content` lays it
 * out: a paragraph — a `<p>` or `<div>`, or a line ended by `<br>` — or a list
 * item. Every element inside `.formatted-content` has no margin or padding, so
 * blocks stack with no gap; only a list indents (`margin-left: 1.25rem`).
 */
export interface FormattedBlock {
  /** Inline HTML, re-opening any bold, italic or underline still open from the block before. */
  html: string
  /** The `text-align` the block's own `<p>`, `<div>` or `<li>` declares, if any. */
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined
  /** The list marker on a list item's first line ("•", "1."); null for a paragraph or an item's later block. */
  marker: string | null
  /** How many lists the block is inside. */
  depth: number
}

const BLOCK_BOUNDARY = /<\/?(?:p|div|ul|ol|li)\b[^>]*>|<br\s*\/?>/gi
const INLINE_FORMAT_TAG = /<(\/?)(strong|b|em|i|u)\b[^>]*>/gi

/**
 * Split formatted HTML into the blocks the browser draws, in order. The shared
 * list helper keeps only the `<li>` of HTML that has a list, which dropped
 * every `<p>` beside it (measured: a summary of two paragraphs and a list lost
 * both paragraphs). A `<br>` ends a line even when the line is empty, as it
 * does in the browser; an element with no text draws nothing.
 */
export function formattedBlocks(html: string): FormattedBlock[] {
  const blocks: FormattedBlock[] = []
  // The open block elements, innermost last. `text-align` inherits, so each
  // takes its own or its parent's; a list keeps its item count.
  const open: { name: string; alignment: FormattedBlock['alignment']; ordered: boolean; count: number }[] = []
  const alignment = () => open[open.length - 1]?.alignment
  const depth = () => open.filter((el) => el.name === 'ul' || el.name === 'ol').length
  // Close `name` and everything opened inside it, as the browser's parser does
  // for an end tag; an end tag with no open element of its name is ignored.
  const close = (name: string) => {
    const at = open.map((el) => el.name).lastIndexOf(name)
    if (at !== -1) open.length = at
  }
  let marker: string | null = null
  let carry = ''
  let buffer = ''
  const flush = (keepEmpty: boolean) => {
    const content = carry + buffer
    if (keepEmpty || content.replace(/<[^>]+>/g, '').trim() !== '') {
      blocks.push({ html: content, alignment: alignment(), marker, depth: depth() })
      marker = null
    }
    const formats: string[] = []
    for (const [, closing, tag] of content.matchAll(INLINE_FORMAT_TAG)) {
      const name = tag.toLowerCase()
      if (!closing) formats.push(name)
      else if (formats.lastIndexOf(name) !== -1) formats.splice(formats.lastIndexOf(name), 1)
    }
    carry = formats.map((name) => `<${name}>`).join('')
    buffer = ''
  }
  let last = 0
  for (const match of html.matchAll(BLOCK_BOUNDARY)) {
    buffer += html.slice(last, match.index)
    last = (match.index ?? 0) + match[0].length
    const tag = match[0].toLowerCase()
    if (tag.startsWith('<br')) {
      flush(true)
      continue
    }
    flush(false)
    const name = /^<\/?([a-z]+)/.exec(tag)?.[1] ?? ''
    if (tag.startsWith('</')) {
      close(name)
      if (name === 'li') marker = null
      continue
    }
    // A <p> cannot hold a block, so the next block start closes an unclosed one;
    // an <li> closes the previous item of its own list.
    if (open[open.length - 1]?.name === 'p') open.pop()
    if (name === 'li') {
      const list = open.map((el) => el.name === 'ul' || el.name === 'ol').lastIndexOf(true)
      const item = open.map((el) => el.name).lastIndexOf('li')
      if (item > list) open.length = item
    }
    const parentList = [...open].reverse().find((el) => el.name === 'ul' || el.name === 'ol')
    open.push({ name, alignment: extractAlignment(match[0]) ?? alignment(), ordered: name === 'ol', count: 0 })
    if (name === 'li' && parentList) {
      parentList.count += 1
      marker = parentList.ordered ? `${parentList.count}.` : '•'
    }
  }
  buffer += html.slice(last)
  flush(false)
  return blocks
}

/**
 * Bold, italic and underline as the bare `<b>`, `<i>`, `<u>` the shared run
 * helper recognises. It matches inline tags exactly, so a tag with attributes
 * — `<strong class="c">`, `<b style="…">` — gets no formatting there, while
 * the Preview draws it bold or italic.
 */
export function bareInlineFormatTags(html: string): string {
  const bare: Readonly<Record<string, string>> = { strong: 'b', b: 'b', em: 'i', i: 'i', u: 'u' }
  return html.replace(INLINE_FORMAT_TAG, (_tag, closing: string, name: string) => `<${closing}${bare[name.toLowerCase()]}>`)
}

/** `.formatted-content ul, ol { margin-left: 1.25rem }`, per level of nesting. */
export const FORMATTED_LIST_INDENT_PX = 20

/**
 * Where the browser draws an outside list marker, before the item's text, in em
 * of the text's size. Measured in Chromium: the disc's ink starts 13px before
 * the text at 11px Arial, 14px at 12.1px Georgia.
 */
export const FORMATTED_LIST_MARKER_EM = 13 / 11
