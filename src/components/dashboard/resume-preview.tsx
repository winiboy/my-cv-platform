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
  titleGap?: number
  setTitleGap?: (gap: number) => void
  contactFontSize?: number
  setContactFontSize?: (size: number) => void
  sectionTitleFontSize?: number
  setSectionTitleFontSize?: (size: number) => void
  sectionDescFontSize?: number
  setSectionDescFontSize?: (size: number) => void
}

export function ResumePreview({
  resume,
  locale,
  dict,
  titleFontSize = 24,
  setTitleFontSize,
  titleGap = 8,
  setTitleGap,
  contactFontSize = 12,
  setContactFontSize,
  sectionTitleFontSize = 16,
  setSectionTitleFontSize,
  sectionDescFontSize = 14,
  setSectionDescFontSize
}: ResumePreviewProps) {
  // Render the appropriate template based on the resume's template field
  switch (resume.template) {
    case 'modern':
      return <ModernTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} />
    case 'classic':
      return <ClassicTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} />
    case 'minimal':
      return <MinimalTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} />
    case 'creative':
      return <CreativeTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} />
    case 'professional':
      return <ProfessionalTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} titleGap={titleGap} setTitleGap={setTitleGap} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} />
    default:
      return <ModernTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} />
  }
}
