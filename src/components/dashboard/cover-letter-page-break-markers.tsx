import { computeCoverLetterPageBreaks, type CoverLetterLayout } from '@/lib/cover-letter-page-breaks'

/** Visual gap, in screen px, between the sheet's right edge and a label. */
const LABEL_GAP_PX = 3

/**
 * On-screen room a label needs beside the sheet: the gap, the label's
 * 10 px line, and a few px of slack for the glyphs' side bearings.
 */
export const PAGE_BREAK_LABEL_ROOM_PX = 16

/**
 * Whether the labels fit beside the scaled sheet without leaving the scroll
 * area's content box, so that drawing them can never add a horizontal
 * scrollbar. The sheet is centred, so the room on its right is half of what
 * the area leaves free.
 *
 * @param contentWidth The scroll area's content width, in screen px.
 * @param sheetWidth The sheet's scaled width, in screen px.
 */
export function hasRoomForPageBreakLabels(contentWidth: number, sheetWidth: number): boolean {
  return (contentWidth - sheetWidth) / 2 >= PAGE_BREAK_LABEL_ROOM_PX
}

/**
 * The breaks to draw. A bad measurement must not take the editor down with a
 * render error, so it is drawn as "not measured yet": no marker. The
 * computation itself stays strict, and any other error is rethrown.
 */
function drawableBoundaries(layout: CoverLetterLayout | null): number[] {
  try {
    return computeCoverLetterPageBreaks(layout).boundaries
  } catch (error) {
    if (error instanceof RangeError) return []
    throw error
  }
}

interface CoverLetterPageBreakMarkersProps {
  /** The letter's measured lines and content bottom, unscaled, or `null` before the first measurement. */
  layout: CoverLetterLayout | null
  /**
   * The CSS scale the surrounding wrapper draws the letter at. The markers
   * live inside that wrapper so they follow the sheet at every zoom, and
   * divide by it so the line and label keep a constant on-screen size.
   */
  scale: number
  /** The localized label, with `{page}` standing for the page that starts below the edge. */
  labelTemplate: string
  /** False when the gutter beside the sheet is too narrow: the line is still drawn. */
  showLabels: boolean
}

/**
 * Marks where each printed page of a cover letter ends, over the letter drawn
 * as one continuous sheet (cover-letter-one-page, US-001). Drawn like the CV's
 * page-break indicators: a dashed teal line across the sheet, and the page
 * that starts below it written vertically in the gutter on the right.
 *
 * Must be rendered inside the scaled wrapper of the letter, as a sibling of the
 * sheet. It is absolutely positioned, so it never changes the letter's
 * measured height or lines; it ignores pointer events and selection, so the
 * letter underneath stays usable; it is hidden in print media; and it is
 * derived from the measured layout only, so it never reaches a stored letter
 * or an export.
 *
 * `aria-hidden`: a visual restatement of the preview's geometry, whose labels
 * would mean nothing read out in the middle of the letter.
 */
export function CoverLetterPageBreakMarkers({
  layout,
  scale,
  labelTemplate,
  showLabels,
}: CoverLetterPageBreakMarkersProps) {
  const boundaries = drawableBoundaries(layout)
  if (boundaries.length === 0) return null

  // One screen px, written in the wrapper's unscaled coordinates.
  const screenPx = 1 / scale

  return (
    <div
      aria-hidden="true"
      data-testid="page-break-indicators"
      // Clipped vertically at the letter's bottom so a label below the last
      // edge cannot lengthen the scroll area; horizontally visible so the
      // labels can reach the gutter.
      className="pointer-events-none absolute inset-0 z-20 select-none overflow-x-visible overflow-y-clip print:hidden"
    >
      {boundaries.map((y, index) => {
        const page = index + 2
        return (
          <div
            key={page}
            data-testid="page-break-indicator"
            data-page={page}
            className="absolute inset-x-0 h-0"
            style={{ top: `${y}px` }}
          >
            {/*
              A 1 px border counter-scaled to the screen, rather than a
              1/scale px border: the browser snaps a border width to whole
              pixels before the wrapper's scale applies, so a 1.44 px border
              at 69% would show 0.69 px, and 1.67 px at 60% would show 0.6 px.
              Sized to the sheet's on-screen width, so the dashes keep their
              on-screen length too.
            */}
            <div
              data-testid="page-break-line"
              className="absolute left-0 h-0 border-t border-dashed border-teal-500/70"
              style={{
                top: `${-screenPx / 2}px`,
                width: `${scale * 100}%`,
                transform: `scale(${screenPx})`,
                transformOrigin: 'top left',
              }}
            />
            {showLabels && (
              <span
                data-testid="page-break-label"
                className="absolute top-0 whitespace-nowrap text-[10px] font-medium leading-none tracking-wide text-teal-700 [writing-mode:vertical-rl]"
                style={{
                  left: `calc(100% + ${LABEL_GAP_PX * screenPx}px)`,
                  transform: `scale(${screenPx})`,
                  transformOrigin: 'top left',
                }}
              >
                {labelTemplate.replace('{page}', String(page))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
