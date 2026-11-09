'use client'

import { useEffect, useId } from 'react'
import { DEFAULT_SIGN_OFF_OPTION, localizedSignOffOptions, signOffOptionsFor } from '@/lib/cover-letter-sign-off'
import { COVER_LETTER_FIELD_LIMITS } from '@/lib/cover-letter-limits'
import {
  COVER_LETTER_NO_ANNEXES,
  type CoverLetterSenderDetailField,
  type CoverLetterSenderDetails,
  type CoverLetterSenderField,
  type CoverLetterSenderFieldError,
} from '@/lib/cover-letter-sender'

interface SignatureSectionProps {
  signOff: string
  /** Printed when the sign-off is empty: the default of the letter's language. */
  defaultSignOff: string
  senderName: string | null
  /** What the sender fields show: the stored details, with the linked CV as fallback. */
  senderDetails: CoverLetterSenderDetails
  annexes: string | null
  /** The fields the last save refused, and why. */
  errors: Partial<Record<CoverLetterSenderField, CoverLetterSenderFieldError>>
  /** A refused field to move focus to; `onFocusHandled` is called once it has it. */
  focusField: CoverLetterSenderField | null
  onFocusHandled: () => void
  onChange: (field: string, value: string | null) => void
  dict: Record<string, unknown>
}

const INPUT_CLASS =
  'w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800'

const INVALID_CLASS = 'border-red-500 dark:border-red-500'

/** The sender detail inputs, in the order the Swiss sender block prints them. */
const SENDER_DETAIL_INPUTS: ReadonlyArray<{
  field: CoverLetterSenderDetailField
  key: 'street' | 'postalLocality' | 'phone' | 'email'
  type: 'text' | 'tel' | 'email'
  autoComplete: string
  label: string
  placeholder: string
}> = [
  { field: 'sender_street', key: 'street', type: 'text', autoComplete: 'street-address', label: 'Street and number', placeholder: 'e.g., Rue de Bourg 12' },
  { field: 'sender_postal_locality', key: 'postalLocality', type: 'text', autoComplete: 'off', label: 'Postcode and locality', placeholder: 'e.g., 1003 Lausanne' },
  { field: 'sender_phone', key: 'phone', type: 'tel', autoComplete: 'tel', label: 'Phone', placeholder: 'e.g., +41 21 555 01 42' },
  { field: 'sender_email', key: 'email', type: 'email', autoComplete: 'email', label: 'Email', placeholder: 'e.g., name@example.ch' },
]

const FIELD_ID_SUFFIX: Record<CoverLetterSenderField, string> = {
  sender_street: 'street',
  sender_postal_locality: 'postal-locality',
  sender_phone: 'phone',
  sender_email: 'email',
  annexes: 'annexes',
}

export function SignatureSection({
  signOff,
  defaultSignOff,
  senderName,
  senderDetails,
  annexes,
  errors,
  focusField,
  onFocusHandled,
  onChange,
  dict,
}: SignatureSectionProps) {
  const idPrefix = useId()
  const editorDict = ((dict.coverLetters || {}) as Record<string, unknown>).editor as Record<string, unknown> || {}
  const signatureDict = (editorDict.signature || {}) as Record<string, unknown>
  const errorsDict = (signatureDict.errors || {}) as Record<string, unknown>
  const text = (key: string, fallback: string) => (signatureDict[key] as string) || fallback

  const signOffOptions = signOffOptionsFor(
    localizedSignOffOptions((signatureDict.signOffOptions || {}) as Record<string, unknown>),
    signOff,
    defaultSignOff,
  )
  // The empty sign-off option reads as the default it prints, not blank.
  const signOffOptionLabel = (option: string) => (option === DEFAULT_SIGN_OFF_OPTION ? defaultSignOff : option)
  const signOffHintId = `${idPrefix}-sign-off-hint`

  const fieldId = (field: CoverLetterSenderField) => `${idPrefix}-${FIELD_ID_SUFFIX[field]}`
  const errorId = (field: CoverLetterSenderField) => `${fieldId(field)}-error`
  const errorMessage = (field: CoverLetterSenderField): string | null => {
    const error = errors[field]
    if (error === 'invalidEmail') {
      return (errorsDict.invalidEmail as string) || 'Enter a valid email address, or leave the field empty.'
    }
    if (error === 'tooLong') {
      return ((errorsDict.tooLong as string) || 'At most {max} characters.').replace(
        '{max}',
        String(COVER_LETTER_FIELD_LIMITS[field]),
      )
    }
    return null
  }

  useEffect(() => {
    if (focusField === null) return
    document.getElementById(`${idPrefix}-${FIELD_ID_SUFFIX[focusField]}`)?.focus()
    onFocusHandled()
  }, [focusField, idPrefix, onFocusHandled])

  // An empty annexes field is `null`: the default list. Only the checkbox
  // stores the empty string that means "no Annexes block".
  const noAnnexes = annexes === COVER_LETTER_NO_ANNEXES
  const annexesHintId = `${fieldId('annexes')}-hint`
  const noAnnexesId = `${idPrefix}-no-annexes`
  const annexesError = errorMessage('annexes')

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {(signatureDict.title as string) || 'Signature'}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            {(signatureDict.signOffLabel as string) || 'Sign-off'}
          </label>
          <select
            value={signOff}
            onChange={(e) => onChange('sign_off', e.target.value)}
            aria-describedby={signOffHintId}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          >
            {signOffOptions.map((option) => (
              <option key={option} value={option}>
                {signOffOptionLabel(option)}
              </option>
            ))}
          </select>
          <p id={signOffHintId} className="mt-1 text-xs text-slate-500">
            {text('signOffDefaultHint', "The first sign-off is the default for the letter's language.")}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {(signatureDict.nameLabel as string) || 'Your first and last name'}
          </label>
          <input
            type="text"
            value={senderName || ''}
            onChange={(e) => onChange('sender_name', e.target.value || null)}
            placeholder={(signatureDict.namePlaceholder as string) || 'Your full name'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          />
        </div>

        {SENDER_DETAIL_INPUTS.map(({ field, key, type, autoComplete, label, placeholder }) => {
          const error = errorMessage(field)
          return (
            <div key={field}>
              <label htmlFor={fieldId(field)} className="block text-sm font-medium mb-1">
                {text(`${key}Label`, label)}
              </label>
              <input
                id={fieldId(field)}
                type={type}
                value={senderDetails[field] ?? ''}
                // An emptied field stores the empty string, not null: it was
                // cleared on purpose, and must not fall back to the CV again.
                onChange={(e) => onChange(field, e.target.value)}
                placeholder={text(`${key}Placeholder`, placeholder)}
                maxLength={COVER_LETTER_FIELD_LIMITS[field]}
                autoComplete={autoComplete}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId(field) : undefined}
                className={`${INPUT_CLASS} ${error ? INVALID_CLASS : ''}`}
              />
              {error && (
                <p id={errorId(field)} className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
          )
        })}

        <div>
          <label htmlFor={fieldId('annexes')} className="block text-sm font-medium mb-1">
            {text('annexesLabel', 'Enclosures')}
          </label>
          <textarea
            id={fieldId('annexes')}
            rows={2}
            value={annexes ?? ''}
            onChange={(e) => onChange('annexes', e.target.value || null)}
            placeholder={noAnnexes ? undefined : text('annexesPlaceholder', 'e.g., CV, references, diplomas')}
            maxLength={COVER_LETTER_FIELD_LIMITS.annexes}
            disabled={noAnnexes}
            aria-invalid={annexesError ? true : undefined}
            aria-describedby={annexesError ? `${annexesHintId} ${errorId('annexes')}` : annexesHintId}
            className={`${INPUT_CLASS} resize-y disabled:opacity-60 disabled:cursor-not-allowed ${annexesError ? INVALID_CLASS : ''}`}
          />
          <p id={annexesHintId} className="mt-1 text-xs text-slate-500">
            {noAnnexes
              ? text('noAnnexesHint', 'No enclosures will be printed.')
              : text('annexesHint', "Leave empty to print the default list, in the letter's language.")}
          </p>
          {annexesError && (
            <p id={errorId('annexes')} className="mt-1 text-xs text-red-600 dark:text-red-400">
              {annexesError}
            </p>
          )}
          <label htmlFor={noAnnexesId} className="mt-1 flex items-center gap-2 min-h-[44px] text-sm">
            <input
              id={noAnnexesId}
              type="checkbox"
              checked={noAnnexes}
              onChange={(e) => onChange('annexes', e.target.checked ? COVER_LETTER_NO_ANNEXES : null)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-2 focus:ring-teal-500 dark:border-slate-600"
            />
            <span>{text('noAnnexesLabel', 'No enclosures block')}</span>
          </label>
        </div>
      </div>
    </div>
  )
}
