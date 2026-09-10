'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n'
import { ResumePreviewWrapper } from '@/components/dashboard/resume-preview-wrapper'
import { DownloadButton } from '@/components/dashboard/download-button'
import { ControlsToggle } from '@/components/dashboard/controls-toggle'
import type { Resume } from '@/types/database'

interface ResumePreviewPageClientProps {
  resume: Resume
  locale: Locale
  dict: any
}

export function ResumePreviewPageClient({ resume, locale, dict }: ResumePreviewPageClientProps) {
  const [showControls, setShowControls] = useState(true)

  return (
    <>
      {/* Header - Hidden when printing */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 print:hidden">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/${locale}/dashboard/resumes/${resume.id}/edit`}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {dict.common?.back || 'Back'}
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{resume.title}</h1>
              <p className="text-sm text-slate-600">
                {dict.resumes?.preview || 'Preview'}
              </p>
            </div>
          </div>

          {/* Center: Controls Toggle */}
          <div className="absolute left-1/2 -translate-x-1/2">
            <ControlsToggle
              showControls={showControls}
              onToggle={setShowControls}
              label={dict?.resumes?.showControls || 'Show Controls'}
            />
          </div>

          {/* Right: Download Button */}
          <DownloadButton
            label={dict.resumes?.downloadPDF || 'Download PDF'}
            wordLabel={dict.resumes?.downloadWord || 'Download Word'}
          />
        </div>
      </div>

      {/* Preview Content - visible both on screen and when printing */}
      <div className="py-8 bg-slate-100 print:py-0 print:bg-white">
        <ResumePreviewWrapper
          initialResume={resume}
          locale={locale}
          dict={dict}
          showControls={showControls}
        />
      </div>
    </>
  )
}
