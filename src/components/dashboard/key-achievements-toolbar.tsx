'use client'

import {
  AlignLeft,
  AlignCenter,
  AlignJustify,
  List,
  ListOrdered,
  Minus,
  Bold,
  Italic
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

export type KeyAchievementsFormatCommand =
  | 'alignLeft'
  | 'alignCenter'
  | 'alignJustify'
  | 'bulletList'
  | 'dashList'
  | 'numberedList'
  | 'bold'
  | 'italic'

interface KeyAchievementsToolbarProps {
  editorId: string
  onFormat: (command: KeyAchievementsFormatCommand) => void
  disabled?: boolean
  showItalic?: boolean
}

export function KeyAchievementsToolbar({
  editorId,
  onFormat,
  disabled = false,
  showItalic = true,
}: KeyAchievementsToolbarProps) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())

  // Update active formats based on current selection
  useEffect(() => {
    const updateActiveFormats = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const formats = new Set<string>()

      try {
        if (document.queryCommandState('bold')) formats.add('bold')
        if (document.queryCommandState('italic')) formats.add('italic')
        if (document.queryCommandState('justifyLeft')) formats.add('alignLeft')
        if (document.queryCommandState('justifyCenter')) formats.add('alignCenter')
        if (document.queryCommandState('justifyFull')) formats.add('alignJustify')
      } catch (e) {
        // queryCommandState can throw in some browsers
      }

      setActiveFormats(formats)
    }

    document.addEventListener('selectionchange', updateActiveFormats)
    return () => document.removeEventListener('selectionchange', updateActiveFormats)
  }, [])

  const handleButtonClick = useCallback((command: KeyAchievementsFormatCommand) => {
    if (disabled) return
    onFormat(command)

    // Update active formats immediately for better UX
    if (command === 'bold' || command === 'italic') {
      const newFormats = new Set(activeFormats)
      if (newFormats.has(command)) {
        newFormats.delete(command)
      } else {
        newFormats.add(command)
      }
      setActiveFormats(newFormats)
    }
  }, [disabled, onFormat, activeFormats])

  const buttonClass = (command: string) =>
    `p-1.5 rounded hover:bg-slate-100 transition-colors ${
      activeFormats.has(command) ? 'bg-teal-100 text-teal-700' : 'text-slate-600'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`

  return (
    <div className="flex items-center gap-0.5 print:hidden">
      {/* Alignment */}
      <button
        type="button"
        onClick={() => handleButtonClick('alignLeft')}
        className={buttonClass('alignLeft')}
        title="Aligner à gauche"
        aria-label="Aligner à gauche"
        disabled={disabled}
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => handleButtonClick('alignCenter')}
        className={buttonClass('alignCenter')}
        title="Centrer"
        aria-label="Centrer"
        disabled={disabled}
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => handleButtonClick('alignJustify')}
        className={buttonClass('alignJustify')}
        title="Justifier"
        aria-label="Justifier"
        disabled={disabled}
      >
        <AlignJustify className="h-3.5 w-3.5" />
      </button>

      <div className="w-px h-4 bg-slate-300 mx-1" />

      {/* Lists */}
      <button
        type="button"
        onClick={() => handleButtonClick('bulletList')}
        className={buttonClass('bulletList')}
        title="Liste à puces"
        aria-label="Liste à puces"
        disabled={disabled}
      >
        <List className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => handleButtonClick('dashList')}
        className={buttonClass('dashList')}
        title="Liste avec tirets"
        aria-label="Liste avec tirets"
        disabled={disabled}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => handleButtonClick('numberedList')}
        className={buttonClass('numberedList')}
        title="Liste numérotée"
        aria-label="Liste numérotée"
        disabled={disabled}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>

      <div className="w-px h-4 bg-slate-300 mx-1" />

      {/* Text Formatting */}
      <button
        type="button"
        onClick={() => handleButtonClick('bold')}
        className={buttonClass('bold')}
        title="Gras (Ctrl+B)"
        aria-label="Gras"
        disabled={disabled}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      {showItalic && (
        <button
          type="button"
          onClick={() => handleButtonClick('italic')}
          className={buttonClass('italic')}
          title="Italique (Ctrl+I)"
          aria-label="Italique"
          disabled={disabled}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
