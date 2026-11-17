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

interface FormattingRibbonProps {
  editorId: string
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

export function FormattingRibbon({
  editorId,
  onFormat,
  currentFont = 'inherit',
  currentFontSize = DEFAULT_FONT_SIZE,
  showAlignment = false,
  dict,
}: FormattingRibbonProps) {
  const t = dict?.resumes?.editor?.richTextToolbar
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [activeAlignment, setActiveAlignment] = useState<TextAlignment>('left')

  // Command state describes the document's selection, wherever it is. Several
  // editors share a page, so only a selection inside this one is read.
  const updateActiveAlignment = useCallback(() => {
    const editor = document.getElementById(editorId)
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) return
    try {
      setActiveAlignment(resolveActiveAlignment((command) => document.queryCommandState(command)))
    } catch {
      // queryCommandState can throw in some browsers; the last state shown stays
    }
  }, [editorId])

  useEffect(() => {
    if (!showAlignment) return
    // Undo and redo change a paragraph's alignment without moving the
    // selection, so the editor's own input events are read too
    const editor = document.getElementById(editorId)
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

      const formats = new Set<string>()

      // Check if cursor is in formatted text
      try {
        if (document.queryCommandState('bold')) formats.add('bold')
        if (document.queryCommandState('italic')) formats.add('italic')
        if (document.queryCommandState('underline')) formats.add('underline')
      } catch (e) {
        // queryCommandState can throw in some browsers
      }

      setActiveFormats(formats)
    }

    // Update on selection change
    document.addEventListener('selectionchange', updateActiveFormats)
    return () => document.removeEventListener('selectionchange', updateActiveFormats)
  }, [])

  const handleButtonClick = (command: FormatCommand, value?: string) => {
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
    onFormat(command)
    // Aligning changes no selection, so no selectionchange reports it
    updateActiveAlignment()
  }

  // Keeps the editor's selection, so the paragraphs under it are the ones aligned
  const keepEditorSelection = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  const buttonClass = (command: string) =>
    `p-2 rounded hover:bg-slate-100 transition-colors ${
      activeFormats.has(command) ? 'bg-teal-100 text-teal-700' : 'text-slate-600'
    }`

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 border border-slate-200 rounded-t-lg print:hidden">
      {/* Text Formatting */}
      <div className="flex items-center gap-1 border-r border-slate-300 pr-2">
        <button
          type="button"
          onClick={() => handleButtonClick('bold')}
          className={buttonClass('bold')}
          title={t?.bold || 'Bold (Ctrl+B)'}
          aria-label={t?.bold || 'Bold (Ctrl+B)'}
        >
          <Bold className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => handleButtonClick('italic')}
          className={buttonClass('italic')}
          title={t?.italic || 'Italic (Ctrl+I)'}
          aria-label={t?.italic || 'Italic (Ctrl+I)'}
        >
          <Italic className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => handleButtonClick('underline')}
          className={buttonClass('underline')}
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
          onClick={() => handleButtonClick('bulletList')}
          className="p-2 rounded hover:bg-slate-100 transition-colors text-slate-600"
          title={t?.bulletList || 'Bullet list'}
          aria-label={t?.bulletList || 'Bullet list'}
        >
          <List className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => handleButtonClick('numberedList')}
          className="p-2 rounded hover:bg-slate-100 transition-colors text-slate-600"
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
            const isActive = activeAlignment === ALIGN_FORMAT_COMMANDS[command]
            return (
              <button
                key={command}
                type="button"
                onMouseDown={keepEditorSelection}
                onClick={() => handleAlignmentClick(command)}
                className={`p-2 rounded hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  isActive ? 'bg-teal-100 text-teal-700' : 'text-slate-600'
                }`}
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
          className="text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
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
          className="text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
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
