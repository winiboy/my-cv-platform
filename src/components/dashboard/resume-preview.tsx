'use client'

import type { Resume } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { SwissVocationalTemplate } from './resume-templates/swiss-vocational-template'
import { SwissCommerceTemplate } from './resume-templates/swiss-commerce-template'
import { SwissTradesTemplate } from './resume-templates/swiss-trades-template'
import { SwissHealthTemplate } from './resume-templates/swiss-health-template'
import { SwissFinanceTemplate } from './resume-templates/swiss-finance-template'
import { SwissEngineeringTemplate } from './resume-templates/swiss-engineering-template'
import { SwissItTemplate } from './resume-templates/swiss-it-template'
import { SwissExecutiveTemplate } from './resume-templates/swiss-executive-template'
import { SwissAcademicTemplate } from './resume-templates/swiss-academic-template'
import { SwissFirstJobTemplate } from './resume-templates/swiss-first-job-template'
import {
  DEFAULT_RESUME_LAYOUT,
  type EditorMainId,
  type EditorSidebarId,
} from '@/lib/layout-settings'
import type { ContactFieldId } from '@/lib/contact-visibility'
import { resolveResumeTemplate } from '@/lib/resume-templates'

/**
 * Read-only by construction (swiss-cv-templates FR-13): no layout setter and no
 * photo handler is accepted, so no template drawn through here renders an
 * in-page editing control. The Editor renders its templates itself.
 */
interface ResumePreviewProps {
  resume: Resume
  locale: Locale
  dict: any
  /**
   * Section visibility. Every Swiss template draws its sections in a fixed
   * order, so it reads which are hidden and never their order.
   */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  hiddenMainSections?: readonly EditorMainId[]
  /** The layout model's contact visibility (FR-14); every template reads it. */
  hiddenContactFields?: readonly ContactFieldId[]
  photoUrl?: string
}

export function ResumePreview({
  resume,
  locale,
  dict,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenContactFields = DEFAULT_RESUME_LAYOUT.hiddenContactFields,
  photoUrl,
}: ResumePreviewProps) {
  // A stored or drafted id outside the ten is drawn as the default template,
  // exactly as the Editor and the Word export draw it (FR-1).
  switch (resolveResumeTemplate(resume.template)) {
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
    case 'swissFirstJob':
      // As swissVocational: no font, no font scale (FR-4); fixed section order.
      return <SwissFirstJobTemplate resume={resume} locale={locale} dict={dict} hiddenMainSections={hiddenMainSections} hiddenSidebarSections={hiddenSidebarSections} photoUrl={photoUrl} hiddenContactFields={hiddenContactFields} />
  }
}
