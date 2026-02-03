import Link from 'next/link'
import Image from 'next/image'
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
  /** Path to the preview image for the right panel */
  imagePath: string
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
  imagePath,
  ctaText,
  className,
}: ToolCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        // Base styles - flex-col by default (mobile), md:flex-row (desktop)
        'group flex flex-col md:flex-row rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden',
        // Hover states: shadow elevation, scale, border color, cursor
        'hover:border-teal-300 hover:shadow-md hover:scale-[1.02] cursor-pointer',
        // Focus states: visible ring for accessibility
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        // Smooth transitions
        'transition-all duration-200 ease-in-out',
        className
      )}
    >
      {/* Left Panel - Tool Info (~40% width on desktop) */}
      <div className="flex flex-col gap-4 p-6 md:w-2/5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm transition-transform group-hover:scale-105">
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
          <p className="text-sm leading-relaxed text-slate-600">{description}</p>
        </div>
        <Button
          className="mt-2 w-fit bg-teal-600 hover:bg-teal-700 text-white"
          size="sm"
        >
          {ctaText}
        </Button>
      </div>

      {/* Right Panel - Preview Image (~60% width on desktop) */}
      <div className="relative h-48 md:h-auto md:w-3/5 bg-slate-100">
        <Image
          src={imagePath}
          alt={`${title} preview`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 60vw"
        />
      </div>
    </Link>
  )
}
