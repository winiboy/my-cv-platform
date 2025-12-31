'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { FormattingRibbon, FormatCommand } from './formatting-ribbon'
import { sanitizeHtml, htmlToPlainText, migrateTextToHtml } from '@/lib/html-utils'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE } from '@/lib/constants/fonts'

interface RichTextEditorProps {
  id: string
  value: string
  onChange: (html: string, plainText: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
  showRibbon?: boolean
  availableFonts?: string[]
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = '',
  className = '',
  minHeight = '192px',
  showRibbon = true,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [currentFont, setCurrentFont] = useState(DEFAULT_FONT)
  const [currentFontSize, setCurrentFontSize] = useState(DEFAULT_FONT_SIZE)
  const lastValueRef = useRef<string>('')
  const isUserEditingRef = useRef(false)

  // Sync external value changes to editor
  useEffect(() => {
    if (!editorRef.current) return

    // Don't update if user is currently editing
    if (isUserEditingRef.current) {
      isUserEditingRef.current = false
      return
    }

    // Only update if value actually changed from outside
    if (value !== lastValueRef.current) {
      const editor = editorRef.current
      const isHtml = /<[^>]+>/.test(value)

      if (isHtml) {
        editor.innerHTML = sanitizeHtml(value)
      } else if (value) {
        const html = migrateTextToHtml(value)
        editor.innerHTML = html
      } else {
        editor.innerHTML = ''
      }

      lastValueRef.current = value
    }
  }, [value])

  // Handle content changes
  const handleInput = useCallback(() => {
    if (!editorRef.current) return

    isUserEditingRef.current = true
    const html = editorRef.current.innerHTML
    const plainText = htmlToPlainText(html)

    lastValueRef.current = html
    onChange(html, plainText)
  }, [onChange])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          document.execCommand('bold')
          handleInput()
          break
        case 'i':
          e.preventDefault()
          document.execCommand('italic')
          handleInput()
          break
        case 'u':
          e.preventDefault()
          document.execCommand('underline')
          handleInput()
          break
      }
    }
  }, [handleInput])

  // Handle paste to strip external formatting
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault()

      // Get plain text from clipboard
      const text = e.clipboardData.getData('text/plain')

      // Insert plain text at cursor
      document.execCommand('insertText', false, text)

      handleInput()
    },
    [handleInput]
  )

  // Handle formatting commands from ribbon
  const handleFormat = useCallback(
    (command: FormatCommand, value?: string) => {
      if (!editorRef.current) return

      editorRef.current.focus()

      switch (command) {
        case 'bold':
          document.execCommand('bold')
          break
        case 'italic':
          document.execCommand('italic')
          break
        case 'underline':
          document.execCommand('underline')
          break
        case 'bulletList':
          document.execCommand('insertUnorderedList')
          break
        case 'numberedList':
          document.execCommand('insertOrderedList')
          break
        case 'font':
          if (value) {
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0)

              // Extract content from selection
              const content = range.extractContents()

              // Remove all existing font-family styles from the content
              const removeInlineFontFamily = (node: Node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const element = node as HTMLElement

                  // Remove font-family from style attribute
                  if (element.style && element.style.fontFamily) {
                    element.style.fontFamily = ''
                    if (!element.getAttribute('style')) {
                      element.removeAttribute('style')
                    }
                  }

                  // Remove deprecated <font> tag face attribute
                  if (element.tagName === 'FONT') {
                    element.removeAttribute('face')
                  }

                  // Recursively process children
                  Array.from(element.childNodes).forEach(removeInlineFontFamily)
                }
              }

              // Remove font-family from all nodes in selection
              Array.from(content.childNodes).forEach(removeInlineFontFamily)

              // Create new span with the desired font family
              const span = document.createElement('span')
              span.style.fontFamily = value
              span.appendChild(content)

              // Insert the wrapped content back
              range.insertNode(span)

              // Restore selection
              range.selectNodeContents(span)
              selection.removeAllRanges()
              selection.addRange(range)

              setCurrentFont(value)
            }
          }
          break
        case 'fontSize':
          if (value) {
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0)

              // Extract content from selection
              const content = range.extractContents()

              // Remove all existing font-size styles from the content
              const removeInlineFontSize = (node: Node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const element = node as HTMLElement
                  if (element.style && element.style.fontSize) {
                    element.style.fontSize = ''
                    // If style is now empty, remove the attribute
                    if (!element.getAttribute('style')) {
                      element.removeAttribute('style')
                    }
                  }
                  // Recursively process children
                  Array.from(element.childNodes).forEach(removeInlineFontSize)
                }
              }

              // Remove font-size from all nodes in selection
              Array.from(content.childNodes).forEach(removeInlineFontSize)

              // Create new span with the desired font size
              const span = document.createElement('span')
              span.style.fontSize = `${value}px`
              span.appendChild(content)

              // Insert the wrapped content back
              range.insertNode(span)

              // Restore selection
              range.selectNodeContents(span)
              selection.removeAllRanges()
              selection.addRange(range)

              setCurrentFontSize(parseInt(value))
            }
          }
          break
      }

      handleInput()
    },
    [handleInput]
  )

  // Auto-resize to fit content
  useEffect(() => {
    if (!editorRef.current) return

    const editor = editorRef.current
    const resizeObserver = new ResizeObserver(() => {
      // Auto-resize is handled by CSS min-height and contenteditable growth
    })

    resizeObserver.observe(editor)

    return () => resizeObserver.disconnect()
  }, [])

  return (
    <div className={`w-full ${className}`}>
      {showRibbon && (
        <FormattingRibbon
          editorId={id}
          onFormat={handleFormat}
          currentFont={currentFont}
          currentFontSize={currentFontSize}
        />
      )}

      <div
        ref={editorRef}
        id={id}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={`
          w-full px-4 py-3 text-sm
          border border-slate-300
          ${showRibbon ? 'rounded-b-lg border-t-0' : 'rounded-lg'}
          focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
          bg-white text-slate-900
          overflow-y-auto
          [&:empty:before]:content-[attr(data-placeholder)]
          [&:empty:before]:text-slate-400
          [&_p]:m-0 [&_p]:p-0
          [&_div]:m-0 [&_div]:p-0
        `}
        style={{
          minHeight: minHeight,
          maxHeight: '500px',
          lineHeight: '1.4',
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
    </div>
  )
}
