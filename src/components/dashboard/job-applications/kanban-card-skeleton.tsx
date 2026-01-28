'use client'

/**
 * Skeleton placeholder for a Kanban card during loading state.
 * Matches exact dimensions of KanbanCard component.
 */
export function KanbanCardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
      {/* Title skeleton */}
      <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />

      {/* Company skeleton */}
      <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-2" />

      {/* Location skeleton */}
      <div className="h-3 w-2/5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-2" />

      {/* Badges skeleton */}
      <div className="flex gap-1.5 mt-2">
        <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
        <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
      </div>

      {/* Status + date row skeleton */}
      <div className="flex items-center justify-between mt-2">
        <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>
    </div>
  )
}
