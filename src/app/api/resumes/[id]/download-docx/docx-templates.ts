import type { BuiltResumeTemplate, UnbuiltResumeTemplate } from '@/types/database'

/**
 * The templates the Word route has a generator for, and so accepts.
 *
 * Kept out of `route.ts` so it can be tested: a Next.js route module may export
 * only its handlers and route config. Typed against `BuiltResumeTemplate`, so a
 * template whose story has not landed cannot be listed here.
 */
export const SUPPORTED_TEMPLATES = [
  'professional',
  'modern',
  'classic',
  'minimal',
  'creative',
  'swissVocational',
  'swissCommerce',
  'swissTrades',
] as const satisfies readonly BuiltResumeTemplate[]

export type DocxTemplateId = (typeof SUPPORTED_TEMPLATES)[number]

/**
 * The Swiss ids the schema accepts whose template is not built yet. A `Record`
 * so that the compiler requires exactly the members of `UnbuiltResumeTemplate`:
 * a story that builds one removes it there, and this stops compiling until it
 * is removed here too.
 */
const UNBUILT_TEMPLATES: Readonly<Record<UnbuiltResumeTemplate, true>> = {
  swissHealth: true,
  swissFinance: true,
  swissEngineering: true,
  swissIt: true,
  swissExecutive: true,
  swissAcademic: true,
  swissFirstJob: true,
}

/**
 * The generator a stored `resumes.template` value is exported with.
 *
 * - A supported template: its own.
 * - An unbuilt Swiss id: modern. Nothing in the application offers one, but
 *   the schema accepts it and the owner's client writes the column, so a row
 *   can hold one; the Editor, the Preview and the PDF draw it as modern (their
 *   `default` branch), and the Word file must match them.
 * - Anything else, or nothing: professional, as the route always did.
 */
export function docxTemplateFor(stored: string | null | undefined): DocxTemplateId {
  const template = stored || 'professional'
  if ((SUPPORTED_TEMPLATES as readonly string[]).includes(template)) return template as DocxTemplateId
  if (Object.hasOwn(UNBUILT_TEMPLATES, template)) return 'modern'
  return 'professional'
}
