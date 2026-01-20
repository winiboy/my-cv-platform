'use client'

import { Bold, Italic, Underline, List, ListOrdered, Type } from 'lucide-react'
import { AVAILABLE_FONTS, FONT_SIZES, DEFAULT_FONT_SIZE } from '@/lib/constants/fonts'
import { useState, useEffect } from 'react'

export type FormatCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bulletList'
  | 'numberedList'
  | 'font'
  | 'fontSize'

interface FormattingRibbonProps {
  editorId: string
  onFormat: (command: FormatCommand, value?: string) => void
  currentFont?: string
  currentFontSize?: number
  dict?: any
}

export function FormattingRibbon({
  editorId,
  onFormat,
  currentFont = 'inherit',
  currentFontSize = DEFAULT_FONT_SIZE,
  dict,
}: FormattingRibbonProps) {
  const t = dict?.resumes?.editor?.richTextToolbar
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())

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
              {font.name}
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
