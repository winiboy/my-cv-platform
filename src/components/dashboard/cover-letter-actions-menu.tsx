'use client'

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Loader2, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BREAKPOINTS, useMediaQuery } from '@/lib/hooks/use-media-query'

/** One action of the menu. Its handler is the editor's, shared with the control it stands in for. */
export interface ActionsMenuItem {
  id: string
  /** The visible text, which is also the item's accessible name. */
  label: string
  /** Drawn before the label; decorative, the label names the item. */
  icon: ReactNode
  onSelect: () => void
  /** The item's own request is running: it is announced busy and cannot be chosen again. */
  busy?: boolean
  /** The item cannot be chosen, though its own request is not the one running. */
  unavailable?: boolean
  describedBy?: string
}

/** Items shown together, set apart from the others by a separator. */
export interface ActionsMenuGroup {
  id: string
  /** Names the group for assistive technology; the items' own labels say what they do. */
  label?: string
  items: readonly ActionsMenuItem[]
}

interface CoverLetterActionsMenuProps {
  /** The trigger's and the menu's accessible name. */
  label: string
  groups: readonly ActionsMenuGroup[]
  /** Lets the editor hand focus back to the trigger once a request it started ends. */
  triggerRef: RefObject<HTMLButtonElement | null>
  /** A request started from the menu is running; shown on the trigger, since the menu closes on a choice. */
  busy: boolean
  className?: string
}

/**
 * The cover letter editor's "•••" menu below `xl`: the header's secondary
 * actions, which do not fit beside the title on a small screen.
 *
 * The WAI-ARIA menu button pattern: the items are a roving tab stop, moved
 * with the arrow keys, Home and End; Escape closes the menu and Tab leaves
 * it, and in both cases focus goes back to the trigger.
 */
export function CoverLetterActionsMenu({ label, groups, triggerRef, busy, className }: CoverLetterActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  // The item that holds the tab stop, and the one focused once the menu opens.
  const [activeIndex, setActiveIndex] = useState(0)
  // The item to focus once the menu has rendered.
  const openIndexRef = useRef(0)
  const menuRef = useRef<HTMLDivElement>(null)
  // Outlives the closing it follows: the effect that set it is cleaned up by that very closing.
  const focusTimerRef = useRef<number | undefined>(undefined)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  const itemCount = groups.reduce((count, group) => count + group.items.length, 0)
  // Each group's first index in the menu's roving order.
  const groupStarts = groups.map((_, index) =>
    groups.slice(0, index).reduce((count, group) => count + group.items.length, 0)
  )

  const focusItem = useCallback((index: number) => {
    setActiveIndex(index)
    itemRefs.current[index]?.focus()
  }, [])

  const open = (index: number) => {
    openIndexRef.current = index
    setActiveIndex(index)
    setIsOpen(true)
  }

  const closeToTrigger = useCallback(() => {
    // Focus moves first: the focused item is removed with the menu, which
    // would otherwise drop focus to <body>.
    triggerRef.current?.focus()
    setIsOpen(false)
  }, [triggerRef])

  // Opening focuses the active item before the browser paints the menu.
  useLayoutEffect(() => {
    if (isOpen) itemRefs.current[openIndexRef.current]?.focus()
  }, [isOpen])

  // A press outside the menu and its trigger closes it. The focused item goes
  // with the menu, so focus is lost unless the press gave it to something
  // (a field the user pressed keeps it); only lost focus goes back to the
  // trigger, the editor's rule for its own buttons. The browser moves focus
  // after `pointerdown`, hence the timer.
  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setIsOpen(false)
      focusTimerRef.current = window.setTimeout(() => {
        const focusWasLost = document.activeElement === null || document.activeElement === document.body
        if (focusWasLost) triggerRef.current?.focus()
      }, 0)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen, triggerRef])

  useEffect(() => () => window.clearTimeout(focusTimerRef.current), [])

  // The menu exists below xl only. Widened past it, the menu closes, rather
  // than reappear open when the window is narrowed again. Adjusted while
  // rendering, as React advises for state that follows a changed value.
  const isWide = useMediaQuery(BREAKPOINTS.xl)
  const [wasWide, setWasWide] = useState(isWide)
  if (isWide !== wasWide) {
    setWasWide(isWide)
    if (isWide) setIsOpen(false)
  }

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      open(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      open(itemCount - 1)
    }
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusItem(activeIndex < itemCount - 1 ? activeIndex + 1 : 0)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusItem(activeIndex > 0 ? activeIndex - 1 : itemCount - 1)
        break
      case 'Home':
        event.preventDefault()
        focusItem(0)
        break
      case 'End':
        event.preventDefault()
        focusItem(itemCount - 1)
        break
      case 'Escape':
        event.preventDefault()
        closeToTrigger()
        break
      case 'Tab':
        // Not prevented: Tab and Shift+Tab then move on from the trigger, as
        // if the menu had never been opened.
        closeToTrigger()
        break
    }
  }

  const choose = (item: ActionsMenuItem) => {
    // A busy or unavailable item is announced as such and does nothing, as
    // its desktop control does.
    if (item.busy || item.unavailable) return
    closeToTrigger()
    item.onSelect()
  }

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-busy={busy}
        onClick={() => (isOpen ? setIsOpen(false) : open(0))}
        onKeyDown={handleTriggerKeyDown}
        className="flex size-11 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {groups.map((group, groupIndex) => (
            <Fragment key={group.id}>
              {groupIndex > 0 && <div role="separator" className="my-1 border-t border-slate-200 dark:border-slate-700" />}
              <div role="group" aria-label={group.label}>
                {group.items.map((item, indexInGroup) => {
                  const index = groupStarts[groupIndex] + indexInGroup
                  return (
                    <button
                      key={item.id}
                      ref={(element) => {
                        itemRefs.current[index] = element
                      }}
                      type="button"
                      role="menuitem"
                      tabIndex={index === activeIndex ? 0 : -1}
                      aria-disabled={item.busy || item.unavailable ? true : undefined}
                      aria-busy={item.busy || undefined}
                      aria-describedby={item.describedBy}
                      onClick={() => choose(item)}
                      onFocus={() => setActiveIndex(index)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 transition-colors dark:text-slate-200',
                        'hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 dark:hover:bg-slate-700 dark:focus:bg-slate-700',
                        'aria-disabled:cursor-wait aria-disabled:opacity-80'
                      )}
                    >
                      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
