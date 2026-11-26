import { measureCoverLetterLineBoxes } from './cover-letter-line-boxes'
import {
  paginateBlocks,
  sheetCountFor,
  sheetsHeight,
  type ResumePageMargins,
  type SheetLayoutNode,
  type SheetLine,
} from './resume-sheets'

/**
 * The DOM side of the Preview's sheets (swiss-templates-only-page-fidelity
 * US-003): reads the rendered resume document, hands its blocks to
 * `paginateBlocks`, and writes the pushes it decides as screen-only CSS.
 *
 * SCREEN ONLY (FR-5). Nothing here changes the document's markup, text or
 * inline styles. A moved element gets a `data-sheet-push` attribute, a broken
 * paragraph a `data-sheet-lines` attribute, and the document root a
 * `data-sheet-fill` attribute, which the rules of one `<style>` element
 * resolve, inside `@media screen`, to a top margin, a `::before` float and a
 * height. In print those rules do not apply, so Chromium fragments the
 * document exactly as it did before this existed; the Preview page printed to
 * PDF is that print. React owns the document's nodes: attributes it does not
 * render are left alone by its reconciliation, and no node is added, removed
 * or split.
 *
 * WHAT PRINT KEEPS WHOLE, AND SO IS MOVED WHOLE HERE
 *
 *   - An element with `break-inside: avoid`: every template's entries, and the
 *     wrapper that holds a section heading with its first entry.
 *   - A block that cannot be broken inside on screen: an image, a row of
 *     wrapping flex items, a table, a grid row, and a block of text that also
 *     holds an inline-block or a replaced element, whose lines this does not
 *     measure. A wrapping flex row is a simplification: print may break
 *     between its flex lines. Every such row in the ten templates today sits
 *     inside a `break-inside: avoid` ancestor or in the page-1 header, where
 *     it never meets a page edge on its own.
 *
 * A PARAGRAPH IS BROKEN BETWEEN ITS LINES, as print breaks it (`breakLines`).
 * A margin cannot open a gap inside a paragraph, so the gap is a float: the
 * paragraph's `::before` becomes a float as wide as the paragraph whose
 * `shape-outside` is one band per break, from the middle of the first line
 * moved down to the y where that line must start. A line box outside every
 * band has the paragraph's full width, as before; one that meets a band has
 * no room beside it and is laid out below the band's foot, where Chromium
 * places a line that does not fit beside a float. Measured, then corrected,
 * as a push is. Only a block container without a `::before` of its own and
 * with inline content only is broken this way; any other block of text is
 * moved whole, as before.
 *
 * Everything else is broken between its children. The children of a flex row
 * (a two-column template's columns) are separate flows, as print fragments
 * them: a push in one column does not move the other.
 */

/** A gap opened inside a paragraph, in px below the top of its content box. */
export interface SheetLineBand {
  /** Where the band starts: inside the first line it moves. */
  start: number
  /** Where it ends: the y the first line it moves starts at. */
  end: number
}

/** Read and write the pushes of one paginated document. */
export interface SheetStyles {
  /** Give `element` a top margin of `marginTop` px, overriding its own. */
  push(element: Element, marginTop: number): void
  /** Open the gaps `bands` between the lines of the paragraph `element`, replacing any it had. */
  breakLines(element: Element, bands: readonly SheetLineBand[]): void
  /** Make the document `height` px tall: every sheet it is drawn on, filled. */
  fill(root: HTMLElement, height: number): void
  /** Remove every push, every gap and the fill. */
  reset(): void
  /** Reset, and remove the style element. */
  dispose(): void
}

const PUSH_ATTRIBUTE = 'data-sheet-push'
const LINES_ATTRIBUTE = 'data-sheet-lines'
const FILL_ATTRIBUTE = 'data-sheet-fill'

/** The attribute naming a frame's scope; the rules of its style element match only inside it. */
export const SHEETS_SCOPE_ATTRIBUTE = 'data-resume-sheets'

/**
 * The `shape-outside` of a paragraph's `::before` float that opens `bands`:
 * one rectangle the float's full width per band, joined along its left edge
 * by segments of no width, which exclude nothing.
 *
 * @throws RangeError when the bands are not in order, overlap, or are empty:
 *   the pagination only ever adds a band below the last.
 */
export function lineBandsShape(bands: readonly SheetLineBand[]): string {
  if (bands.length === 0) throw new RangeError('No band to open')
  let previousEnd = 0
  for (const band of bands) {
    if (
      !Number.isFinite(band.start) ||
      !Number.isFinite(band.end) ||
      band.start < previousEnd ||
      band.end <= band.start
    ) {
      throw new RangeError(`Invalid line band: start ${band.start}, end ${band.end}`)
    }
    previousEnd = band.end
  }
  const points = bands.flatMap(({ start, end }) => [`0px ${start}px`, `100% ${start}px`, `100% ${end}px`, `0px ${end}px`])
  return `polygon(${points.join(', ')})`
}

/**
 * The style element that carries the pushes of the document inside `frame`.
 * Appended to `<head>`, outside the frame, so writing it is not a change to
 * the document its observers react to.
 *
 * Each pushed element and each broken paragraph owns one rule of the style
 * element's `@media screen` block, written through the CSSOM: a correction
 * rewrites that one declaration, never the whole style sheet's text.
 */
export function createSheetStyles(frame: HTMLElement, scope: string): SheetStyles {
  frame.setAttribute(SHEETS_SCOPE_ATTRIBUTE, scope)
  const style = document.createElement('style')
  style.setAttribute('data-resume-sheets-style', scope)
  style.textContent = '@media screen{}'
  document.head.appendChild(style)
  const media = style.sheet?.cssRules[0]
  if (!(media instanceof CSSMediaRule)) {
    style.remove()
    frame.removeAttribute(SHEETS_SCOPE_ATTRIBUTE)
    throw new Error('The resume sheets style element has no @media screen rule')
  }

  const within = `[${SHEETS_SCOPE_ATTRIBUTE}="${scope}"]`
  const rules = new Map<string, CSSStyleRule>()
  const pushIds = new Map<Element, string>()
  const lineIds = new Map<Element, string>()
  let nextId = 0

  const idOf = (ids: Map<Element, string>, element: Element, attribute: string): string => {
    const known = ids.get(element)
    if (known !== undefined) return known
    const id = String(nextId++)
    ids.set(element, id)
    element.setAttribute(attribute, id)
    return id
  }

  const ruleFor = (selector: string): CSSStyleRule => {
    const known = rules.get(selector)
    if (known) return known
    const rule = media.cssRules[media.insertRule(`${selector}{}`, media.cssRules.length)]
    if (!(rule instanceof CSSStyleRule)) throw new Error(`Could not add the sheets rule ${selector}`)
    rules.set(selector, rule)
    return rule
  }

  const declare = (selector: string, declarations: Readonly<Record<string, string>>) => {
    const rule = ruleFor(selector)
    for (const [property, value] of Object.entries(declarations)) {
      rule.style.setProperty(property, value, 'important')
    }
  }

  const reset = () => {
    for (const element of frame.querySelectorAll(`[${PUSH_ATTRIBUTE}],[${LINES_ATTRIBUTE}],[${FILL_ATTRIBUTE}]`)) {
      element.removeAttribute(PUSH_ATTRIBUTE)
      element.removeAttribute(LINES_ATTRIBUTE)
      element.removeAttribute(FILL_ATTRIBUTE)
    }
    while (media.cssRules.length > 0) media.deleteRule(media.cssRules.length - 1)
    rules.clear()
    pushIds.clear()
    lineIds.clear()
    nextId = 0
  }

  return {
    push(element, marginTop) {
      const id = idOf(pushIds, element, PUSH_ATTRIBUTE)
      declare(`${within} [${PUSH_ATTRIBUTE}="${id}"]`, { 'margin-top': `${marginTop}px` })
    },
    breakLines(element, bands) {
      const shape = lineBandsShape(bands)
      const id = idOf(lineIds, element, LINES_ATTRIBUTE)
      declare(`${within} [${LINES_ATTRIBUTE}="${id}"]::before`, {
        content: '""',
        float: 'left',
        width: '100%',
        height: `${bands[bands.length - 1].end}px`,
        margin: '0',
        padding: '0',
        border: '0',
        'shape-outside': shape,
      })
    },
    fill(root, height) {
      root.setAttribute(FILL_ATTRIBUTE, '')
      // The sheets draw the page's shadow, one per sheet.
      declare(`${within} [${FILL_ATTRIBUTE}]`, {
        height: `${height}px`,
        'min-height': `${height}px`,
        'box-shadow': 'none',
      })
    },
    reset,
    dispose() {
      reset()
      style.remove()
      frame.removeAttribute(SHEETS_SCOPE_ATTRIBUTE)
    },
  }
}

/**
 * Paginate with `paginate`, or, when it throws, fall back to the plain
 * document: every push, gap and fill `styles` holds is removed, the error is
 * handed to `report`, and the document is drawn on one sheet, continuous, as
 * it was before the sheets existed.
 *
 * The pagination throws by design on a measurement that is not a layout (a
 * `RangeError` from the arithmetic). Thrown out of the frame's effect, that
 * would unmount the resume document through the nearest error boundary, and
 * with it the PDF route's export of that resume, or leave pushes half
 * applied; a document drawn without its sheets is still the whole resume, and
 * print is untouched either way.
 *
 * @returns The number of sheets to draw.
 */
export function paginateOrFallBack(
  paginate: () => number,
  styles: Pick<SheetStyles, 'reset'>,
  report: (error: unknown) => void,
): number {
  try {
    return paginate()
  } catch (error) {
    styles.reset()
    report(error)
    return 1
  }
}

/** What decides whether a block of text can be broken between its lines: read from the DOM by the caller. */
export interface LineBoxCandidate {
  /** The block's computed `display`. */
  display: string
  /** Its computed `list-style-position`. */
  listStylePosition: string
  /** Its `::before`'s computed `content`. */
  beforeContent: string
  /** Whether it is itself a replaced element. */
  replaced: boolean
  /** Whether it holds any text that is not whitespace. */
  hasText: boolean
  /** Each descendant element's computed `display`, and whether it is replaced. */
  descendants: readonly { display: string; replaced: boolean }[]
}

/**
 * Whether print breaks the block `candidate` describes between its lines and
 * this can too: a block container of text whose every descendant is a plain
 * inline box, so that its text's rects are its lines, and whose `::before` is
 * free for the float. A list item whose marker is `inside` is excluded: its
 * marker is an inline box at the head of the first line, which the float
 * would sit beside, and its lines are not measured with it; it moves whole.
 */
export function breaksBetweenLines(candidate: LineBoxCandidate): boolean {
  if (!LINE_CONTAINERS.has(candidate.display) || candidate.replaced || !candidate.hasText) return false
  if (candidate.display === 'list-item' && candidate.listStylePosition === 'inside') return false
  if (candidate.beforeContent !== 'none' && candidate.beforeContent !== 'normal') return false
  return candidate.descendants.every(
    ({ display, replaced }) => display === 'none' || (display === 'inline' && !replaced),
  )
}

/** Elements whose content a margin can only move as a whole. */
const REPLACED = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'PICTURE', 'IFRAME', 'OBJECT', 'EMBED', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'])

/** The displays of a block whose own lines print breaks between. */
const LINE_CONTAINERS = new Set(['block', 'list-item', 'flow-root'])

/** How close two grid items' tops must be to share a row, in unscaled px. */
const GRID_ROW_TOLERANCE_PX = 0.5

/**
 * The residual a push or a band is corrected down to: a margin that collapses
 * with a neighbour's moves its element less than it grows, so a push is
 * measured and corrected until the element lands.
 */
const PUSH_PRECISION_PX = 0.01
const MAX_PUSH_CORRECTIONS = 4

const isInlineLevel = (display: string) => display.startsWith('inline') || display === 'ruby'

const isReplaced = (element: Element) => REPLACED.has(element.tagName.toUpperCase())

/** `element` when `breaksBetweenLines` says it can be broken between its lines; `null` otherwise. */
function lineBreakableParagraph(element: Element, style: CSSStyleDeclaration): HTMLElement | null {
  // Cheap checks first: most blocks fail them, and the rest reads every descendant's style.
  if (!(element instanceof HTMLElement) || !LINE_CONTAINERS.has(style.display)) return null
  const candidate: LineBoxCandidate = {
    display: style.display,
    listStylePosition: style.listStylePosition,
    beforeContent: getComputedStyle(element, '::before').content,
    replaced: isReplaced(element),
    hasText: (element.textContent ?? '').trim() !== '',
    descendants: Array.from(element.querySelectorAll('*')).map((descendant) => ({
      display: getComputedStyle(descendant).display,
      replaced: isReplaced(descendant),
    })),
  }
  return breaksBetweenLines(candidate) ? element : null
}

/**
 * Paginate the resume document `root` on screen: reset every earlier push,
 * place every block, then fill the document to the foot of its last sheet.
 *
 * @returns The number of sheets the document is drawn on.
 */
export function paginateResumeDocument(root: HTMLElement, margins: ResumePageMargins, styles: SheetStyles): number {
  styles.reset()

  // The Editor draws the document through a scaling transform; every length
  // is read back unscaled.
  const scale = root.getBoundingClientRect().width / root.offsetWidth

  const box = (element: Element) => {
    const origin = root.getBoundingClientRect().top
    const rect = element.getBoundingClientRect()
    return { top: (rect.top - origin) / scale, bottom: (rect.bottom - origin) / scale }
  }

  /** The in-flow children of `element`, `display: contents` opened, empty boxes dropped. */
  const flowChildren = (element: Element): Element[] =>
    Array.from(element.children).flatMap((child) => {
      const style = getComputedStyle(child)
      if (style.display === 'contents') return flowChildren(child)
      if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') return []
      const rect = child.getBoundingClientRect()
      return rect.height > 0 ? [child] : []
    })

  const moveElement = (element: Element, top: number) => {
    let marginTop = parseFloat(getComputedStyle(element).marginTop) + (top - box(element).top)
    for (let correction = 0; correction < MAX_PUSH_CORRECTIONS; correction++) {
      styles.push(element, marginTop)
      const residual = top - box(element).top
      if (Math.abs(residual) < PUSH_PRECISION_PX) return
      marginTop += residual
    }
  }

  /** The line boxes of the paragraph `element`, unscaled, from the document's top. */
  const measureLines = (element: HTMLElement): SheetLine[] => {
    const top = box(element).top
    return measureCoverLetterLineBoxes(element, element.offsetWidth).map((line) => ({
      top: top + line.top,
      bottom: top + line.bottom,
    }))
  }

  /** The gaps opened in each paragraph during this pass, top to bottom. */
  const lineBands = new Map<HTMLElement, SheetLineBand[]>()

  const breakElementLines = (element: HTMLElement, index: number, top: number) => {
    const line = measureLines(element)[index]
    if (line === undefined) return
    // The float starts at the top of the paragraph's content box.
    const style = getComputedStyle(element)
    const contentTop = box(element).top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)
    const band: SheetLineBand = { start: (line.top + line.bottom) / 2 - contentTop, end: top - contentTop }
    const bands = [...(lineBands.get(element) ?? []), band]
    lineBands.set(element, bands)
    // Chromium places a line below a `shape-outside` band in whole px steps
    // (measured: a band end of 1124.3 and of 1124.0 put the line at the same
    // y, 1124.5 one px lower), so a correction can only bring it to within
    // half a px, and may step past it: the closest end tried is kept.
    let best = { end: band.end, error: Number.POSITIVE_INFINITY }
    for (let correction = 0; correction < MAX_PUSH_CORRECTIONS; correction++) {
      styles.breakLines(element, bands)
      const moved = measureLines(element)[index]
      if (moved === undefined) return
      const residual = top - moved.top
      if (Math.abs(residual) < best.error) best = { end: band.end, error: Math.abs(residual) }
      if (Math.abs(residual) < PUSH_PRECISION_PX) return
      band.end += residual
    }
    if (band.end !== best.end) {
      band.end = best.end
      styles.breakLines(element, bands)
    }
  }

  /** A row of grid items: kept whole, and moved together. */
  const gridRowNode = (items: readonly Element[]): SheetLayoutNode => {
    const measure = () => {
      const boxes = items.map(box)
      return { top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)) }
    }
    return {
      keep: true,
      measure,
      children: () => [],
      moveTo(top) {
        const shift = top - measure().top
        const targets = items.map((item) => box(item).top + shift)
        items.forEach((item, index) => moveElement(item, targets[index]))
      },
    }
  }

  const gridRows = (grid: Element): SheetLayoutNode[] => {
    const rows: Element[][] = []
    let rowBottom = Number.NEGATIVE_INFINITY
    for (const item of flowChildren(grid)) {
      const { top, bottom } = box(item)
      const current = rows[rows.length - 1]
      if (current && top < rowBottom - GRID_ROW_TOLERANCE_PX) {
        current.push(item)
        rowBottom = Math.max(rowBottom, bottom)
      } else {
        rows.push([item])
        rowBottom = bottom
      }
    }
    return rows.map(gridRowNode)
  }

  const elementNode = (element: Element): SheetLayoutNode => {
    const style = getComputedStyle(element)
    const children = flowChildren(element)
    const avoid = style.breakInside === 'avoid' || style.breakInside === 'avoid-page'
    const flexRow = style.display.endsWith('flex') && style.flexDirection.startsWith('row')
    const grid = style.display.endsWith('grid')
    const hasOwnText = Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
    )
    const indivisible =
      isReplaced(element) ||
      style.display.startsWith('table') ||
      (flexRow && style.flexWrap !== 'nowrap') ||
      hasOwnText ||
      children.every((child) => isInlineLevel(getComputedStyle(child).display))
    const paragraph = indivisible ? lineBreakableParagraph(element, style) : null

    return {
      // A paragraph is placed line by line; only `break-inside: avoid` keeps it whole.
      keep: avoid || (indivisible && paragraph === null),
      measure: () => box(element),
      children: () => (indivisible ? [] : grid ? gridRows(element) : children.map(elementNode)),
      sideBySide: flexRow && style.flexWrap === 'nowrap',
      lines: paragraph
        ? {
            measure: () => measureLines(paragraph),
            breakBefore: (index, top) => breakElementLines(paragraph, index, top),
          }
        : undefined,
      moveTo: (top) => moveElement(element, top),
    }
  }

  const contentBottom = paginateBlocks(flowChildren(root).map(elementNode), margins)
  const sheetCount = sheetCountFor(contentBottom)
  styles.fill(root, sheetsHeight(sheetCount))
  return sheetCount
}
