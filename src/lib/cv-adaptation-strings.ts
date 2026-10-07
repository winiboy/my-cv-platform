/**
 * Every string the CV adaptation modal (and the diff viewer inside it) draws,
 * plus the two the resume editor shows around it: the "Adapt to Job" button
 * and the success alert.
 *
 * They all live in `jobs.json -> cvAdaptation`, except the create-from-job
 * strings, which `jobs.json -> createCV` already owns and which are mapped onto
 * the names the modal reads. Both surfaces that open the modal (the resume
 * editor and Job Search) build this object with `cvAdaptationStrings`, so they
 * hand the modal the same words from the same source.
 */
export interface CVAdaptationStrings {
  title: string
  helpText: string
  jobDescriptionLabel: string
  jobDescriptionPlaceholder: string
  jobDescriptionHint: string
  /** Contains `{count}`, replaced by the current length of the description. */
  jobDescriptionCharacterCount: string
  jobDescriptionTooShort: string
  jobTitleLabel: string
  jobTitlePlaceholder: string
  jobTitleRequired: string
  companyLabel: string
  companyPlaceholder: string
  optional: string
  analyzeButton: string
  antiCopyDisclaimer: string
  orDivider: string
  browseJobListings: string
  browseJobListingsHint: string
  analyzing: string
  generating: string
  adaptationFailed: string
  matchScore: string
  keyGaps: string
  strengths: string
  summaryTitle: string
  experienceTitle: string
  addSkills: string
  enhanceSkills: string
  currentVersion: string
  proposedVersion: string
  noContent: string
  reasoning: string
  confidenceHigh: string
  confidenceMedium: string
  confidenceLow: string
  applyChange: string
  noChangesTitle: string
  noChangesMessage: string
  selectAll: string
  deselectAll: string
  applySelected: string
  cancel: string
  close: string
  adaptToJob: string
  successMessage: string
  createModeTitle: string
  createCVHelpText: string
  createCVButton: string
  creatingCV: string
  createFailed: string
}

type CVAdaptationKey = keyof CVAdaptationStrings

/** Keys read from `jobs.json -> cvAdaptation` under the same name. */
const CV_ADAPTATION_KEYS = [
  'title',
  'helpText',
  'jobDescriptionLabel',
  'jobDescriptionPlaceholder',
  'jobDescriptionHint',
  'jobDescriptionCharacterCount',
  'jobDescriptionTooShort',
  'jobTitleLabel',
  'jobTitlePlaceholder',
  'jobTitleRequired',
  'companyLabel',
  'companyPlaceholder',
  'optional',
  'analyzeButton',
  'antiCopyDisclaimer',
  'orDivider',
  'browseJobListings',
  'browseJobListingsHint',
  'analyzing',
  'generating',
  'adaptationFailed',
  'matchScore',
  'keyGaps',
  'strengths',
  'summaryTitle',
  'experienceTitle',
  'addSkills',
  'enhanceSkills',
  'currentVersion',
  'proposedVersion',
  'noContent',
  'reasoning',
  'confidenceHigh',
  'confidenceMedium',
  'confidenceLow',
  'applyChange',
  'noChangesTitle',
  'noChangesMessage',
  'selectAll',
  'deselectAll',
  'applySelected',
  'cancel',
  'close',
  'adaptToJob',
  'successMessage',
  'createFailed',
] as const satisfies readonly CVAdaptationKey[]

/** Keys the modal reads under its own name, sourced from `jobs.json -> createCV`. */
const CREATE_CV_KEYS = {
  createModeTitle: 'modalTitle',
  createCVHelpText: 'helpText',
  createCVButton: 'createButton',
  creatingCV: 'creating',
} as const satisfies Record<Exclude<CVAdaptationKey, (typeof CV_ADAPTATION_KEYS)[number]>, string>

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

/**
 * Select, on the server, the modal's strings from a locale's `jobs` dictionary.
 *
 * A missing or empty string is a translation defect, so it throws rather than
 * letting the modal fall back to another language.
 */
export function cvAdaptationStrings(jobs: Record<string, unknown>): CVAdaptationStrings {
  const cvAdaptation = asRecord(jobs.cvAdaptation)
  const createCV = asRecord(jobs.createCV)
  const missing: string[] = []

  const read = (source: Record<string, unknown> | undefined, sourceName: string, key: string): string => {
    const value = source?.[key]
    if (typeof value !== 'string' || value === '') {
      missing.push(`${sourceName}.${key}`)
      return ''
    }
    return value
  }

  const strings = {} as Record<CVAdaptationKey, string>
  for (const key of CV_ADAPTATION_KEYS) {
    strings[key] = read(cvAdaptation, 'cvAdaptation', key)
  }
  for (const [key, sourceKey] of Object.entries(CREATE_CV_KEYS) as [CVAdaptationKey, string][]) {
    strings[key] = read(createCV, 'createCV', sourceKey)
  }

  if (missing.length > 0) {
    throw new Error(`Missing translation jobs.json ${missing.join(', ')}`)
  }

  return strings
}
