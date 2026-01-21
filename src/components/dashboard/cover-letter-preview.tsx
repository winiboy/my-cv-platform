'use client'

import { useRef, useEffect, useState } from 'react'
import type { CoverLetter } from '@/types/database'
import { ModernLetterTemplate } from './cover-letter-templates/modern-letter-template'

interface CoverLetterPreviewProps {
  coverLetter: CoverLetter
  senderName?: string
  scale?: number
}

export function CoverLetterPreview({
  coverLetter,
  senderName,
  scale = 0.85,
}: CoverLetterPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [computedScale, setComputedScale] = useState(scale)

  // Auto-scale to fit container
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return

      const containerWidth = containerRef.current.clientWidth
      const pageWidth = 816 // A4 width in px at 96dpi

      // Calculate scale to fit, but cap at provided scale
      const fitScale = Math.min(containerWidth / pageWidth, scale)
      setComputedScale(fitScale)
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [scale])

  return (
    <div
      ref={containerRef}
      className="flex justify-center overflow-auto bg-slate-200 dark:bg-slate-900 p-4 min-h-full"
    >
      <div
        style={{
          transform: `scale(${computedScale})`,
          transformOrigin: 'top center',
        }}
      >
        <div className="shadow-2xl">
          <ModernLetterTemplate
            coverLetter={coverLetter}
            senderName={senderName}
          />
        </div>
      </div>
    </div>
  )
}
