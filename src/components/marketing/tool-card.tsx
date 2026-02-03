import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ToolCardProps {
  /** Lucide icon component to display at the top of the card */
  icon: LucideIcon
  /** Title of the tool */
  title: string
  /** Brief description of what the tool does */
  description: string
  /** Navigation destination when card is clicked */
  href: string
  /** Text for the CTA button */
  ctaText: string
  /** Optional additional CSS classes */
  className?: string
}

/**
 * A clickable card component for displaying career tools on the Tools page.
 * Two-panel layout: left panel with tool info, right panel with preview image.
 * Panels stack vertically on mobile, horizontally on desktop.
 */
export function ToolCard({
  icon: Icon,
  title,
  description,
  href,
  ctaText,
  className,
}: ToolCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        // Base styles - flex-col by default (mobile), md:flex-row (desktop)
        'group flex flex-col md:flex-row rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden',
        // Hover states: subtle shadow increase and border color change
        'hover:shadow-md hover:border-gray-300',
        // Focus states: visible ring for accessibility
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        // Smooth transitions
        'transition-shadow duration-200 ease-in-out',
        className
      )}
    >
      {/* Left Panel - Tool Info (~40% width on desktop) */}
      <div className="flex flex-col gap-4 p-6 md:w-2/5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-50 p-3">
          <Icon className="h-6 w-6 text-teal-600" />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <p className="text-sm leading-relaxed text-gray-600">{description}</p>
        </div>
        <Button
          className="mt-2 w-fit min-h-11 bg-teal-600 hover:bg-teal-700 text-white"
          size="sm"
        >
          {ctaText}
        </Button>
      </div>

      {/* Right Panel - Placeholder for live preview component */}
      <div className="relative aspect-video md:aspect-auto md:h-auto md:w-3/5 bg-gray-100 rounded-b-lg md:rounded-b-none md:rounded-r-lg" />
    </Link>
  )
}
