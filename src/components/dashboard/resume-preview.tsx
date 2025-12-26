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
  switch (resume.template) {
    case 'modern':
      return <ModernTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} />
    case 'classic':
      return <ClassicTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} />
    case 'minimal':
      return <MinimalTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} />
    case 'creative':
      return <CreativeTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} />
    case 'professional':
      return <ProfessionalTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} />
    default:
      // Default to Modern template if no template is specified
      return <ModernTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} />
  }
}
