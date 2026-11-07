'use client'

import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { CoverLetter } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import type { CoverLetterSenderDetails } from '@/lib/cover-letter-sender'
import { cn } from '@/lib/utils'
import {
  PAGE_WIDTH_PX,
  canZoomIn,
  canZoomOut,
  clampZoomScale,
  fitPageScale,
  fitWidthScale,
  zoomInScale,
  zoomOutScale,
  zoomPercent,
} from '@/lib/cover-letter-preview-zoom'
import { ModernLetterTemplate } from './cover-letter-templates/modern-letter-template'
import {
  CoverLetterZoomControls,
  type CoverLetterZoomLabels,
  type ZoomAnnouncement,
} from './cover-letter-zoom-controls'

/** Distance of the zoom controls from the scroll area's visible edges, scrollbars excluded. */
const CONTROLS_INSET_PX = 12

/**
 * Where a preview starts, and how it looks:
 *
 * - `pane`: the editor's preview pane. Starts fitted to the width, at most
 *   `maxScale`, as it always has. No side padding, so the fitted page spans
 *   the pane edge to edge as before.
 * - `window`: the full-screen preview. Starts at "show all", with a gutter
 *   on every side.
 */
type PreviewVariant = 'pane' | 'window'

/**
 * The zoom the user asked for. A fit follows the area's size as it changes
 * (a window resize, say); a level picked with zoom in or out stays put.
 */
type Zoom = { kind: 'fit'; fit: 'width' | 'page' } | { kind: 'fixed'; scale: number }

/** The scroll area as last measured, in CSS pixels. */
interface AreaMetrics {
  /**
   * The content box: the area's rendered size less scrollbars and padding,
   * rounded down, so a page fitted to it never exceeds it by a fraction of
   * a pixel (clientWidth and clientHeight are rounded to the nearest pixel).
   */
  contentWidth: number
  contentHeight: number
  /** Space the scrollbars take on the right and at the bottom. */
  scrollbarRight: number
  scrollbarBottom: number
}

function sameMetrics(a: AreaMetrics | null, b: AreaMetrics): boolean {
  return (
    a !== null &&
    a.contentWidth === b.contentWidth &&
    a.contentHeight === b.contentHeight &&
    a.scrollbarRight === b.scrollbarRight &&
    a.scrollbarBottom === b.scrollbarBottom
  )
}

function measureArea(element: HTMLElement): AreaMetrics {
  const style = window.getComputedStyle(element)
  const { width, height } = element.getBoundingClientRect()
  const scrollbarRight = element.offsetWidth - element.clientWidth
  const scrollbarBottom = element.offsetHeight - element.clientHeight
  return {
    contentWidth: Math.floor(
      width - scrollbarRight - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    ),
    contentHeight: Math.floor(
      height - scrollbarBottom - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    ),
    scrollbarRight,
    scrollbarBottom,
  }
}

function zoomLabels(editorDict: Record<string, unknown>): CoverLetterZoomLabels {
  return {
    group: (editorDict.zoomControls as string) || 'Zoom',
    zoomOut: (editorDict.zoomOut as string) || 'Zoom out',
    zoomIn: (editorDict.zoomIn as string) || 'Zoom in',
    showAll: (editorDict.zoomFit as string) || 'Show all',
    level: (editorDict.zoomLevel as string) || 'Zoom level: {percent}%',
  }
}

interface CoverLetterPreviewProps {
  coverLetter: CoverLetter
  /** The sender details as printed: `effectiveSenderDetails(letter, linked CV contact)`. */
  senderDetails: CoverLetterSenderDetails
  /** The page's locale, the fallback language of the letter's printed parts. */
  locale: Locale
  /** The `coverLetters.editor` dictionary: the scroll area's and the zoom controls' labels. */
  editorDict: Record<string, unknown>
  variant: PreviewVariant
  /** The `pane` variant's starting scale is fitted to the width, but never above this. */
  maxScale?: number
  /** The letter's scroll area, for a caller that moves focus into it. */
  scrollAreaRef?: RefObject<HTMLDivElement | null>
}

/**
 * The letter, scaled, in its own scroll area, with zoom controls at the
 * area's bottom-right (cover-letter-preview-and-card-language, US-002). Each
 * preview owns its zoom, so the editor's pane and the preview window zoom
 * independently.
 *
 * The caller lays it out as a flex item: it fills the remaining height of a
 * column flex container.
 */
export function CoverLetterPreview({
  coverLetter,
  senderDetails,
  locale,
  editorDict,
  variant,
  maxScale = 0.85,
  scrollAreaRef,
}: CoverLetterPreviewProps) {
  const ownScrollAreaRef = useRef<HTMLDivElement>(null)
  const areaRef = scrollAreaRef ?? ownScrollAreaRef
  const pageRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<Zoom>({ kind: 'fit', fit: variant === 'pane' ? 'width' : 'page' })
  const [area, setArea] = useState<AreaMetrics | null>(null)
  // The level announced to assistive technology: set only by a press of a
  // control, so a refit that follows a window resize changes the shown
  // percentage without speaking it.
  const [announcement, setAnnouncement] = useState<ZoomAnnouncement | null>(null)
  const announce = (percent: number) =>
    setAnnouncement((previous) => ({ percent, id: (previous?.id ?? 0) + 1 }))
  // Counts "show all" presses: each one brings the first page back into view.
  const [showAllRequests, setShowAllRequests] = useState(0)
  // Unscaled height of the page. A CSS transform does not change the layout
  // box, so the frame around the page is sized from this: the scroll area
  // then ends at the page's last line, with no blank space below it and no
  // part of the page out of reach.
  const [pageHeight, setPageHeight] = useState<number | null>(null)

  // A layout effect, so the first paint is already at the fitted size. The
  // observer follows the area's size, which a window resize changes as
  // well as a scrollbar appearing when the zoom grows.
  useLayoutEffect(() => {
    const element = areaRef.current
    if (!element) return

    const measure = () => {
      const next = measureArea(element)
      setArea((previous) => (sameMetrics(previous, next) ? previous : next))
    }
    measure()

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [areaRef])

  // Follow the page's height as the letter grows or shrinks while it is
  // edited. offsetHeight ignores the transform.
  useLayoutEffect(() => {
    const element = pageRef.current
    if (!element) return

    const measure = () => setPageHeight(element.offsetHeight)
    measure()

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [])

  // After "show all" has been applied, before paint: the page has shrunk, but
  // the area kept its scroll offsets, which could leave the first page's top
  // out of view. The fit is read again from a fresh measure, as the smaller
  // page may have removed a scrollbar, so the level announced is the one
  // the page settles at.
  useLayoutEffect(() => {
    if (showAllRequests === 0) return
    const element = areaRef.current
    if (!element) return
    element.scrollTo({ left: 0, top: 0, behavior: 'instant' })
    const next = measureArea(element)
    setArea((previous) => (sameMetrics(previous, next) ? previous : next))
    announce(zoomPercent(fitPageScale(next.contentWidth, next.contentHeight)))
  }, [showAllRequests, areaRef])

  let scale: number
  if (zoom.kind === 'fixed') {
    scale = zoom.scale
  } else if (area === null) {
    scale = clampZoomScale(maxScale)
  } else if (zoom.fit === 'width') {
    scale = fitWidthScale(area.contentWidth, maxScale)
  } else {
    scale = fitPageScale(area.contentWidth, area.contentHeight)
  }

  const zoomTo = (next: number) => {
    setZoom({ kind: 'fixed', scale: next })
    announce(zoomPercent(next))
  }
  const showAll = () => {
    setZoom({ kind: 'fit', fit: 'page' })
    setShowAllRequests((count) => count + 1)
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={areaRef}
        tabIndex={0}
        role="region"
        aria-label={(editorDict.previewScrollArea as string) || 'Letter, scrollable'}
        data-testid="cover-letter-preview-scroll-area"
        // A stable gutter keeps the width the page is fitted to from changing
        // when the vertical scrollbar comes and goes, which would otherwise
        // refit the page and could toggle the scrollbar back.
        style={{ scrollbarGutter: 'stable' }}
        className={cn(
          'absolute inset-0 overflow-auto overscroll-contain bg-slate-200 dark:bg-slate-900',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500',
          variant === 'pane' ? 'py-4' : 'p-4'
        )}
      >
        {/*
          Sized to the scaled page, so the untransformed page box adds no
          scroll area. A block centred with auto margins, not a centring flex
          container: a page wider than the area then overflows to the right
          only, and its left edge stays reachable at scrollLeft 0.
        */}
        <div
          className="mx-auto"
          style={{
            width: `${PAGE_WIDTH_PX * scale}px`,
            height: pageHeight === null ? undefined : `${pageHeight * scale}px`,
          }}
        >
          <div
            ref={pageRef}
            style={{
              width: `${PAGE_WIDTH_PX}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <div className="shadow-2xl" data-testid="cover-letter-preview-page">
              <ModernLetterTemplate coverLetter={coverLetter} senderDetails={senderDetails} locale={locale} />
            </div>
          </div>
        </div>
      </div>

      <CoverLetterZoomControls
        className="absolute"
        percent={zoomPercent(scale)}
        canZoomIn={canZoomIn(scale)}
        canZoomOut={canZoomOut(scale)}
        announcement={announcement}
        onZoomIn={() => zoomTo(zoomInScale(scale))}
        onZoomOut={() => zoomTo(zoomOutScale(scale))}
        onShowAll={showAll}
        labels={zoomLabels(editorDict)}
        style={{
          right: `${(area?.scrollbarRight ?? 0) + CONTROLS_INSET_PX}px`,
          bottom: `${(area?.scrollbarBottom ?? 0) + CONTROLS_INSET_PX}px`,
        }}
      />
    </div>
  )
}
