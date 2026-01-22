import type { JobStatus } from '@/types/database'

/**
 * Status configuration with colors and labels for job applications.
 * Colors follow semantic meaning:
 * - saved: gray (neutral)
 * - applied: blue (in progress)
 * - interviewing: yellow (active)
 * - offer: green (positive)
 * - rejected: red (negative)
 * - accepted: emerald (success)
 * - declined: orange (user choice)
 */
export const JOB_STATUS_CONFIG: Record<
  JobStatus,
  {
    bgColor: string
    textColor: string
    label: string
  }
> = {
  saved: {
    bgColor: 'bg-slate-100 dark:bg-slate-700',
    textColor: 'text-slate-700 dark:text-slate-300',
    label: 'Saved',
  },
  applied: {
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-400',
    label: 'Applied',
  },
  interviewing: {
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    textColor: 'text-yellow-700 dark:text-yellow-400',
    label: 'Interviewing',
  },
  offer: {
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-700 dark:text-green-400',
    label: 'Offer',
  },
  rejected: {
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-700 dark:text-red-400',
    label: 'Rejected',
  },
  accepted: {
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    textColor: 'text-emerald-700 dark:text-emerald-400',
    label: 'Accepted',
  },
  declined: {
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-700 dark:text-orange-400',
    label: 'Declined',
  },
}

/**
 * All possible job status values in workflow order.
 * Order represents typical progression through application process.
 */
export const JOB_STATUSES: JobStatus[] = [
  'saved',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'accepted',
  'declined',
]
