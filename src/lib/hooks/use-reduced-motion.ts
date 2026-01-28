'use client'

import { useMediaQuery } from './use-media-query'

/**
 * Hook that returns true when the user prefers reduced motion.
 *
 * Uses the `prefers-reduced-motion` media query to detect user preference.
 * This allows components to conditionally disable or simplify animations
 * to respect accessibility settings.
 *
 * Returns false on server and during initial hydration to prevent
 * hydration mismatches, then syncs with actual user preference.
 *
 * @returns boolean indicating if reduced motion is preferred
 *
 * @example
 * const prefersReducedMotion = useReducedMotion()
 * const animationClass = prefersReducedMotion ? '' : 'animate-in fade-in'
 */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
