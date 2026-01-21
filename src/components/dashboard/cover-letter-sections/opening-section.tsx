'use client'

import { RichTextEditor } from '../rich-text-editor'

interface OpeningSectionProps {
  greeting: string
  openingParagraph: string | null
  onChange: (field: string, value: string | null) => void
  dict: Record<string, unknown>
}

export function OpeningSection({
  greeting,
  openingParagraph,
  onChange,
  dict,
}: OpeningSectionProps) {
  const editorDict = ((dict.coverLetters || {}) as Record<string, unknown>).editor as Record<string, unknown> || {}
  const openingDict = (editorDict.opening || {}) as Record<string, unknown>

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {(openingDict.title as string) || 'Opening'}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            {(openingDict.greetingLabel as string) || 'Greeting'}
          </label>
          <input
            type="text"
            value={greeting}
            onChange={(e) => onChange('greeting', e.target.value)}
            placeholder={(openingDict.greetingPlaceholder as string) || 'Dear Hiring Manager,'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {(openingDict.paragraphLabel as string) || 'Opening Paragraph'}
          </label>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
            {(openingDict.paragraphHint as string) ||
              'Introduce yourself and explain why you are writing. Mention the position and how you learned about it.'}
          </p>
          <RichTextEditor
            id="opening-paragraph"
            value={openingParagraph || ''}
            onChange={(html) => onChange('opening_paragraph', html || null)}
            placeholder={(openingDict.paragraphPlaceholder as string) || 'Write your opening paragraph...'}
            minHeight="120px"
            dict={dict}
          />
        </div>
      </div>
    </div>
  )
}
