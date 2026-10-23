import { escapeHtml } from '@/lib/escape-html'

/**
 * DOM-free sanitizing for untrusted text (AI output, job-offer fields) that is
 * written into a new resume on the server.
 *
 * WHY A SEPARATE SANITIZER
 * `sanitizeHtml` (`src/lib/html-utils.tsx`) parses with `document`, so it cannot
 * run in a route handler or server action, and adding a sanitizing dependency is
 * out of scope. Stored rich text is still sanitized again by `SanitizedHtml`
 * when it is rendered; this module makes sure what is STORED is already safe.
 *
 * SAFE BY CONSTRUCTION
 * The output contains only tags this module writes itself, from a fixed
 * allowlist and without a single attribute. Every other character of the input
 * is emitted as escaped text. So however the input is malformed - unterminated
 * tags, quoted `>` inside attributes, nested comments - nothing in it can become
 * an element, an attribute or a URL in the output.
 *
 * LINEAR TIME
 * The input is cut before it is scanned, and every pattern either consumes what
 * it starts on or fails at its first character, so adversarial input (runs of
 * `<a`, `&`, `<!--`, unclosed tags) costs time proportional to its length.
 *
 * STORABLE
 * The output never holds a NUL or other C0 control character (tab, line feed
 * and carriage return excepted) or an unpaired surrogate: PostgreSQL rejects
 * both in text and JSON values.
 */

/** Elements kept, after `b`/`i` are normalized to `strong`/`em`. */
const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li'])

const TAG_ALIASES: Readonly<Record<string, string>> = { b: 'strong', i: 'em' }

/** Elements whose CONTENT is dropped too: their text is code or never shown. */
const DROPPED_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'noscript',
  'textarea',
  'title',
  'svg',
  'math',
  'head',
])

/**
 * A tag, comment, doctype or processing instruction.
 *
 * Every branch ends in an optional `>` (or end of input), so a match always
 * consumes everything up to its closing `>` or to the end; a pattern that
 * REQUIRED the `>` would rescan to the end from every unclosed `<x` and turn a
 * run of them quadratic. An unclosed tag at the end is therefore dropped,
 * which is also what a browser does with it.
 */
const MARKUP_PATTERN = /<!--[\s\S]*?(?:-->|$)|<![^>]*>?|<\?[^>]*>?|<(\/?)([a-zA-Z][^\s/>]*)[^>]*>?/g

/** A well-formed entity, a bare `&`, or another character HTML text must escape. */
const ESCAPABLE = /&(?:#\d{1,7};|#x[0-9a-fA-F]{1,6};|[a-zA-Z][a-zA-Z0-9]{1,31};)?|[<>"']/g

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * How much longer than its limit a plain-text value may be before it is
 * scanned: markup does not count towards a label's length, so the scan must see
 * past `maxLength`, but not unboundedly far. Eight times the limit (1,600
 * characters for a 200-character label) clears any plausible markup around a
 * label; text beyond it is dropped unread.
 */
const PLAIN_TEXT_SCAN_FACTOR = 8

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}

/**
 * Removes the characters PostgreSQL cannot store: C0 controls other than tab,
 * line feed and carriage return (NUL above all), and unpaired surrogates.
 */
function removeUnstorableCharacters(text: string): string {
  let result = ''
  let kept = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    let drop = false
    if (code < 0x20) {
      drop = code !== 0x09 && code !== 0x0a && code !== 0x0d
    } else if (isHighSurrogate(code)) {
      if (index + 1 < text.length && isLowSurrogate(text.charCodeAt(index + 1))) {
        index += 1 // a valid pair: keep both halves
      } else {
        drop = true
      }
    } else if (isLowSurrogate(code)) {
      drop = true
    }
    if (drop) {
      result += text.slice(kept, index)
      kept = index + 1
    }
  }
  return kept === 0 ? text : result + text.slice(kept)
}

/** The first `maxLength` UTF-16 units, without cutting a surrogate pair in half. */
function cutToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const end = maxLength > 0 && isHighSurrogate(text.charCodeAt(maxLength - 1)) ? maxLength - 1 : maxLength
  return text.slice(0, end)
}

/**
 * Escapes text for HTML while keeping entities it already contains, so text
 * the AI wrote as `R&amp;D` is not turned into `R&amp;amp;D`. Keeping an entity
 * is safe: inside text content it decodes to a character, never to markup.
 */
function escapeTextKeepingEntities(text: string): string {
  // One native pass: each `&` either starts a whole entity (kept) or is a bare
  // ampersand (escaped); the entity name is bounded, so the scan stays linear.
  return text.replace(ESCAPABLE, (match) => (match.length > 1 ? match : (ESCAPED_CHARACTERS[match] ?? match)))
}

/** `escapeHtml`'s replacements, looked up per character instead of re-run. */
const ESCAPED_CHARACTERS: Readonly<Record<string, string>> = Object.fromEntries(
  ['&', '<', '>', '"', "'"].map((character) => [character, escapeHtml(character)])
)

function decodeEntities(text: string): string {
  return text.replace(/&(#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return safeCodePoint(Number.parseInt(body.slice(2), 16)) ?? match
    }
    if (body.startsWith('#')) {
      return safeCodePoint(Number.parseInt(body.slice(1), 10)) ?? match
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

function safeCodePoint(codePoint: number): string | null {
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return null
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null
  return String.fromCodePoint(codePoint)
}

/** True when the HTML holds visible text, not only tags and whitespace. */
function hasVisibleText(html: string): boolean {
  // Tags and the entities that decode to whitespace are removed without
  // decoding the rest: any character left is visible text.
  return /\S/.test(html.replace(/<[^>]*>|&nbsp;|&#0*(?:9|10|13|32|160);|&#x0*(?:9|a|d|20|a0);/gi, ''))
}

/**
 * Plain text (no markup at all) as paragraphs: a blank line starts a new `<p>`,
 * a single line break becomes `<br>` - the editor's own plain-text convention.
 */
function plainTextToHtml(text: string): string {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${paragraph.split(/\r?\n/).map(escapeTextKeepingEntities).join('<br>')}</p>`)
    .join('')
}

/**
 * Untrusted rich text to stored HTML.
 *
 * Keeps `p`, `br`, `strong`, `em`, `u`, `ul`, `ol`, `li` (with `b`/`i` as
 * `strong`/`em`), drops every attribute, drops `script`/`style` and similar
 * elements with their content, unwraps every other element to its text, and
 * closes whatever the input left open. Input without markup becomes `<p>`
 * paragraphs. The input is cut to `maxLength` characters BEFORE sanitizing, so
 * a cut through a tag only drops that tag.
 *
 * Returns `''` when the result has no visible text, so the caller can tell an
 * empty value from a filled one.
 */
export function sanitizeUntrustedRichText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return ''
  const source = removeUnstorableCharacters(cutToLength(input, maxLength))
  if (source.trim().length === 0) return ''

  if (!/<[a-zA-Z!/?]/.test(source)) {
    const html = plainTextToHtml(source)
    return hasVisibleText(html) ? html : ''
  }

  const open: string[] = []
  // How many of each element are open, so a stray closing tag is rejected in
  // constant time instead of by searching the stack.
  const openCounts = new Map<string, number>()
  let droppingUntil: string | null = null
  let output = ''
  let cursor = 0

  for (const match of source.matchAll(MARKUP_PATTERN)) {
    const start = match.index ?? 0
    if (droppingUntil === null) {
      output += escapeTextKeepingEntities(source.slice(cursor, start))
    }
    cursor = start + match[0].length

    const rawName = match[2]
    if (rawName === undefined) continue // comment, doctype, processing instruction

    const isClosing = match[1] === '/'
    const lowerName = rawName.toLowerCase()

    if (droppingUntil !== null) {
      if (isClosing && lowerName === droppingUntil) droppingUntil = null
      continue
    }
    if (DROPPED_WITH_CONTENT.has(lowerName)) {
      if (!isClosing && !match[0].endsWith('/>')) droppingUntil = lowerName
      continue
    }

    const name = TAG_ALIASES[lowerName] ?? lowerName
    if (!ALLOWED_TAGS.has(name)) continue

    if (name === 'br') {
      if (!isClosing) output += '<br>'
      continue
    }

    if (!isClosing) {
      output += `<${name}>`
      open.push(name)
      openCounts.set(name, (openCounts.get(name) ?? 0) + 1)
      continue
    }

    if (!openCounts.get(name)) continue // a close with no open: ignore it
    let closed: string | undefined
    do {
      closed = open.pop()
      if (closed === undefined) break
      openCounts.set(closed, (openCounts.get(closed) ?? 1) - 1)
      output += `</${closed}>`
    } while (closed !== name)
  }

  if (droppingUntil === null) {
    output += escapeTextKeepingEntities(source.slice(cursor))
  }
  while (open.length > 0) {
    output += `</${open.pop()}>`
  }

  const trimmed = output.trim()
  return hasVisibleText(trimmed) ? trimmed : ''
}

/**
 * Untrusted text to a single-line plain-text value (a name, a label, a list
 * item): markup removed, `script`-like content dropped, entities decoded, any
 * remaining angle bracket removed, whitespace collapsed, cut to `maxLength`.
 *
 * Angle brackets are removed rather than kept because these values are drawn as
 * plain text, and a `<` in a label would make `renderFormattedText` treat it as
 * HTML.
 */
export function sanitizeUntrustedPlainText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return ''
  const source = cutToLength(input, maxLength * PLAIN_TEXT_SCAN_FACTOR)
  let text = ''
  let droppingUntil: string | null = null
  let cursor = 0

  for (const match of source.matchAll(MARKUP_PATTERN)) {
    const start = match.index ?? 0
    if (droppingUntil === null) text += source.slice(cursor, start)
    cursor = start + match[0].length

    const rawName = match[2]
    if (rawName === undefined) continue
    const lowerName = rawName.toLowerCase()
    const isClosing = match[1] === '/'

    if (droppingUntil !== null) {
      if (isClosing && lowerName === droppingUntil) droppingUntil = null
      continue
    }
    if (DROPPED_WITH_CONTENT.has(lowerName) && !isClosing && !match[0].endsWith('/>')) {
      droppingUntil = lowerName
      continue
    }
    // Block boundaries separate words that would otherwise run together.
    text += ' '
  }
  if (droppingUntil === null) text += source.slice(cursor)

  const plain = removeUnstorableCharacters(decodeEntities(text))
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cutToLength(plain, maxLength).trim()
}
