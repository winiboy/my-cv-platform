import type { ResumeTemplate } from '@/types/database'
import { resolveResumeTemplate } from './resume-templates'
import type { ResumePageMargins } from './resume-sheets'
import { SWISS_ACADEMIC_GEOMETRY } from './swiss-academic-template'
import { SWISS_COMMERCE_GEOMETRY } from './swiss-commerce-template'
import { SWISS_ENGINEERING_GEOMETRY } from './swiss-engineering-template'
import { SWISS_EXECUTIVE_GEOMETRY } from './swiss-executive-template'
import { SWISS_FINANCE_GEOMETRY } from './swiss-finance-template'
import { SWISS_FIRST_JOB_GEOMETRY } from './swiss-first-job-template'
import { SWISS_HEALTH_GEOMETRY } from './swiss-health-template'
import { SWISS_IT_GEOMETRY } from './swiss-it-template'
import { SWISS_TRADES_GEOMETRY } from './swiss-trades-template'
import { SWISS_VOCATIONAL_GEOMETRY } from './swiss-vocational-template'

const margins = ({ pageTop, pageBottom }: ResumePageMargins): ResumePageMargins =>
  Object.freeze({ pageTop, pageBottom })

/**
 * Each template's printed page margins, read from its one geometry (FR-3):
 * the same `pageTop` and `pageBottom` its print CSS and its Word generator
 * read, so the Preview's sheets break where the PDF and Word break.
 */
export const RESUME_PAGE_MARGINS: Readonly<Record<ResumeTemplate, ResumePageMargins>> = Object.freeze({
  swissVocational: margins(SWISS_VOCATIONAL_GEOMETRY),
  swissCommerce: margins(SWISS_COMMERCE_GEOMETRY),
  swissTrades: margins(SWISS_TRADES_GEOMETRY),
  swissHealth: margins(SWISS_HEALTH_GEOMETRY),
  swissFinance: margins(SWISS_FINANCE_GEOMETRY),
  swissEngineering: margins(SWISS_ENGINEERING_GEOMETRY),
  swissIt: margins(SWISS_IT_GEOMETRY),
  swissExecutive: margins(SWISS_EXECUTIVE_GEOMETRY),
  swissAcademic: margins(SWISS_ACADEMIC_GEOMETRY),
  swissFirstJob: margins(SWISS_FIRST_JOB_GEOMETRY),
})

/** The page margins of the template a stored or drafted id is drawn with. */
export function resumePageMargins(template: string | null | undefined): ResumePageMargins {
  return RESUME_PAGE_MARGINS[resolveResumeTemplate(template)]
}
