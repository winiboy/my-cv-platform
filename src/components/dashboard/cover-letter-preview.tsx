'use client'

import { useRef, useLayoutEffect, useState } from 'react'
import type { CoverLetter } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { ModernLetterTemplate } from './cover-letter-templates/modern-letter-template'

/** A4 width in px at 96dpi, the letter template's fixed page width. */
const PAGE_WIDTH_PX = 816

interface CoverLetterPreviewProps {
  coverLetter: CoverLetter
  senderName?: string
  /** The page's locale, the fallback language of the letter's printed parts. */
  locale: Locale
  /** The page is scaled to fit the container's width, but never above this. */
  maxScale?: number
  /**
   * Fit the page inside the container's padding, leaving a gutter on both
   * sides. Off by default: the editor pane fits the page to the full width,
   * padding included, as it always has.
   */
  fitInsidePadding?: boolean
}

export function CoverLetterPreview({
  coverLetter,
  senderName,
  locale,
  maxScale = 0.85,
  fitInsidePadding = false,
}: CoverLetterPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [computedScale, setComputedScale] = useState(maxScale)
  // Unscaled height of the page. A CSS transform does not change the layout
  // box, so the frame around the page is sized from this: a scroll container
  // around the preview then ends at the page's last line, with no blank space
  // below it and no part of the page out of reach.
  const [pageHeight, setPageHeight] = useState<number | null>(null)

  // Auto-scale to fit container. A layout effect, so the first paint is
  // already at the fitted size rather than at full size.
  useLayoutEffect(() => {
    const updateScale = () => {
      const container = containerRef.current
      if (!container) return

      let containerWidth = container.clientWidth
      if (fitInsidePadding) {
        const style = window.getComputedStyle(container)
        containerWidth -= parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      }

      // Calculate scale to fit, but cap at provided scale
      const fitScale = Math.min(containerWidth / PAGE_WIDTH_PX, maxScale)
      setComputedScale(fitScale)
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [maxScale, fitInsidePadding])

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

  return (
    <div
      ref={containerRef}
      className="flex justify-center overflow-auto bg-slate-200 dark:bg-slate-900 p-4 min-h-full"
    >
      {/* Sized to the scaled page, so the untransformed page box adds no scroll area. */}
      <div
        className="flex shrink-0 items-start justify-center"
        style={{
          width: `${PAGE_WIDTH_PX * computedScale}px`,
          height: pageHeight === null ? undefined : `${pageHeight * computedScale}px`,
        }}
      >
        <div
          ref={pageRef}
          style={{
            flexShrink: 0,
            transform: `scale(${computedScale})`,
            transformOrigin: 'top center',
          }}
        >
          <div className="shadow-2xl">
            <ModernLetterTemplate
              coverLetter={coverLetter}
              senderName={senderName}
              locale={locale}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
