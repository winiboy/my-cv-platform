'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { MapPin, GripVertical, MoreVertical, Pencil, FileText, Mail, Trash2 } from 'lucide-react'
import type { JobApplicationWithRelations } from '@/types/database'
import { JOB_STATUS_CONFIG } from '@/lib/constants/job-statuses'
import { cn } from '@/lib/utils'
import { ResumeLinkBadge, CoverLetterLinkBadge } from '@/components/dashboard/entity-link-badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { KanbanCardPreview } from './kanban-card-preview'

/**
 * useIsomorphicLayoutEffect is useLayoutEffect on client, useEffect on server.
 * This avoids SSR warnings while ensuring synchronous DOM updates on client.
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Number of menu items for keyboard navigation bounds */
const MENU_ITEM_COUNT = 4

interface KanbanCardProps {
  jobApplication: JobApplicationWithRelations
  locale: string
  dict: Record<string, unknown>
  /** When true, renders a clean version for DragOverlay without drag handle */
  isDragOverlay?: boolean
  /** Callback when delete action is triggered */
  onDelete?: (id: string) => void
  /** When true, this card should receive programmatic focus */
  isFocused?: boolean
  /** Callback when this card receives focus (e.g., via tab) */
  onFocus?: (id: string) => void
  /** Register this card's ref for keyboard navigation focus */
  registerCardRef?: (id: string, el: HTMLDivElement | null) => void
  /** Whether the viewport is mobile-sized for touch-friendly targets */
  isMobile?: boolean
}

/**
 * KanbanCard displays a compact job application card for the Kanban board.
 * Shows job title, company, location, status badge, and date.
 * Navigates to the job application detail page on click.
 * Uses a div with onClick instead of Link to avoid nested anchor tags
 * when child badge components contain their own Links.
 */
export function KanbanCard({
  jobApplication,
  locale,
  dict,
  isDragOverlay = false,
  onDelete,
  isFocused = false,
  onFocus,
  registerCardRef,
  isMobile = false,
}: KanbanCardProps) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [menuFocusIndex, setMenuFocusIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuItemRefs = useRef<(HTMLElement | null)[]>([])

  const jobsDict = (dict.jobs || {}) as Record<string, unknown>
  const statusesDict = (jobsDict.statuses || {}) as Record<string, string>
  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const cardDict = (kanbanDict.card || {}) as Record<string, string>

  // Set up draggable behavior using @dnd-kit
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: jobApplication.id,
    data: {
      jobApplication,
      status: jobApplication.status,
    },
  })

  // Transform style for drag movement
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  const statusConfig = JOB_STATUS_CONFIG[jobApplication.status]

  /**
   * Get translated status label with fallback to English
   */
  const getStatusLabel = (): string => {
    return statusesDict[jobApplication.status] || statusConfig.label
  }

  /**
   * Format date for display in short format (e.g., "Jan 28")
   */
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
    }).format(date)
  }

  // Use applied_date if available, otherwise fall back to created_at
  const displayDate = jobApplication.applied_date || jobApplication.created_at

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  // Handle programmatic focus when isFocused becomes true
  // Using useLayoutEffect ensures synchronous DOM focus before paint
  useIsomorphicLayoutEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.focus()
    }
  }, [isFocused])

  // Focus first menu item when menu opens
  useIsomorphicLayoutEffect(() => {
    if (showMenu) {
      setMenuFocusIndex(0)
      // Focus first item after menu renders
      requestAnimationFrame(() => {
        menuItemRefs.current[0]?.focus()
      })
    }
  }, [showMenu])

  /**
   * Handle delete action with confirmation.
   * Prevents event propagation to avoid card navigation.
   */
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()

    const confirmMessage = cardDict.confirmDelete || 'Are you sure you want to delete this job application?'

    if (!confirm(confirmMessage)) {
      setShowMenu(false)
      return
    }

    setIsDeleting(true)
    setShowMenu(false)
    onDelete?.(jobApplication.id)
  }

  /**
   * Navigate to job application detail page.
   * Using router.push instead of Link to avoid nested anchor tags.
   * Prevents navigation when dragging to avoid unintended clicks.
   */
  const handleCardClick = () => {
    if (isDragging) return
    router.push(`/${locale}/dashboard/job-applications/${jobApplication.id}`)
  }

  /**
   * Handle keyboard interaction for accessibility.
   * - Enter: Navigate to card detail page
   * - Space: Open context menu
   * - Escape: Close context menu if open
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCardClick()
    } else if (e.key === ' ') {
      // Space opens context menu instead of navigating
      e.preventDefault()
      setShowMenu(true)
    } else if (e.key === 'Escape' && showMenu) {
      e.preventDefault()
      setShowMenu(false)
      // Return focus to the menu button
      menuButtonRef.current?.focus()
    }
  }

  /**
   * Handle keyboard navigation within the context menu.
   * - ArrowDown: Move to next menu item
   * - ArrowUp: Move to previous menu item
   * - Home: Move to first menu item
   * - End: Move to last menu item
   * - Escape: Close menu and return focus to trigger
   * - Enter/Space: Activate current item
   */
  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setMenuFocusIndex((prev) => {
          const next = prev < MENU_ITEM_COUNT - 1 ? prev + 1 : 0
          menuItemRefs.current[next]?.focus()
          return next
        })
        break
      case 'ArrowUp':
        e.preventDefault()
        setMenuFocusIndex((prev) => {
          const next = prev > 0 ? prev - 1 : MENU_ITEM_COUNT - 1
          menuItemRefs.current[next]?.focus()
          return next
        })
        break
      case 'Home':
        e.preventDefault()
        setMenuFocusIndex(0)
        menuItemRefs.current[0]?.focus()
        break
      case 'End':
        e.preventDefault()
        setMenuFocusIndex(MENU_ITEM_COUNT - 1)
        menuItemRefs.current[MENU_ITEM_COUNT - 1]?.focus()
        break
      case 'Escape':
        e.preventDefault()
        setShowMenu(false)
        menuButtonRef.current?.focus()
        break
      case 'Tab':
        // Close menu on Tab to allow natural focus flow
        setShowMenu(false)
        break
    }
  }, [])

  /**
   * Handle focus event to sync with keyboard navigation state.
   */
  const handleFocus = () => {
    onFocus?.(jobApplication.id)
  }

  // Tooltip should be disabled during drag operations to avoid interference
  const isTooltipDisabled = isDragging || isDragOverlay

  /**
   * Merge refs for dnd-kit, local focus, and keyboard navigation registry.
   * This allows draggable behavior, local focus, and board-level keyboard navigation.
   */
  const mergeRefs = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el)
      cardRef.current = el
      // Register with keyboard navigation system
      registerCardRef?.(jobApplication.id, el)
    },
    [setNodeRef, registerCardRef, jobApplication.id]
  )

  // Cleanup ref registration on unmount
  useEffect(() => {
    return () => {
      registerCardRef?.(jobApplication.id, null)
    }
  }, [registerCardRef, jobApplication.id])

  const cardElement = (
    <div
      ref={mergeRefs}
      style={style}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      role="button"
      tabIndex={0}
      aria-label={`${jobApplication.job_title} at ${jobApplication.company_name}`}
      className={cn(
        'relative block bg-white dark:bg-slate-800',
        'border border-slate-200 dark:border-slate-700',
        'rounded-lg',
        // Mobile: larger padding for better touch targets, Desktop: standard padding
        isMobile ? 'p-4' : 'p-3',
        'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 hover:-translate-y-0.5',
        'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
        'transition-all duration-200 cursor-pointer',
        'touch-none', // Prevents touch scrolling interference during drag
        isDragOverlay && 'shadow-lg ring-2 ring-teal-500/50' // Enhanced styling for drag overlay
      )}
    >
      {/* Drag handle and job title row */}
      <div className="flex items-start gap-2">
        {/* Drag handle - only shown when not in drag overlay */}
        {/* Mobile: 44px minimum touch target, Desktop: compact */}
        {!isDragOverlay && (
          <button
            type="button"
            className={cn(
              'flex-shrink-0 rounded flex items-center justify-center',
              'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1',
              'transition-colors',
              isDragging ? 'cursor-grabbing' : 'cursor-grab',
              // Mobile: 44px touch target, Desktop: compact
              isMobile ? 'min-h-[44px] min-w-[44px] -ml-2 -mt-2' : 'p-0.5 -ml-1 -mt-0.5'
            )}
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()} // Prevent card click when using handle
            aria-label={cardDict.dragToMove || 'Drag to move'}
          >
            <GripVertical className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
          </button>
        )}

        {/* Job title */}
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate flex-1 min-w-0">
          {jobApplication.job_title}
        </h4>

        {/* Context menu button - hidden during drag and in drag overlay */}
        {/* Mobile: 44px minimum touch target, Desktop: compact */}
        {!isDragOverlay && !isDragging && (
          <button
            ref={menuButtonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className={cn(
              'flex-shrink-0 rounded ml-auto flex items-center justify-center',
              'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1',
              'transition-colors',
              // Mobile: 44px touch target, Desktop: compact
              isMobile ? 'min-h-[44px] min-w-[44px] -mr-2 -mt-2' : 'p-0.5 -mr-1 -mt-0.5'
            )}
            aria-label={cardDict.moreActions || 'More actions'}
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            <MoreVertical className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
          </button>
        )}
      </div>

      {/* Context menu dropdown */}
      {/* Mobile: larger touch targets with py-3 (48px height), Desktop: compact */}
      {showMenu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={cardDict.menuLabel || 'Job application actions'}
          className={cn(
            'absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50',
            'animate-in fade-in-0 zoom-in-95 duration-150 origin-top-right',
            isMobile ? 'w-56' : 'w-48'
          )}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleMenuKeyDown}
        >
          <Link
            ref={(el) => { menuItemRefs.current[0] = el }}
            href={`/${locale}/dashboard/job-applications/${jobApplication.id}`}
            role="menuitem"
            tabIndex={menuFocusIndex === 0 ? 0 : -1}
            className={cn(
              'flex items-center gap-2 px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 focus:bg-slate-100 dark:focus:bg-slate-700 focus:outline-none',
              isMobile ? 'py-3' : 'py-2'
            )}
            onClick={() => setShowMenu(false)}
          >
            <Pencil className="h-4 w-4" />
            {cardDict.edit || 'Edit'}
          </Link>
          <Link
            ref={(el) => { menuItemRefs.current[1] = el }}
            href={`/${locale}/dashboard/resumes/new?jobApplicationId=${jobApplication.id}`}
            role="menuitem"
            tabIndex={menuFocusIndex === 1 ? 0 : -1}
            className={cn(
              'flex items-center gap-2 px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 focus:bg-slate-100 dark:focus:bg-slate-700 focus:outline-none',
              isMobile ? 'py-3' : 'py-2'
            )}
            onClick={() => setShowMenu(false)}
          >
            <FileText className="h-4 w-4" />
            {cardDict.createCV || 'Create CV for this Job'}
          </Link>
          <Link
            ref={(el) => { menuItemRefs.current[2] = el }}
            href={`/${locale}/dashboard/cover-letters/new?jobApplicationId=${jobApplication.id}`}
            role="menuitem"
            tabIndex={menuFocusIndex === 2 ? 0 : -1}
            className={cn(
              'flex items-center gap-2 px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 focus:bg-slate-100 dark:focus:bg-slate-700 focus:outline-none',
              isMobile ? 'py-3' : 'py-2'
            )}
            onClick={() => setShowMenu(false)}
          >
            <Mail className="h-4 w-4" />
            {cardDict.createCoverLetter || 'Create Cover Letter'}
          </Link>
          <button
            ref={(el) => { menuItemRefs.current[3] = el }}
            onClick={handleDelete}
            disabled={isDeleting}
            role="menuitem"
            tabIndex={menuFocusIndex === 3 ? 0 : -1}
            className={cn(
              'flex items-center gap-2 px-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20 focus:outline-none w-full',
              isMobile ? 'py-3' : 'py-2'
            )}
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? (cardDict.deleting || 'Deleting...') : (cardDict.delete || 'Delete')}
          </button>
        </div>
      )}

      {/* Company name */}
      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
        {jobApplication.company_name}
      </p>

      {/* Location (optional) */}
      {jobApplication.location && (
        <div className="flex items-center gap-1 mt-1 text-xs text-slate-400 dark:text-slate-500">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{jobApplication.location}</span>
        </div>
      )}

      {/* Linked entities badges */}
      {(jobApplication.resume || jobApplication.cover_letter) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {jobApplication.resume && (
            <ResumeLinkBadge
              resumeTitle={jobApplication.resume.title}
              href={`/${locale}/dashboard/resumes/${jobApplication.resume.id}/edit`}
              dict={dict}
            />
          )}
          {jobApplication.cover_letter && (
            <CoverLetterLinkBadge
              count={1}
              href={`/${locale}/dashboard/cover-letters/${jobApplication.cover_letter.id}/edit`}
              dict={dict}
            />
          )}
        </div>
      )}

      {/* Status badge and date row */}
      <div className="flex items-center justify-between mt-2">
        <span
          className={cn(
            'text-xs px-1.5 py-0.5 rounded',
            statusConfig.bgColor,
            statusConfig.textColor
          )}
        >
          {getStatusLabel()}
        </span>
        <span className="text-xs text-slate-400">
          {formatDate(displayDate)}
        </span>
      </div>
    </div>
  )

  // When dragging or in drag overlay, render card without tooltip
  if (isTooltipDisabled) {
    return cardElement
  }

  // Wrap card with tooltip for hover preview
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        {cardElement}
      </TooltipTrigger>
      <TooltipContent side="right" align="start">
        <KanbanCardPreview
          jobApplication={jobApplication}
          locale={locale}
          dict={dict}
        />
      </TooltipContent>
    </Tooltip>
  )
}
