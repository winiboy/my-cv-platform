import { AlignmentType } from 'docx'
import { extractAlignment } from './docx-helpers'

/**
 * What a generator needs to know about how the Preview's browser lays text
 * out, to draw the same lines in Microsoft Word: how `.formatted-content`
 * splits rich text into blocks, and how far a list indents.
 *
 * Every value here was measured against Word's own render (Word → PDF) and
 * Chromium's on Windows; see `docs/engineering/docx-word-parity.md` for the
 * method. They hold for Microsoft Word on Windows only.
 */

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
