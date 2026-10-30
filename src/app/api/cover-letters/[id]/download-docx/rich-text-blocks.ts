/**
 * A cover letter's stored rich text (opening, body paragraphs, closing) as the
 * paragraphs, list items and formatted runs a Word document is built from.
 *
 * WHY NOT THE RESUME DOCX PARSER
 * `parseHtmlToDocxRuns` (`src/app/api/resumes/[id]/download-docx/docx-helpers.ts`)
 * decodes `&lt;`/`&gt;` BEFORE it looks for tags, so text a user typed as
 * "<b>" would become bold or vanish, where the PDF prints it as typed; and it
 * flattens a field into one paragraph with "•" prefixes and line breaks. A
 * letter's Word file needs real paragraphs and real Word lists, and that
 * parser is shared by five resume templates, so it is not changed here.
 *
 * THE SAME ALLOWLIST AS THE PDF
 * The PDF is sanitized by `sanitizeRichHtml` (`src/lib/rich-html-sanitizer.ts`),
 * the editor's own allowlist, which needs a DOM the server does not have. This
 * module applies the same rules without one:
 *   - `p`, `div`, `br`, `strong`/`b`, `em`/`i`, `u`, `ul`, `ol`, `li`, `span`,
 *     `font` are the elements that keep a meaning;
 *   - of their attributes, only `font-family`, `font-size` and `text-align` in
 *     `style`, and `face` on `font`, are read;
 *   - every other element becomes its text, with no formatting of its own, as
 *     the sanitizer replaces it with its `textContent`.
 * Nothing here produces markup: the result is plain data, and the `docx`
 * library XML-escapes every string it writes.
 *
 * WHAT IS APPROXIMATED
 * The browser's HTML parser is not reproduced in full. Markup the editor
 * writes (Chrome's `contentEditable` serialization) is read exactly; malformed
 * markup degrades to its text, never to lost text. Named entities are decoded
 * for HTML 4's Latin-1 and typographic set, which covers what the editor and
 * the AI paths store; any other stays as written.
 *
 * BOUNDED WORK
 * One pass of a tokenizer whose every branch consumes what it starts on, as in
 * `src/lib/resume-from-job/untrusted-text.ts`. Every step after a token looks
 * at most `MAX_NESTING_DEPTH` open elements: an element opened deeper than
 * that is ignored (its text joins its parent's, its closing tag is matched by
 * a counter), so a field costs O(length × MAX_NESTING_DEPTH), linear in its
 * length. `maxBlocks` stops the pass as soon as the field holds more blocks
 * than the caller can take, so a flood of tiny paragraphs is refused after
 * reading only as many as the limit.
 *
 * XML-SAFE TEXT
 * Decoded character references never yield a character XML 1.0 cannot carry
 * (see `decodeHtmlEntities`); literal ones are the caller's to remove from
 * the input before parsing.
 */

/** The alignment a paragraph's `text-align` asks for. */
export type RichTextAlignment = 'left' | 'center' | 'right' | 'justify'

/** The formatting a run of text carries. */
export interface RichTextFormat {
  bold: boolean
  italic: boolean
  underline: boolean
  /** An inline `font-size`, in CSS px. */
  fontSizePx?: number
  /** The first family of an inline `font-family`, unquoted. */
  fontFamily?: string
}

export type RichInline = { type: 'text'; text: string; format: RichTextFormat } | { type: 'break' }

/**
 * A paragraph, or one item of a list. `list` numbers the field's lists in
 * order of appearance, so each ordered list can restart at 1; `level` is the
 * item's nesting depth, 0 for a top-level list.
 */
export type RichBlock =
  | { type: 'paragraph'; inlines: RichInline[]; alignment?: RichTextAlignment }
  | {
      type: 'listItem'
      ordered: boolean
      list: number
      level: number
      inlines: RichInline[]
      alignment?: RichTextAlignment
    }

/**
 * How deep elements are followed. The editor nests a handful (a list in a
 * list, a bold span in an italic one); anything deeper is only a cost.
 */
export const MAX_NESTING_DEPTH = 32

/** The field holds more blocks than `maxBlocks` allowed; nothing is returned. */
export class RichTextTooLargeError extends Error {
  constructor(readonly maxBlocks: number) {
    super(`Rich text holds more than ${maxBlocks} blocks`)
    this.name = 'RichTextTooLargeError'
  }
}

/**
 * The elements that keep a meaning: `sanitizeRichHtml`'s allowlist, lower
 * case. `rich-text-blocks.test.ts` fails if the two drift apart.
 */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set(['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'span', 'font'])

const BLOCK_TAGS = new Set(['p', 'div'])
const LIST_TAGS = new Set(['ul', 'ol'])

/** Elements with no content and no closing tag. */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/** Elements whose content is text up to their closing tag, never markup. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes'])
/** The same, with entities decoded. */
const ESCAPABLE_RAW_TEXT_TAGS = new Set(['textarea', 'title'])

/**
 * A comment, doctype, processing instruction, or tag with its attribute text.
 * Each branch consumes what it starts on (to its `>` or to the end), so the
 * scan is linear; a `<` that starts none of them is text.
 */
const MARKUP_PATTERN = /<!--[\s\S]*?(?:-->|$)|<![^>]*>?|<\?[^>]*>?|<(\/?)([a-zA-Z][^\s/>]*)([^>]*)>?/g

/** HTML 4's Latin-1 names, U+00A0 to U+00FF in order. */
const LATIN1_ENTITY_NAMES = (
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 ' +
  'acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml ' +
  'Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde ' +
  'Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ' +
  'ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide ' +
  'oslash ugrave uacute ucirc uuml yacute thorn yuml'
).split(' ')

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ...LATIN1_ENTITY_NAMES.map((name, index): [string, string] => [name, String.fromCharCode(0xa0 + index)]),
  ...(
    [
      ['OElig', 0x152],
      ['oelig', 0x153],
      ['Scaron', 0x160],
      ['scaron', 0x161],
      ['Yuml', 0x178],
      ['fnof', 0x192],
      ['circ', 0x2c6],
      ['tilde', 0x2dc],
      ['ensp', 0x2002],
      ['emsp', 0x2003],
      ['thinsp', 0x2009],
      ['zwnj', 0x200c],
      ['zwj', 0x200d],
      ['lrm', 0x200e],
      ['rlm', 0x200f],
      ['ndash', 0x2013],
      ['mdash', 0x2014],
      ['lsquo', 0x2018],
      ['rsquo', 0x2019],
      ['sbquo', 0x201a],
      ['ldquo', 0x201c],
      ['rdquo', 0x201d],
      ['bdquo', 0x201e],
      ['dagger', 0x2020],
      ['Dagger', 0x2021],
      ['bull', 0x2022],
      ['hellip', 0x2026],
      ['permil', 0x2030],
      ['prime', 0x2032],
      ['Prime', 0x2033],
      ['lsaquo', 0x2039],
      ['rsaquo', 0x203a],
      ['euro', 0x20ac],
      ['trade', 0x2122],
    ] as const
  ).map(([name, code]): [string, string] => [name, String.fromCharCode(code)]),
])

const ENTITY = /&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g

/**
 * The HTML parser's reading of numeric references 0x80 to 0x9F: the
 * windows-1252 characters legacy text meant by them (`&#146;` is ’). The five
 * code points windows-1252 leaves undefined stay as they are.
 */
const WINDOWS_1252: ReadonlyMap<number, number> = new Map([
  [0x80, 0x20ac], [0x82, 0x201a], [0x83, 0x0192], [0x84, 0x201e], [0x85, 0x2026], [0x86, 0x2020],
  [0x87, 0x2021], [0x88, 0x02c6], [0x89, 0x2030], [0x8a, 0x0160], [0x8b, 0x2039], [0x8c, 0x0152],
  [0x8e, 0x017d], [0x91, 0x2018], [0x92, 0x2019], [0x93, 0x201c], [0x94, 0x201d], [0x95, 0x2022],
  [0x96, 0x2013], [0x97, 0x2014], [0x98, 0x02dc], [0x99, 0x2122], [0x9a, 0x0161], [0x9b, 0x203a],
  [0x9c, 0x0153], [0x9e, 0x017e], [0x9f, 0x0178],
])

/** Code points XML 1.0 cannot carry: C0 controls but tab, line feed and carriage return, and U+FFFE/U+FFFF. */
function isXmlInvalid(code: number): boolean {
  return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0xfffe || code === 0xffff
}

/**
 * Character references decoded as an HTML parser decodes them in text, except
 * that a reference to a character XML cannot carry decodes to nothing: such a
 * character draws nothing in the PDF either, and in `document.xml` it would
 * stop Word opening the file.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(ENTITY, (match, body: string) => {
    if (body[0] === '#') {
      const parsed = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      // As the parser does: no NUL, no surrogate, nothing past Unicode.
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 0x10ffff || (parsed >= 0xd800 && parsed <= 0xdfff)) return '�'
      const code = WINDOWS_1252.get(parsed) ?? parsed
      return isXmlInvalid(code) ? '' : String.fromCodePoint(code)
    }
    return NAMED_ENTITIES.get(body) ?? match
  })
}

/** An attribute's value from a tag's attribute text, entities decoded. */
function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i').exec(attributes)
  if (!match) return undefined
  return decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '')
}

/** One declaration's value from a `style` attribute, as the sanitizer reads it. */
function styleValue(style: string, property: string): string | undefined {
  const match = new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+)`, 'i').exec(style)
  const value = match?.[1].trim()
  return value ? value : undefined
}

/** A `font-size` in CSS px; units other than px and pt are not read. */
function fontSizePx(value: string | undefined): number | undefined {
  if (!value) return undefined
  const match = /^(\d+(?:\.\d+)?)\s*(px|pt)$/i.exec(value.replace(/\s*!important$/i, ''))
  if (!match) return undefined
  const size = Number.parseFloat(match[1]) * (match[2].toLowerCase() === 'pt' ? 4 / 3 : 1)
  return size > 0 && Number.isFinite(size) ? size : undefined
}

/** The first family of a `font-family` list, unquoted. */
function primaryFamily(value: string | undefined): string | undefined {
  const family = value?.split(',')[0].trim().replace(/^["']|["']$/g, '').trim()
  return family ? family : undefined
}

function alignment(value: string | undefined): RichTextAlignment | undefined {
  const normalized = value?.toLowerCase()
  return normalized === 'left' || normalized === 'center' || normalized === 'right' || normalized === 'justify'
    ? normalized
    : undefined
}

interface OpenElement {
  name: string
  format: RichTextFormat
  alignment?: RichTextAlignment
  /** For a list: its number in the field. */
  list?: number
}

const PLAIN: RichTextFormat = { bold: false, italic: false, underline: false }

/** Collapsible HTML whitespace; U+00A0 is not part of it. */
const COLLAPSIBLE_WHITESPACE = /[ \t\n\r\f]+/g

/**
 * Whitespace laid out as a browser lays out a block: runs collapse to one
 * space, and a line neither starts nor ends with one. A trailing `<br>` opens
 * no new line, except when it is all the block holds: that is an empty line.
 */
function layOutLine(inlines: RichInline[]): RichInline[] | null {
  const laidOut: RichInline[] = []
  let atLineStart = true
  let lastWasSpace = false

  const trimLineEnd = () => {
    const last = laidOut[laidOut.length - 1]
    if (last?.type !== 'text' || !last.text.endsWith(' ')) return
    last.text = last.text.slice(0, -1)
    if (last.text === '') laidOut.pop()
  }

  for (const inline of inlines) {
    if (inline.type === 'break') {
      trimLineEnd()
      laidOut.push(inline)
      atLineStart = true
      lastWasSpace = false
      continue
    }
    let text = inline.text.replace(COLLAPSIBLE_WHITESPACE, ' ')
    if (text.startsWith(' ') && (atLineStart || lastWasSpace)) text = text.slice(1)
    if (text === '') continue
    laidOut.push({ type: 'text', text, format: inline.format })
    atLineStart = false
    lastWasSpace = text.endsWith(' ')
  }
  trimLineEnd()

  if (laidOut.length === 0) return null
  if (laidOut[laidOut.length - 1].type === 'break') {
    // `<div><br></div>` is one empty line; `text<br>` is just the text.
    if (laidOut.length === 1) return []
    laidOut.pop()
  }
  return laidOut
}

const hasText = (inlines: RichInline[]): boolean =>
  inlines.some((inline) => inline.type === 'text' && inline.text.trim() !== '')

export interface RichTextToBlocksOptions {
  /** Throw `RichTextTooLargeError` as soon as the field holds more blocks than this. */
  maxBlocks?: number
}

/** One more open element named `name` than the stack holds. */
function countUp(counts: Map<string, number>, name: string): void {
  counts.set(name, (counts.get(name) ?? 0) + 1)
}

/** Matches a closing tag against `counts`; whether it did. */
function countDown(counts: Map<string, number>, name: string): boolean {
  const count = counts.get(name) ?? 0
  if (count === 0) return false
  counts.set(name, count - 1)
  return true
}

/**
 * The blocks of one stored rich-text field, in order. A field with no visible
 * text gives no block; an empty line between paragraphs is an empty
 * paragraph, as the PDF shows it.
 */
export function richTextToBlocks(html: string, { maxBlocks = Infinity }: RichTextToBlocksOptions = {}): RichBlock[] {
  const blocks: RichBlock[] = []
  /** Open allowed elements, at most `MAX_NESTING_DEPTH`. */
  const stack: OpenElement[] = []
  /** Allowed elements opened beyond the depth limit, by name: ignored, their closing tags absorbed. */
  const ignored = new Map<string, number>()
  /** Disallowed elements being read as text, so their closing tags can be matched; at most the depth limit. */
  const opaque: string[] = []
  /** Disallowed elements opened beyond the depth limit inside them, by name. */
  const opaqueOverflow = new Map<string, number>()
  let current: RichInline[] = []
  // Kept as a flag, so a paragraph boundary inside a long list item costs O(1).
  let currentHasText = false
  let listCount = 0
  const lower = html.toLowerCase()

  const format = (): RichTextFormat => stack[stack.length - 1]?.format ?? PLAIN
  const blockAlignment = (): RichTextAlignment | undefined => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const element = stack[index]
      if (element.alignment) return element.alignment
      if (element.name === 'li') return undefined
    }
    return undefined
  }
  /** The open `li` and the list it belongs to, when the nearest list context is an item. */
  const openItem = (): { item: OpenElement; listElement: OpenElement; level: number } | null => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (LIST_TAGS.has(stack[index].name)) return null
      if (stack[index].name === 'li') {
        for (let listIndex = index - 1; listIndex >= 0; listIndex -= 1) {
          if (LIST_TAGS.has(stack[listIndex].name)) {
            const level = stack.slice(0, listIndex).filter((element) => LIST_TAGS.has(element.name)).length
            return { item: stack[index], listElement: stack[listIndex], level }
          }
        }
        return null
      }
    }
    return null
  }

  const appendText = (text: string) => {
    if (!text) return
    current.push({ type: 'text', text, format: format() })
    if (!currentHasText && text.trim() !== '') currentHasText = true
  }

  const pushBlock = (block: RichBlock) => {
    if (blocks.length >= maxBlocks) throw new RichTextTooLargeError(maxBlocks)
    blocks.push(block)
  }

  /** Ends the block being collected. Inside a list item, a paragraph boundary is a line break. */
  const flush = (endsItem = false) => {
    const context = openItem()
    if (context && !endsItem) {
      if (currentHasText && current[current.length - 1].type !== 'break') current.push({ type: 'break' })
      return
    }
    const inlines = layOutLine(current)
    current = []
    currentHasText = false
    if (inlines === null) return
    if (context) {
      if (!hasText(inlines)) return
      pushBlock({
        type: 'listItem',
        ordered: context.listElement.name === 'ol',
        list: context.listElement.list ?? 0,
        level: context.level,
        inlines,
        alignment: blockAlignment(),
      })
      return
    }
    pushBlock({ type: 'paragraph', inlines, alignment: blockAlignment() })
  }

  /** Closes the innermost open element named `name`, and everything opened inside it. */
  const close = (name: string) => {
    if (!stack.some((element) => element.name === name)) return
    let closed: OpenElement | undefined
    do {
      closed = stack[stack.length - 1]
      if (closed.name === 'li') flush(true)
      else if (BLOCK_TAGS.has(closed.name) || LIST_TAGS.has(closed.name)) flush()
      stack.pop()
    } while (closed.name !== name)
  }

  /** As the parser does, a new block closes an open `p`; a new item closes the open item of its list. */
  const closeImplied = (name: string) => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const open = stack[index].name
      if (name === 'li' && open === 'li') return close('li')
      if (LIST_TAGS.has(open) || open === 'li') return
      if (open === 'p') return close('p')
    }
  }

  const pattern = new RegExp(MARKUP_PATTERN.source, 'g')
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    appendText(decodeHtmlEntities(html.slice(cursor, match.index)))
    cursor = match.index + match[0].length

    const rawName = match[2]
    if (rawName === undefined) continue // a comment, doctype or processing instruction
    const name = rawName.toLowerCase()
    const closing = match[1] === '/'
    const attributes = match[3] ?? ''

    if (!closing && (RAW_TEXT_TAGS.has(name) || ESCAPABLE_RAW_TEXT_TAGS.has(name))) {
      // Its content is its text, up to its own closing tag, whatever it holds.
      const end = lower.indexOf(`</${name}`, cursor)
      const content = html.slice(cursor, end < 0 ? html.length : end)
      appendText(ESCAPABLE_RAW_TEXT_TAGS.has(name) ? decodeHtmlEntities(content) : content)
      const closeEnd = end < 0 ? -1 : html.indexOf('>', end)
      cursor = end < 0 ? html.length : closeEnd < 0 ? html.length : closeEnd + 1
      pattern.lastIndex = cursor
      continue
    }

    if (opaque.length > 0) {
      if (closing) {
        if (!countDown(opaqueOverflow, name)) {
          const at = opaque.lastIndexOf(name)
          if (at >= 0) opaque.length = at
          if (opaque.length === 0) opaqueOverflow.clear()
        }
      } else if (!VOID_TAGS.has(name)) {
        if (opaque.length < MAX_NESTING_DEPTH) opaque.push(name)
        else countUp(opaqueOverflow, name)
      }
      continue
    }

    if (!ALLOWED_TAGS.has(name)) {
      // Replaced by its text, as the sanitizer does; a void element has none.
      if (!closing && !VOID_TAGS.has(name)) opaque.push(name)
      continue
    }

    if (name === 'br') {
      if (!closing) current.push({ type: 'break' })
      continue
    }

    if (closing) {
      if (!countDown(ignored, name)) close(name)
      continue
    }

    if (stack.length >= MAX_NESTING_DEPTH) {
      // Too deep to follow: its text joins its parent's, unformatted by it.
      countUp(ignored, name)
      continue
    }

    if (BLOCK_TAGS.has(name) || LIST_TAGS.has(name) || name === 'li') {
      closeImplied(name)
      // A nested list ends the item's own line: it is written before the
      // nested items, not folded into a line break.
      flush(LIST_TAGS.has(name))
    }

    const style = attribute(attributes, 'style') ?? ''
    const parent = format()
    const element: OpenElement = {
      name,
      format: {
        ...parent,
        bold: parent.bold || name === 'strong' || name === 'b',
        italic: parent.italic || name === 'em' || name === 'i',
        underline: parent.underline || name === 'u',
      },
    }
    const size = fontSizePx(styleValue(style, 'font-size'))
    if (size !== undefined) element.format.fontSizePx = size
    const family = primaryFamily(styleValue(style, 'font-family') ?? (name === 'font' ? attribute(attributes, 'face') : undefined))
    if (family !== undefined) element.format.fontFamily = family
    if (BLOCK_TAGS.has(name) || name === 'li') element.alignment = alignment(styleValue(style, 'text-align'))
    if (LIST_TAGS.has(name)) element.list = listCount++
    stack.push(element)
  }
  appendText(decodeHtmlEntities(html.slice(cursor)))

  while (stack.length > 0) close(stack[0].name)
  flush()
  return blocks
}
