'use client'

import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { ModernTemplate } from './resume-templates/modern-template'
import { ClassicTemplate } from './resume-templates/classic-template'
import { MinimalTemplate } from './resume-templates/minimal-template'
import { CreativeTemplate } from './resume-templates/creative-template'
import { ProfessionalTemplate } from './resume-templates/professional-template'
import { SwissVocationalTemplate } from './resume-templates/swiss-vocational-template'
import { SwissCommerceTemplate } from './resume-templates/swiss-commerce-template'
import { SwissTradesTemplate } from './resume-templates/swiss-trades-template'
import { SwissHealthTemplate } from './resume-templates/swiss-health-template'
import { SwissFinanceTemplate } from './resume-templates/swiss-finance-template'
import { SwissEngineeringTemplate } from './resume-templates/swiss-engineering-template'
import { SwissItTemplate } from './resume-templates/swiss-it-template'
import { SwissExecutiveTemplate } from './resume-templates/swiss-executive-template'
import { SwissAcademicTemplate } from './resume-templates/swiss-academic-template'
import {
  chosenFontFamily,
  DEFAULT_RESUME_LAYOUT,
  mapEditorOrderToCreative,
  type EditorMainId,
  type EditorSidebarId,
  type ModernMainId,
  type ModernSidebarId,
} from '@/lib/layout-settings'
import type { ContactFieldId } from '@/lib/contact-visibility'

type SidebarSectionId = EditorSidebarId
type MainContentSectionId = EditorMainId

/**
 * Sidebar colour is stored as its HSL components, so the default is composed
 * from them rather than restated as a literal. Composing keeps one source for
 * the colour: changing the default hue in DEFAULT_RESUME_LAYOUT moves this
 * fallback with it instead of leaving the two disagreeing.
 */
const DEFAULT_SIDEBAR_COLOR = `hsl(${DEFAULT_RESUME_LAYOUT.sidebarHue}, ${DEFAULT_RESUME_LAYOUT.sidebarSaturation}%, ${DEFAULT_RESUME_LAYOUT.sidebarBrightness}%)`

/**
 * Read-only by construction (swiss-cv-templates FR-13): no layout setter and no
 * photo handler is accepted, so no template drawn through here renders an
 * in-page editing control. The Editor renders its templates itself.
 */
interface ResumePreviewProps {
  resume: Resume
  locale: Locale
  dict: any
  titleFontSize?: number
  titleGap?: number
  contactFontSize?: number
  sectionTitleFontSize?: number
  sectionDescFontSize?: number
  sectionGap?: number
  headerGap?: number
  sidebarColor?: string
  fontScale?: number
  fontFamily?: string
  sidebarOrder?: readonly SidebarSectionId[]
  mainContentOrder?: readonly MainContentSectionId[]
  sidebarTopMargin?: number
  mainContentTopMargin?: number
  sidebarWidth?: number
  hiddenSidebarSections?: readonly SidebarSectionId[]
  hiddenMainSections?: readonly MainContentSectionId[]
  modernSidebarOrder?: ModernSidebarId[]
  modernMainContentOrder?: ModernMainId[]
  hiddenModernSidebarSections?: ModernSidebarId[]
  hiddenModernMainSections?: ModernMainId[]
  /** The layout model's contact visibility (FR-14); every template reads it. */
  hiddenContactFields?: readonly ContactFieldId[]
  photoUrl?: string
}

export function ResumePreview({
  resume,
  locale,
  dict,
  titleFontSize = DEFAULT_RESUME_LAYOUT.titleFontSize,
  titleGap = DEFAULT_RESUME_LAYOUT.titleGap,
  contactFontSize = DEFAULT_RESUME_LAYOUT.contactFontSize,
  sectionTitleFontSize = DEFAULT_RESUME_LAYOUT.sectionTitleFontSize,
  sectionDescFontSize = DEFAULT_RESUME_LAYOUT.sectionDescFontSize,
  sectionGap = DEFAULT_RESUME_LAYOUT.sectionGap,
  headerGap = DEFAULT_RESUME_LAYOUT.headerGap,
  sidebarColor = DEFAULT_SIDEBAR_COLOR,
  fontScale = DEFAULT_RESUME_LAYOUT.fontScale,
  fontFamily = DEFAULT_RESUME_LAYOUT.fontFamily,
  sidebarOrder = DEFAULT_RESUME_LAYOUT.sidebarOrder,
  mainContentOrder = DEFAULT_RESUME_LAYOUT.mainContentOrder,
  sidebarTopMargin = DEFAULT_RESUME_LAYOUT.sidebarTopMargin,
  mainContentTopMargin = DEFAULT_RESUME_LAYOUT.mainContentTopMargin,
  sidebarWidth = DEFAULT_RESUME_LAYOUT.sidebarWidth,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  modernSidebarOrder,
  modernMainContentOrder,
  hiddenModernSidebarSections,
  hiddenModernMainSections,
  hiddenContactFields = DEFAULT_RESUME_LAYOUT.hiddenContactFields,
  photoUrl,
}: ResumePreviewProps) {
  /**
   * The font to impose on a template that has one of its own (Part 3 US-012).
   *
   * Classic, minimal and creative each draw a designed font — classic's serif
   * title and headings, minimal's and creative's Inter — and keep it until the
   * owner chooses a font, so they are passed the CHOSEN font or nothing at all.
   * `undefined` is what "nothing was chosen" looks like to a template prop.
   *
   * Professional and modern are passed the stack itself, as they always were.
   * They declare no font of their own, so the stored default IS what they draw;
   * routing them through this would change nothing but would make the value
   * they render depend on a rule that does not apply to them.
   */
  const chosenFont = chosenFontFamily(fontFamily) ?? undefined

  // Render the appropriate template based on the resume's template field
  switch (resume.template) {
    case 'modern':
      return <ModernTemplate resume={resume} locale={locale} dict={dict} sidebarColor={sidebarColor} titleFontSize={titleFontSize} contactFontSize={contactFontSize} sectionTitleFontSize={sectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} sidebarOrder={modernSidebarOrder} mainContentOrder={modernMainContentOrder} hiddenSidebarSections={hiddenModernSidebarSections} hiddenMainSections={hiddenModernMainSections} sidebarWidth={sidebarWidth} sidebarTopMargin={sidebarTopMargin} mainContentTopMargin={mainContentTopMargin} fontScale={fontScale} fontFamily={fontFamily} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
    case 'classic':
      return <ClassicTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} contactFontSize={contactFontSize} sectionTitleFontSize={sectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} fontScale={fontScale} fontFamily={chosenFont} mainContentOrder={mainContentOrder} hiddenMainSections={hiddenMainSections} hiddenContactFields={hiddenContactFields} />
    case 'minimal':
      return <MinimalTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} contactFontSize={contactFontSize} sectionTitleFontSize={sectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} fontScale={fontScale} fontFamily={chosenFont} mainContentOrder={mainContentOrder} hiddenMainSections={hiddenMainSections} hiddenContactFields={hiddenContactFields} />
    case 'creative': {
      // Part 3 US-015: creative reads the editor vocabulary through the shared
      // mapping, exactly as docx-creative.ts does. Neither surface states a
      // section list of its own, which is what makes the two orders one order.
      const creative = mapEditorOrderToCreative(sidebarOrder, mainContentOrder, hiddenSidebarSections, hiddenMainSections)
      return <CreativeTemplate resume={resume} locale={locale} dict={dict} titleFontSize={titleFontSize} contactFontSize={contactFontSize} sectionTitleFontSize={sectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} fontScale={fontScale} fontFamily={chosenFont} sidebarOrder={creative.creativeSidebarOrder} mainContentOrder={creative.creativeMainOrder} hiddenSidebarSections={creative.hiddenCreativeSidebar} hiddenMainSections={creative.hiddenCreativeMain} summaryHidden={creative.summaryHidden} hiddenContactFields={hiddenContactFields} />
    }
    case 'professional':
      return <ProfessionalTemplate resume={resume} locale={locale} dict={dict} sidebarColor={sidebarColor} fontScale={fontScale} fontFamily={fontFamily} sidebarOrder={sidebarOrder} mainContentOrder={mainContentOrder} sidebarTopMargin={sidebarTopMargin} mainContentTopMargin={mainContentTopMargin} sidebarWidth={sidebarWidth} hiddenSidebarSections={hiddenSidebarSections} hiddenMainSections={hiddenMainSections} hiddenContactFields={hiddenContactFields} />
    case 'swissVocational':
      // It draws its own typeface at its own sizes, so it is passed neither the
      // font nor the font scale (FR-4). It reads the sections' visibility and
      // not their order, which is fixed: skills, languages and training are
      // sidebar ids in the model although it draws no sidebar.
      return <SwissVocationalTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
    case 'swissCommerce':
      // As swissVocational: no font, no font scale (FR-4); fixed section order.
      return <SwissCommerceTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
    case 'swissTrades':
      // As swissVocational: no font, no font scale (FR-4); fixed section order.
      return <SwissTradesTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
    case 'swissHealth':
      // As swissVocational: no font, no font scale (FR-4); fixed section order.
      return <SwissHealthTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
    case 'swissFinance':
      // As swissVocational: no font, no font scale (FR-4); fixed section order.
      return <SwissFinanceTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
    case 'swissEngineering':
      // As swissVocational: no font, no font scale (FR-4); fixed section order.
      return <SwissEngineeringTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
    case 'swissIt':
      // As swissVocational: no font, no font scale (FR-4); fixed section order.
      return <SwissItTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
    case 'swissExecutive':
      // As swissVocational: no font, no font scale (FR-4); fixed section order.
      return <SwissExecutiveTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
    case 'swissAcademic':
      // As swissVocational: no font, no font scale (FR-4); fixed section order;
      // no photo, which it never draws (PRD FR-5 exception).
      return <SwissAcademicTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} hiddenContactFields={hiddenContactFields} />
    default:
      return <ModernTemplate resume={resume} locale={locale} dict={dict} sidebarColor={sidebarColor} titleFontSize={titleFontSize} contactFontSize={contactFontSize} sectionTitleFontSize={sectionTitleFontSize} sectionDescFontSize={sectionDescFontSize} sidebarOrder={modernSidebarOrder} mainContentOrder={modernMainContentOrder} hiddenSidebarSections={hiddenModernSidebarSections} hiddenMainSections={hiddenModernMainSections} sidebarWidth={sidebarWidth} sidebarTopMargin={sidebarTopMargin} mainContentTopMargin={mainContentTopMargin} fontScale={fontScale} fontFamily={fontFamily} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
  }
}
