'use client'

import { memo, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Briefcase, FileText, Layout, PenTool, Sparkles, type LucideIcon } from 'lucide-react'
import { ResumePreview } from '@/components/dashboard/resume-preview'
import type { Locale } from '@/lib/i18n'
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, PAGE_WIDTH_PX } from '@/lib/resume-page-size'
import { TEMPLATE_SAMPLE_RESUME } from '@/lib/template-sample-resume'
import type { Resume, ResumeTemplate } from '@/types/database'

interface TemplateOption {
  id: ResumeTemplate
  icon: LucideIcon
}

/**
 * The one list of templates a user can create a CV with, in the order every
 * creation surface shows them. A surface chooses only the default selection.
 */
export const TEMPLATE_OPTIONS: readonly TemplateOption[] = [
  { id: 'modern', icon: Sparkles },
  { id: 'classic', icon: FileText },
  { id: 'minimal', icon: Layout },
  { id: 'creative', icon: PenTool },
  { id: 'professional', icon: Briefcase },
]

/**
 * The option a radio-group key selects from `current`, or `null` when the key
 * does not move the selection. Arrow keys wrap, as the WAI-ARIA radio group
 * pattern specifies; Home and End jump to the first and last option.
 */
export function templateIdForKey(current: ResumeTemplate, key: string): ResumeTemplate | null {
  const index = TEMPLATE_OPTIONS.findIndex((option) => option.id === current)
  const last = TEMPLATE_OPTIONS.length - 1

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return TEMPLATE_OPTIONS[index >= last ? 0 : index + 1].id
    case 'ArrowLeft':
    case 'ArrowUp':
      return TEMPLATE_OPTIONS[index <= 0 ? last : index - 1].id
    case 'Home':
      return TEMPLATE_OPTIONS[0].id
    case 'End':
      return TEMPLATE_OPTIONS[last].id
    default:
      return null
  }
}

/**
 * A template's localized name and description from `common.json ->
 * resumes.templates`, the only place they are defined. A missing entry is a
 * translation defect the locale-parity test guards against, so it throws
 * rather than silently showing another language.
 */
function templateLabels(dict: Record<string, unknown>, id: ResumeTemplate): { name: string; description: string } {
  const resumes = dict.resumes as Record<string, unknown> | undefined
  const templates = resumes?.templates as Record<string, unknown> | undefined
  const name = templates?.[id]
  const description = templates?.[`${id}Desc`]

  if (typeof name !== 'string' || name === '' || typeof description !== 'string' || description === '') {
    throw new Error(`Missing translation for template "${id}" in common.json resumes.templates`)
  }

  return { name, description }
}

interface TemplateThumbnailPageProps {
  templateId: ResumeTemplate
  locale: Locale
  dict: Record<string, unknown>
}

/**
 * The sample resume drawn by `ResumePreview` in one template, at full page
 * width and with the default layout. No setter, photo or callback prop is
 * passed, so the template draws none of its editing affordances.
 *
 * Memoized so that changing the selection or the scale never re-renders a
 * whole template.
 */
export const TemplateThumbnailPage = memo(function TemplateThumbnailPage({
  templateId,
  locale,
  dict,
}: TemplateThumbnailPageProps) {
  const resume = useMemo<Resume>(() => ({ ...TEMPLATE_SAMPLE_RESUME, template: templateId }), [templateId])

  return <ResumePreview resume={resume} locale={locale} dict={dict} />
})

/**
 * An A4-proportioned window onto the first page of a template, scaled from
 * page width down to the window's fixed width.
 *
 * The width is fixed rather than fluid so that a card's height does not grow
 * with the width the layout gives it.
 *
 * The page is drawn only once the window has been measured. A CSS transform
 * cannot take a ratio of two lengths, so the scale needs the rendered width;
 * drawing nothing until then keeps the server render and the first client
 * render identical, so there is nothing to hydrate inside the window.
 *
 * The window is `aria-hidden` and `inert`: the option's accessible name is the
 * template name alone, and nothing a template draws can take focus or a click.
 */
const TemplateThumbnail = memo(function TemplateThumbnail({ templateId, locale, dict }: TemplateThumbnailPageProps) {
  const windowRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState<number | null>(null)

  useEffect(() => {
    const element = windowRef.current
    if (!element) return

    const measure = () => {
      const width = element.clientWidth
      if (width > 0) setScale(width / PAGE_WIDTH_PX)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={windowRef}
      aria-hidden="true"
      inert
      data-testid="template-thumbnail"
      data-template={templateId}
      className="pointer-events-none select-none relative w-28 shrink-0 overflow-hidden rounded border border-slate-200 dark:border-slate-700 bg-white"
      style={{ aspectRatio: `${PAGE_WIDTH_MM} / ${PAGE_HEIGHT_MM}` }}
    >
      {scale !== null && (
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: PAGE_WIDTH_PX, transform: `scale(${scale})` }}
        >
          <TemplateThumbnailPage templateId={templateId} locale={locale} dict={dict} />
        </div>
      )}
    </div>
  )
})

export interface TemplatePickerProps {
  /** The selected template. The caller owns it, and so chooses the default. */
  value: ResumeTemplate
  onChange: (id: ResumeTemplate) => void
  /** Freezes the selection, e.g. while the CV is being created. */
  disabled?: boolean
  /** Id of the element that labels the group. */
  labelledBy: string
  locale: Locale
  /** The `common` dictionary: template names and the thumbnails' section headings. */
  dict: Record<string, unknown>
}

/**
 * The template picker every CV-creation surface uses: a radio group with one
 * card per template, each showing a live thumbnail of that template.
 *
 * Keyboard behaviour follows the WAI-ARIA radio group pattern with a roving
 * tab stop: Tab reaches the selected option, arrow keys move and select, and
 * Space or Enter selects the focused option.
 */
export function TemplatePicker({ value, onChange, disabled = false, labelledBy, locale, dict }: TemplatePickerProps) {
  const baseId = useId()
  const optionRefs = useRef(new Map<ResumeTemplate, HTMLDivElement>())

  const options = useMemo(
    () => TEMPLATE_OPTIONS.map((option) => ({ ...option, ...templateLabels(dict, option.id) })),
    [dict]
  )

  const select = (id: ResumeTemplate) => {
    if (disabled || id === value) return
    onChange(id)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: ResumeTemplate) => {
    if (disabled) return

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      select(id)
      return
    }

    const next = templateIdForKey(id, event.key)
    if (next === null) return

    event.preventDefault()
    select(next)
    optionRefs.current.get(next)?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      {options.map((option) => {
        const Icon = option.icon
        const isSelected = value === option.id
        const nameId = `${baseId}-${option.id}-name`
        const descriptionId = `${baseId}-${option.id}-description`

        return (
          <div
            key={option.id}
            ref={(element) => {
              if (element) optionRefs.current.set(option.id, element)
              else optionRefs.current.delete(option.id)
            }}
            role="radio"
            aria-checked={isSelected}
            aria-disabled={disabled || undefined}
            aria-labelledby={nameId}
            aria-describedby={descriptionId}
            tabIndex={!disabled && isSelected ? 0 : -1}
            data-template={option.id}
            onClick={() => select(option.id)}
            onKeyDown={(event) => handleKeyDown(event, option.id)}
            className={`@container min-w-0 p-3 border-2 rounded-lg text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
              isSelected
                ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* The card follows its own width, not the viewport's: the same
                viewport can give it a full row (mobile, one column) or a narrow
                column (tablet, two columns beside the dashboard sidebar). The
                text goes beside the thumbnail only while the column left for it
                still fits the longest name and description word; otherwise it
                goes below, so no word is ever broken to fit. */}
            <div className="flex flex-col items-start gap-3 @[16rem]:flex-row">
              <TemplateThumbnail templateId={option.id} locale={locale} dict={dict} />
              {/* `break-words` is a last resort against overflow at widths no
                  layout above can serve; at supported widths no word breaks. */}
              <div className="min-w-0 self-stretch @[16rem]:flex-1">
                {/* The name sits beside the icon tile while the column is wide
                    enough for both, and drops below it otherwise. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span id={nameId} className="block min-w-0 break-words font-semibold">
                    {option.name}
                  </span>
                </div>
                <span id={descriptionId} className="block break-words text-sm text-slate-600 dark:text-slate-400">
                  {option.description}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
