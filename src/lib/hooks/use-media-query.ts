'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * SSR-safe hook to track media query matches.
 *
 * Uses useSyncExternalStore for proper SSR hydration without
 * causing cascading renders. Returns false on server and during
 * initial hydration to prevent hydration mismatches.
 *
 * @param query - CSS media query string (e.g., '(max-width: 768px)')
 * @returns boolean indicating if the media query matches
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 768px)')
 * const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)')
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const mediaQueryList = window.matchMedia(query)
      mediaQueryList.addEventListener('change', callback)
      return () => mediaQueryList.removeEventListener('change', callback)
    },
    [query]
  )

  const getSnapshot = useCallback(() => {
    return window.matchMedia(query).matches
  }, [query])

  // Server snapshot always returns false to avoid hydration mismatch
  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Common breakpoint queries matching Tailwind CSS defaults
 */
export const BREAKPOINTS = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
} as const

/**
 * Hook that returns true when viewport is below the md breakpoint (768px).
 * Commonly used for mobile-specific layouts.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}

/**
 * Hook that returns true when viewport is at or above the md breakpoint.
 * Commonly used for desktop-specific layouts.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(BREAKPOINTS.md)
}
