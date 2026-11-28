'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { FormattingRibbon, type FormatCommand } from './formatting-ribbon'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE } from '@/lib/constants/fonts'

/**
 * One formatting toolbar for several rich-text editors on a page (the cover
 * letter's opening, body paragraphs and closing).
 *
 * Each editor rendered with `sharedToolbar` registers itself here. The target
 * is the registered editor that last received focus. It is cleared when the
 * user acts in a control outside the toolbar and every editor (clicks the
 * greeting input or the section nav, types in a field, changes a select), or
 * when the editor unmounts. Moving focus with the keyboard does not clear it,
 * so Tab reaches the toolbar. With no target the toolbar is disabled.
 */

/** What counts as a control the user can act in. */
const INTERACTIVE_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="tab"]',
  '[role="link"]',
  '[role="menuitem"]',
].join(', ')

/** Keys that only move focus or the caret, or are pressed with another key. */
const FOCUS_NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  'Tab',
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

export interface SharedFormattingTarget {
  id: string
  /** The contentEditable: focus inside it makes this editor the target. */
  element: HTMLElement
  /** Applies a command to this editor's last selection. */
  format: (command: FormatCommand, value?: string) => void
}

type RegisterTarget = (target: SharedFormattingTarget) => () => void

interface SharedFormattingState {
  target: SharedFormattingTarget | null
  toolbarRef: (element: HTMLElement | null) => void
}

// Two contexts: editors only register, so a change of target re-renders the
// toolbar alone, not every editor on the page.
const RegisterContext = createContext<RegisterTarget | null>(null)
const StateContext = createContext<SharedFormattingState | null>(null)

export function SharedFormattingProvider({ children }: { children: ReactNode }) {
  const targetsRef = useRef(new Set<SharedFormattingTarget>())
  const toolbarElementRef = useRef<HTMLElement | null>(null)
  const [target, setTarget] = useState<SharedFormattingTarget | null>(null)

  const register = useCallback<RegisterTarget>((registered) => {
    targetsRef.current.add(registered)
    return () => {
      targetsRef.current.delete(registered)
      setTarget((current) => (current === registered ? null : current))
    }
  }, [])

  const toolbarRef = useCallback((element: HTMLElement | null) => {
    toolbarElementRef.current = element
  }, [])

  useEffect(() => {
    const registeredHolding = (node: Node) => {
      for (const registered of targetsRef.current) {
        if (registered.element.contains(node)) return registered
      }
      return null
    }

    /** The event's target, when it is outside the toolbar and every editor. */
    const outside = (event: Event): Element | null => {
      const node = event.target
      if (!(node instanceof Element)) return null
      if (toolbarElementRef.current?.contains(node)) return null
      if (registeredHolding(node)) return null
      return node
    }

    // Focus entering an editor, by any means, makes it the target.
    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Node)) return
      const registered = registeredHolding(event.target)
      if (registered) setTarget(registered)
    }

    // The target is cleared when the user acts in another control: clicks it,
    // types in it or changes its value. Only moving through controls does
    // not clear it (Shift+Tab from a field to the toolbar passes the greeting
    // input and the section nav), nor does a click on blank space, padding or
    // a scrollbar, nor a touch pan, which fires no click.
    const handleClick = (event: MouseEvent) => {
      if (outside(event)?.closest(INTERACTIVE_SELECTOR)) setTarget(null)
    }
    const handleValueChange = (event: Event) => {
      if (outside(event)) setTarget(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (FOCUS_NAVIGATION_KEYS.has(event.key)) return
      if (outside(event)?.closest(INTERACTIVE_SELECTOR)) setTarget(null)
    }

    // Capture, so a control that stops an event's propagation still clears it.
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('input', handleValueChange, true)
    document.addEventListener('change', handleValueChange, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('input', handleValueChange, true)
      document.removeEventListener('change', handleValueChange, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])

  const state = useMemo(() => ({ target, toolbarRef }), [target, toolbarRef])

  return (
    <RegisterContext.Provider value={register}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </RegisterContext.Provider>
  )
}

/** The registration function, or `null` outside a `SharedFormattingProvider`. */
export function useSharedFormattingRegistration(): RegisterTarget | null {
  return useContext(RegisterContext)
}

interface FontChoice {
  font: string
  fontSize: number
}

const DEFAULT_CHOICE: FontChoice = { font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE }

interface SharedFormattingToolbarProps {
  /** The toolbar's accessible name. */
  label: string
  testId?: string
  showAlignment?: boolean
  dict?: Record<string, unknown>
}

export function SharedFormattingToolbar({ label, testId, showAlignment = false, dict }: SharedFormattingToolbarProps) {
  const state = useContext(StateContext)
  if (!state) throw new Error('SharedFormattingToolbar must be rendered inside a SharedFormattingProvider')
  const { target, toolbarRef } = state

  // The font and size each editor was last given, shown again when it is the
  // target, as its own ribbon did.
  const [choices, setChoices] = useState<Record<string, FontChoice>>({})
  const choice = (target && choices[target.id]) || DEFAULT_CHOICE

  const handleFormat = useCallback(
    (command: FormatCommand, value?: string) => {
      if (!target) return
      target.format(command, value)
      if ((command === 'font' || command === 'fontSize') && value) {
        setChoices((previous) => {
          const current = previous[target.id] ?? DEFAULT_CHOICE
          const next = command === 'font' ? { ...current, font: value } : { ...current, fontSize: parseInt(value, 10) }
          return { ...previous, [target.id]: next }
        })
      }
    },
    [target]
  )

  return (
    <div ref={toolbarRef} data-testid={testId} className="min-w-0">
      <FormattingRibbon
        // Remounted for each target, so its active states are read from that
        // target as it mounts, never carried over from the previous one.
        key={target?.id ?? 'no-target'}
        placement="shared"
        label={label}
        editorId={target?.id ?? null}
        onFormat={handleFormat}
        currentFont={choice.font}
        currentFontSize={choice.fontSize}
        showAlignment={showAlignment}
        dict={dict}
      />
    </div>
  )
}
