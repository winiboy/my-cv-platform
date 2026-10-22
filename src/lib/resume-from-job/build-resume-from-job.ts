import { escapeHtml } from '@/lib/escape-html'
import { AI_LIST_LIMITS, AI_TEXT_LIMITS } from '@/lib/api/ai-input-limits'
import type {
  ResumeCertification,
  ResumeContact,
  ResumeEducation,
  ResumeExperience,
  ResumeLanguage,
  ResumeProject,
  ResumeSkillCategory,
} from '@/types/database'
import {
  RESUME_SAMPLE_VALUES,
  SAMPLE_DATES,
  SUMMARY_COMPANY_PLACEHOLDER,
  SUMMARY_JOB_TITLE_PLACEHOLDER,
  type ResumeContentLanguage,
  type ResumeSampleValues,
} from './sample-values'
import { sanitizeUntrustedPlainText, sanitizeUntrustedRichText } from './untrusted-text'

/**
 * The one builder that turns a job offer into the content of a new resume
 * (PRD `tasks/prds/cv-from-job-complete.md`, US-001). Both ways of creating a
 * CV from an offer - a saved job application and Job Search - go through it,
 * so every such CV is filled the same way.
 *
 * Precedence, field by field: the offer's own data (job title, location), then
 * the AI content when there is any, then the sample value of the resume's one
 * content language. Every field except the photo ends up non-empty, and every
 * entry visible.
 *
 * Pure and DOM-free: no I/O, no clock, no randomness, so it runs in a route
 * handler and gives the same resume for the same input.
 */

/** The job offer a resume is built for. Every field is untrusted text. */
export interface JobOfferForResume {
  /** Becomes the resume title, which every template draws as the headline. */
  readonly title: string
  readonly company?: string | null
  /** Becomes the contact location when present. */
  readonly location?: string | null
}

/**
 * AI-written content, in the shape `generateResumeFromJobDescription` returns
 * (`src/lib/ai/transformations.ts`, prompt in `src/lib/ai/prompts.ts`), with
 * `achievements` added for experiences.
 *
 * The types describe what the AI is asked for, not what it is guaranteed to
 * send: the builder re-checks every value at run time, sanitizes it, and treats
 * anything missing, empty or malformed as absent.
 */
export interface AiResumeContent {
  /** Rich-text HTML. */
  readonly summary?: string | null
  readonly experience?: readonly AiExperienceContent[] | null
  readonly skills?: readonly AiSkillCategoryContent[] | null
  readonly projects?: readonly AiProjectContent[] | null
}

export interface AiExperienceContent {
  readonly position?: string | null
  readonly company?: string | null
  readonly location?: string | null
  /** `YYYY-MM`. */
  readonly startDate?: string | null
  /** `YYYY-MM`; `Present`, or no end date, marks the role as current. */
  readonly endDate?: string | null
  /** `true` keeps the role current; the stored end date is then only filler. */
  readonly current?: boolean | null
  /** Rich-text HTML. */
  readonly description?: string | null
  readonly achievements?: readonly string[] | null
}

export interface AiSkillCategoryContent {
  readonly category?: string | null
  readonly items?: readonly string[] | null
}

export interface AiProjectContent {
  readonly name?: string | null
  /** Rich-text HTML. */
  readonly description?: string | null
  readonly url?: string | null
  readonly startDate?: string | null
  readonly endDate?: string | null
  readonly technologies?: readonly string[] | null
}

export interface BuildResumeFromJobInput {
  readonly offer: JobOfferForResume
  /** Every sample value in the result comes from this one language's set. */
  readonly language: ResumeContentLanguage
  /** Absent when the offer had no usable description or the AI was not used. */
  readonly aiContent?: AiResumeContent | null
}

/**
 * The content columns of a new resume. Each field reuses the stored type from
 * `@/types/database`; the caller adds `user_id`, `template` and the rest.
 */
export interface ResumeDraftContent {
  title: string
  contact: ResumeContact
  summary: string
  experience: ResumeExperience[]
  education: ResumeEducation[]
  skills: ResumeSkillCategory[]
  languages: ResumeLanguage[]
  certifications: ResumeCertification[]
  projects: ResumeProject[]
}

/**
 * Ceiling on the AI entries kept per section. The prompt asks for 2-3
 * experiences and 3-5 projects; the cap only keeps a runaway reply from
 * flooding the resume.
 */
export const MAX_AI_ENTRIES_PER_SECTION = 10

const PLACEHOLDER_PATTERN = new RegExp(
  [SUMMARY_JOB_TITLE_PLACEHOLDER, SUMMARY_COMPANY_PLACEHOLDER]
    .map((placeholder) => placeholder.replace(/[{}]/g, '\\$&'))
    .join('|'),
  'g'
)

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])(?:$|-)/

/** `YYYY-MM` from a `YYYY-MM` or `YYYY-MM-DD` value, otherwise `''`. */
function toMonth(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = MONTH_PATTERN.exec(value.trim())
  return match ? `${match[1]}-${match[2]}` : ''
}

/**
 * A start and end month, each taken from the AI when valid. When the result
 * would end before it starts, the whole range comes from the sample instead, so
 * a range is never inverted.
 */
function toDateRange(
  start: unknown,
  end: unknown,
  sample: { readonly startDate: string; readonly endDate: string }
): { startDate: string; endDate: string } {
  const startDate = toMonth(start) || sample.startDate
  const endDate = toMonth(end) || sample.endDate
  if (endDate < startDate) {
    return { startDate: sample.startDate, endDate: sample.endDate }
  }
  return { startDate, endDate }
}

/** An absolute `http(s)` URL from untrusted input, otherwise `''`. */
function toHttpUrl(value: unknown): string {
  const text = sanitizeUntrustedPlainText(value, AI_TEXT_LIMITS.SHORT_LABEL)
  if (!text) return ''
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function toPlainList(value: unknown, maxCharacters: number, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => sanitizeUntrustedPlainText(item, maxCharacters))
    .filter((item) => item.length > 0)
    .slice(0, maxItems)
}

/**
 * One AI entry, read as untyped data: the declared AI types say what was asked
 * for, and each value is checked again where it is read.
 */
type UntrustedEntry = Readonly<Record<string, unknown>>

function toAiEntries(value: unknown): UntrustedEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is UntrustedEntry => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    .slice(0, MAX_AI_ENTRIES_PER_SECTION)
}

/** Trusted plain text (a sample value) as one stored rich-text paragraph. */
function paragraph(text: string): string {
  return `<p>${escapeHtml(text)}</p>`
}

function fillPlaceholders(template: string, jobTitle: string, company: string): string {
  // One pass with a replacer function: its return value is inserted literally
  // (a replacement STRING would expand `$&` and similar), and text inserted for
  // one placeholder is never scanned again for the other.
  return template.replace(PLACEHOLDER_PATTERN, (placeholder) =>
    placeholder === SUMMARY_JOB_TITLE_PLACEHOLDER ? jobTitle : company
  )
}

function sampleSummary(sample: ResumeSampleValues, jobTitle: string, company: string): string {
  const sentence = company ? sample.summary.withCompany : sample.summary.withoutCompany
  return paragraph(fillPlaceholders(sentence, jobTitle, company))
}

/**
 * An AI experience read once: every value sanitized, `''`/`[]` where the AI
 * gave nothing usable. Filtering and gap filling both work on this, so no
 * value is sanitized twice.
 */
interface ReadExperience {
  readonly position: string
  readonly company: string
  readonly location: string
  readonly description: string
  readonly achievements: readonly string[]
  readonly startDate: unknown
  readonly endDate: unknown
  readonly current: unknown
}

function readExperience(entry: UntrustedEntry): ReadExperience {
  return {
    position: sanitizeUntrustedPlainText(entry.position, AI_TEXT_LIMITS.SHORT_LABEL),
    company: sanitizeUntrustedPlainText(entry.company, AI_TEXT_LIMITS.SHORT_LABEL),
    location: sanitizeUntrustedPlainText(entry.location, AI_TEXT_LIMITS.SHORT_LABEL),
    description: sanitizeUntrustedRichText(entry.description, AI_TEXT_LIMITS.DESCRIPTION),
    achievements: toPlainList(entry.achievements, AI_TEXT_LIMITS.BULLET, AI_LIST_LIMITS.ACHIEVEMENTS),
    startDate: entry.startDate,
    endDate: entry.endDate,
    current: entry.current,
  }
}

/**
 * The dates of an experience.
 *
 * The AI marks a role it presents as ongoing with `current: true`, with
 * `Present` as its end date, or with no end date (owner decision, 2026-10-22):
 * such a role stays `current`, and every template and Word export then draws
 * the localized "present" word in place of the end date. The end date is still
 * filled - every field must be non-empty - with a month that never precedes
 * the start, so the stored range is never inverted. The editor shows it in its
 * disabled end-date field and clears it when "current" is toggled.
 *
 * A sample experience (no AI entry) is a finished role with the sample range.
 */
function experienceDates(ai: ReadExperience | null): Pick<ResumeExperience, 'startDate' | 'endDate' | 'current'> {
  const sample = SAMPLE_DATES.experience
  if (ai === null) return { ...sample, current: false }

  const isCurrent = ai.current === true || toMonth(ai.endDate) === ''
  if (!isCurrent) return { ...toDateRange(ai.startDate, ai.endDate, sample), current: false }

  const startDate = toMonth(ai.startDate) || sample.startDate
  const endCandidate = toMonth(ai.endDate) || sample.endDate
  return { startDate, endDate: endCandidate < startDate ? startDate : endCandidate, current: true }
}

function fillExperience(ai: ReadExperience | null, sample: ResumeSampleValues['experience']): ResumeExperience {
  return {
    company: ai?.company || sample.company,
    position: ai?.position || sample.position,
    ...experienceDates(ai),
    location: ai?.location || sample.location,
    description: ai?.description || paragraph(sample.description),
    achievements: ai && ai.achievements.length > 0 ? [...ai.achievements] : [...sample.achievements],
    visible: true,
  }
}

function buildExperiences(aiValue: unknown, sample: ResumeSampleValues['experience']): ResumeExperience[] {
  const entries = toAiEntries(aiValue)
    .map(readExperience)
    .filter((entry) => entry.position || entry.company || entry.description)
  if (entries.length === 0) return [fillExperience(null, sample)]
  return entries.map((entry) => fillExperience(entry, sample))
}

interface ReadSkillCategory {
  readonly category: string
  readonly items: readonly string[]
}

function readSkillCategory(entry: UntrustedEntry): ReadSkillCategory {
  return {
    category: sanitizeUntrustedPlainText(entry.category, AI_TEXT_LIMITS.SHORT_LABEL),
    items: toPlainList(entry.items, AI_TEXT_LIMITS.SKILL, AI_LIST_LIMITS.SKILLS),
  }
}

function fillSkillCategory(ai: ReadSkillCategory | null, sample: ResumeSampleValues['skills']): ResumeSkillCategory {
  const items = ai && ai.items.length > 0 ? [...ai.items] : [...sample.items]
  return {
    category: ai?.category || sample.category,
    items,
    // The editor edits `skillsHtml` and every template prefers it to `items`, so
    // both are written from the same list: neither can show a stale copy.
    skillsHtml: paragraph(items.join(', ')),
    visible: true,
  }
}

function buildSkills(aiValue: unknown, sample: ResumeSampleValues['skills']): ResumeSkillCategory[] {
  const entries = toAiEntries(aiValue)
    .map(readSkillCategory)
    .filter((entry) => entry.category || entry.items.length > 0)
  if (entries.length === 0) return [fillSkillCategory(null, sample)]
  return entries.map((entry) => fillSkillCategory(entry, sample))
}

interface ReadProject {
  readonly name: string
  readonly description: string
  readonly url: string
  readonly technologies: readonly string[]
  readonly startDate: unknown
  readonly endDate: unknown
}

function readProject(entry: UntrustedEntry): ReadProject {
  return {
    name: sanitizeUntrustedPlainText(entry.name, AI_TEXT_LIMITS.SHORT_LABEL),
    description: sanitizeUntrustedRichText(entry.description, AI_TEXT_LIMITS.DESCRIPTION),
    url: toHttpUrl(entry.url),
    technologies: toPlainList(entry.technologies, AI_TEXT_LIMITS.SKILL, AI_LIST_LIMITS.SKILLS),
    startDate: entry.startDate,
    endDate: entry.endDate,
  }
}

function fillProject(ai: ReadProject | null, sample: ResumeSampleValues['project']): ResumeProject {
  const { startDate, endDate } = toDateRange(ai?.startDate, ai?.endDate, SAMPLE_DATES.project)
  return {
    name: ai?.name || sample.name,
    description: ai?.description || paragraph(sample.description),
    url: ai?.url || sample.url,
    startDate,
    endDate,
    technologies: ai && ai.technologies.length > 0 ? [...ai.technologies] : [...sample.technologies],
    visible: true,
  }
}

function buildProjects(aiValue: unknown, sample: ResumeSampleValues['project']): ResumeProject[] {
  const entries = toAiEntries(aiValue)
    .map(readProject)
    .filter((entry) => entry.name || entry.description)
  if (entries.length === 0) return [fillProject(null, sample)]
  return entries.map((entry) => fillProject(entry, sample))
}

/**
 * Builds the content of a new resume for a job offer: every field filled, in
 * one content language, with all untrusted text sanitized and cut to the
 * existing input limits.
 */
export function buildResumeFromJobOffer({ offer, language, aiContent }: BuildResumeFromJobInput): ResumeDraftContent {
  const sample = RESUME_SAMPLE_VALUES[language]

  const jobTitle = sanitizeUntrustedPlainText(offer.title, AI_TEXT_LIMITS.SHORT_LABEL)
  const company = sanitizeUntrustedPlainText(offer.company, AI_TEXT_LIMITS.SHORT_LABEL)
  const location = sanitizeUntrustedPlainText(offer.location, AI_TEXT_LIMITS.SHORT_LABEL)
  const headline = jobTitle || sample.headline

  return {
    title: headline,
    contact: {
      ...sample.contact,
      location: location || sample.contact.location,
      visible: true,
    },
    summary:
      sanitizeUntrustedRichText(aiContent?.summary, AI_TEXT_LIMITS.SUMMARY) ||
      sampleSummary(sample, headline, company),
    experience: buildExperiences(aiContent?.experience, sample.experience),
    education: [
      {
        school: sample.education.school,
        degree: sample.education.degree,
        field: sample.education.field,
        ...SAMPLE_DATES.education,
        gpa: sample.education.gpa,
        description: paragraph(sample.education.description),
        achievements: [...sample.education.achievements],
        visible: true,
      },
    ],
    skills: buildSkills(aiContent?.skills, sample.skills),
    languages: sample.languages.map(({ language: name, level }) => ({ language: name, level, visible: true })),
    certifications: [
      {
        name: sample.certification.name,
        issuer: sample.certification.issuer,
        ...SAMPLE_DATES.certification,
        credentialId: sample.certification.credentialId,
        url: sample.certification.url,
        visible: true,
      },
    ],
    projects: buildProjects(aiContent?.projects, sample.project),
  }
}
