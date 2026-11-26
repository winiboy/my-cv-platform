'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { resumePageMargins } from '@/lib/resume-page-margins'
import { PAGE_HEIGHT_PX } from '@/lib/resume-page-size'
import * as Sentry from '@sentry/nextjs'
import {
  createSheetStyles,
  paginateOrFallBack,
  paginateResumeDocument,
  type SheetStyles,
} from '@/lib/resume-sheet-pagination'
import { SHEET_GAP_PX, sheetTop, type ResumePageMargins } from '@/lib/resume-sheets'
import { cn } from '@/lib/utils'

/** Visual gap, in screen px, between the sheet's right edge and a page label. */
const LABEL_GAP_PX = 3

/** Marks the frame's own drawings, whose changes are not changes to the document. */
const CHROME_ATTRIBUTE = 'data-resume-sheets-chrome'

/**
 * Attributes of the document whose change can move its blocks. The pagination's
 * own attributes (`data-sheet-*`) are not among them, so writing them does not
 * schedule another pass.
 */
const OBSERVED_ATTRIBUTES = ['class', 'style', 'src', 'srcset', 'hidden', 'width', 'height']

/**
 * Report a pagination that failed. The error carries geometry only (the
 * arithmetic's coordinates, a rule's selector), never resume content, and
 * nothing else is attached. A warning: the resume is still drawn, whole, on
 * one continuous sheet, and print does not depend on the sheets.
 */
function reportSheetsFailure(error: unknown): void {
  Sentry.captureException(error instanceof Error ? error : new Error('Resume sheets pagination failed'), {
    level: 'warning',
    tags: { area: 'resume-sheets', failure_kind: 'pagination_failed' },
  })
}

/**
 * Keep `frame`'s resume document laid out on A4 sheets, and return how many.
 *
 * The document is paginated once on mount, then again, at most once per
 * frame, whenever it changes: its content or markup (an edit in the Editor, a
 * draft, a template switch), its size, an image or a font that finishes
 * loading. Nothing is paginated while the page is in print media, where the
 * pushes do not apply and print fragments the document itself.
 *
 * A pagination that throws never reaches React: its pushes are removed, it is
 * reported, and the document is drawn continuous on one sheet
 * (`paginateOrFallBack`). The PDF route waits for this document to render, so
 * a failure here must not unmount it.
 */
function useResumeSheets(frameRef: RefObject<HTMLDivElement | null>, margins: ResumePageMargins): number {
  const [sheetCount, setSheetCount] = useState(1)
  const scope = useId().replace(/[^A-Za-z0-9_-]/g, '')

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    // Reported once per mount: a document that fails to paginate fails on
    // every edit, and one report says as much as a hundred.
    let reported = false
    const report = (error: unknown) => {
      if (reported) return
      reported = true
      reportSheetsFailure(error)
    }

    let styles: SheetStyles
    try {
      styles = createSheetStyles(frame, scope)
    } catch (error) {
      // No sheets: the document is drawn as it is, on the one sheet already counted.
      report(error)
      return
    }
    const print = window.matchMedia('print')
    let pending = 0
    let disposed = false

    const run = () => {
      pending = 0
      if (disposed || print.matches) return
      const root = frame.querySelector<HTMLElement>(':scope > [data-testid="resume-document"]')
      // Not drawn, or drawn in a hidden pane: nothing to measure.
      if (!root || root.offsetWidth === 0) {
        styles.reset()
        setSheetCount(1)
        return
      }
      setSheetCount(paginateOrFallBack(() => paginateResumeDocument(root, margins, styles), styles, report))
    }
    const schedule = () => {
      if (pending === 0) pending = window.requestAnimationFrame(run)
    }

    run()

    // A notification about the frame's own drawings, inside them or their
    // mounting and unmounting, is not a document change.
    const isChrome = (node: Node) => node instanceof Element && node.hasAttribute(CHROME_ATTRIBUTE)
    const isDocumentChange = (record: MutationRecord) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      if (target?.closest(`[${CHROME_ATTRIBUTE}]`)) return false
      const nodes = [...record.addedNodes, ...record.removedNodes]
      return nodes.length === 0 || !nodes.every(isChrome)
    }
    const mutations = new MutationObserver((records) => {
      if (records.some(isDocumentChange)) schedule()
    })
    mutations.observe(frame, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: OBSERVED_ATTRIBUTES,
    })
    // Scheduled, never run in the callback: the run resizes the document, and
    // a resize inside a ResizeObserver callback is reported as a loop error.
    const resizes = new ResizeObserver(schedule)
    resizes.observe(frame)
    // `load` does not bubble; captured, it reports every image in the document.
    frame.addEventListener('load', schedule, true)
    document.fonts.addEventListener('loadingdone', schedule)
    void document.fonts.ready.then(schedule)
    print.addEventListener('change', schedule)

    return () => {
      disposed = true
      if (pending !== 0) window.cancelAnimationFrame(pending)
      mutations.disconnect()
      resizes.disconnect()
      frame.removeEventListener('load', schedule, true)
      document.fonts.removeEventListener('loadingdone', schedule)
      print.removeEventListener('change', schedule)
      styles.dispose()
    }
  }, [frameRef, margins, scope])

  return sheetCount
}

interface ResumeSheetsProps {
  /** The resume's stored or drafted template id: its page margins place the blocks (FR-3). */
  template: string | null | undefined
  /** The resume document, `data-testid="resume-document"`, as the only child. */
  children: ReactNode
  /**
   * The CSS scale the surrounding wrapper draws the sheets at (1 when
   * unscaled). The page labels divide by it, so they keep a constant
   * on-screen size.
   */
  scale: number
  /** The localized page label, with `{page}` standing for the sheet's number. */
  labelTemplate: string
  /**
   * Extra classes for each label, for a surface that must decide when its
   * gutter is too narrow to draw one (the gap between sheets is always drawn).
   */
  labelClassName?: string
  className?: string
  style?: CSSProperties
}

/**
 * The resume document drawn as the separate A4 sheets it prints on
 * (swiss-templates-only-page-fidelity US-003), on the Preview page and in the
 * Editor's live preview: each sheet 794 × 1123 px, `SHEET_GAP_PX` apart, with
 * the items print keeps whole moved whole to the next sheet and every sheet
 * after the first starting below the template's top margin.
 *
 * The document stays one element: the pagination pushes its blocks down
 * through the gaps and margins (`resume-sheet-pagination.ts`), and this frame
 * draws, around it, a white sheet with its shadow behind each page and the
 * page's background colour over each gap. The document's own backgrounds
 * (a template's columns, its strip) run through the gaps under that colour, so
 * every sheet shows them top to foot, as every printed page does.
 *
 * Screen only (FR-5): the sheets and gaps are `print:hidden`, and the pushes
 * are `@media screen` rules, so the printed document, and the PDF printed
 * from the Preview page, are what they were without this frame.
 *
 * The frame is exactly as tall as the document, which fills its last sheet;
 * it adds no padding or margin of its own. The gaps and labels are
 * `aria-hidden`: they restate the page geometry, not content.
 */
export function ResumeSheets({
  template,
  children,
  scale,
  labelTemplate,
  labelClassName,
  className,
  style,
}: ResumeSheetsProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const sheetCount = useResumeSheets(frameRef, resumePageMargins(template))
  const sheets = Array.from({ length: sheetCount }, (_, index) => index)
  // One screen px, written in the frame's unscaled coordinates.
  const screenPx = 1 / scale

  return (
    <div
      ref={frameRef}
      data-testid="resume-sheets"
      data-sheet-count={sheetCount}
      className={cn('relative', className)}
      style={style}
    >
      {/* Before the document, so the document paints over it. */}
      <div
        aria-hidden="true"
        data-resume-sheets-chrome=""
        className="pointer-events-none absolute inset-x-0 top-0 print:hidden"
      >
        {sheets.map((index) => (
          <div
            key={index}
            data-testid="resume-sheet"
            data-sheet={index + 1}
            className="absolute inset-x-0 bg-white shadow-lg"
            style={{ top: `${sheetTop(index)}px`, height: `${PAGE_HEIGHT_PX}px` }}
          />
        ))}
      </div>

      {children}

      {sheetCount > 1 && (
        <div
          aria-hidden="true"
          data-resume-sheets-chrome=""
          data-testid="page-break-indicators"
          // Clipped vertically at the document's foot; horizontally visible so
          // the labels can reach the gutter.
          className="pointer-events-none absolute inset-0 z-20 select-none overflow-x-visible overflow-y-clip print:hidden"
        >
          {sheets.slice(1).map((index) => {
            const page = index + 1
            return (
              <div
                key={page}
                data-testid="page-break-indicator"
                data-page={page}
                className="absolute inset-x-0 h-0"
                style={{ top: `${sheetTop(index)}px` }}
              >
                {/* The gap above this sheet, in the colour of the page around the sheets. */}
                <div
                  data-testid="resume-sheet-gap"
                  className="absolute inset-x-0 bg-slate-100"
                  style={{ top: `${-SHEET_GAP_PX}px`, height: `${SHEET_GAP_PX}px` }}
                />
                <span
                  data-testid="page-break-label"
                  className={cn(
                    'absolute top-0 whitespace-nowrap text-[10px] font-medium leading-none tracking-wide text-teal-700 [writing-mode:vertical-rl]',
                    labelClassName,
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
      )}
    </div>
  )
}
