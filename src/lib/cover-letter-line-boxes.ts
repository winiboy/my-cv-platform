import type { CoverLetterLineBox } from '@/lib/cover-letter-page-breaks'

/**
 * The line boxes of a rendered letter, as `computeCoverLetterPageBreaks`
 * takes them: in the sheet's unscaled CSS px, from its top, each with the
 * paragraph (block) it belongs to.
 *
 * ONE IMPLEMENTATION, TWO BROWSERS. The editor preview measures the letter it
 * draws; the server measures the letter it would print, in the PDF renderer's
 * own browser (`measureCoverLetterPageCount`), to decide whether the AI's
 * letter fits on one page (cover-letter-one-page, US-002). Both run the code of
 * `coverLetterLineBoxModel`: the preview calls it, the server hands its source
 * text to the page with `page.evaluate`. That is why the factory depends on
 * nothing outside its own body, and is written without syntax a compiler could
 * turn into a call to a helper defined elsewhere (no object spread, no optional
 * chaining).
 *
 * A text range's client rects, and a `<br>`'s, are the glyphs' content area
 * (the font's ascent plus descent), not the line box the print fragments on.
 * The line box is rebuilt as Chromium lays it out:
 *
 *   - each piece of text has an inline box `line-height` tall around its
 *     glyphs, with floor((line-height − content height) / 2) of the leading
 *     above them; the leading is negative when the text is taller than its
 *     line height (a large font size in the rich text), and the box is then
 *     shorter than the glyphs;
 *   - every line also holds the paragraph's strut: an inline box of the
 *     paragraph's own font and line height, on the same baseline;
 *   - the line box spans all of them.
 *
 * Empty lines count: a bare `<br>`, a `<div><br></div>` or an `&nbsp;` line
 * prints a full line box, which takes room on the page and counts toward
 * `orphans` and `widows`. Only an element with no line at all, such as an
 * empty `<p></p>`, has none.
 *
 * `vertical-align` other than `baseline` is not modelled: the letter's rich
 * text cannot set it.
 */

/** A font's ascent and descent, in px, as the browser lays its text out. */
export interface FontMetrics {
  ascent: number
  descent: number
}

/** The strut of a paragraph: its own font and line height. */
export interface Strut {
  /** The computed `line-height` in px; `null` for `normal`, which is the content height. */
  lineHeight: number | null
  metrics: FontMetrics
}

/** One rect of text or of a `<br>`, unscaled, with what lays its line out. */
export interface LineFragment {
  block: number
  /** Top and height of the glyphs' content area. */
  glyphTop: number
  glyphHeight: number
  /** The inline's computed `line-height` in px; `null` for `normal`. */
  lineHeight: number | null
  /** The inline's font. */
  metrics: FontMetrics
  strut: Strut
}

export interface CoverLetterLineBoxModel {
  /**
   * The part of the line box one fragment accounts for: its inline box, and
   * the paragraph's strut on the same baseline.
   */
  fragmentLineBox(fragment: LineFragment): CoverLetterLineBox
  /**
   * One box per line: the boxes of the fragments of one line (a word in bold,
   * a larger word, a `<br>`) overlap, and those of two lines only touch.
   * Does not change its input.
   */
  mergeLineBoxes(boxes: readonly CoverLetterLineBox[]): CoverLetterLineBox[]
  /**
   * Measure the line boxes of the letter drawn in `sheet`, whose unscaled
   * width is `sheetWidth`. Reads the layout, and the fonts' metrics from a
   * detached canvas; changes nothing in the document.
   */
  measure(sheet: HTMLElement, sheetWidth: number): CoverLetterLineBox[]
}

/**
 * The line-box model. Self-contained: see the module comment before adding
 * anything it would reach outside its body for.
 */
export function coverLetterLineBoxModel(): CoverLetterLineBoxModel {
  /** Layout runs in 1/64 px: snapped first, so floating-point noise cannot move a floor. */
  const snap = (value: number) => Math.round(value * 64) / 64

  /** The leading above the content area: floor((line height − content height) / 2), negative when taller. */
  const topLeading = (lineHeight: number, contentHeight: number) => Math.floor(snap((lineHeight - contentHeight) / 2))

  function fragmentLineBox(fragment: LineFragment): CoverLetterLineBox {
    const metrics = fragment.metrics
    const strut = fragment.strut
    // The rect's own height, split as the font splits ascent and descent.
    const baseline = fragment.glyphTop + (fragment.glyphHeight * metrics.ascent) / (metrics.ascent + metrics.descent)

    const inlineHeight = fragment.lineHeight === null ? fragment.glyphHeight : fragment.lineHeight
    const inlineTop = fragment.glyphTop - topLeading(inlineHeight, fragment.glyphHeight)

    const strutContent = strut.metrics.ascent + strut.metrics.descent
    const strutHeight = strut.lineHeight === null ? strutContent : strut.lineHeight
    const strutTop = baseline - strut.metrics.ascent - topLeading(strutHeight, strutContent)

    return {
      block: fragment.block,
      top: Math.min(inlineTop, strutTop),
      bottom: Math.max(inlineTop + inlineHeight, strutTop + strutHeight),
    }
  }

  function mergeLineBoxes(boxes: readonly CoverLetterLineBox[]): CoverLetterLineBox[] {
    const sorted = boxes.slice().sort((a, b) => a.block - b.block || a.top - b.top)
    const lines: CoverLetterLineBox[] = []
    for (const box of sorted) {
      const previous = lines.length > 0 ? lines[lines.length - 1] : null
      if (previous !== null && previous.block === box.block && box.top < previous.bottom - 0.5) {
        previous.top = Math.min(previous.top, box.top)
        previous.bottom = Math.max(previous.bottom, box.bottom)
      } else {
        lines.push({ block: box.block, top: box.top, bottom: box.bottom })
      }
    }
    return lines
  }

  function lineHeightOf(style: CSSStyleDeclaration): number | null {
    const value = parseFloat(style.lineHeight)
    return Number.isFinite(value) ? value : null
  }

  function measure(sheet: HTMLElement, sheetWidth: number): CoverLetterLineBox[] {
    const origin = sheet.getBoundingClientRect()
    const context = document.createElement('canvas').getContext('2d')
    if (origin.width === 0 || context === null) return []
    const canvas = context
    const scale = origin.width / sheetWidth

    const metricsByFont = new Map<string, FontMetrics>()
    const metricsOf = (style: CSSStyleDeclaration): FontMetrics => {
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const known = metricsByFont.get(font)
      if (known !== undefined) return known
      canvas.font = font
      // The font's ascent and descent: the same whatever the text measured.
      const text = canvas.measureText('x')
      const metrics = { ascent: text.fontBoundingBoxAscent, descent: text.fontBoundingBoxDescent }
      metricsByFont.set(font, metrics)
      return metrics
    }

    const blocks = new Map<Element, { id: number; strut: Strut }>()
    const blockOf = (inline: Element) => {
      let element: Element | null = inline
      while (element !== null && element !== sheet && window.getComputedStyle(element).display.startsWith('inline')) {
        element = element.parentElement
      }
      const block = element === null ? sheet : element
      const known = blocks.get(block)
      if (known !== undefined) return known
      const style = window.getComputedStyle(block)
      const entry = { id: blocks.size, strut: { lineHeight: lineHeightOf(style), metrics: metricsOf(style) } }
      blocks.set(block, entry)
      return entry
    }

    const boxes: CoverLetterLineBox[] = []
    const addRects = (inline: Element, rects: DOMRectList) => {
      const block = blockOf(inline)
      const style = window.getComputedStyle(inline)
      for (const rect of Array.from(rects)) {
        if (rect.height === 0) continue
        boxes.push(
          fragmentLineBox({
            block: block.id,
            glyphTop: (rect.top - origin.top) / scale,
            glyphHeight: rect.height / scale,
            lineHeight: lineHeightOf(style),
            metrics: metricsOf(style),
            strut: block.strut,
          }),
        )
      }
    }

    // Text, `&nbsp;` included. Whitespace the layout collapsed has no rect.
    const range = document.createRange()
    const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.parentElement === null || node.textContent === '') continue
      range.selectNodeContents(node)
      addRects(node.parentElement, range.getClientRects())
    }
    // A `<br>` sits on the line it ends: an empty line has only its `<br>`.
    for (const br of Array.from(sheet.querySelectorAll('br'))) {
      if (br.parentElement !== null) addRects(br.parentElement, br.getClientRects())
    }

    return mergeLineBoxes(boxes)
  }

  return { fragmentLineBox, mergeLineBoxes, measure }
}

const model = coverLetterLineBoxModel()

/** See `CoverLetterLineBoxModel.fragmentLineBox`. */
export const fragmentLineBox = model.fragmentLineBox

/** See `CoverLetterLineBoxModel.mergeLineBoxes`. */
export const mergeLineBoxes = model.mergeLineBoxes

/** See `CoverLetterLineBoxModel.measure`. Browser-only. */
export const measureCoverLetterLineBoxes = model.measure

/** Two measurements of the same lines, to within a hundredth of a px. */
export function sameLineBoxes(a: readonly CoverLetterLineBox[] | null, b: readonly CoverLetterLineBox[]): boolean {
  return (
    a !== null &&
    a.length === b.length &&
    a.every(
      (line, index) =>
        line.block === b[index].block &&
        Math.abs(line.top - b[index].top) < 0.01 &&
        Math.abs(line.bottom - b[index].bottom) < 0.01,
    )
  )
}
