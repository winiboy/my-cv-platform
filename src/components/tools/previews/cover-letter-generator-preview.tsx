'use client'

import { Mail, Copy, FileText, Bold, Italic, Underline, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Translations for the CoverLetterGeneratorPreview component.
 */
export interface CoverLetterGeneratorPreviewTranslations {
  /** Header title text */
  aiGenerated: string
  /** Header subtitle text */
  personalizedLetter: string
  /** Copy button label */
  copy: string
  /** PDF button label */
  pdf: string
  /** DOCX button label */
  docx: string
  /** Improve button label */
  improve: string
  /** Bold formatting button label */
  bold: string
  /** Italic formatting button label */
  italic: string
  /** Underline formatting button label */
  underline: string
}

/**
 * Props for CoverLetterGeneratorPreview component.
 */
export interface CoverLetterGeneratorPreviewProps {
  /** Optional translations for UI labels */
  translations?: Partial<CoverLetterGeneratorPreviewTranslations>
}

/**
 * Default translations (French/English mixed matching original design).
 */
const DEFAULT_TRANSLATIONS: CoverLetterGeneratorPreviewTranslations = {
  aiGenerated: 'AI-Generated Content',
  personalizedLetter: 'Your personalized cover letter',
  copy: 'Copy',
  pdf: 'PDF',
  docx: 'DOCX',
  improve: 'Ameliorer av...',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
}

/**
 * Action button configuration for the toolbar.
 */
interface ActionButton {
  /** Display label for the button */
  label: string
  /** Icon component to display */
  icon?: typeof Copy
  /** Whether the button has primary/accent styling */
  isPrimary?: boolean
}

/**
 * Sample cover letter content matching the screenshot reference.
 */
const SAMPLE_LETTER_CONTENT = `Cher Responsable du Recrutement,

Je me permets de vous contacter pour exprimer mon interet pour le poste d'instructeur allemand suisse que vous avez annonce. En tant qu'apprenti bijoutier-joaillier passionne et motive, je suis conscient que mes competences en matiere de communication et de pedagogie pourraient etre utiles pour enseigner la langue allemande suisse a des expatries qui s'installent en Suisse. Mon experience dans la fabrication et la reparation de bijoux m'a appris l'importance de la precision, de la patience et de la capacite a expliquer...`

/**
 * Creates action buttons configuration with translations.
 */
function createActionButtons(t: CoverLetterGeneratorPreviewTranslations): ActionButton[] {
  return [
    { label: t.copy, icon: Copy },
    { label: t.pdf, icon: FileText },
    { label: t.docx, icon: FileText },
    { label: t.improve, icon: Sparkles, isPrimary: true },
  ]
}

/**
 * Action button component for the toolbar.
 * Renders a styled button with optional icon and label.
 */
function ActionButtonItem({ button }: { button: ActionButton }) {
  const IconComponent = button.icon

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
        button.isPrimary
          ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
      )}
    >
      {IconComponent && (
        <IconComponent className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {button.label}
    </button>
  )
}

/**
 * Formatting toolbar button component.
 * Renders a simple icon button for text formatting.
 */
function FormatButton({
  icon: IconComponent,
  label,
}: {
  icon: typeof Bold
  label: string
}) {
  return (
    <button
      type="button"
      className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
      aria-label={label}
    >
      <IconComponent className="w-4 h-4" aria-hidden="true" />
    </button>
  )
}

/**
 * CoverLetterGeneratorPreview displays a static preview of the Cover Letter Generator output.
 * Shows:
 * - Header with mail icon, title, and subtitle
 * - Action buttons row (Copy, PDF, DOCX, Ameliorer)
 * - Formatting toolbar (Bold, Italic, Underline)
 * - Sample cover letter content
 *
 * This is a static display component using hardcoded sample data
 * matching the design in Screenshot/5-Lettre-de-motivation.png.
 *
 * @param props - Component props
 * @param props.translations - Optional translations for UI labels
 */
export default function CoverLetterGeneratorPreview({
  translations,
}: CoverLetterGeneratorPreviewProps) {
  const t: CoverLetterGeneratorPreviewTranslations = {
    ...DEFAULT_TRANSLATIONS,
    ...translations,
  }

  const actionButtons = createActionButtons(t)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header section with mail icon */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-teal-100">
          <Mail className="w-5 h-5 text-teal-600" aria-hidden="true" />
        </div>
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-slate-800">
            {t.aiGenerated}
          </h3>
          <p className="text-xs text-slate-500">{t.personalizedLetter}</p>
        </div>
      </div>

      {/* Action buttons row */}
      <div className="flex flex-wrap items-center gap-2">
        {actionButtons.map((button) => (
          <ActionButtonItem key={button.label} button={button} />
        ))}
      </div>

      {/* Formatting toolbar */}
      <div className="flex items-center gap-0.5 border-b border-slate-200 pb-2">
        <FormatButton icon={Bold} label={t.bold} />
        <FormatButton icon={Italic} label={t.italic} />
        <FormatButton icon={Underline} label={t.underline} />
      </div>

      {/* Letter content preview */}
      <div className="text-sm text-slate-700 leading-relaxed">
        <p className="whitespace-pre-line line-clamp-6">{SAMPLE_LETTER_CONTENT}</p>
      </div>
    </div>
  )
}
