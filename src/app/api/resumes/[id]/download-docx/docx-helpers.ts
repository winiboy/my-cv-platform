import {
  Paragraph,
  TextRun,
  AlignmentType,
  LineRuleType,
  type IShadingAttributesProperties,
  type ISpacingProperties,
} from 'docx'
import type { Locale } from '@/lib/i18n'

// ============================================================
// SHARED TYPES FOR ALL DOCX GENERATORS
// ============================================================

/**
 * Settings passed from the route dispatcher to each template-specific generator.
 * All generators receive the same shape so the route remains template-agnostic.
 */
export interface DocxGeneratorSettings {
  fontFamily: string
  fontScale: number
  locale: string
  sidebarHue: number
  sidebarSaturation: number
  sidebarBrightness: number
  sidebarWidth: number
  sidebarTopMargin: number
  mainContentTopMargin: number
  sidebarOrder: string[]
  mainContentOrder: string[]
  hiddenSidebarSections: string[]
  hiddenMainSections: string[]
  /** Base64-encoded photo data (data URL or raw base64) for embedding in sidebar */
  photoBase64?: string
}

// ============================================================
// UNIT CONVERSION UTILITIES
// ============================================================

/**
 * Convert pixels to DOCX half-points (1pt = 2 half-points, 1px ≈ 0.75pt at 96 DPI)
 * Preview uses px, DOCX uses half-points for font sizes
 */
export function pxToHalfPoints(px: number): number {
  // 1px at 96 DPI = 0.75pt, 1pt = 2 half-points
  // So 1px = 1.5 half-points
  return Math.round(px * 1.5)
}

/**
 * Convert pixels to twips for spacing (1 inch = 1440 twips, 1px at 96 DPI = 15 twips)
 */
export function pxToTwips(px: number): number {
  // 1 inch = 96px at 96 DPI, 1 inch = 1440 twips
  // So 1px = 1440/96 = 15 twips
  return Math.round(px * 15)
}

/** A paragraph's line spacing, as every generator writes it. */
export type LineSpacing = Required<Pick<ISpacingProperties, 'line' | 'lineRule'>>

/**
 * Word exact line spacing for the CSS line boxes a paragraph stands for
 * (Part 3 US-004).
 *
 * Each box is a CSS `line-height` ratio and the size, in half-points, of the
 * run written for that text. CSS multiplies the ratio by the font size; Word
 * `exact` spacing is that product in twips (half-points × 10), and every line
 * of the paragraph is laid at exactly that pitch whatever the font. A Word
 * `auto` multiple would scale the font's own single-line height instead, so it
 * is never written.
 *
 * Where one paragraph carries text the Preview draws as several elements side
 * by side — a title and its date in one flex row — the row is as tall as its
 * tallest line box, so the largest is written. An element whose own box is
 * filled and padded (modern's job-title bar) adds its vertical padding, top
 * plus bottom, so the DOCX shading covers what the Preview fills; height a
 * SIBLING box contributes to the row is space before and after, not leading,
 * or a paragraph that wraps would be spaced at the sibling's height.
 */
export type RowBox =
  | readonly [lineHeight: number, halfPoints: number]
  | { readonly lineHeight: number; readonly halfPoints: number; readonly paddingPx: number }

function boxTwips(box: RowBox): number {
  if ('paddingPx' in box) return box.lineHeight * box.halfPoints * 10 + box.paddingPx * 15
  const [lineHeight, halfPoints] = box
  return lineHeight * halfPoints * 10
}

export function exactLineSpacing(...boxes: readonly RowBox[]): LineSpacing {
  if (boxes.length === 0) throw new Error('exactLineSpacing needs at least one line box')
  return { line: Math.round(Math.max(...boxes.map(boxTwips))), lineRule: LineRuleType.EXACT }
}

/**
 * The line of a paragraph that stands for no Preview text: a spacer carrying a
 * gap as its space before or after, or the empty paragraph OOXML requires in a
 * table cell or after a table. The Preview draws no line there, so the
 * paragraph takes a 1-twip exact line rather than a line of text height.
 */
export const NO_TEXT_LINE: LineSpacing = { line: 1, lineRule: LineRuleType.EXACT }

/**
 * Convert HSL color string to hex (without #)
 * Input: "hsl(240, 85%, 35%)" or computed from hue/brightness
 */
export function hslToHex(h: number, s: number, l: number): string {
  // Hue is cyclic. The sidebar hue slider is min="0" max="360", so 360 is
  // user-selectable and must resolve to red like 0, not fall through every
  // branch below and leave r/g/b at their initial 0 (black).
  h = ((h % 360) + 360) % 360
  s /= 100
  l /= 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0

  if (0 <= h && h < 60) { r = c; g = x; b = 0 }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0 }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/**
 * Convert oklch to hex - simplified for grayscale (chroma = 0)
 * oklch(L C H) where L is lightness 0-1
 * For our use case, we only use grayscale: oklch(0.2 0 0), oklch(0.3 0 0), etc.
 */
export function oklchToHex(lightness: number): string {
  // For grayscale oklch (chroma = 0), lightness maps roughly to:
  // oklch lightness is perceptual, roughly: hex = lightness^3 * 255 for dark values
  // Simplified approximation for our specific values:
  const gray = Math.round(Math.pow(lightness, 0.5) * 255 * 0.85)
  const hex = gray.toString(16).padStart(2, '0')
  return `${hex}${hex}${hex}`.toUpperCase()
}

/**
 * The one colour the professional and modern generators write that is NOT
 * taken from the Preview's palette (`docx-palette.ts`, US-003). It does not
 * match what the Preview renders.
 */
export const COLORS = {
  // Sidebar text the Preview draws translucent over the user's colour
  // (professional `opacity-80`, modern `rgba(255,255,255,…)`), written opaque
  // white here until US-006 composites it.
  WHITE: 'FFFFFF',
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Extract primary font name from CSS font-family stack
 * e.g., "'Arial', Helvetica, sans-serif" -> "Arial"
 */
export function extractPrimaryFont(fontFamily: string): string {
  const fonts = fontFamily.split(',')
  if (fonts.length > 0) {
    return fonts[0].trim().replace(/['"]/g, '')
  }
  return 'Arial'
}

/**
 * Strip HTML tags from text
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, '').trim()
}

/**
 * Extract list items from HTML and join them inline with bullet separators
 * @deprecated Use parseHtmlToDocxRuns for rich text support
 */
export function renderInlineBullets(text: string | null | undefined): string {
  if (!text) return ''

  const isHtml = /<[^>]+>/.test(text)

  if (isHtml) {
    const liMatches = text.match(/<li[^>]*>(.*?)<\/li>/gi)
    if (liMatches && liMatches.length > 0) {
      const items = liMatches.map(li =>
        li.replace(/<li[^>]*>/gi, '').replace(/<\/li>/gi, '').replace(/<[^>]+>/g, '').trim()
      )
      return items.join(' • ')
    }
    return text.replace(/<[^>]+>/g, '').trim()
  }

  const lines = text.split('\n')
  const bulletItems = lines
    .filter(line => /^[\s]*[•\-*]\s+/.test(line))
    .map(line => line.replace(/^[\s]*[•\-*]\s+/, '').trim())

  if (bulletItems.length > 0) {
    return bulletItems.join(' • ')
  }

  return text.replace(/\n/g, ' ').trim()
}

/**
 * Parse HTML content and convert to DOCX TextRun objects with formatting preserved
 * Handles: bold, italic, underline, line breaks, paragraphs, lists, alignment
 */
export interface DocxTextRunOptions {
  size: number
  color: string
  font: string
}

export interface ParsedDocxContent {
  runs: (typeof TextRun.prototype)[]
  alignment?: typeof AlignmentType[keyof typeof AlignmentType]
}

/**
 * Check if HTML content contains a list structure
 */
export function isHtmlList(html: string | null | undefined): boolean {
  if (!html) return false
  return /<(ul|ol)[^>]*>/i.test(html)
}

/**
 * Parse HTML list content into separate paragraphs (for proper list rendering in DOCX)
 * Returns array of Paragraph objects for each list item
 */
export function parseHtmlListToParagraphs(
  html: string,
  options: DocxTextRunOptions,
  spacingAfterItem: number,
  spacingAfterLast: number,
  lineSpacing: LineSpacing,
  indent?: { right?: number; left?: number },
  alignment?: typeof AlignmentType[keyof typeof AlignmentType]
): Paragraph[] {
  const { size, color, font } = options
  const paragraphs: Paragraph[] = []

  // Determine if ordered or unordered list
  const isOrdered = /<ol[^>]*>/i.test(html)

  // Extract list items
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
  const items: string[] = []
  let match: RegExpExecArray | null

  while ((match = liRegex.exec(html)) !== null) {
    const content = match[1].trim()
    if (content) {
      items.push(content)
    }
  }

  items.forEach((itemHtml, index) => {
    const isLast = index === items.length - 1
    const bulletPrefix = isOrdered ? `${index + 1}. ` : '• '

    // Parse the item content for inline formatting (bold, italic, etc.)
    const itemRuns = parseHtmlToDocxRuns(itemHtml, options)

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: bulletPrefix,
            size,
            color,
            font,
          }),
          ...itemRuns,
        ],
        spacing: { after: isLast ? spacingAfterLast : spacingAfterItem, ...lineSpacing },
        indent: indent,
        alignment: alignment,
      })
    )
  })

  return paragraphs
}

// ============================================================
// PLAIN-TEXT LISTS
// ============================================================

// The Preview renders legacy plain text through formatText
// (src/lib/format-text.tsx), which turns marker lines into real lists. These
// rules must stay identical to it; docx-helpers.test.ts compares the two.
const PLAIN_TEXT_PARAGRAPH_SEPARATOR = /\n\n+/
const PLAIN_TEXT_BULLET_MARKER = /^[\s]*[•\-*]\s+/
const PLAIN_TEXT_NUMBER_MARKER = /^[\s]*\d+\.\s+/

export type PlainTextBlock =
  | { type: 'bullet' | 'numbered'; items: string[] }
  | { type: 'text'; lines: string[] }

function extractPlainTextItems(lines: string[], marker: RegExp): string[] {
  return lines
    .filter(line => marker.test(line))
    .map(line => line.replace(marker, '').trim())
}

/**
 * Split plain text into the blocks formatText renders: one block per
 * blank-line-separated paragraph. A paragraph with any bullet line is a bullet
 * list, otherwise one with any numbered line is a numbered list, otherwise it
 * is text. List blocks keep only their marker lines, as the Preview does.
 */
export function parsePlainTextBlocks(text: string | null | undefined): PlainTextBlock[] {
  if (!text) return []

  return text.split(PLAIN_TEXT_PARAGRAPH_SEPARATOR).map((paragraph): PlainTextBlock => {
    const lines = paragraph.split('\n')

    if (lines.some(line => PLAIN_TEXT_BULLET_MARKER.test(line))) {
      return { type: 'bullet', items: extractPlainTextItems(lines, PLAIN_TEXT_BULLET_MARKER) }
    }

    if (lines.some(line => PLAIN_TEXT_NUMBER_MARKER.test(line))) {
      return { type: 'numbered', items: extractPlainTextItems(lines, PLAIN_TEXT_NUMBER_MARKER) }
    }

    return { type: 'text', lines }
  })
}

/**
 * True when plain (non-HTML) text contains at least one list the Preview
 * renders as <ul>/<ol>. HTML content is excluded with the same tag test
 * renderFormattedText uses, so it keeps going through the HTML paths.
 */
export function isPlainTextList(text: string | null | undefined): boolean {
  if (!text) return false
  if (/<[^>]+>/.test(text)) return false
  return parsePlainTextBlocks(text).some(block => block.type !== 'text')
}

/**
 * Paragraph properties a call site applies to every paragraph produced from
 * plain text, so each template can match the styling of its own list branch.
 */
export interface PlainTextParagraphLayout {
  spacingAfterItem: number
  spacingAfterLast: number
  indent?: { right?: number; left?: number }
  alignment?: typeof AlignmentType[keyof typeof AlignmentType]
  lineSpacing: LineSpacing
  shading?: IShadingAttributesProperties
}

/**
 * Convert plain text containing lists into DOCX paragraphs: one paragraph per
 * list item (prefixed like parseHtmlListToParagraphs) and one per text block,
 * with line breaks between its lines. Text is emitted literally because the
 * Preview renders plain text literally (no entity decoding).
 */
export function parsePlainTextListToParagraphs(
  text: string,
  options: DocxTextRunOptions,
  layout: PlainTextParagraphLayout
): Paragraph[] {
  const { size, color, font } = options
  const paragraphChildren: TextRun[][] = []

  for (const block of parsePlainTextBlocks(text)) {
    if (block.type === 'text') {
      // Mirror how the browser lays out the Preview's <div>line<br />line</div>:
      // a div with only blank text has no height, and a trailing <br /> does not
      // open a new line (a trailing break in Word would).
      if (block.lines.length === 1 && block.lines[0].trim() === '') continue
      const lines = block.lines[block.lines.length - 1].trim() === ''
        ? block.lines.slice(0, -1)
        : block.lines

      const runs: TextRun[] = []
      lines.forEach((line, index) => {
        if (index > 0) {
          runs.push(new TextRun({ break: 1, size, color, font }))
        }
        if (line) {
          runs.push(new TextRun({ text: line, size, color, font }))
        }
      })
      paragraphChildren.push(runs)
      continue
    }

    block.items.forEach((item, index) => {
      const prefix = block.type === 'numbered' ? `${index + 1}. ` : '• '
      const runs = [new TextRun({ text: prefix, size, color, font })]
      if (item) {
        runs.push(new TextRun({ text: item, size, color, font }))
      }
      paragraphChildren.push(runs)
    })
  }

  const lastIndex = paragraphChildren.length - 1

  return paragraphChildren.map((children, index) =>
    new Paragraph({
      children,
      spacing: {
        after: index === lastIndex ? layout.spacingAfterLast : layout.spacingAfterItem,
        ...layout.lineSpacing,
      },
      indent: layout.indent,
      alignment: layout.alignment,
      shading: layout.shading,
    })
  )
}

export function parseHtmlToDocxRuns(
  html: string | null | undefined,
  options: DocxTextRunOptions
): (typeof TextRun.prototype)[] {
  if (!html) return []

  const { size, color, font } = options

  // Decode HTML entities first so encoded tags become real tags
  const decoded = html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")

  // Check if content is HTML
  const isHtml = /<[^>]+>/.test(decoded)

  if (!isHtml) {
    // Plain text - return single TextRun
    return [
      new TextRun({
        text: decoded.replace(/\n/g, ' ').trim(),
        size,
        color,
        font,
      }),
    ]
  }

  const runs: (typeof TextRun.prototype)[] = []

  // Parse HTML using regex (server-side compatible)
  // We'll process the HTML sequentially to preserve formatting

  // First, normalize the HTML - replace block elements with markers
  let processedHtml = decoded
    // Handle line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Handle paragraphs and divs - add line breaks
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<div[^>]*>/gi, '')
    // Strip strikethrough tags but keep their text content (preview does not show strikethrough)
    .replace(/<\/?(s|strike|del)[^>]*>/gi, '')

  // Handle lists - differentiate between ordered (ol) and unordered (ul) lists
  // Process ordered lists first - replace <li> with numbered items
  processedHtml = processedHtml.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, listContent) => {
    // Collect all list items, clean them, and join with newlines
    const items: string[] = []
    let itemNumber = 0
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let liMatch: RegExpExecArray | null
    while ((liMatch = liRegex.exec(listContent)) !== null) {
      // Clean the content: remove HTML tags for trimming check, trim whitespace
      const rawContent = liMatch[1]
      const cleanedContent = rawContent.replace(/<[^>]+>/g, '').trim()
      // Skip empty list items
      if (cleanedContent) {
        itemNumber++
        // Keep original content but trim leading/trailing whitespace
        items.push(`${itemNumber}. ${rawContent.trim()}`)
      }
    }
    // Join items with single newline, no trailing newline
    return items.length > 0 ? items.join('\n') : ''
  })

  // Process unordered lists - replace <li> with bullet points
  processedHtml = processedHtml.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, listContent) => {
    // Collect all list items, clean them, and join with newlines
    const items: string[] = []
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let liMatch: RegExpExecArray | null
    while ((liMatch = liRegex.exec(listContent)) !== null) {
      // Clean the content: remove HTML tags for trimming check, trim whitespace
      const rawContent = liMatch[1]
      const cleanedContent = rawContent.replace(/<[^>]+>/g, '').trim()
      // Skip empty list items
      if (cleanedContent) {
        // Keep original content but trim leading/trailing whitespace
        items.push(`• ${rawContent.trim()}`)
      }
    }
    // Join items with single newline, no trailing newline
    return items.length > 0 ? items.join('\n') : ''
  })

  // Handle any remaining standalone list items (edge case)
  processedHtml = processedHtml
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (match, content) => {
      const cleaned = content.replace(/<[^>]+>/g, '').trim()
      return cleaned ? `• ${content.trim()}` : ''
    })

  // Normalize multiple consecutive newlines to single newline
  processedHtml = processedHtml.replace(/\n{2,}/g, '\n')

  // Trim leading/trailing whitespace and newlines to prevent extra gaps
  processedHtml = processedHtml.trim()

  // Now parse inline formatting
  // We need to handle nested tags like <strong><em>text</em></strong>

  // Tokenize the content
  interface TextSegment {
    text: string
    bold: boolean
    italic: boolean
    underline: boolean
  }

  const segments: TextSegment[] = []
  let currentPos = 0
  let currentBold = false
  let currentItalic = false
  let currentUnderline = false

  // Simple state machine to parse HTML
  const tagPattern = /<\/?(?:strong|b|em|i|u|span)[^>]*>/gi
  let match: RegExpExecArray | null

  let lastIndex = 0
  const tempHtml = processedHtml

  // Reset regex
  tagPattern.lastIndex = 0

  while ((match = tagPattern.exec(tempHtml)) !== null) {
    // Add text before this tag
    if (match.index > lastIndex) {
      const textBefore = tempHtml.substring(lastIndex, match.index)
      if (textBefore) {
        segments.push({
          text: textBefore,
          bold: currentBold,
          italic: currentItalic,
          underline: currentUnderline,
        })
      }
    }

    const tag = match[0].toLowerCase()

    // Update state based on tag
    if (tag === '<strong>' || tag === '<b>') {
      currentBold = true
    } else if (tag === '</strong>' || tag === '</b>') {
      currentBold = false
    } else if (tag === '<em>' || tag === '<i>') {
      currentItalic = true
    } else if (tag === '</em>' || tag === '</i>') {
      currentItalic = false
    } else if (tag === '<u>') {
      currentUnderline = true
    } else if (tag === '</u>') {
      currentUnderline = false
    }
    // Ignore span tags (they're for font styles we handle elsewhere)

    lastIndex = match.index + match[0].length
  }

  // Add remaining text after last tag
  if (lastIndex < tempHtml.length) {
    const remainingText = tempHtml.substring(lastIndex)
    if (remainingText) {
      segments.push({
        text: remainingText,
        bold: currentBold,
        italic: currentItalic,
        underline: currentUnderline,
      })
    }
  }

  // If no segments were created, the HTML had no recognized tags
  if (segments.length === 0) {
    const plainText = tempHtml.replace(/<[^>]+>/g, '').trim()
    if (plainText) {
      segments.push({
        text: plainText,
        bold: false,
        italic: false,
        underline: false,
      })
    }
  }

  // Convert segments to TextRuns
  for (const segment of segments) {
    // Clean up the text - remove any remaining HTML tags
    let cleanText = segment.text.replace(/<[^>]+>/g, '')

    // Handle line breaks within segment
    // Filter out empty trailing lines to prevent extra gaps
    let lines = cleanText.split('\n')
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop()
    }

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i]

      if (lineText) {
        runs.push(
          new TextRun({
            text: lineText,
            size,
            color,
            font,
            bold: segment.bold,
            italics: segment.italic,
            underline: segment.underline ? {} : undefined,
          })
        )
      }

      // Add line break between lines (but not after last line)
      // Only add break if there's actual content in the next line
      if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
        runs.push(
          new TextRun({
            break: 1,
            size,
            color,
            font,
          })
        )
      }
    }
  }

  return runs
}

/**
 * Extract text alignment from HTML style attribute
 * Uses the LAST occurrence to get the innermost/most specific alignment
 */
export function extractAlignment(html: string | null | undefined): typeof AlignmentType[keyof typeof AlignmentType] | undefined {
  if (!html) return undefined

  // Find ALL text-align declarations and use the last one (innermost/most specific)
  const alignMatches = [...html.matchAll(/text-align:\s*(left|center|right|justify)/gi)]

  if (alignMatches.length === 0) return undefined

  // Get the last match (innermost alignment)
  const lastMatch = alignMatches[alignMatches.length - 1]
  const align = lastMatch[1].toLowerCase()

  switch (align) {
    case 'left':
      return AlignmentType.LEFT
    case 'center':
      return AlignmentType.CENTER
    case 'right':
      return AlignmentType.RIGHT
    case 'justify':
      return AlignmentType.JUSTIFIED
  }

  return undefined
}

/**
 * Format date range matching Preview logic
 */
export function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean | undefined,
  locale: Locale,
  dict: any
): string {
  if (!startDate) return ''

  const start = new Date(startDate + '-01').toLocaleDateString(locale, {
    month: '2-digit',
    year: 'numeric',
  })

  const end = isCurrent
    ? (dict as any).resumes?.template?.present || 'Present'
    : endDate
      ? new Date(endDate + '-01').toLocaleDateString(locale, {
          month: '2-digit',
          year: 'numeric',
        })
      : (dict as any).resumes?.template?.present || 'Present'

  return `${start} - ${end}`
}
