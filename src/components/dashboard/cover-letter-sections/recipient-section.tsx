'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from 'react'
import {
  SWISS_LETTER_FONT_FAMILY,
  SWISS_LETTER_LAYOUT_PX,
  SWISS_LETTER_WINDOW_MAX_LINES,
  swissLetterRecipientLines,
} from '@/lib/cover-letter-swiss-letter'

interface RecipientSectionProps {
  recipientName: string | null
  recipientTitle: string | null
  companyName: string | null
  companyAddress: string | null
  onChange: (field: string, value: string | null) => void
  dict: Record<string, unknown>
}

/**
 * The recipient block as the letter prints it in the envelope window: the
 * window's width, the letter's font, size and line height, the same line
 * breaks and wrapping. Measured, never shown.
 */
const WINDOW_MEASURER_STYLE: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: SWISS_LETTER_LAYOUT_PX.window.width,
  fontFamily: SWISS_LETTER_FONT_FAMILY,
  fontSize: SWISS_LETTER_LAYOUT_PX.fontSize,
  fontWeight: 400,
  letterSpacing: 'normal',
  lineHeight: `${SWISS_LETTER_LAYOUT_PX.lineHeight}px`,
  overflowWrap: 'break-word',
  visibility: 'hidden',
  pointerEvents: 'none',
}

/**
 * How many lines the recipient block takes in the envelope window, wrapped
 * lines included, from the height of `measurer`: a real text measurement, so
 * it follows the font and the wrapping as the print has them. Updates when
 * the block's height changes: a line typed or removed, a word that wraps, the
 * font finishing loading. 0 until measured.
 */
function useMeasuredLineCount(measurer: RefObject<HTMLDivElement | null>): number {
  const [lineCount, setLineCount] = useState(0)
  useEffect(() => {
    const element = measurer.current
    if (!element) return
    const measure = () => setLineCount(Math.round(element.offsetHeight / SWISS_LETTER_LAYOUT_PX.lineHeight))
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [measurer])
  return lineCount
}

export function RecipientSection({
  recipientName,
  recipientTitle,
  companyName,
  companyAddress,
  onChange,
  dict,
}: RecipientSectionProps) {
  const editorDict = ((dict.coverLetters || {}) as Record<string, unknown>).editor as Record<string, unknown> || {}
  const recipientDict = (editorDict.recipient || {}) as Record<string, unknown>

  const warningId = `${useId()}-window-warning`
  const measurer = useRef<HTMLDivElement>(null)
  const recipientLines = swissLetterRecipientLines({
    recipient_name: recipientName,
    recipient_title: recipientTitle,
    company_name: companyName,
    company_address: companyAddress,
  })
  // FR-2: the window holds six lines. The letter still prints the whole block;
  // the warning only tells the user it runs below the window.
  const overflowsWindow = useMeasuredLineCount(measurer) > SWISS_LETTER_WINDOW_MAX_LINES
  const describedBy = overflowsWindow ? warningId : undefined
  const windowWarning = ((recipientDict.windowOverflow as string) ||
    'The address does not fit the envelope window ({lines} lines)').replace('{lines}', String(SWISS_LETTER_WINDOW_MAX_LINES))

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {(recipientDict.title as string) || 'Recipient Information'}
      </h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            {(recipientDict.nameLabel as string) || 'Recipient Name'}
          </label>
          <input
            type="text"
            value={recipientName || ''}
            aria-describedby={describedBy}
            onChange={(e) => onChange('recipient_name', e.target.value || null)}
            placeholder={(recipientDict.namePlaceholder as string) || 'e.g., John Smith'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {(recipientDict.titleLabel as string) || 'Recipient Title'}
          </label>
          <input
            type="text"
            value={recipientTitle || ''}
            aria-describedby={describedBy}
            onChange={(e) => onChange('recipient_title', e.target.value || null)}
            placeholder={(recipientDict.titlePlaceholder as string) || 'e.g., Hiring Manager'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {(recipientDict.companyLabel as string) || 'Company Name'}
          </label>
          <input
            type="text"
            value={companyName || ''}
            aria-describedby={describedBy}
            onChange={(e) => onChange('company_name', e.target.value || null)}
            placeholder={(recipientDict.companyPlaceholder as string) || 'e.g., Acme Corp'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {(recipientDict.addressLabel as string) || 'Company Address'}
          </label>
          <textarea
            value={companyAddress || ''}
            aria-describedby={describedBy}
            onChange={(e) => onChange('company_address', e.target.value || null)}
            placeholder={(recipientDict.addressPlaceholder as string) || '123 Main St\nCity, State 12345'}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 resize-none"
          />
          {/* Always mounted, so the live region announces the warning when it appears. */}
          <p
            id={warningId}
            role="status"
            className={`text-sm text-amber-700 dark:text-amber-400${overflowsWindow ? ' mt-1' : ''}`}
          >
            {overflowsWindow ? windowWarning : null}
          </p>
          {/* Zero height and inside this field's block, so it adds no space to the section. */}
          <div className="relative h-0 overflow-hidden" aria-hidden="true">
            <div ref={measurer} data-testid="recipient-window-measurer" style={WINDOW_MEASURER_STYLE}>
              {recipientLines.map((line, index) => (
                <div key={index} style={line.multiline ? { whiteSpace: 'pre-line' } : undefined}>
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
