'use client'

import type { CSSProperties } from 'react'
import { Shrink, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CoverLetterZoomLabels {
  /** The group's accessible name. */
  group: string
  zoomOut: string
  zoomIn: string
  showAll: string
  /** The announcement of a new level, with a `{percent}` placeholder. */
  level: string
}

export interface ZoomAnnouncement {
  percent: number
  id: number
}

interface CoverLetterZoomControlsProps {
  /** The current zoom, as the whole percentage shown. */
  percent: number
  /**
   * The level to announce, set when the user presses a control; `null`
   * until then. Kept apart from `percent` so a refit after a resize is
   * shown but not spoken. Each press has its own `id`, so a press that
   * leaves the level as it was is announced again.
   */
  announcement: ZoomAnnouncement | null
  canZoomIn: boolean
  canZoomOut: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onShowAll: () => void
  labels: CoverLetterZoomLabels
  className?: string
  /** Placement over the scroll area, which depends on its scrollbars. */
  style?: CSSProperties
}

interface ZoomButtonProps {
  icon: LucideIcon
  label: string
  disabled?: boolean
  onClick: () => void
}

/**
 * A bound disables its button with `aria-disabled` rather than `disabled`, so a
 * keyboard user pressing it to the bound keeps focus on it instead of losing
 * focus to the page.
 */
function ZoomButton({ icon: Icon, label, disabled = false, onClick }: ZoomButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={cn(
        // 32px for a mouse; 44px where the pointer is a finger.
        'flex h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-full',
        'text-slate-700 dark:text-slate-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
        'transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-40'
          : 'hover:bg-slate-100 dark:hover:bg-slate-700'
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

/**
 * The letter preview's zoom controls (cover-letter-preview-and-card-language,
 * US-002, FR-2): one component, used by both the editor's pane and the preview
 * window. It holds no zoom state of its own; each preview owns its level.
 */
export function CoverLetterZoomControls({
  percent,
  announcement,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onShowAll,
  labels,
  className,
  style,
}: CoverLetterZoomControlsProps) {
  return (
    <div
      role="group"
      aria-label={labels.group}
      data-testid="cover-letter-zoom-controls"
      style={style}
      className={cn(
        'flex items-center gap-0.5 rounded-full p-1',
        'border border-slate-200 bg-white/95 shadow-md dark:border-slate-600 dark:bg-slate-800/95',
        className
      )}
    >
      <ZoomButton icon={ZoomOut} label={labels.zoomOut} disabled={!canZoomOut} onClick={onZoomOut} />
      {/*
        The current level, always: shown as a bare percentage, and read out in
        full ("Zoom level: 63%") from the group, whether or not anything has
        been announced yet.
      */}
      <span className="min-w-[3rem] text-center text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">
        <span aria-hidden="true" data-testid="cover-letter-zoom-percent">
          {percent}%
        </span>
        <span className="sr-only" data-testid="cover-letter-zoom-level">
          {labels.level.replace('{percent}', String(percent))}
        </span>
      </span>
      {/*
        Announcements only, after a press. The keyed child is replaced on every
        press, so the region changes, and is spoken, even when the text is the
        same as the last one.
      */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement !== null && (
          <span key={announcement.id}>{labels.level.replace('{percent}', String(announcement.percent))}</span>
        )}
      </span>
      <ZoomButton icon={ZoomIn} label={labels.zoomIn} disabled={!canZoomIn} onClick={onZoomIn} />
      <ZoomButton icon={Shrink} label={labels.showAll} onClick={onShowAll} />
    </div>
  )
}
