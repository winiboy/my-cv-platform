'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  defaultDropAnimationSideEffects,
  type DragStartEvent,
  type DragEndEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import type { JobApplicationWithRelations, JobStatus } from '@/types/database'
import { type ColumnSortOption, DEFAULT_COLUMN_SORT } from '@/types/filters'
import { JOB_STATUS_CONFIG, JOB_STATUSES } from '@/lib/constants/job-statuses'
import { useToast } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useKanbanKeyboardNavigation } from '@/lib/hooks/use-kanban-keyboard-navigation'
import { useIsMobile } from '@/lib/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { QuickAddModal } from './quick-add-modal'

/** localStorage key for persisting collapsed column state */
const COLLAPSED_COLUMNS_STORAGE_KEY = 'kanban_collapsed_columns'

/**
 * Custom drop animation configuration for smooth card placement.
 * Uses 200ms ease-out for a snappy but elegant drop feel.
 */
const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.5',
      },
    },
  }),
  duration: 200,
  easing: 'ease-out',
}

interface KanbanBoardProps {
  jobApplications: JobApplicationWithRelations[]
  locale: string
  dict: Record<string, unknown>
}

/**
 * KanbanBoard displays job applications in a horizontal scrollable
 * board with columns for each status. Applications are grouped by
 * their current status and displayed in workflow order.
 *
 * Supports drag-and-drop between columns with optimistic updates
 * and automatic rollback on API failure.
 */
export function KanbanBoard({
  jobApplications,
  locale,
  dict,
}: KanbanBoardProps) {
  const toast = useToast()

  // Local state for optimistic updates during drag operations
  const [localApplications, setLocalApplications] = useState(jobApplications)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Quick Add modal state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)
  const [quickAddStatus, setQuickAddStatus] = useState<JobStatus>('saved')

  // Sort preferences per column - persists during session
  const [columnSortPreferences, setColumnSortPreferences] = useState<
    Record<JobStatus, ColumnSortOption>
  >(() => {
    // Initialize all columns with default sort
    const initial: Record<JobStatus, ColumnSortOption> = {} as Record<JobStatus, ColumnSortOption>
    for (const status of JOB_STATUSES) {
      initial[status] = DEFAULT_COLUMN_SORT
    }
    return initial
  })

  // Collapsed state per column - persisted to localStorage
  const [collapsedColumns, setCollapsedColumns] = useState<Record<JobStatus, boolean>>(() => {
    // Initialize all columns as expanded (not collapsed)
    const initial: Record<JobStatus, boolean> = {} as Record<JobStatus, boolean>
    for (const status of JOB_STATUSES) {
      initial[status] = false
    }
    return initial
  })

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_COLUMNS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>
        setCollapsedColumns((prev) => {
          const updated = { ...prev }
          for (const status of JOB_STATUSES) {
            if (typeof parsed[status] === 'boolean') {
              updated[status] = parsed[status]
            }
          }
          return updated
        })
      }
    } catch {
      // Ignore invalid localStorage data
    }
  }, [])

  // Persist collapsed state to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_COLUMNS_STORAGE_KEY, JSON.stringify(collapsedColumns))
    } catch {
      // Ignore storage errors (e.g., quota exceeded)
    }
  }, [collapsedColumns])

  // Sync local state when props change (e.g., from server refresh)
  useEffect(() => {
    setLocalApplications(jobApplications)
  }, [jobApplications])

  /**
   * Configure drag sensors with activation constraints
   * to prevent accidental drags and improve UX on touch devices.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags - requires 8px movement
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // 200ms delay before drag starts on touch
        tolerance: 5, // 5px tolerance during delay
      },
    }),
    useSensor(KeyboardSensor)
  )

  /**
   * Handle drag start - track which card is being dragged
   * for rendering in the DragOverlay.
   */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  /**
   * Handle drag end - update status via API with optimistic UI.
   * On failure, rollback to previous state and show error toast.
   */
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const draggedAppId = active.id as string
    const newStatus = over.id as JobStatus
    const draggedApp = localApplications.find(app => app.id === draggedAppId)

    // Exit early if no app found or status unchanged
    if (!draggedApp || draggedApp.status === newStatus) return

    // Store previous state for rollback on failure
    const previousApplications = [...localApplications]

    // Build optimistic update - auto-set applied_date when moving to 'applied'
    const updatedApp: JobApplicationWithRelations = {
      ...draggedApp,
      status: newStatus,
      applied_date: newStatus === 'applied' && !draggedApp.applied_date
        ? new Date().toISOString().split('T')[0]
        : draggedApp.applied_date,
    }

    // Apply optimistic update immediately for responsive UI
    setLocalApplications(apps =>
      apps.map(app => app.id === draggedAppId ? updatedApp : app)
    )

    // Persist change via API
    try {
      const response = await fetch(`/api/job-applications/${draggedAppId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }
    } catch {
      // Rollback optimistic update on failure
      setLocalApplications(previousApplications)
      toast.error('Failed to update status. Please try again.')
    }
  }, [localApplications, toast])

  /**
   * Handle drag cancel - reset active state without changes.
   */
  const handleDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  /**
   * Handle column sort preference change.
   * Updates the sort option for a specific column.
   */
  const handleColumnSortChange = useCallback(
    (status: JobStatus, sortOption: ColumnSortOption) => {
      setColumnSortPreferences((prev) => ({
        ...prev,
        [status]: sortOption,
      }))
    },
    []
  )

  /**
   * Handle application deletion with optimistic UI update.
   * Removes the application immediately and rolls back on API failure.
   */
  const handleDeleteApplication = useCallback(async (id: string) => {
    const previousApplications = [...localApplications]

    // Optimistic remove
    setLocalApplications(apps => apps.filter(app => app.id !== id))

    try {
      const response = await fetch(`/api/job-applications/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete')
    } catch {
      // Rollback on error
      setLocalApplications(previousApplications)
      toast.error('Failed to delete application. Please try again.')
    }
  }, [localApplications, toast])

  /**
   * Handle quick add button click - opens modal for the specified status.
   */
  const handleQuickAdd = useCallback((status: JobStatus) => {
    setQuickAddStatus(status)
    setIsQuickAddOpen(true)
  }, [])

  /**
   * Handle successful job application creation from quick add modal.
   * Performs optimistic update by adding the new application to local state.
   */
  const handleQuickAddSuccess = useCallback(
    (newApp: JobApplicationWithRelations) => {
      setLocalApplications((apps) => [newApp, ...apps])
      setIsQuickAddOpen(false)
    },
    []
  )

  /**
   * Handle quick add modal close.
   */
  const handleQuickAddClose = useCallback(() => {
    setIsQuickAddOpen(false)
  }, [])

  /**
   * Handle column collapse toggle.
   * Updates the collapsed state for a specific column.
   */
  const handleToggleCollapse = useCallback((status: JobStatus) => {
    setCollapsedColumns((prev) => ({
      ...prev,
      [status]: !prev[status],
    }))
  }, [])

  /**
   * Sort applications within a column based on sort option.
   * - 'recent': sort by updated_at DESC (most recent first)
   * - 'oldest': sort by updated_at ASC (oldest first)
   * - 'company_asc': sort by company_name A-Z
   * - 'company_desc': sort by company_name Z-A
   */
  const sortApplications = useCallback(
    (
      applications: JobApplicationWithRelations[],
      sortOption: ColumnSortOption
    ): JobApplicationWithRelations[] => {
      const sorted = [...applications]

      switch (sortOption) {
        case 'recent':
          sorted.sort((a, b) => {
            const dateA = a.updated_at || a.applied_date || a.created_at
            const dateB = b.updated_at || b.applied_date || b.created_at
            return new Date(dateB).getTime() - new Date(dateA).getTime()
          })
          break

        case 'oldest':
          sorted.sort((a, b) => {
            const dateA = a.updated_at || a.applied_date || a.created_at
            const dateB = b.updated_at || b.applied_date || b.created_at
            return new Date(dateA).getTime() - new Date(dateB).getTime()
          })
          break

        case 'company_asc':
          sorted.sort((a, b) =>
            a.company_name.toLowerCase().localeCompare(b.company_name.toLowerCase())
          )
          break

        case 'company_desc':
          sorted.sort((a, b) =>
            b.company_name.toLowerCase().localeCompare(a.company_name.toLowerCase())
          )
          break
      }

      return sorted
    },
    []
  )

  /**
   * Group applications by status and apply column-specific sorting.
   * Uses localApplications for optimistic updates during drag.
   */
  const applicationsByStatus = useMemo(() => {
    const grouped: Record<JobStatus, JobApplicationWithRelations[]> = {
      saved: [],
      applied: [],
      interviewing: [],
      offer: [],
      rejected: [],
      accepted: [],
      declined: [],
    }

    // Group applications by status
    for (const application of localApplications) {
      const status = application.status as JobStatus
      if (grouped[status]) {
        grouped[status].push(application)
      }
    }

    // Apply sorting to each column based on its sort preference
    for (const status of JOB_STATUSES) {
      grouped[status] = sortApplications(
        grouped[status],
        columnSortPreferences[status]
      )
    }

    return grouped
  }, [localApplications, columnSortPreferences, sortApplications])

  /**
   * Find the currently dragged application for DragOverlay rendering.
   * Returns null when no drag is active.
   */
  const activeApplication = activeId
    ? localApplications.find(app => app.id === activeId)
    : null

  /**
   * Keyboard navigation for the Kanban board.
   * Arrow keys navigate between cards, disabled during drag operations.
   */
  const {
    focusedCardId,
    handleBoardKeyDown,
    setFocusedCardId,
    resetFocus,
    registerCardRef,
  } = useKanbanKeyboardNavigation({
    applicationsByStatus,
    isDragActive: activeId !== null,
  })

  // Track mobile viewport for responsive layout
  const isMobile = useIsMobile()

  /**
   * Extended drag start handler that resets keyboard focus.
   */
  const handleDragStartWithReset = useCallback(
    (event: DragStartEvent) => {
      resetFocus()
      handleDragStart(event)
    },
    [resetFocus, handleDragStart]
  )

  return (
    <TooltipProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStartWithReset}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Board container with keyboard navigation */}
        {/* Mobile: horizontal scroll-snap, Desktop: standard horizontal scroll */}
        <div
          className={cn(
            'overflow-x-auto focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 rounded-lg',
            // Mobile: scroll-snap for better column navigation
            isMobile && 'snap-x snap-mandatory overscroll-x-contain px-4 -mx-4'
          )}
          role="region"
          aria-label={((dict.kanban as Record<string, unknown>)?.board as Record<string, string>)?.ariaLabel || 'Job applications board'}
          tabIndex={0}
          onKeyDown={handleBoardKeyDown}
        >
          <div
            className={cn(
              'flex min-w-max pb-4',
              // Mobile: tighter gap, Desktop: standard gap
              isMobile ? 'gap-2' : 'gap-4'
            )}
          >
            {JOB_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                applications={applicationsByStatus[status]}
                locale={locale}
                statusConfig={JOB_STATUS_CONFIG[status]}
                dict={dict}
                onDelete={handleDeleteApplication}
                sortOption={columnSortPreferences[status]}
                onSortChange={(sortOption) => handleColumnSortChange(status, sortOption)}
                focusedCardId={focusedCardId}
                onCardFocus={setFocusedCardId}
                registerCardRef={registerCardRef}
                isMobile={isMobile}
                onQuickAdd={handleQuickAdd}
                isCollapsed={!isMobile && collapsedColumns[status]}
                onToggleCollapse={() => handleToggleCollapse(status)}
              />
            ))}
          </div>
        </div>

        {/* Drag overlay renders the card that follows the cursor */}
        <DragOverlay dropAnimation={dropAnimation}>
          {activeApplication && (
            <KanbanCard
              jobApplication={activeApplication}
              locale={locale}
              dict={dict}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={handleQuickAddClose}
        onSuccess={handleQuickAddSuccess}
        initialStatus={quickAddStatus}
        locale={locale}
        dict={dict}
      />
    </TooltipProvider>
  )
}
