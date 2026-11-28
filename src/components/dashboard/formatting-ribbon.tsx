'use client'

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { AVAILABLE_FONTS, FONT_SIZES, DEFAULT_FONT, DEFAULT_FONT_SIZE } from '@/lib/constants/fonts'
import { resolveActiveAlignment, type TextAlignment } from '@/lib/rich-text-alignment'
import { useState, useEffect, useCallback } from 'react'

export type AlignFormatCommand = 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignJustify'

export type FormatCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bulletList'
  | 'numberedList'
  | 'font'
  | 'fontSize'
  | AlignFormatCommand

/** The paragraph alignment each alignment button applies. */
export const ALIGN_FORMAT_COMMANDS: Readonly<Record<AlignFormatCommand, TextAlignment>> = {
  alignLeft: 'left',
  alignCenter: 'center',
  alignRight: 'right',
  alignJustify: 'justify',
}

/**
 * The alignment buttons, in Word's order. Each label is a key of
 * `resumes.editor.richTextToolbar`; the fallback matches the other buttons'.
 */
const ALIGNMENT_BUTTONS: ReadonlyArray<{
  command: AlignFormatCommand
  labelKey: AlignFormatCommand
  fallbackLabel: string
  Icon: LucideIcon
}> = [
  { command: 'alignLeft', labelKey: 'alignLeft', fallbackLabel: 'Align left', Icon: AlignLeft },
  { command: 'alignCenter', labelKey: 'alignCenter', fallbackLabel: 'Center', Icon: AlignCenter },
  { command: 'alignRight', labelKey: 'alignRight', fallbackLabel: 'Align right', Icon: AlignRight },
  { command: 'alignJustify', labelKey: 'alignJustify', fallbackLabel: 'Justify', Icon: AlignJustify },
]

interface FormattingRibbonBaseProps {
  onFormat: (command: FormatCommand, value?: string) => void
  currentFont?: string
  currentFontSize?: number
  /**
   * Shows the paragraph alignment buttons. Opt-in: only the cover letter's
   * opening, body and closing fields have them; the CV's fields do not.
   */
  showAlignment?: boolean
  dict?: any
}

/**
 * Where the ribbon sits.
 *
 * - `attached` (the default): above its own editor.
 * - `shared`: one page-level toolbar for several editors (the cover letter's
 *   opening, body and closing). It formats the editor `editorId` names, the
 *   one that last held the cursor, and is disabled while there is none. Its
 *   buttons keep that editor's selection when pressed, and its active state
 *   reads a selection inside that editor only.
 */
type FormattingRibbonPlacementProps =
  | { placement?: 'attached'; editorId: string }
  | { placement: 'shared'; editorId: string | null; label: string }

type FormattingRibbonProps = FormattingRibbonBaseProps & FormattingRibbonPlacementProps

const NO_FORMATS: ReadonlySet<string> = new Set()

/** Whether the document's selection is in the editor `editorId` names. */
function isSelectionIn(editorId: string | null): boolean {
  if (!editorId || typeof document === 'undefined') return false
  const editor = document.getElementById(editorId)
  const selection = window.getSelection()
  return !!editor && !!selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)
}

/** Bold, italic and underline, as the document's selection has them. */
function readActiveFormats(): Set<string> {
  const formats = new Set<string>()

  // Check if cursor is in formatted text
  try {
    if (document.queryCommandState('bold')) formats.add('bold')
    if (document.queryCommandState('italic')) formats.add('italic')
    if (document.queryCommandState('underline')) formats.add('underline')
  } catch {
    // queryCommandState can throw in some browsers
  }

  return formats
}

/** The selection's paragraph alignment, or `null` when the browser cannot tell. */
function readActiveAlignment(): TextAlignment | null {
  try {
    return resolveActiveAlignment((command) => document.queryCommandState(command))
  } catch {
    // queryCommandState can throw in some browsers
    return null
  }
}

export function FormattingRibbon(props: FormattingRibbonProps) {
  const {
    editorId,
    onFormat,
    currentFont = 'inherit',
    currentFontSize = DEFAULT_FONT_SIZE,
    showAlignment = false,
    dict,
  } = props
  const shared = props.placement === 'shared' ? props : null
  const isShared = shared !== null
  const disabled = isShared && editorId === null
  const t = dict?.resumes?.editor?.richTextToolbar
  // A shared toolbar is remounted for each new target, and starts from that
  // target's state: focus can enter a field with no selectionchange (Tab back
  // to a caret it already had).
  const [activeFormats, setActiveFormats] = useState<Set<string>>(() =>
    isShared && isSelectionIn(editorId) ? readActiveFormats() : new Set()
  )
  const [activeAlignment, setActiveAlignment] = useState<TextAlignment>(() =>
    (isShared && showAlignment && isSelectionIn(editorId) && readActiveAlignment()) || 'left'
  )

  // Command state describes the document's selection, wherever it is. Several
  // editors share a page, so only a selection inside this one is read.
  const updateActiveAlignment = useCallback(() => {
    if (!isSelectionIn(editorId)) {
      // A shared toolbar shows its target's state only; outside it, nothing
      // has been read, which is shown as the default, left
      if (isShared) setActiveAlignment('left')
      return
    }
    // When the browser cannot tell, the last state shown stays
    const alignment = readActiveAlignment()
    if (alignment) setActiveAlignment(alignment)
  }, [editorId, isShared])

  useEffect(() => {
    if (!showAlignment) return
    // Undo and redo change a paragraph's alignment without moving the
    // selection, so the editor's own input events are read too
    const editor = editorId ? document.getElementById(editorId) : null
    document.addEventListener('selectionchange', updateActiveAlignment)
    editor?.addEventListener('input', updateActiveAlignment)
    return () => {
      document.removeEventListener('selectionchange', updateActiveAlignment)
      editor?.removeEventListener('input', updateActiveAlignment)
    }
  }, [showAlignment, editorId, updateActiveAlignment])

  // Update active formats based on current selection
  useEffect(() => {
    const updateActiveFormats = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      // A shared toolbar describes its target editor only: a selection
      // elsewhere on the page (another field, the preview) is not its state.
      if (isShared && !isSelectionIn(editorId)) {
        setActiveFormats(new Set())
        return
      }

      setActiveFormats(readActiveFormats())
    }

    // Update on selection change
    document.addEventListener('selectionchange', updateActiveFormats)
    return () => document.removeEventListener('selectionchange', updateActiveFormats)
  }, [isShared, editorId])

  const handleButtonClick = (command: FormatCommand, value?: string) => {
    // A shared toolbar with no target stays focusable (aria-disabled) but does nothing
    if (disabled) return
    onFormat(command, value)

    // Update active formats immediately for better UX
    if (command === 'bold' || command === 'italic' || command === 'underline') {
      const newFormats = new Set(activeFormats)
      if (newFormats.has(command)) {
        newFormats.delete(command)
      } else {
        newFormats.add(command)
      }
      setActiveFormats(newFormats)
    }
  }

  const handleAlignmentClick = (command: AlignFormatCommand) => {
    if (disabled) return
    onFormat(command)
    // Aligning changes no selection, so no selectionchange reports it
    updateActiveAlignment()
  }

  // Keeps the editor's selection, so the paragraphs under it are the ones aligned
  const keepEditorSelection = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  // Pressing a shared toolbar's button would move focus out of the target
  // editor; keeping it there keeps the selection the command applies to.
  const holdSelection = isShared ? keepEditorSelection : undefined

  // A shared toolbar's controls are disabled with aria-disabled rather than
  // `disabled`, so they stay in the Tab order. Its attributes and classes are
  // added to a shared toolbar only: an attached ribbon's markup is the same
  // as before the shared toolbar existed.
  const ariaDisabled = isShared ? disabled : undefined
  const disabledClass = isShared ? ' aria-disabled:cursor-not-allowed aria-disabled:opacity-50' : ''
  const pressed = (command: string) => (isShared ? shownFormats.has(command) : undefined)

  const shownFormats = disabled ? NO_FORMATS : activeFormats

  const buttonClass = (command: string) =>
    `p-2 rounded hover:bg-slate-100 transition-colors ${
      shownFormats.has(command) ? 'bg-teal-100 text-teal-700' : 'text-slate-600'
    }${disabledClass}`

  return (
    <div
      role={shared ? 'toolbar' : undefined}
      aria-label={shared?.label}
      // A shared toolbar sits flat in its page's band, with no frame of its own
      className={
        isShared
          ? 'flex flex-wrap items-center gap-1 print:hidden'
          : 'flex flex-wrap items-center gap-1 p-2 bg-slate-50 border border-slate-200 rounded-t-lg print:hidden'
      }
    >
      {/* Text Formatting */}
      <div className="flex items-center gap-1 border-r border-slate-300 pr-2">
        <button
          type="button"
          onMouseDown={holdSelection}
          onClick={() => handleButtonClick('bold')}
          aria-disabled={ariaDisabled}
          className={buttonClass('bold')}
          aria-pressed={pressed('bold')}
          title={t?.bold || 'Bold (Ctrl+B)'}
          aria-label={t?.bold || 'Bold (Ctrl+B)'}
        >
          <Bold className="h-4 w-4" />
        </button>

        <button
          type="button"
          onMouseDown={holdSelection}
          onClick={() => handleButtonClick('italic')}
          aria-disabled={ariaDisabled}
          className={buttonClass('italic')}
          aria-pressed={pressed('italic')}
          title={t?.italic || 'Italic (Ctrl+I)'}
          aria-label={t?.italic || 'Italic (Ctrl+I)'}
        >
          <Italic className="h-4 w-4" />
        </button>

        <button
          type="button"
          onMouseDown={holdSelection}
          onClick={() => handleButtonClick('underline')}
          aria-disabled={ariaDisabled}
          className={buttonClass('underline')}
          aria-pressed={pressed('underline')}
          title={t?.underline || 'Underline (Ctrl+U)'}
          aria-label={t?.underline || 'Underline (Ctrl+U)'}
        >
          <Underline className="h-4 w-4" />
        </button>
      </div>

      {/* Lists */}
      <div className="flex items-center gap-1 border-r border-slate-300 pr-2">
        <button
          type="button"
          onMouseDown={holdSelection}
          onClick={() => handleButtonClick('bulletList')}
          aria-disabled={ariaDisabled}
          className={`p-2 rounded hover:bg-slate-100 transition-colors text-slate-600${disabledClass}`}
          title={t?.bulletList || 'Bullet list'}
          aria-label={t?.bulletList || 'Bullet list'}
        >
          <List className="h-4 w-4" />
        </button>

        <button
          type="button"
          onMouseDown={holdSelection}
          onClick={() => handleButtonClick('numberedList')}
          aria-disabled={ariaDisabled}
          className={`p-2 rounded hover:bg-slate-100 transition-colors text-slate-600${disabledClass}`}
          title={t?.numberedList || 'Numbered list'}
          aria-label={t?.numberedList || 'Numbered list'}
        >
          <ListOrdered className="h-4 w-4" />
        </button>
      </div>

      {showAlignment && (
        <div
          className="flex items-center gap-1 border-r border-slate-300 pr-2"
          data-testid="formatting-ribbon-alignment"
        >
          {ALIGNMENT_BUTTONS.map(({ command, labelKey, fallbackLabel, Icon }) => {
            const label = t?.[labelKey] || fallbackLabel
            const isActive = !disabled && activeAlignment === ALIGN_FORMAT_COMMANDS[command]
            return (
              <button
                key={command}
                type="button"
                onMouseDown={keepEditorSelection}
                onClick={() => handleAlignmentClick(command)}
                aria-disabled={ariaDisabled}
                className={`p-2 rounded hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  isActive ? 'bg-teal-100 text-teal-700' : 'text-slate-600'
                }${disabledClass}`}
                title={label}
                aria-label={label}
                aria-pressed={isActive}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      )}

      {/* Font Selection */}
      <div className="flex items-center gap-2 border-r border-slate-300 pr-2">
        <Type className="h-4 w-4 text-slate-400" />
        <select
          value={currentFont}
          onChange={(e) => handleButtonClick('font', e.target.value)}
          aria-disabled={ariaDisabled}
          className={`text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500${disabledClass}`}
          aria-label={t?.font || 'Font'}
        >
          {AVAILABLE_FONTS.map((font) => (
            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
              {font.value === DEFAULT_FONT ? t?.systemDefault || font.name : font.name}
            </option>
          ))}
        </select>
      </div>

      {/* Font Size */}
      <div className="flex items-center gap-2">
        <select
          value={currentFontSize}
          onChange={(e) => handleButtonClick('fontSize', e.target.value)}
          aria-disabled={ariaDisabled}
          className={`text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500${disabledClass}`}
          aria-label={t?.fontSize || 'Font size'}
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
