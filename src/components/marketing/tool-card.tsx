import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolCardProps {
  /** Lucide icon component to display at the top of the card */
  icon: LucideIcon
  /** Title of the tool */
  title: string
  /** Brief description of what the tool does */
  description: string
  /** Navigation destination when card is clicked */
  href: string
  /** Optional additional CSS classes */
  className?: string
}

/**
 * A clickable card component for displaying career tools on the Tools page.
 * The entire card acts as a navigation link.
 */
export function ToolCard({
  icon: Icon,
  title,
  description,
  href,
  className,
}: ToolCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        // Base styles
        'group flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm',
        // Hover states: shadow elevation, scale, border color, cursor
        'hover:border-teal-300 hover:shadow-md hover:scale-[1.02] cursor-pointer',
        // Focus states: visible ring for accessibility
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        // Smooth transitions
        'transition-all duration-200 ease-in-out',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm transition-transform group-hover:scale-105">
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
    </Link>
  )
}
