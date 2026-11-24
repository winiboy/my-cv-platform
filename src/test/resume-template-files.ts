import type { BuiltResumeTemplate } from '@/types/database'

/**
 * Where each built template's Preview component and Word generator live, for
 * the suites that read template sources.
 *
 * The five original templates are named `<id>-template.tsx` and `docx-<id>.ts`;
 * the Swiss templates use kebab-case file names, so the path is looked up rather
 * than derived from the id.
 */
const FILE_STEM: Readonly<Record<BuiltResumeTemplate, string>> = {
  professional: 'professional',
  modern: 'modern',
  classic: 'classic',
  minimal: 'minimal',
  creative: 'creative',
  swissVocational: 'swiss-vocational',
  swissCommerce: 'swiss-commerce',
  swissTrades: 'swiss-trades',
  swissHealth: 'swiss-health',
  swissFinance: 'swiss-finance',
  swissEngineering: 'swiss-engineering',
  swissIt: 'swiss-it',
}

/** The repository-relative path of a template's Preview component. */
export function templateComponentFile(template: BuiltResumeTemplate): string {
  return `src/components/dashboard/resume-templates/${FILE_STEM[template]}-template.tsx`
}

/** The repository-relative path of a template's Word generator. */
export function templateDocxFile(template: BuiltResumeTemplate): string {
  return `src/app/api/resumes/[id]/download-docx/docx-${FILE_STEM[template]}.ts`
}

/**
 * The five templates that existed before the Swiss templates.
 *
 * The per-element DOCX suites (letter spacing, line spacing, text colour,
 * localized words) and the parity and visual fixtures pin values element by
 * element for these five. A Swiss template's own per-element checks live in its
 * generator's test, so these suites are typed to the five rather than given
 * entries they do not exercise.
 */
export type OriginalResumeTemplate = 'professional' | 'modern' | 'classic' | 'minimal' | 'creative'
