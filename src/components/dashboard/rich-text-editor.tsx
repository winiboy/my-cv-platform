'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { ALIGN_FORMAT_COMMANDS, FormattingRibbon, FormatCommand } from './formatting-ribbon'
import { sanitizeHtml, htmlToPlainText, migrateTextToHtml } from '@/lib/html-utils'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE } from '@/lib/constants/fonts'
import { ALIGNMENT_COMMANDS, type TextAlignment } from '@/lib/rich-text-alignment'
import { useSharedFormattingRegistration } from './shared-formatting-toolbar'

/** Whether both ends of `range` are in `editor`'s current content. */
function isRangeInside(editor: HTMLElement, range: Range): boolean {
  return (
    range.startContainer.isConnected &&
    range.endContainer.isConnected &&
    editor.contains(range.startContainer) &&
    editor.contains(range.endContainer)
  )
}

/**
 * A boundary of a selection as an offset into the editor's text. `atEnd` says
 * whether it sat at the end of its text node: an offset that falls between
 * two text nodes (the end of one paragraph, the start of the next) is then
 * put back on the same side.
 */
interface TextPoint {
  offset: number
  atEnd: boolean
}

function textPointOf(editor: HTMLElement, node: Node, offset: number): TextPoint {
  const before = document.createRange()
  before.setStart(editor, 0)
  before.setEnd(node, offset)
  return {
    offset: before.toString().length,
    atEnd: node.nodeType === Node.TEXT_NODE && offset === (node as Text).data.length && offset > 0,
  }
}

function textOffsetsOf(editor: HTMLElement, range: Range): { start: TextPoint; end: TextPoint } {
  return {
    start: textPointOf(editor, range.startContainer, range.startOffset),
    end: textPointOf(editor, range.endContainer, range.endOffset),
  }
}

/** The text node and offset in it at `point`; the end of the text when past it. */
function nodeAtTextPoint(editor: HTMLElement, point: TextPoint): [Node, number] {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  let seen = 0
  let last: Text | null = null
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const length = node.data.length
    if (point.offset < seen + length || (point.offset === seen + length && point.atEnd)) {
      return [node, point.offset - seen]
    }
    seen += length
    last = node
  }
  return last ? [last, last.data.length] : [editor, 0]
}

function rangeAtTextOffsets(editor: HTMLElement, offsets: { start: TextPoint; end: TextPoint }): Range {
  const range = document.createRange()
  range.setStart(...nodeAtTextPoint(editor, offsets.start))
  range.setEnd(...nodeAtTextPoint(editor, offsets.end))
  return range
}

interface RichTextEditorProps {
  id: string
  value: string
  onChange: (html: string, plainText: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
  showRibbon?: boolean
  /** Adds the paragraph alignment buttons to the ribbon (cover letter fields only). */
  showAlignment?: boolean
  /**
   * Formatted from the page's `SharedFormattingToolbar` instead of a ribbon of
   * its own (cover letter fields only). Requires a `SharedFormattingProvider`.
   */
  sharedToolbar?: boolean
  /** The alignment of the paragraph that typing into the empty field starts. */
  emptyAlignment?: TextAlignment
  availableFonts?: string[]
  dict?: any
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = '',
  className = '',
  minHeight = '192px',
  showRibbon = true,
  showAlignment = false,
  sharedToolbar = false,
  emptyAlignment,
  dict,
}: RichTextEditorProps) {
  const registerSharedTarget = useSharedFormattingRegistration()
  if (sharedToolbar && !registerSharedTarget) {
    throw new Error(`RichTextEditor "${id}" uses sharedToolbar outside a SharedFormattingProvider`)
  }
  const hasOwnRibbon = showRibbon && !sharedToolbar
  const editorRef = useRef<HTMLDivElement>(null)
  // The selection last made in this editor. A shared toolbar's select takes
  // focus, and the selection with it, so a command restores this first.
  const savedRangeRef = useRef<Range | null>(null)
  const [currentFont, setCurrentFont] = useState(DEFAULT_FONT)
  const [currentFontSize, setCurrentFontSize] = useState(DEFAULT_FONT_SIZE)
  // The HTML this editor last showed: what it reported on input, or the value
  // it was last given. Every parent passes that HTML back as `value`.
  const lastValueRef = useRef<string>('')

  // Sync external value changes to editor
  useEffect(() => {
    if (!editorRef.current) return

    // Only a value that is not the editor's own HTML came from outside (a
    // whole-letter alignment, an AI rewrite, a reload). Typing reports the
    // editor's HTML, which comes back unchanged and is skipped, so the caret
    // stays where it is. A comparison rather than a "user is editing" flag:
    // an input that changes nothing (Ctrl+B with no selection) would leave
    // such a flag set, and the next outside change would be skipped.
    if (value !== lastValueRef.current) {
      const editor = editorRef.current
      const isHtml = /<[^>]+>/.test(value)

      // Rewriting the HTML removes the nodes the caret or selection is in. The
      // live selection (when in this editor) and the saved one are kept as
      // text offsets and put back at the same offsets afterwards: a
      // whole-letter alignment changes no text, only styles and the blocks
      // around it, so the caret stays where the user left it.
      // The live selection is put back only in a focused editor: placing a
      // selection in a contentEditable focuses it, which would take focus
      // from the control the user is on (a "Move up" pressed by keyboard).
      const selection = window.getSelection()
      const live = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
      const liveInside = live !== null && isRangeInside(editor, live) && document.activeElement === editor
      const saved = savedRangeRef.current
      const kept = liveInside ? live : saved && isRangeInside(editor, saved) ? saved : null
      const offsets = kept ? textOffsetsOf(editor, kept) : null

      if (isHtml) {
        editor.innerHTML = sanitizeHtml(value)
      } else if (value) {
        const html = migrateTextToHtml(value)
        editor.innerHTML = sanitizeHtml(html)
      } else {
        editor.innerHTML = ''
      }
      // The nodes the last selection was in are gone
      savedRangeRef.current = null

      if (offsets) {
        const restored = rangeAtTextOffsets(editor, offsets)
        savedRangeRef.current = restored.cloneRange()
        if (liveInside && selection) {
          selection.removeAllRanges()
          selection.addRange(restored)
        }
      }

      lastValueRef.current = value
    }
  }, [value])

  // Handle content changes
  const handleInput = useCallback(() => {
    if (!editorRef.current) return

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

      const editor = editorRef.current

      if (sharedToolbar) {
        // The command applies to the live selection when it is in this
        // editor, otherwise to the last one made here while its nodes are
        // still in it. With neither, nothing is formatted, rather than
        // wherever focusing the editor would put the caret.
        const selection = window.getSelection()
        if (!selection) return
        const live = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
        let range: Range
        if (live && isRangeInside(editor, live)) {
          range = live.cloneRange()
        } else {
          const saved = savedRangeRef.current
          if (!saved || !isRangeInside(editor, saved)) {
            savedRangeRef.current = null
            return
          }
          range = saved
        }
        // Font and size edit the range itself, with no editing command, so
        // focus stays in the select: a keyboard user can keep arrowing in it.
        // The others need the editor focused, and focusing it can move the
        // caret to its start, so the range is set after.
        if (command !== 'font' && command !== 'fontSize') editor.focus()
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        editor.focus()
      }

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
        case 'alignLeft':
        case 'alignCenter':
        case 'alignRight':
        case 'alignJustify': {
          // Writes text-align on each block the selection touches, or wraps a
          // bare line in a <div> carrying it. Without styleWithCSS, Gecko
          // writes <div align="…"> instead, which the sanitizer drops. It is
          // switched on for this command only, so bold, italic and underline
          // keep writing the tags they always have.
          let styledWithCss = false
          try {
            styledWithCss = document.queryCommandState('styleWithCSS')
          } catch {
            // Not every browser reports this state; the editor's default is off
          }
          document.execCommand('styleWithCSS', false, 'true')
          try {
            document.execCommand(ALIGNMENT_COMMANDS[ALIGN_FORMAT_COMMANDS[command]])
          } finally {
            document.execCommand('styleWithCSS', false, String(styledWithCss))
          }
          break
        }
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
    [handleInput, sharedToolbar]
  )

  // The shared toolbar holds one handle per editor for as long as it is
  // mounted; the handle calls the latest handleFormat, which changes with
  // every new onChange.
  const handleFormatRef = useRef(handleFormat)
  useEffect(() => {
    handleFormatRef.current = handleFormat
  }, [handleFormat])

  // Text entered into an empty field is bare text, which carries no
  // alignment. With `emptyAlignment`, an empty field that takes focus gets an
  // empty paragraph aligned so, with the caret in it, before anything is
  // entered: typing, an IME or dead key, Android's composition and paste
  // (inserted as text) all land in it alike, and nothing is rewritten while
  // the user types, so composition and the undo history are untouched.
  // The paragraph is in the editor only: until something is entered the field
  // still stores nothing, and when focus leaves with nothing entered it is
  // removed again, so the placeholder shows. While such a field has focus,
  // its placeholder is hidden.
  const handleFocus = useCallback(() => {
    const editor = editorRef.current
    if (!editor || !emptyAlignment) return
    if (editor.textContent !== '' || editor.querySelector('p, div, li')) return
    const paragraph = document.createElement('p')
    paragraph.style.textAlign = emptyAlignment
    paragraph.appendChild(document.createElement('br'))
    editor.replaceChildren(paragraph)
    const range = document.createRange()
    range.setStart(paragraph, 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [emptyAlignment])

  // The letter's alignment can change while an empty field has focus (the
  // alignment buttons need no target): the paragraph waiting for input takes
  // the new one, or goes when there is no shared one left.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement !== editor) return
    if (lastValueRef.current !== '' || editor.textContent !== '') return
    const paragraph = editor.firstElementChild
    const isSeed =
      editor.childNodes.length === 1 &&
      paragraph instanceof HTMLParagraphElement &&
      paragraph.childNodes.length === 1 &&
      paragraph.firstChild instanceof HTMLBRElement
    if (!isSeed) return
    if (emptyAlignment) {
      paragraph.style.textAlign = emptyAlignment
      return
    }
    editor.replaceChildren()
    const range = document.createRange()
    range.setStart(editor, 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [emptyAlignment])

  const handleBlur = useCallback(() => {
    const editor = editorRef.current
    // Only while nothing has been entered: the field still stores nothing
    if (!editor || !emptyAlignment || lastValueRef.current !== '' || editor.textContent !== '') return
    editor.replaceChildren()
  }, [emptyAlignment])

  useEffect(() => {
    const editor = editorRef.current
    if (!sharedToolbar || !registerSharedTarget || !editor) return

    const rememberSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      const range = selection.getRangeAt(0)
      if (isRangeInside(editor, range)) savedRangeRef.current = range.cloneRange()
    }

    document.addEventListener('selectionchange', rememberSelection)
    // selectionchange is delivered later and coalesced: a click followed at
    // once by Shift+Tab reports only the selection in the next field. Focus
    // leaving the editor is reported before the selection moves, so the last
    // selection made here is read then too.
    editor.addEventListener('focusout', rememberSelection)
    const unregister = registerSharedTarget({
      id,
      element: editor,
      format: (command, value) => handleFormatRef.current(command, value),
    })
    return () => {
      document.removeEventListener('selectionchange', rememberSelection)
      editor.removeEventListener('focusout', rememberSelection)
      unregister()
    }
  }, [sharedToolbar, registerSharedTarget, id])

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
      {hasOwnRibbon && (
        <FormattingRibbon
          editorId={id}
          onFormat={handleFormat}
          currentFont={currentFont}
          currentFontSize={currentFontSize}
          showAlignment={showAlignment}
          dict={dict}
        />
      )}

      <div
        ref={editorRef}
        id={id}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={emptyAlignment ? handleFocus : undefined}
        onBlur={emptyAlignment ? handleBlur : undefined}
        className={`
          w-full px-4 py-3 text-sm
          border border-slate-300
          ${hasOwnRibbon ? 'rounded-b-lg border-t-0' : 'rounded-lg'}
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
