'use client'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface AnimatedCountBadgeProps extends Omit<BadgeProps, 'children'> {
  /** The current count to display */
  count: number
}

/**
 * Badge component that animates when the count changes.
 *
 * Displays a pulse/scale animation when the count increases or decreases,
 * providing visual feedback when items are added to or removed from a column.
 *
 * Uses React key prop with the count value to trigger remount and fresh animation
 * each time the count changes. This approach is React-compliant and avoids
 * setState-in-effect or ref-during-render anti-patterns.
 *
 * The animation respects prefers-reduced-motion via CSS media query in globals.css.
 *
 * @example
 * <AnimatedCountBadge count={applications.length} variant="secondary" />
 */
export function AnimatedCountBadge({
  count,
  className,
  ...props
}: AnimatedCountBadgeProps) {
  // Using count as key causes remount on count change, triggering animate-in
  return (
    <Badge
      key={count}
      className={cn(
        'animate-in zoom-in-75 duration-300',
        className
      )}
      {...props}
    >
      {count}
    </Badge>
  )
}
