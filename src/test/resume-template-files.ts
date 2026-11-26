import type { ResumeTemplate } from '@/types/database'

/**
 * Where each template's Preview component and Word generator live, for the
 * suites that read template sources. The files use kebab-case names, so the
 * path is looked up rather than derived from the id.
 */
const FILE_STEM: Readonly<Record<ResumeTemplate, string>> = {
  swissVocational: 'swiss-vocational',
  swissCommerce: 'swiss-commerce',
  swissTrades: 'swiss-trades',
  swissHealth: 'swiss-health',
  swissFinance: 'swiss-finance',
  swissEngineering: 'swiss-engineering',
  swissIt: 'swiss-it',
  swissExecutive: 'swiss-executive',
  swissAcademic: 'swiss-academic',
  swissFirstJob: 'swiss-first-job',
}

/** The repository-relative path of a template's Preview component. */
export function templateComponentFile(template: ResumeTemplate): string {
  return `src/components/dashboard/resume-templates/${FILE_STEM[template]}-template.tsx`
}

/** The repository-relative path of a template's Word generator. */
export function templateDocxFile(template: ResumeTemplate): string {
  return `src/app/api/resumes/[id]/download-docx/docx-${FILE_STEM[template]}.ts`
}
