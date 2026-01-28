'use client'

import { KanbanCardSkeleton } from './kanban-card-skeleton'

/**
 * Skeleton placeholder for a Kanban column during loading state.
 * Matches exact dimensions of KanbanColumn component.
 */
export function KanbanColumnSkeleton() {
  return (
    <div className="w-72 min-w-72 shrink-0 flex flex-col">
      {/* Column header skeleton */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-5 w-8 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
      </div>

      {/* Cards area - 3 placeholder cards */}
      <div className="flex flex-col gap-3 flex-1 min-h-[200px]">
        <KanbanCardSkeleton />
        <KanbanCardSkeleton />
        <KanbanCardSkeleton />
      </div>
    </div>
  )
}
