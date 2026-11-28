// The Word export's paragraph reader: a pure, import-free parser, shared so
// the active alignment shown is the one the Word file will have
import { richTextToBlocks } from '@/app/api/cover-letters/[id]/download-docx/rich-text-blocks'
import type { TextAlignment } from './rich-text-alignment'

/**
 * Whole-letter alignment (cover-letter-top-toolbar, US-002): one alignment
 * click aligns every paragraph of the opening, of every body paragraph and of
 * the closing, wherever the cursor is.
 *
 * It is a transform of the fields' stored HTML, not an editing command: only
 * the current section's editors are mounted, so the browser's `justify*`
 * commands could not reach the others. The editor page applies it to the
 * letter's state, and the mounted editors re-sync from their value. A
 * consequence: Ctrl+Z inside a field does not undo it.
 *
 * PURE STRING TRANSFORM, BY DESIGN. It runs in Node (the unit tests, server
 * render) as in the browser, and it changes only what it must: the `style` of
 * each block start tag, and a wrapping `<p>` around bare text at the top
 * level. Every other byte (inline formatting, entities, whitespace) is kept as
 * it was, so bold, italic, underline, lists, font and size are untouched.
 *
 * Blocks are the elements the stored HTML may hold as paragraphs (see
 * `ALLOWED_TAGS` in rich-text-blocks.ts): `p`, `div` and `li`, at any depth,
 * so a nested paragraph never keeps an alignment of its own. `ul` and `ol`
 * keep their markup: their items carry the alignment, which is where the Word
 * export reads it (`richTextToBlocks`). Left is written explicitly too, so a
 * paragraph that was centered becomes left, not "whatever it was".
 *
 * The input is HTML as the editor stores it. A legacy plain-text value (no
 * tag at all) must be converted with `migrateTextToHtml` first, as the editor
 * does to display it, or its paragraph breaks would collapse into one block.
 */

const ALIGNED_BLOCKS = new Set(['p', 'div', 'li'])
/** Block elements that end a run of top-level text. */
const BLOCKS = new Set(['p', 'div', 'li', 'ul', 'ol'])
/** Elements with no end tag. */
const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input', 'wbr'])

type Token =
  | { kind: 'text'; source: string }
  | { kind: 'start'; source: string; name: string; selfClosing: boolean }
  | { kind: 'end'; source: string; name: string }
  | { kind: 'other'; source: string }

/** Splits HTML into text, tags and comments, without changing a byte. */
function tokenize(html: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < html.length) {
    const open = html.indexOf('<', index)
    if (open < 0) {
      tokens.push({ kind: 'text', source: html.slice(index) })
      break
    }
    if (open > index) tokens.push({ kind: 'text', source: html.slice(index, open) })

    if (html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4)
      const end = close < 0 ? html.length : close + 3
      tokens.push({ kind: 'other', source: html.slice(open, end) })
      index = end
      continue
    }

    const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(open, open + 64))
    if (!tag) {
      // A "<" that opens no tag is text, as in the browser's parser
      tokens.push({ kind: 'text', source: '<' })
      index = open + 1
      continue
    }

    // The tag ends at the first ">" outside a quoted attribute value
    let end = open + tag[0].length
    let quote: string | null = null
    while (end < html.length) {
      const char = html[end]
      if (quote) {
        if (char === quote) quote = null
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (char === '>') {
        break
      }
      end += 1
    }
    const source = html.slice(open, Math.min(end + 1, html.length))
    const name = tag[2].toLowerCase()
    if (tag[1]) tokens.push({ kind: 'end', source, name })
    else tokens.push({ kind: 'start', source, name, selfClosing: /\/\s*>$/.test(source) })
    index = end + 1
  }
  return tokens
}

const STYLE_ATTRIBUTE = /(\sstyle\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'>]+))/i

/** The start tag with its `text-align` set to `alignment`, its other styles kept. */
function withAlignment(source: string, alignment: TextAlignment): string {
  const declaration = `text-align: ${alignment};`
  const match = STYLE_ATTRIBUTE.exec(source)
  if (!match) {
    const close = /\s*\/?>$/.exec(source)
    const at = close ? close.index : source.length
    return `${source.slice(0, at)} style="${declaration}"${source.slice(at)}`
  }
  const current = match[3] ?? match[4] ?? match[5] ?? ''
  // Only the text-align declaration is removed: the rest of the style is kept
  // as written, entities included (`&quot;Times New Roman&quot;` holds ";")
  const others = current.replace(/(^|;)\s*text-align\s*:[^;]*;?/gi, '$1').trim()
  // A final ";" that ends an entity (`&quot;`, `&#34;`) is no separator
  const endsWithSeparator = /(?<!&#?[a-zA-Z0-9]+);$/.test(others)
  const style = (others === '' ? declaration : `${others}${endsWithSeparator ? '' : ';'} ${declaration}`).replace(
    /"/g,
    '&quot;'
  )
  return `${source.slice(0, match.index)}${match[1]}"${style}"${source.slice(match.index + match[0].length)}`
}

/** Whether text holds something visible: a non-breaking space alone does not count. */
function isVisibleText(source: string): boolean {
  return source.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').trim() !== ''
}

/** `html` with every paragraph aligned to `alignment`. Empty input stays empty. */
export function alignRichText(html: string, alignment: TextAlignment): string {
  if (html.trim() === '') return html

  const output: string[] = []
  /** Names of the open elements, outermost first. */
  const open: string[] = []
  /** A run of top-level text and inline elements, not yet in any block. */
  let run: string[] = []
  let runHasText = false
  /** Inline elements opened in the run and not closed yet. */
  let runOpen = 0
  /** The run closes an element it did not open. */
  let runUnbalanced = false

  // A run is wrapped only when it is whole: an inline element that holds a
  // block (`<b>x<p>y</p>z</b>`, which the editor does not write) is left as
  // it is, since a wrapping paragraph would cut it in two. Its blocks are
  // still aligned; its bare text is not. Malformed runs (an end tag with no
  // start, an element left open) are likewise kept unwrapped, never repaired.
  const flushRun = () => {
    if (run.length === 0) return
    const wrap = runHasText && runOpen === 0 && !runUnbalanced
    output.push(wrap ? `<p style="text-align: ${alignment};">${run.join('')}</p>` : run.join(''))
    run = []
    runHasText = false
    runOpen = 0
    runUnbalanced = false
  }
  const insideBlock = () => open.some((name) => BLOCKS.has(name))

  for (const token of tokenize(html)) {
    if (token.kind === 'start' && BLOCKS.has(token.name)) {
      // A block opened at the top level, or inside top-level inline elements,
      // ends the text run before it
      if (!insideBlock()) flushRun()
      // The parser's implied end tags: a block closes an open <p>, an item a previous item
      if (open[open.length - 1] === 'p') open.pop()
      if (token.name === 'li') {
        const item = open.lastIndexOf('li')
        const list = Math.max(open.lastIndexOf('ul'), open.lastIndexOf('ol'))
        if (item > list) open.length = item
      }
      output.push(ALIGNED_BLOCKS.has(token.name) ? withAlignment(token.source, alignment) : token.source)
      if (!token.selfClosing) open.push(token.name)
      continue
    }

    if (token.kind === 'end' && BLOCKS.has(token.name)) {
      const at = open.lastIndexOf(token.name)
      if (at >= 0) open.length = at
      output.push(token.source)
      continue
    }

    if (insideBlock()) {
      output.push(token.source)
    } else {
      run.push(token.source)
      if (token.kind === 'text' && isVisibleText(token.source)) runHasText = true
      if (token.kind === 'start' && !token.selfClosing && !VOID_ELEMENTS.has(token.name)) runOpen += 1
      if (token.kind === 'end') {
        if (runOpen > 0) runOpen -= 1
        else runUnbalanced = true
      }
    }

    if (token.kind === 'start' && !token.selfClosing && !VOID_ELEMENTS.has(token.name)) open.push(token.name)
    if (token.kind === 'end') {
      const at = open.lastIndexOf(token.name)
      if (at >= 0) open.length = at
    }
  }
  flushRun()

  return output.join('')
}

/**
 * The paragraphs of the fields that hold text, as the Word export reads them.
 * An empty paragraph (a blank line) has nothing to align, so it never counts.
 */
function blocksOf(fields: ReadonlyArray<string | null | undefined>) {
  return fields
    .flatMap((field) => (field ? richTextToBlocks(field) : []))
    .filter((block) =>
      block.inlines.some((inline) => inline.type === 'text' && inline.text.replace(/ /g, ' ').trim() !== '')
    )
}

/**
 * The alignment every paragraph of `fields` shares, a paragraph with none of
 * its own counting as left; `null` when they differ or no field holds text.
 */
export function sharedAlignment(fields: ReadonlyArray<string | null | undefined>): TextAlignment | null {
  let shared: TextAlignment | null = null
  for (const block of blocksOf(fields)) {
    const alignment = block.alignment ?? 'left'
    if (shared === null) shared = alignment
    else if (alignment !== shared) return null
  }
  return shared
}

/** Whether any of `fields` holds text, which is what an alignment can apply to. */
export function hasAlignableText(fields: ReadonlyArray<string | null | undefined>): boolean {
  return blocksOf(fields).length > 0
}
