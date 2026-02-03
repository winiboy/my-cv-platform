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
  /** Optional preview component to render in the right panel */
  preview?: React.ReactNode
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
  preview,
  className,
}: ToolCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        // Base styles - flex-col by default (mobile), md:flex-row (desktop)
        'group flex flex-col md:flex-row rounded-xl border border-gray-200 bg-white shadow-sm',
        // Hover states: subtle shadow increase and border color change
        'hover:shadow-lg hover:border-gray-300',
        // Focus states: visible ring for accessibility
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        // Smooth transitions
        'transition-all duration-200 ease-in-out',
        // Prevent content overflow
        'overflow-hidden',
        className
      )}
    >
      {/* Left Panel - Tool Info (~40% width on desktop) */}
      <div className="flex flex-col justify-center gap-4 p-6 md:p-8 md:w-2/5">
        {/* Icon badge with subtle shadow */}
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 shadow-sm">
          <Icon className="h-6 w-6 text-teal-600" />
        </div>

        {/* Title and description */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-semibold tracking-tight text-gray-900 group-hover:text-teal-700 transition-colors">
            {title}
          </h3>
          <p className="text-sm leading-relaxed text-gray-600 line-clamp-3">
            {description}
          </p>
        </div>

        {/* CTA Button */}
        <Button
          className="mt-2 w-fit min-h-11 bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
          size="sm"
        >
          {ctaText}
        </Button>
      </div>

      {/* Right Panel - Preview component with subtle background */}
      <div className="relative md:w-3/5 bg-gray-50 overflow-hidden">
        {/* Fixed aspect ratio container for mobile, flexible height for desktop */}
        <div className="aspect-video md:aspect-auto md:h-full md:min-h-[280px] flex items-center justify-center p-4 md:p-6">
          {preview && (
            <div className="w-full max-w-sm transform scale-90 md:scale-95 origin-center">
              {preview}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
