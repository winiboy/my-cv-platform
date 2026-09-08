'use client'

import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { ModernTemplate } from './resume-templates/modern-template'
import type { ModernSidebarSectionId, ModernMainContentSectionId } from './resume-templates/modern-template'
import { ClassicTemplate } from './resume-templates/classic-template'
import { MinimalTemplate } from './resume-templates/minimal-template'
import { CreativeTemplate } from './resume-templates/creative-template'
import { ProfessionalTemplate } from './resume-templates/professional-template'
import {
  DEFAULT_RESUME_LAYOUT,
  type EditorMainId,
  type EditorSidebarId,
} from '@/lib/layout-settings'

type SidebarSectionId = EditorSidebarId
type MainContentSectionId = EditorMainId

/**
 * Sidebar colour is stored as its HSL components, so the default is composed
 * from them rather than restated as a literal. Composing keeps one source for
 * the colour: changing the default hue in DEFAULT_RESUME_LAYOUT moves this
 * fallback with it instead of leaving the two disagreeing.
 */
const DEFAULT_SIDEBAR_COLOR = `hsl(${DEFAULT_RESUME_LAYOUT.sidebarHue}, ${DEFAULT_RESUME_LAYOUT.sidebarSaturation}%, ${DEFAULT_RESUME_LAYOUT.sidebarBrightness}%)`

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
  sectionGap?: number
  setSectionGap?: (gap: number) => void
  headerGap?: number
  setHeaderGap?: (gap: number) => void
  sidebarColor?: string
  setSidebarColor?: (color: string) => void
  fontScale?: number
  fontFamily?: string
  sidebarOrder?: readonly SidebarSectionId[]
  mainContentOrder?: readonly MainContentSectionId[]
  sidebarTopMargin?: number
  setSidebarTopMargin?: (margin: number) => void
  mainContentTopMargin?: number
  setMainContentTopMargin?: (margin: number) => void
  sidebarWidth?: number
  setSidebarWidth?: (width: number) => void
  hiddenSidebarSections?: readonly SidebarSectionId[]
  hiddenMainSections?: readonly MainContentSectionId[]
  modernSidebarOrder?: ModernSidebarSectionId[]
  modernMainContentOrder?: ModernMainContentSectionId[]
  hiddenModernSidebarSections?: ModernSidebarSectionId[]
  hiddenModernMainSections?: ModernMainContentSectionId[]
  photoUrl?: string
  onPhotoChange?: (dataUrl: string) => void
}

export function ResumePreview({
  resume,
  locale,
  dict,
  titleFontSize = DEFAULT_RESUME_LAYOUT.titleFontSize,
  setTitleFontSize,
  titleGap = DEFAULT_RESUME_LAYOUT.titleGap,
  setTitleGap,
  contactFontSize = DEFAULT_RESUME_LAYOUT.contactFontSize,
  setContactFontSize,
  sectionTitleFontSize = DEFAULT_RESUME_LAYOUT.sectionTitleFontSize,
  setSectionTitleFontSize,
  sectionDescFontSize = DEFAULT_RESUME_LAYOUT.sectionDescFontSize,
  setSectionDescFontSize,
  sectionGap = DEFAULT_RESUME_LAYOUT.sectionGap,
  setSectionGap,
  headerGap = DEFAULT_RESUME_LAYOUT.headerGap,
  setHeaderGap,
  sidebarColor = DEFAULT_SIDEBAR_COLOR,
  setSidebarColor,
  fontScale = DEFAULT_RESUME_LAYOUT.fontScale,
  fontFamily = DEFAULT_RESUME_LAYOUT.fontFamily,
  sidebarOrder = DEFAULT_RESUME_LAYOUT.sidebarOrder,
  mainContentOrder = DEFAULT_RESUME_LAYOUT.mainContentOrder,
  sidebarTopMargin = DEFAULT_RESUME_LAYOUT.sidebarTopMargin,
  setSidebarTopMargin,
  mainContentTopMargin = DEFAULT_RESUME_LAYOUT.mainContentTopMargin,
  setMainContentTopMargin,
  sidebarWidth = DEFAULT_RESUME_LAYOUT.sidebarWidth,
  setSidebarWidth,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  modernSidebarOrder,
  modernMainContentOrder,
  hiddenModernSidebarSections,
  hiddenModernMainSections,
  photoUrl,
  onPhotoChange
}: ResumePreviewProps) {
  // Render the appropriate template based on the resume's template field
  switch (resume.template) {
    case 'modern':
      return <ModernTemplate resume={resume} locale={locale} dict={dict} sidebarColor={sidebarColor} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} sidebarOrder={modernSidebarOrder} mainContentOrder={modernMainContentOrder} hiddenSidebarSections={hiddenModernSidebarSections} hiddenMainSections={hiddenModernMainSections} sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} sidebarTopMargin={sidebarTopMargin} setSidebarTopMargin={setSidebarTopMargin} mainContentTopMargin={mainContentTopMargin} setMainContentTopMargin={setMainContentTopMargin} fontScale={fontScale} fontFamily={fontFamily} photoUrl={photoUrl} onPhotoChange={onPhotoChange} />
    case 'classic':
      return <ClassicTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} />
    case 'minimal':
      return <MinimalTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} />
    case 'creative':
      return <CreativeTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} />
    case 'professional':
      return <ProfessionalTemplate resume={resume} locale={locale} dict={dict} sidebarColor={sidebarColor} fontScale={fontScale} fontFamily={fontFamily} sidebarOrder={sidebarOrder} mainContentOrder={mainContentOrder} sidebarTopMargin={sidebarTopMargin} setSidebarTopMargin={setSidebarTopMargin} mainContentTopMargin={mainContentTopMargin} setMainContentTopMargin={setMainContentTopMargin} sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} hiddenSidebarSections={hiddenSidebarSections} hiddenMainSections={hiddenMainSections} />
    default:
      return <ModernTemplate resume={resume} locale={locale} dict={dict} sidebarColor={sidebarColor} titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize} contactFontSize={contactFontSize} setContactFontSize={setContactFontSize} sectionTitleFontSize={sectionTitleFontSize} setSectionTitleFontSize={setSectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} setSectionDescFontSize={setSectionDescFontSize} sidebarOrder={modernSidebarOrder} mainContentOrder={modernMainContentOrder} hiddenSidebarSections={hiddenModernSidebarSections} hiddenMainSections={hiddenModernMainSections} sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} sidebarTopMargin={sidebarTopMargin} setSidebarTopMargin={setSidebarTopMargin} mainContentTopMargin={mainContentTopMargin} setMainContentTopMargin={setMainContentTopMargin} fontScale={fontScale} fontFamily={fontFamily} photoUrl={photoUrl} onPhotoChange={onPhotoChange} />
  }
}
