'use client'

import { Plus, Trash2, GripVertical } from 'lucide-react'
import { RichTextEditor } from '../rich-text-editor'

interface BodySectionProps {
  bodyParagraphs: string[]
  onChange: (paragraphs: string[]) => void
  dict: Record<string, unknown>
}

export function BodySection({
  bodyParagraphs,
  onChange,
  dict,
}: BodySectionProps) {
  const editorDict = ((dict.coverLetters || {}) as Record<string, unknown>).editor as Record<string, unknown> || {}
  const bodyDict = (editorDict.body || {}) as Record<string, unknown>

  const addParagraph = () => {
    onChange([...bodyParagraphs, ''])
  }

  const updateParagraph = (index: number, value: string) => {
    const updated = [...bodyParagraphs]
    updated[index] = value
    onChange(updated)
  }

  const removeParagraph = (index: number) => {
    const updated = bodyParagraphs.filter((_, i) => i !== index)
    onChange(updated)
  }

  const moveParagraph = (from: number, to: number) => {
    if (to < 0 || to >= bodyParagraphs.length) return
    const updated = [...bodyParagraphs]
    const [moved] = updated.splice(from, 1)
    updated.splice(to, 0, moved)
    onChange(updated)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {(bodyDict.title as string) || 'Body Paragraphs'}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {(bodyDict.hint as string) ||
              'Explain why you are a good fit for the role. Highlight relevant experience and achievements.'}
          </p>
        </div>
        <button
          type="button"
          onClick={addParagraph}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          {(bodyDict.addParagraph as string) || 'Add Paragraph'}
        </button>
      </div>

      <div className="space-y-4">
        {bodyParagraphs.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-center">
            <p className="text-slate-600 dark:text-slate-400 mb-3">
              {(bodyDict.emptyState as string) || 'No body paragraphs yet'}
            </p>
            <button
              type="button"
              onClick={addParagraph}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              {(bodyDict.addFirst as string) || 'Add Your First Paragraph'}
            </button>
          </div>
        ) : (
          bodyParagraphs.map((paragraph, index) => (
            <div
              key={index}
              className="group relative border border-slate-200 dark:border-slate-700 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveParagraph(index, index - 1)}
                    disabled={index === 0}
                    className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-sm font-medium text-slate-500">
                  {(bodyDict.paragraphLabel as string) || 'Paragraph'} {index + 1}
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => removeParagraph(index)}
                  className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title={(bodyDict.removeParagraph as string) || 'Remove paragraph'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <RichTextEditor
                id={`body-paragraph-${index}`}
                value={paragraph}
                onChange={(html) => updateParagraph(index, html)}
                placeholder={(bodyDict.paragraphPlaceholder as string) || 'Write your paragraph...'}
                minHeight="100px"
                dict={dict}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
