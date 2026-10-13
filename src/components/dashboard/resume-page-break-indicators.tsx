import { computePageBreaks } from '@/lib/resume-page-breaks'
import { cn } from '@/lib/utils'

/** Visual gap, in screen px, between the page's right edge and a label. */
const LABEL_GAP_PX = 3

interface ResumePageBreakIndicatorsProps {
  /** The document's measured unscaled height, or `null` before the first measurement. */
  documentHeight: number | null
  /**
   * The CSS scale the surrounding wrapper draws the page at (1 when unscaled).
   * The indicators live inside that wrapper so they track the page through
   * every scale, and divide by it so the line and label keep a constant
   * on-screen size.
   */
  scale: number
  /** The localized label, with `{page}` standing for the number of the page that starts below the edge. */
  labelTemplate: string
  /**
   * Extra classes for each label, for a surface that must decide when its
   * gutter is too narrow to draw one (the line is always drawn).
   */
  labelClassName?: string
}

/**
 * Marks every edge between two printed A4 sheets over a resume rendered as one
 * continuous page.
 *
 * Must be rendered as a sibling of `data-testid="resume-document"`, inside the
 * page-wide wrapper that positions it. It is absolutely positioned, so it never
 * changes the wrapper's measured height; it ignores pointer events, so clicks
 * and selection reach the CV underneath; and it is hidden in print media, so
 * it never reaches the PDF.
 *
 * Each label sits in the gutter to the right of the page, never over the CV.
 *
 * The whole overlay is `aria-hidden`: it is a visual aid that restates the
 * geometry of the preview, not content or a control. Exposed, its labels would
 * be read in the middle of the CV text with no meaning out of their position.
 */
export function ResumePageBreakIndicators({
  documentHeight,
  scale,
  labelTemplate,
  labelClassName,
}: ResumePageBreakIndicatorsProps) {
  // A bad measurement must not take the editor down with a render error; it is
  // drawn as "not measured yet". `computePageBreaks` itself stays strict.
  const measured =
    documentHeight !== null && Number.isFinite(documentHeight) && documentHeight >= 0
      ? documentHeight
      : null
  const { boundaries } = computePageBreaks(measured)
  if (boundaries.length === 0) return null

  // One screen px, written in the wrapper's unscaled coordinates.
  const screenPx = 1 / scale

  return (
    <div
      aria-hidden="true"
      data-testid="page-break-indicators"
      // Clipped vertically at the document's bottom so a label below the last
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
            <div
              className="absolute inset-x-0 border-t border-dashed border-teal-500/70"
              style={{ borderTopWidth: `${screenPx}px`, top: `${-screenPx / 2}px` }}
            />
            <span
              data-testid="page-break-label"
              className={cn(
                'absolute top-0 whitespace-nowrap text-[10px] font-medium leading-none tracking-wide text-teal-700 [writing-mode:vertical-rl]',
                labelClassName
              )}
              style={{
                left: `calc(100% + ${LABEL_GAP_PX * screenPx}px)`,
                transform: `scale(${screenPx})`,
                transformOrigin: 'top left',
              }}
            >
              {labelTemplate.replace('{page}', String(page))}
            </span>
          </div>
        )
      })}
    </div>
  )
}
