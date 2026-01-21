'use client'

import { RichTextEditor } from '../rich-text-editor'

interface ClosingSectionProps {
  closingParagraph: string | null
  onChange: (value: string | null) => void
  dict: Record<string, unknown>
}

export function ClosingSection({
  closingParagraph,
  onChange,
  dict,
}: ClosingSectionProps) {
  const editorDict = ((dict.coverLetters || {}) as Record<string, unknown>).editor as Record<string, unknown> || {}
  const closingDict = (editorDict.closing || {}) as Record<string, unknown>

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {(closingDict.title as string) || 'Closing'}
      </h3>

      <div>
        <label className="block text-sm font-medium mb-1">
          {(closingDict.paragraphLabel as string) || 'Closing Paragraph'}
        </label>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
          {(closingDict.paragraphHint as string) ||
            'Express your enthusiasm and include a call to action. Thank the reader for their consideration.'}
        </p>
        <RichTextEditor
          id="closing-paragraph"
          value={closingParagraph || ''}
          onChange={(html) => onChange(html || null)}
          placeholder={(closingDict.paragraphPlaceholder as string) || 'Write your closing paragraph...'}
          minHeight="100px"
          dict={dict}
        />
      </div>
    </div>
  )
}
