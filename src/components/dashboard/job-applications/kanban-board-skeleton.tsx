'use client'

import { KanbanColumnSkeleton } from './kanban-column-skeleton'

/**
 * Skeleton placeholder for the entire Kanban board during loading state.
 * Renders 7 column skeletons matching the real board structure.
 */
export function KanbanBoardSkeleton() {
  // 7 columns to match the 7 job statuses
  const columns = Array.from({ length: 7 }, (_, i) => i)

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-4 min-w-max pb-4">
        {columns.map((index) => (
          <KanbanColumnSkeleton key={index} />
        ))}
      </div>
    </div>
  )
}
