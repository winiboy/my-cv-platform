'use client'

import Link from 'next/link'
import { FileText, Mail, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Entity types supported by the link badge
 * - resume: Links to a CV/Resume
 * - coverLetter: Links to a Cover Letter
 * - job: Links to a Job Application
 */
type EntityType = 'resume' | 'coverLetter' | 'job'

interface EntityLinkBadgeProps {
  /** The type of entity this badge represents */
  type: EntityType
  /** Number of linked entities (used for showing count) */
  count?: number
  /** Whether a single entity is linked (alternative to count for 1:1 relationships) */
  linked?: boolean
  /** Optional navigation link - if provided, badge becomes clickable */
  href?: string
  /** Optional custom tooltip text */
  tooltip?: string
  /** Optional label override (defaults to entity type name) */
  label?: string
  /** Dictionary for translations */
  dict?: Record<string, unknown>
  /** Prevent parent click event propagation (useful when badge is inside a clickable card) */
  stopPropagation?: boolean
}

/**
 * Configuration for each entity type including colors and icons
 */
const entityConfig: Record<
  EntityType,
  {
    icon: typeof FileText
    bgColor: string
    textColor: string
    hoverBgColor: string
    defaultLabel: string
  }
> = {
  resume: {
    icon: FileText,
    bgColor: 'bg-teal-100 dark:bg-teal-900/30',
    textColor: 'text-teal-700 dark:text-teal-400',
    hoverBgColor: 'hover:bg-teal-200 dark:hover:bg-teal-900/50',
    defaultLabel: 'CV',
  },
  coverLetter: {
    icon: Mail,
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    textColor: 'text-purple-700 dark:text-purple-400',
    hoverBgColor: 'hover:bg-purple-200 dark:hover:bg-purple-900/50',
    defaultLabel: 'Cover Letter',
  },
  job: {
    icon: Briefcase,
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-400',
    hoverBgColor: 'hover:bg-blue-200 dark:hover:bg-blue-900/50',
    defaultLabel: 'Job',
  },
}

/**
 * EntityLinkBadge - A reusable badge component that shows link indicators
 * between CVs, Cover Letters, and Job Applications.
 *
 * Used on dashboard cards to indicate associations between entities.
 */
export function EntityLinkBadge({
  type,
  count,
  linked,
  href,
  tooltip,
  label,
  dict,
  stopPropagation = true,
}: EntityLinkBadgeProps) {
  const config = entityConfig[type]
  const Icon = config.icon

  // Determine what text to show
  const badgesDict = (dict?.badges || {}) as Record<string, unknown>
  const displayLabel = label || (badgesDict[`${type}Label`] as string) || config.defaultLabel
  const linkedText = (badgesDict.linked as string) || 'Linked'

  // Build the display text
  let displayText: string
  if (count !== undefined && count > 0) {
    // Show count (e.g., "3 cover letter(s)")
    displayText = `${count} ${displayLabel}${count > 1 ? 's' : ''}`
  } else if (linked) {
    // Show "Linked" indicator for single entity relationships
    displayText = `${displayLabel} ${linkedText}`
  } else {
    // No visible content - don't render
    return null
  }

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation()
    }
  }

  const badgeContent = (
    <>
      <Icon className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{displayText}</span>
    </>
  )

  const baseClasses = cn(
    'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors max-w-full',
    config.bgColor,
    config.textColor
  )

  // If href is provided, render as a clickable link
  if (href) {
    return (
      <Link
        href={href}
        onClick={handleClick}
        className={cn(baseClasses, config.hoverBgColor)}
        title={tooltip}
      >
        {badgeContent}
      </Link>
    )
  }

  // Otherwise render as a static badge
  return (
    <div className={baseClasses} title={tooltip}>
      {badgeContent}
    </div>
  )
}

/**
 * Truncates text to a maximum length, adding ellipsis if needed.
 * Truncates at word boundaries when possible.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const truncated = text.slice(0, maxLength - 1)
  // Try to truncate at last space for cleaner display
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + '\u2026'
  }
  return truncated + '\u2026'
}

/**
 * Convenience component for showing linked job indicator.
 * Shows only company name by default to keep badge compact.
 * Falls back to truncated job title if no company name available.
 *
 * When jobId and locale are provided, the badge becomes clickable
 * and navigates to the job application detail page.
 */
export function JobLinkBadge({
  jobId,
  jobTitle,
  companyName,
  href,
  locale,
  dict,
}: {
  /** The job application ID - used to generate navigation link */
  jobId?: string
  jobTitle?: string
  companyName?: string
  /** Optional explicit href - if not provided, will be generated from jobId and locale */
  href?: string
  /** Current locale for navigation - required if jobId is provided */
  locale?: string
  dict?: Record<string, unknown>
}) {
  // Prefer company name for compact display, fall back to truncated job title
  const MAX_LABEL_LENGTH = 25
  let label: string | undefined

  if (companyName) {
    label = truncateText(companyName, MAX_LABEL_LENGTH)
  } else if (jobTitle) {
    label = truncateText(jobTitle, MAX_LABEL_LENGTH)
  }

  // Generate href from jobId and locale if not explicitly provided
  let resolvedHref = href
  if (!resolvedHref && jobId) {
    if (locale) {
      resolvedHref = `/${locale}/dashboard/job-applications/${jobId}`
    } else {
      // Fallback without locale prefix - useful if locale is not available
      resolvedHref = `/dashboard/job-applications/${jobId}`
    }
  }

  return (
    <EntityLinkBadge
      type="job"
      linked
      href={resolvedHref}
      label={label}
      dict={dict}
    />
  )
}

/**
 * Convenience component for showing linked resume indicator
 */
export function ResumeLinkBadge({
  resumeTitle,
  href,
  dict,
}: {
  resumeTitle?: string
  href?: string
  dict?: Record<string, unknown>
}) {
  return (
    <EntityLinkBadge
      type="resume"
      linked
      href={href}
      label={resumeTitle}
      dict={dict}
    />
  )
}

/**
 * Convenience component for showing cover letter count or link
 */
export function CoverLetterLinkBadge({
  count,
  href,
  dict,
}: {
  count?: number
  href?: string
  dict?: Record<string, unknown>
}) {
  return (
    <EntityLinkBadge
      type="coverLetter"
      count={count}
      href={href}
      dict={dict}
    />
  )
}
