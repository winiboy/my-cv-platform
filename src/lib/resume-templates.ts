import type { ResumeTemplate } from '@/types/database'

/**
 * Every resume template identifier, in the order the template picker offers
 * them (swiss-templates-only-page-fidelity FR-1).
 *
 * `resumes_template_check` (migration 012) accepts exactly these ids; the
 * checked-in Supabase types derive `ResumeTemplate` from that constraint, and
 * the assertion below fails to compile if this list and the type disagree.
 */
export const RESUME_TEMPLATES = [
  'swissVocational',
  'swissCommerce',
  'swissTrades',
  'swissHealth',
  'swissFinance',
  'swissEngineering',
  'swissIt',
  'swissExecutive',
  'swissAcademic',
  'swissFirstJob',
] as const satisfies readonly ResumeTemplate[]

type MissingTemplate = Exclude<ResumeTemplate, (typeof RESUME_TEMPLATES)[number]>
const everyTemplateListed: MissingTemplate extends never ? true : never = true
void everyTemplateListed

/** A new resume's template, and what an unknown stored id is drawn as (FR-1). */
export const DEFAULT_RESUME_TEMPLATE = 'swissCommerce' as const satisfies ResumeTemplate

/** Whether `value` is one of the ten resume template ids. */
export function isResumeTemplate(value: unknown): value is ResumeTemplate {
  return typeof value === 'string' && (RESUME_TEMPLATES as readonly string[]).includes(value)
}

/**
 * The template a stored or drafted `resumes.template` value is drawn with.
 *
 * The column is constrained to the ten ids, but a value can still arrive from
 * outside them: a row read before migration 012 was applied, a stale client
 * draft, or a cached response. The Editor, the Preview (and so the PDF) and the
 * Word export all resolve it here, so they agree on one template rather than
 * each choosing its own fallback, and none of them throws.
 */
export function resolveResumeTemplate(stored: string | null | undefined): ResumeTemplate {
  return isResumeTemplate(stored) ? stored : DEFAULT_RESUME_TEMPLATE
}
