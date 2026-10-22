import { z } from 'zod'

/**
 * Validation messages for the quick add form, read from `kanban.quickAdd`.
 * A missing key falls back to the English text the form showed before the
 * messages were translated.
 */
export interface QuickAddMessages {
  jobTitleRequired?: string
  jobTitleTooLong?: string
  companyRequired?: string
  companyTooLong?: string
  invalidUrl?: string
  urlTooLong?: string
}

/**
 * Helper to validate URL format.
 * Returns true for valid URLs, false otherwise.
 */
function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

/**
 * Builds the quick add form schema with messages in the page language.
 * Requires job title and company name, optional URL. The schema is built from
 * the dictionary rather than at module load so the messages follow the locale.
 */
export function createQuickAddSchema(messages: QuickAddMessages) {
  return z.object({
    job_title: z
      .string()
      .min(1, messages.jobTitleRequired || 'Job title is required')
      .max(255, messages.jobTitleTooLong || 'Job title must be less than 255 characters'),
    company_name: z
      .string()
      .min(1, messages.companyRequired || 'Company name is required')
      .max(255, messages.companyTooLong || 'Company name must be less than 255 characters'),
    job_url: z
      .string()
      .max(2000, messages.urlTooLong || 'URL must be less than 2000 characters')
      .refine(
        (val) => !val || val === '' || isValidUrl(val),
        messages.invalidUrl || 'Please enter a valid URL'
      )
      .optional()
      .or(z.literal('')),
  })
}

export type QuickAddFormData = z.infer<ReturnType<typeof createQuickAddSchema>>
