/**
 * The four language flags of the product's language pickers: the grammar
 * checker's analysis language and the cover-letter editor's translation
 * buttons. One source, so both draw exactly the same SVGs
 * (cover-letter-export-translate, US-003, FR-4).
 *
 * Simple, lightweight representations of country flags. Each is decorative
 * (`aria-hidden`): the control that holds it carries the accessible name.
 */

export function FlagGB({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 30" width="20" height="10" aria-hidden="true">
      {/* Blue background */}
      <rect width="60" height="30" fill="#012169" />
      {/* White diagonal stripes */}
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      {/* Red diagonal stripes */}
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" />
      {/* White cross */}
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
      {/* Red cross */}
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}

export function FlagFR({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" width="20" height="13" aria-hidden="true">
      <rect width="10" height="20" fill="#002395" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ED2939" />
    </svg>
  )
}

export function FlagDE({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" width="20" height="13" aria-hidden="true">
      <rect width="30" height="6.67" fill="#000" />
      <rect y="6.67" width="30" height="6.67" fill="#DD0000" />
      <rect y="13.33" width="30" height="6.67" fill="#FFCC00" />
    </svg>
  )
}

export function FlagIT({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" width="20" height="13" aria-hidden="true">
      <rect width="10" height="20" fill="#009246" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#CE2B37" />
    </svg>
  )
}

/** A language a flag stands for. */
export type FlagLanguage = 'en' | 'fr' | 'de' | 'it'

/**
 * The languages in the order every picker shows them, each with its flag and
 * its name in its own language.
 */
export const LANGUAGE_FLAG_OPTIONS = [
  { code: 'en', Flag: FlagGB, fullName: 'English' },
  { code: 'fr', Flag: FlagFR, fullName: 'Français' },
  { code: 'de', Flag: FlagDE, fullName: 'Deutsch' },
  { code: 'it', Flag: FlagIT, fullName: 'Italiano' },
] as const satisfies readonly { code: FlagLanguage; Flag: typeof FlagGB; fullName: string }[]
