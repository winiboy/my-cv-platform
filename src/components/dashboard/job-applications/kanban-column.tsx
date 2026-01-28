'use client'

import { useEffect, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Inbox, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import type { JobApplicationWithRelations, JobStatus } from '@/types/database'
import type { ColumnSortOption } from '@/types/filters'
import { KanbanCard } from './kanban-card'
import { ColumnSortDropdown } from './column-sort-dropdown'
import { AnimatedCountBadge } from './animated-count-badge'
import { cn } from '@/lib/utils'

/** Delay in ms before auto-expanding a collapsed column on drag hover */
const AUTO_EXPAND_DELAY_MS = 500

interface KanbanColumnProps {
  status: JobStatus
  applications: JobApplicationWithRelations[]
  locale: string
  statusConfig: { bgColor: string; textColor: string; label: string }
  dict: Record<string, unknown>
  onDelete?: (id: string) => void
  sortOption: ColumnSortOption
  onSortChange: (sortOption: ColumnSortOption) => void
  /** ID of the currently focused card (for keyboard navigation) */
  focusedCardId?: string | null
  /** Callback when a card receives focus */
  onCardFocus?: (id: string) => void
  /** Register card ref for keyboard navigation focus */
  registerCardRef?: (id: string, el: HTMLDivElement | null) => void
  /** Whether the viewport is mobile-sized */
  isMobile?: boolean
  /** Callback to open quick add modal for this column's status */
  onQuickAdd?: (status: JobStatus) => void
  /** Whether the column is collapsed (desktop only) */
  isCollapsed?: boolean
  /** Callback to toggle column collapse state */
  onToggleCollapse?: () => void
}

/**
 * KanbanColumn displays a single column in the Kanban board.
 * Each column represents a job application status and contains
 * cards for applications in that status.
 */
export function KanbanColumn({
  status,
  applications,
  locale,
  statusConfig,
  dict,
  onDelete,
  sortOption,
  onSortChange,
  focusedCardId,
  onCardFocus,
  registerCardRef,
  isMobile = false,
  onQuickAdd,
  isCollapsed = false,
  onToggleCollapse,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  })

  const count = applications.length

  // Auto-expand timer ref for drag hover
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Extract translations
  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const quickAddDict = (kanbanDict.quickAdd || {}) as Record<string, string>
  const columnDict = (kanbanDict.column || {}) as Record<string, string>

  // Auto-expand collapsed column when dragging over it
  useEffect(() => {
    if (isCollapsed && isOver && onToggleCollapse) {
      autoExpandTimerRef.current = setTimeout(() => {
        onToggleCollapse()
      }, AUTO_EXPAND_DELAY_MS)
    }

    return () => {
      if (autoExpandTimerRef.current) {
        clearTimeout(autoExpandTimerRef.current)
        autoExpandTimerRef.current = null
      }
    }
  }, [isCollapsed, isOver, onToggleCollapse])

  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Collapsed column render
  if (isCollapsed) {
    return (
      <div
        ref={setNodeRef}
        role="group"
        aria-label={statusConfig.label}
        className={cn(
          'shrink-0 flex flex-col border-2 rounded-lg',
          'w-14 min-w-14',
          prefersReducedMotion
            ? ''
            : 'transition-all duration-300 ease-in-out',
          isOver
            ? 'border-teal-500 bg-teal-50/30 dark:bg-teal-900/30'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50'
        )}
        data-status={status}
        data-collapsed="true"
      >
        {/* Collapsed header with count */}
        <div className="flex flex-col items-center py-3 px-1 border-b border-slate-200 dark:border-slate-700">
          <AnimatedCountBadge
            count={count}
            variant="secondary"
            className="text-xs mb-2"
          />
          {/* Expand button */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'flex items-center justify-center rounded-md p-1.5',
              'text-slate-500 hover:text-teal-600 dark:hover:text-teal-400',
              'hover:bg-slate-100 dark:hover:bg-slate-700',
              'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1',
              prefersReducedMotion ? '' : 'transition-colors'
            )}
            aria-label={columnDict.expand || 'Expand column'}
            aria-expanded="false"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Vertical status label */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            'flex-1 flex items-center justify-center py-4 cursor-pointer',
            'hover:bg-slate-100/50 dark:hover:bg-slate-700/50',
            prefersReducedMotion ? '' : 'transition-colors'
          )}
          aria-label={`${columnDict.expand || 'Expand column'}: ${statusConfig.label}`}
        >
          <span
            className={cn(
              'text-sm font-medium whitespace-nowrap',
              statusConfig.textColor
            )}
            style={{
              writingMode: 'vertical-lr',
              transform: 'rotate(180deg)',
            }}
          >
            {statusConfig.label}
          </span>
        </button>
      </div>
    )
  }

  // Expanded column render
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={statusConfig.label}
      className={cn(
        'shrink-0 flex flex-col border-2 border-transparent rounded-lg',
        prefersReducedMotion
          ? 'transition-colors duration-200'
          : 'transition-all duration-300 ease-in-out',
        // Mobile: 85vw width to show partial next column, Desktop: fixed 288px
        isMobile ? 'w-[85vw] min-w-[85vw] snap-start' : 'w-72 min-w-72',
        isOver && 'border-teal-500 bg-teal-50/10 dark:bg-teal-900/10'
      )}
      data-status={status}
      data-collapsed="false"
    >
      {/* Column header with status label, quick add, sort, count, and collapse toggle */}
      {/* Mobile: sticky header for visibility while scrolling cards */}
      <div
        className={cn(
          'flex items-center justify-between mb-3 px-1',
          isMobile && 'sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 py-2 -my-2'
        )}
      >
        <div className="flex items-center gap-2">
          {/* Collapse button (desktop only) */}
          {!isMobile && onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={cn(
                'flex items-center justify-center rounded-md h-7 w-7',
                'text-slate-400 hover:text-teal-600 dark:hover:text-teal-400',
                'hover:bg-slate-100 dark:hover:bg-slate-700',
                'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1',
                prefersReducedMotion ? '' : 'transition-colors'
              )}
              aria-label={columnDict.collapse || 'Collapse column'}
              aria-expanded="true"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <span
            className={cn(
              'px-2 py-1 text-sm font-medium rounded',
              statusConfig.bgColor,
              statusConfig.textColor
            )}
          >
            {statusConfig.label}
          </span>
          {/* Quick Add button */}
          {onQuickAdd && (
            <button
              type="button"
              onClick={() => onQuickAdd(status)}
              className={cn(
                'flex items-center justify-center rounded-md',
                'text-slate-400 hover:text-teal-600 dark:hover:text-teal-400',
                'hover:bg-slate-100 dark:hover:bg-slate-700',
                'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1',
                prefersReducedMotion ? '' : 'transition-colors',
                // Mobile: 44px touch target for accessibility
                isMobile ? 'min-h-[44px] min-w-[44px]' : 'h-7 w-7'
              )}
              aria-label={
                (quickAddDict.addToColumn || 'Add job to {status}').replace(
                  '{status}',
                  statusConfig.label
                )
              }
            >
              <Plus className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ColumnSortDropdown
            sortOption={sortOption}
            onSortChange={onSortChange}
            dict={dict}
          />
          <AnimatedCountBadge count={count} variant="secondary" className="text-xs" />
        </div>
      </div>

      {/* Cards area */}
      {/* Mobile: scrollable with max height, Desktop: grows naturally */}
      <div
        className={cn(
          'flex flex-col gap-3 flex-1 min-h-[200px]',
          isMobile && 'overflow-y-auto max-h-[60vh] overscroll-y-contain'
        )}
      >
        {count === 0 ? (
          <div
            className={cn(
              'flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg gap-2 transition-colors duration-200',
              isOver
                ? 'border-teal-500 bg-teal-50/20 dark:bg-teal-900/20'
                : 'border-slate-200 dark:border-slate-700'
            )}
          >
            <Inbox className="h-5 w-5 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-400 dark:text-slate-500">
              {isOver
                ? (((dict.kanban as Record<string, unknown>)?.column as Record<string, string>)?.dropHere ?? 'Drop here')
                : (((dict.kanban as Record<string, unknown>)?.column as Record<string, string>)?.noApplications ?? 'No applications')}
            </p>
          </div>
        ) : (
          applications.map((application) => (
            <KanbanCard
              key={application.id}
              jobApplication={application}
              locale={locale}
              dict={dict}
              onDelete={onDelete}
              isFocused={focusedCardId === application.id}
              onFocus={onCardFocus}
              registerCardRef={registerCardRef}
              isMobile={isMobile}
            />
          ))
        )}
      </div>
    </div>
  )
}
