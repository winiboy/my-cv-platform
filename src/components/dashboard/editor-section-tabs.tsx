'use client'

import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'

/** One section of an editor's nav. */
export interface EditorSectionTab<Id extends string> {
  id: Id
  label: string
  icon: LucideIcon
  /** Marks a section with unsaved edits; the resume editor is the only one that tracks them. */
  isModified?: boolean
}

interface EditorSectionTabsProps<Id extends string> {
  tabs: readonly EditorSectionTab<Id>[]
  activeId: Id
  onSelect: (id: Id) => void
  /** The list's padding at `xl`, where it is a vertical column. */
  xlPadding: 'xl:p-2' | 'xl:p-4'
  /**
   * Classes an editor appends to the shared tab classes, for its own look at
   * `xl` or in dark mode; the light strip below `xl` is the shared one, so
   * they carry an `xl:` or `dark:` variant.
   */
  tabClassName?: string
  activeTabClassName?: string
  inactiveTabClassName?: string
}

/** Joins a shared class list and an editor's optional additions. */
function withExtra(base: string, extra: string | undefined): string {
  return extra ? `${base} ${extra}` : base
}

/**
 * The section nav of the resume and cover letter editors: a horizontally
 * scrolling tab strip below `xl` (1280px), a vertical list from `xl` up.
 *
 * Below xl the strip scrolls sideways without a scrollbar; the right-edge
 * fade signals more tabs, and the end padding lets the last tab clear it.
 */
export function EditorSectionTabs<Id extends string>({
  tabs,
  activeId,
  onSelect,
  xlPadding,
  tabClassName,
  activeTabClassName,
  inactiveTabClassName,
}: EditorSectionTabsProps<Id>) {
  const navRef = useRef<HTMLElement>(null)

  // Keep the active tab visible in the horizontally scrolling strip. Only the
  // strip itself is scrolled: scrollIntoView would also scroll the page, and
  // on the vertical (xl) list there is nothing to scroll at all.
  useEffect(() => {
    const nav = navRef.current
    if (!nav || nav.scrollWidth <= nav.clientWidth) return
    const active = nav.querySelector<HTMLElement>('[aria-current="true"]')
    if (!active) return

    const navRect = nav.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    // The strip's end padding is covered by the fade, so keep the tab clear of it.
    const visibleRight = navRect.right - parseFloat(window.getComputedStyle(nav).paddingRight)

    if (activeRect.left < navRect.left) {
      nav.scrollLeft -= navRect.left - activeRect.left
    } else if (activeRect.right > visibleRight) {
      nav.scrollLeft += activeRect.right - visibleRight
    }
  }, [activeId])

  const tabBaseClassName = withExtra(
    'relative flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors xl:min-h-0 xl:w-full xl:whitespace-normal',
    tabClassName
  )
  const activeClassName = withExtra('bg-teal-100 text-teal-900', activeTabClassName)
  const inactiveClassName = withExtra(
    'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
    inactiveTabClassName
  )

  return (
    <nav
      ref={navRef}
      className={`flex gap-1 overflow-x-auto p-2 pr-8 [mask-image:linear-gradient(to_left,transparent,black_2rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:block xl:space-y-1 xl:overflow-visible ${xlPadding} xl:[mask-image:none]`}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeId === tab.id
        const isModified = tab.isModified === true

        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            aria-current={isActive ? 'true' : undefined}
            className={`${tabBaseClassName} ${
              isActive ? activeClassName : inactiveClassName
            } ${isModified ? 'border-l-4 border-amber-500 pl-2' : ''}`}
          >
            {isModified && (
              <span className="absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-amber-500"></span>
            )}
            <Icon className={`h-4 w-4 ${isModified ? 'ml-3' : ''}`} />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
