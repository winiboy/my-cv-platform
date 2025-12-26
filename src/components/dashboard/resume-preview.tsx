'use client'

import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { ModernTemplate } from './resume-templates/modern-template'
import { ClassicTemplate } from './resume-templates/classic-template'
import { MinimalTemplate } from './resume-templates/minimal-template'
import { CreativeTemplate } from './resume-templates/creative-template'
import { ProfessionalTemplate } from './resume-templates/professional-template'

interface ResumePreviewProps {
  resume: Resume
  locale: Locale
  dict: any
  titleFontSize?: number
  setTitleFontSize?: (size: number) => void
}

export function ResumePreview({ resume, locale, dict, titleFontSize = 24, setTitleFontSize }: ResumePreviewProps) {
  // Render the appropriate template based on the resume's template field
  let template
  switch (resume.template) {
    case 'modern':
      template = <ModernTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} />
      break
    case 'classic':
      template = <ClassicTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} />
      break
    case 'minimal':
      template = <MinimalTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} />
      break
    case 'creative':
      template = <CreativeTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} />
      break
    case 'professional':
      template = <ProfessionalTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} />
      break
    default:
      template = <ModernTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} />
  }

  return (
    <div className="flex items-start gap-6">
      {/* CV Template */}
      <div>{template}</div>

      {/* Font Size Slider - Outside CV, on the right */}
      {setTitleFontSize && (
        <div className="sticky top-4 print:hidden">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <label className="mb-3 block text-sm font-medium text-slate-700">
              Title Size
            </label>
            <div className="flex flex-col items-center gap-3">
              <input
                type="range"
                min="16"
                max="48"
                step="2"
                value={titleFontSize}
                onChange={(e) => setTitleFontSize(Number(e.target.value))}
                orient="vertical"
                className="h-32 cursor-pointer accent-slate-600"
                style={{
                  writingMode: 'bt-lr',
                  WebkitAppearance: 'slider-vertical',
                  width: '8px'
                }}
              />
              <span className="text-sm font-mono text-slate-600">
                {titleFontSize}px
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
