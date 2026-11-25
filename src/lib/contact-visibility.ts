import type { ResumeContact } from '@/types/database'

/**
 * Which contact details a CV shows (swiss-cv-templates FR-14).
 *
 * The owner ticks each detail in the Editor's Contact tab; what is unticked is
 * stored as `hiddenContactFields` in the layout model (`layout-settings.ts`).
 * Every output — the Editor live preview, the Preview page (and so the PDF)
 * and every Word generator — reads that one stored list through
 * `visibleContactDetails` below, so no output keeps a copy of the decision.
 *
 * Pure: no React and no `docx`, so the client bundle and the export route can
 * both import it.
 */

/**
 * The details that can be hidden, in the Contact tab's order. The full name is
 * not one of them: it is what a CV is.
 */
export const CONTACT_FIELD_IDS = [
  'title',
  'email',
  'phone',
  'location',
  'linkedin',
  'github',
  'website',
  'photo',
] as const

export type ContactFieldId = (typeof CONTACT_FIELD_IDS)[number]

/** The contact keys a field id hides: every id but `title` and `photo`. */
type HideableContactKey = Exclude<ContactFieldId, 'title' | 'photo'>

const HIDEABLE_CONTACT_KEYS: readonly HideableContactKey[] = [
  'email',
  'phone',
  'location',
  'linkedin',
  'github',
  'website',
]

/**
 * The hidden list after the owner ticks (`visible`) or unticks one field.
 *
 * Returned in `CONTACT_FIELD_IDS` order and without repeats whatever order the
 * ticks came in, so equal choices always store the same value.
 */
export function withContactFieldVisible(
  hidden: readonly ContactFieldId[],
  field: ContactFieldId,
  visible: boolean,
): ContactFieldId[] {
  return CONTACT_FIELD_IDS.filter((id) => (id === field ? !visible : hidden.includes(id)))
}

/** What a renderer draws of the CV title, the contact details and the photo. */
export interface VisibleContactDetails {
  /** The stored contact, less the hidden details. A fresh object: never written back. */
  contact: ResumeContact
  /** The stored CV title, or '' when it is hidden. */
  title: string
  /**
   * False when the title is hidden. Distinct from an empty `title` because
   * some templates draw a placeholder for an empty title and must draw
   * nothing at all for a hidden one.
   */
  titleVisible: boolean
  /** False when the photo is hidden: the output draws it as if there were none. */
  photoVisible: boolean
}

/**
 * The contact details an output draws.
 *
 * A hidden detail is treated exactly as an empty one, so each template's own
 * "draw it only when it has a value" test drops its label, icon and separator
 * with it — the same path a CV without that detail has always taken. With
 * nothing hidden the stored values come back unchanged, so a CV whose list is
 * missing or empty renders as it did before the list existed.
 *
 * The stored values are never touched: the form keeps showing them, and
 * ticking a detail again brings it back.
 *
 * @param source  The resume, or the subset of it these fields live in. Typed
 *                loosely because the route hands generators the raw row.
 * @param hidden  The layout model's `hiddenContactFields`.
 */
export function visibleContactDetails(
  source: { contact?: unknown; title?: string | null },
  hidden: readonly ContactFieldId[] = [],
): VisibleContactDetails {
  const stored = (source.contact ?? {}) as ResumeContact
  const contact: ResumeContact = { ...stored }
  for (const key of HIDEABLE_CONTACT_KEYS) {
    if (hidden.includes(key)) delete contact[key]
  }
  const titleVisible = !hidden.includes('title')
  return {
    contact,
    title: titleVisible ? source.title ?? '' : '',
    titleVisible,
    photoVisible: !hidden.includes('photo'),
  }
}
