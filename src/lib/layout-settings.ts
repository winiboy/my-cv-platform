/**
 * The one layout model for a resume, plus the helpers that read and write it.
 *
 * Three storage formats meet here:
 *
 * 1. `resumes.layout_settings` JSONB — the account's copy and the only place
 *    layout state is written from now on. Carries the whole model.
 *
 * 2. `custom_sections` JSONB, the layout model's previous home, which held four
 *    of its nineteen properties:
 *      { items: CustomSection[], layoutSettings: ResumeLayoutSettings }
 *    Legacy rows hold a plain `CustomSection[]` with no layout settings.
 *    Still READ, so rows written before 007 keep working; no longer written.
 *
 * 3. The `resume_slider_settings_${id}` localStorage blob written by the
 *    editor and the preview wrapper, which carries the full model. A cache,
 *    not an authority — see `resolveResumeLayout`.
 */

import type { ResumeLayoutSettings, ResumeTemplate } from '@/types/database'
import { CONTACT_FIELD_IDS, type ContactFieldId } from '@/lib/contact-visibility'
import { resolveResumeTemplate } from '@/lib/resume-templates'

/** Known sidebar section IDs — used for validation and migration. */
const VALID_SIDEBAR_IDS = ['keyAchievements', 'skills', 'languages', 'training'] as const

/** Known main-content section IDs — used for validation. */
const VALID_MAIN_IDS = ['summary', 'experience', 'education'] as const

/** Editor sidebar section IDs (used by the drag-and-drop UI). */
export type EditorSidebarId = (typeof VALID_SIDEBAR_IDS)[number]

/** Editor main-content section IDs. */
export type EditorMainId = (typeof VALID_MAIN_IDS)[number]

// ---------- The one layout model ----------

/**
 * Every layout property a resume carries, in one place.
 *
 * This is the union of three stores that each previously declared their own
 * copy of the same properties and the same defaults:
 *
 *   - the `resume_slider_settings_${id}` localStorage blob written by
 *     `resume-editor.tsx` and `resume-preview-wrapper.tsx`;
 *   - `ResumeLayoutSettings`, the section order/visibility subset persisted
 *     in the `custom_sections` JSONB column;
 *   - the `download-docx` query parameters.
 *
 * Two DOCX query parameters are deliberately NOT here. `locale` comes from
 * the route segment and `template` from the resume row: both are already
 * canonical elsewhere and neither is layout state. Pulling them in would
 * create the second source of truth this model exists to remove.
 *
 * Section IDs are the EDITOR vocabulary. Each Swiss template draws its own
 * fixed sequence of sections and reads only their visibility from these IDs;
 * that sequence is template identity, not a competing copy of this default.
 */
export interface ResumeLayoutModel {
  /** Candidate-name font size in px. */
  titleFontSize: number
  /** Gap in px between the name and the contact line. */
  titleGap: number
  /** Contact-line font size in px. */
  contactFontSize: number
  /** Section-heading font size in px. */
  sectionTitleFontSize: number
  /** Section body font size in px. */
  sectionDescFontSize: number
  /** Gap in px between a section heading and its body. */
  sectionGap: number
  /** Gap in px between the contact line and the first section. */
  headerGap: number
  /** Sidebar colour hue, 0-360. */
  sidebarHue: number
  /** Sidebar colour saturation percentage. */
  sidebarSaturation: number
  /** Sidebar colour lightness percentage. */
  sidebarBrightness: number
  /** Global typography multiplier. */
  fontScale: number
  /** CSS font-family stack. */
  fontFamily: string
  /** Sidebar top margin in px. */
  sidebarTopMargin: number
  /** Main-content top margin in px. */
  mainContentTopMargin: number
  /** Sidebar width as a percentage of page width. */
  sidebarWidth: number
  /**
   * Section order and visibility.
   *
   * Readonly because `DEFAULT_RESUME_LAYOUT` is frozen and is handed out by
   * reference — `resume-preview.tsx` uses these very arrays as prop defaults. A mutable declared type would let a future
   * `.sort()` type-check and then throw at render time in production; readonly
   * turns that into a compile error. Call sites that need to mutate copy with
   * `[...]`, which they already do.
   */
  readonly sidebarOrder: readonly EditorSidebarId[]
  readonly mainContentOrder: readonly EditorMainId[]
  readonly hiddenSidebarSections: readonly EditorSidebarId[]
  readonly hiddenMainSections: readonly EditorMainId[]
  /**
   * The contact details the owner unticked in the Contact tab, which no
   * output draws (swiss-cv-templates FR-14). Empty means everything is shown,
   * which is also what a blob written before the list existed resolves to.
   * Read through `visibleContactDetails` in `@/lib/contact-visibility`.
   */
  readonly hiddenContactFields: readonly ContactFieldId[]
}

/**
 * The single set of layout defaults.
 *
 * Every value here is the value that was previously duplicated across
 * `resume-preview-wrapper.tsx`, `resume-editor.tsx`, `resume-preview.tsx`,
 * the original templates and `download-docx/route.ts`. Nothing changed
 * while consolidating them — `layout-settings.test.ts` pins each value
 * literally, so editing one here fails the suite rather than silently moving
 * every surface at once.
 *
 * Frozen because it is shared by reference across the whole app. The arrays
 * are frozen at runtime AND declared `readonly` on the model, so a consumer
 * that tries to mutate one fails to compile rather than corrupting the default
 * for every later reader.
 */
export const DEFAULT_RESUME_LAYOUT: Readonly<ResumeLayoutModel> = Object.freeze({
  titleFontSize: 24,
  titleGap: 8,
  contactFontSize: 12,
  sectionTitleFontSize: 16,
  sectionDescFontSize: 14,
  sectionGap: 12,
  headerGap: 12,
  sidebarHue: 240,
  sidebarSaturation: 85,
  sidebarBrightness: 35,
  fontScale: 1,
  fontFamily: 'Arial, Helvetica, sans-serif',
  sidebarTopMargin: 64,
  mainContentTopMargin: 24,
  sidebarWidth: 30,
  sidebarOrder: Object.freeze([...VALID_SIDEBAR_IDS]),
  mainContentOrder: Object.freeze([...VALID_MAIN_IDS]),
  hiddenSidebarSections: Object.freeze([] as EditorSidebarId[]),
  hiddenMainSections: Object.freeze([] as EditorMainId[]),
  hiddenContactFields: Object.freeze([] as ContactFieldId[]),
})

/**
 * A model under construction, before it is handed out.
 *
 * The model's array properties are `readonly` so callers cannot mutate a
 * shared default; a builder inside this module still needs to assign them, so
 * it strips the modifier for its own local use only.
 */
type MutableLayoutDraft = {
  -readonly [K in keyof ResumeLayoutModel]?: ResumeLayoutModel[K]
}

type NumericLayoutKey = {
  [K in keyof ResumeLayoutModel]: ResumeLayoutModel[K] extends number ? K : never
}[keyof ResumeLayoutModel]

/**
 * The range each control can actually produce, taken from the clamp that
 * defines it rather than from an assumed zero floor.
 *
 * Every entry is the range a control could produce. The per-property size,
 * sidebar colour, font scale, sidebar margin and sidebar width controls
 * belonged to the five original templates' editor, removed by
 * swiss-templates-only-page-fidelity US-001; their ranges
 * stay so that the values those controls stored remain valid when parsed.
 * `null` means no control ever wrote the key, so the only values in storage
 * for those three are the default and whatever an older blob already holds.
 *
 * This table exists for validation, not for rendering — the components remain
 * the owners of their own clamps. `layout-settings.test.ts` asserts that every
 * accepted range below admits BOTH endpoints of its control range, so
 * narrowing a bound past a value a user can reach fails the suite instead of
 * silently resetting their resume on the next page load.
 */
export const LAYOUT_CONTROL_RANGES: Readonly<
  Record<NumericLayoutKey, readonly [number, number] | null>
> = Object.freeze({
  titleFontSize: [16, 48],
  titleGap: null,
  contactFontSize: [10, 18],
  sectionTitleFontSize: [12, 24],
  sectionDescFontSize: [10, 18],
  sectionGap: null,
  headerGap: null,
  // The former hue slider; its eyedropper rounded a full turn to 0-360.
  sidebarHue: [0, 360],
  // No slider; the former eyedropper yielded Math.round(s * 100).
  sidebarSaturation: [0, 100],
  // The former brightness slider; the eyedropper was clamped to the same range.
  sidebarBrightness: [20, 50],
  // The former font-size slider.
  fontScale: [0.7, 1.3],
  sidebarTopMargin: [24, 200],
  // The floor is NEGATIVE: main content could be dragged up past the top of
  // its own box, and -20 is an ordinary saved value.
  mainContentTopMargin: [-20, 80],
  sidebarWidth: [20, 45],
})

/**
 * Accepted range for each numeric property.
 *
 * Each bound starts from the control range above and widens outward, so a
 * value a user can produce is never rejected — rejecting one would restore a
 * different number than the user left behind and silently change how their
 * resume renders. Out-of-range values are dropped, never clamped: clamping is
 * an output change too, so the only safe answer for a value outside these
 * bounds is to fall back to the documented default.
 *
 * Widening is per key rather than a single formula, because a proportional
 * widening of a font-size control produces a negative lower bound and would
 * defeat the point. The remaining headroom exists to stop a corrupted or
 * hostile blob (`NaN`, `1e9`, a negative font size) from reaching a style
 * attribute, while leaving room for a control range to be retuned without
 * invalidating blobs already in the field.
 */
const NUMERIC_RANGES: Readonly<Record<NumericLayoutKey, readonly [number, number]>> =
  Object.freeze({
    titleFontSize: [1, 200], // control [16, 48]; floor stays positive
    titleGap: [0, 500], // no control; gaps have no negative meaning
    contactFontSize: [1, 200], // control [10, 18]
    sectionTitleFontSize: [1, 200], // control [12, 24]
    sectionDescFontSize: [1, 200], // control [10, 18]
    sectionGap: [0, 500], // no control
    headerGap: [0, 500], // no control
    sidebarHue: [0, 360], // control [0, 360]; the hue circle is the whole domain
    sidebarSaturation: [0, 100], // control [0, 100]; percentage is the whole domain
    sidebarBrightness: [0, 100], // control [20, 50]; percentage is the whole domain
    fontScale: [0.1, 5], // control [0.7, 1.3]; floor stays positive
    sidebarTopMargin: [0, 500], // control [24, 200]
    mainContentTopMargin: [-200, 500], // control [-20, 80]; floor derived from the drag clamp
    sidebarWidth: [0, 100], // control [20, 45]; percentage is the whole domain
  })

const NUMERIC_LAYOUT_KEYS = Object.keys(NUMERIC_RANGES) as NumericLayoutKey[]

/** Longest font stack accepted. The shipped stacks are well under 100 chars. */
const MAX_FONT_FAMILY_LENGTH = 200

/**
 * Characters with no legitimate place in a CSS font-family stack, which would
 * be meaningful if the value reached a raw stylesheet, an unescaped `style`
 * attribute or a DOCX run.
 *
 * React escapes style objects, so this is defence in depth rather than the
 * only barrier — but the value is user-controlled and crosses into DOCX
 * generation and a URL query parameter, so it is checked at the boundary
 * instead of being trusted downstream. Spaces, commas, quotes, hyphens and
 * digits are legitimate (`'Source Sans 3', 'Source Sans Pro', sans-serif`)
 * and are accepted.
 */
const UNSAFE_FONT_FAMILY_CHARS = ['<', '>', '{', '}', ';', '\\', '/', '@']

function isValidFontFamily(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.trim().length === 0) return false
  if (value.length > MAX_FONT_FAMILY_LENGTH) return false
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    // Reject C0 controls and DEL outright; they cannot appear in a font stack.
    if (code < 0x20 || code === 0x7f) return false
    if (UNSAFE_FONT_FAMILY_CHARS.includes(value[i])) return false
  }
  return true
}

/**
 * Keeps the known IDs from `value`, in the given order, without repeats.
 * Returns null when `value` is not an array, so the caller can tell
 * "absent or unusable" from "present and empty".
 */
function parseIdList<T extends string>(value: unknown, known: readonly T[]): T[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const result: T[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    if (!(known as readonly string[]).includes(entry)) continue
    if (seen.has(entry)) continue
    seen.add(entry)
    result.push(entry as T)
  }
  return result
}

/**
 * Reads a stored layout blob and returns only the properties that are both
 * present and usable.
 *
 * Total by construction: `null`, a string, an array, unknown keys, wrong
 * types, `NaN` and out-of-range numbers all produce an omission rather than a
 * throw. A resume whose settings blob is odd must still render — with
 * defaults for the parts that are odd and the user's own values for the rest.
 *
 * Partial rather than complete on purpose. Callers layer several sources
 * (the database, then localStorage) and need to know which keys a source
 * actually carried; filling absent keys with defaults here would let a
 * localStorage blob that never mentioned `sidebarOrder` overwrite the order
 * stored on the account. Use `resolveLayoutModel` when a complete model is
 * what you want.
 */
export function parseLayoutModel(input: unknown): Partial<ResumeLayoutModel> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }

  const raw = input as Record<string, unknown>
  const result: MutableLayoutDraft = {}

  for (const key of NUMERIC_LAYOUT_KEYS) {
    const value = raw[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const [min, max] = NUMERIC_RANGES[key]
    if (value < min || value > max) continue
    result[key] = value
  }

  if (isValidFontFamily(raw.fontFamily)) {
    result.fontFamily = raw.fontFamily
  }

  // A stored sidebar order goes through the same migration the editor and the
  // preview have always applied, so an order saved before 'languages' existed
  // still resolves to a complete, de-duplicated list.
  //
  // Note the asymmetry with `mainContentOrder` below: an EMPTY sidebar order is
  // rebuilt into the full default list and therefore counts as a value the
  // store carried, while an empty main order is discarded and falls through to
  // whatever a lower-priority store says. That is `migrateSidebarOrder`'s
  // documented behaviour — an unusable order must not render an empty sidebar —
  // and neither shape is reachable from any writer, which is why it is recorded
  // here rather than changed.
  if (Array.isArray(raw.sidebarOrder)) {
    result.sidebarOrder = migrateSidebarOrder(
      raw.sidebarOrder.filter((entry): entry is string => typeof entry === 'string'),
    ) as EditorSidebarId[]
  }

  // An order that survives validation with nothing left in it would render an
  // empty document, so it is treated as unusable and falls through to the
  // default. An explicitly emptied list is not reachable from the editor,
  // which always keeps all three main sections present and expresses
  // visibility through `hiddenMainSections`.
  const mainContentOrder = parseIdList(raw.mainContentOrder, VALID_MAIN_IDS)
  if (mainContentOrder !== null && mainContentOrder.length > 0) {
    result.mainContentOrder = mainContentOrder
  }

  // Empty IS the meaningful default for the hidden lists, so an empty result
  // is kept rather than discarded.
  const hiddenSidebarSections = parseIdList(raw.hiddenSidebarSections, VALID_SIDEBAR_IDS)
  if (hiddenSidebarSections !== null) {
    result.hiddenSidebarSections = hiddenSidebarSections
  }

  const hiddenMainSections = parseIdList(raw.hiddenMainSections, VALID_MAIN_IDS)
  if (hiddenMainSections !== null) {
    result.hiddenMainSections = hiddenMainSections
  }

  const hiddenContactFields = parseIdList(raw.hiddenContactFields, CONTACT_FIELD_IDS)
  if (hiddenContactFields !== null) {
    result.hiddenContactFields = hiddenContactFields
  }

  return result
}

/**
 * Reads a stored layout blob into a complete model, filling anything absent
 * or unusable from `DEFAULT_RESUME_LAYOUT`.
 */
export function resolveLayoutModel(input: unknown): ResumeLayoutModel {
  return { ...DEFAULT_RESUME_LAYOUT, ...parseLayoutModel(input) }
}

/**
 * Largest stored layout blob this application will read.
 *
 * `parseLayoutModel` already makes an enormous blob harmless to RENDERING —
 * it keeps at most the nineteen known keys and bounds every one of them — so
 * this bound is not what protects a style attribute. It protects the work
 * done before that point: parsing megabytes of attacker-chosen JSON out of
 * localStorage on every mount, and walking it key by key.
 *
 * The server-side twin of this bound is `resumes_layout_settings_check` in
 * migration 007, which is what actually stops an oversized value from being
 * STORED — the column is written straight from the browser under the table's
 * UPDATE policy, and a policy decides whose row may be written, not what may
 * be put in it. This constant is the same number expressed on the read side,
 * so a value that somehow predates or bypasses the constraint still degrades
 * to defaults rather than reaching a reader.
 *
 * Compared against string length, while the constraint counts UTF-8 bytes. A
 * string's length in UTF-16 code units is never greater than its length in
 * UTF-8 bytes, so anything the database accepted passes here too: the two
 * bounds cannot disagree in the direction that would reject a legitimate
 * value. 4096 against a worst case of 1074 bytes — twenty properties with
 * every list full, the longest accepted font stack, and every number as wide
 * as a double can print inside its accepted range. The model the CONTROLS can
 * actually produce is 849 bytes. Both are asserted in `layout-settings.test.ts`
 * so this bound cannot be narrowed past a legitimate value without failing.
 */
export const MAX_LAYOUT_BLOB_LENGTH = 4096

/**
 * Reads one blob out of a store — the database column, the legacy
 * `custom_sections` value, or the localStorage string — into the partial model
 * it can be trusted to carry.
 *
 * This is the boundary where untrusted stored state enters the application.
 * Accepts either JSON text or an already-parsed value, because the two stores
 * hand back different things: `localStorage.getItem` returns a string,
 * supabase-js returns JSONB already parsed.
 *
 * Total, like `parseLayoutModel`: oversized, unparseable, wrongly-shaped and
 * individually invalid input all produce omissions rather than a throw. There
 * is no input for which a resume fails to render.
 */
export function parseStoredLayout(input: unknown): Partial<ResumeLayoutModel> {
  if (input === null || input === undefined) return {}

  if (typeof input === 'string') {
    if (input.length > MAX_LAYOUT_BLOB_LENGTH) return {}
    try {
      return parseLayoutModel(JSON.parse(input) as unknown)
    } catch {
      // A blob that is not JSON at all carries nothing, which is exactly what
      // an empty partial says. Nothing downstream needs to distinguish it from
      // an absent blob.
      return {}
    }
  }

  if (typeof input !== 'object' || Array.isArray(input)) return {}

  let serialized: string
  try {
    serialized = JSON.stringify(input)
  } catch {
    return {}
  }
  if (serialized.length > MAX_LAYOUT_BLOB_LENGTH) return {}

  return parseLayoutModel(input)
}

/** The two persisted layout stores, as they arrive on a resume row. */
export interface PersistedLayoutSource {
  /** `resumes.layout_settings` — the current home. NULL until first written. */
  layout_settings: unknown
  /** `resumes.custom_sections` — the previous home, still read. */
  custom_sections: unknown
}

/**
 * THE PRECEDENCE RULE. The one place it is decided, and the one place to read
 * or change it.
 *
 * Every surface that renders a resume resolves its layout here: the account's
 * persisted settings and the browser's cached ones go in, one complete model
 * comes out. No caller layers these sources itself, because a caller that did
 * would be a second copy of this rule that could disagree with it.
 *
 * THE RULE
 *
 *   For each property: the account's persisted value wins if the account has
 *   one. Otherwise the browser's cached value is adopted. Otherwise the
 *   documented default.
 *
 * WHY PER PROPERTY AND NOT PER RESUME
 *
 * "Persisted wins" without qualification would be wrong at exactly one moment
 * — the first load after this ships — and wrong in the direction that destroys
 * data. A resume that persisted only its section order (all four properties
 * the old `custom_sections` blob could hold) would then have its fifteen
 * typography, colour and spacing properties resolved from server-side defaults,
 * silently discarding a customization the user had really made and could see
 * on screen a moment earlier.
 *
 * Per property, the four persisted ones win and the fifteen absent ones leave
 * the browser's values in place, to be adopted and written back by US-004.
 *
 * This is a finer statement of the same rule, not a different one, and the
 * distinction disappears once persistence is live: the writer always stores
 * the complete model, so a blob written by this application carries all
 * nineteen keys and beats the cache outright. The two only differ across the
 * migration boundary, which is precisely the case the qualification exists for.
 *
 * The legacy `custom_sections` blob sits between the cache and the column for
 * the same reason: it is the account speaking, so it outranks the browser, but
 * it is the account's OLD words, so the column outranks it. During the
 * transition a row may have been backfilled into the column, still carry the
 * legacy blob, or both; under a per-property merge all three cases resolve to
 * the same answer and none of them can lose a value.
 *
 * THE COST OF RANKING THE LEGACY BLOB ABOVE THE CACHE, STATED PLAINLY.
 *
 * Only the editor ever wrote that blob, and only while the resume's template
 * was `modern`; localStorage was written by both surfaces for every template.
 * So a resume that was once Modern and whose sections were reordered later
 * under another template has a legacy blob OLDER than its cache, and this
 * ordering shows the older one — the section order the ACCOUNT holds, not the
 * one this browser holds.
 *
 * That is the behaviour US-003 asks for rather than a defect: the account is
 * the cross-device truth, and "the account wins even where this browser
 * disagrees" is the whole point of inverting the previous rule. It is NOT the
 * failure the qualification above guards, which is specifically about EMPTY
 * defaults beating a real customization — here the winning value is a real one
 * the user chose, on a device the account remembers.
 *
 * It is written down because it is the one case where a user sees a visible
 * change with no action of their own, and because reversing it later means
 * reversing these two lines and nothing else.
 *
 * @param resume  The row's two persisted stores.
 * @param cached  The `resume_slider_settings_${id}` localStorage string, or
 *                null when the browser has none.
 */
export function resolveResumeLayout(
  resume: PersistedLayoutSource,
  cached: string | null,
): ResumeLayoutModel {
  return {
    ...DEFAULT_RESUME_LAYOUT,
    ...parseStoredLayout(cached),
    ...parseStoredLayout(extractLayoutSettings(resume.custom_sections)),
    ...parseStoredLayout(resume.layout_settings),
  }
}

/**
 * The layout model as it goes INTO a store: the same nineteen properties with
 * the model's `readonly` array modifiers dropped.
 *
 * `readonly` on the model exists to stop a consumer mutating the frozen shared
 * default. A value on its way to a JSONB column is a fresh object nobody else
 * holds, and `Json` — the generated database type — describes mutable arrays,
 * so a readonly one does not satisfy it. Widening here rather than casting at
 * the call site keeps the guarantee where it matters and drops it only where
 * it is provably irrelevant.
 */
export type StoredLayoutModel = {
  -readonly [K in keyof ResumeLayoutModel]: ResumeLayoutModel[K] extends readonly (infer E)[]
    ? E[]
    : ResumeLayoutModel[K]
}

/**
 * A layout model as plain JSON data, ready to be written to a store.
 *
 * Exactly the model's own properties in a fixed key order, so two equal models
 * always produce the same value and an unrelated key that crept into a stored
 * blob is not carried forward. The arrays are copied, so the returned value
 * shares no structure with the caller's model — or with the frozen default.
 *
 * This is what goes into `resumes.layout_settings`, whose CHECK constraint
 * requires a JSON object; `serializeLayoutModel` is the same value as text,
 * which is what localStorage takes.
 */
export function toStoredLayout(model: ResumeLayoutModel): StoredLayoutModel {
  return {
    titleFontSize: model.titleFontSize,
    titleGap: model.titleGap,
    contactFontSize: model.contactFontSize,
    sectionTitleFontSize: model.sectionTitleFontSize,
    sectionDescFontSize: model.sectionDescFontSize,
    sectionGap: model.sectionGap,
    headerGap: model.headerGap,
    sidebarHue: model.sidebarHue,
    sidebarSaturation: model.sidebarSaturation,
    sidebarBrightness: model.sidebarBrightness,
    fontScale: model.fontScale,
    fontFamily: model.fontFamily,
    sidebarTopMargin: model.sidebarTopMargin,
    mainContentTopMargin: model.mainContentTopMargin,
    sidebarWidth: model.sidebarWidth,
    sidebarOrder: [...model.sidebarOrder],
    mainContentOrder: [...model.mainContentOrder],
    hiddenSidebarSections: [...model.hiddenSidebarSections],
    hiddenMainSections: [...model.hiddenMainSections],
    hiddenContactFields: [...model.hiddenContactFields],
  }
}

/**
 * Serializes a layout model for a string-valued store (localStorage).
 */
export function serializeLayoutModel(model: ResumeLayoutModel): string {
  return JSON.stringify(toStoredLayout(model))
}

// ---------- Section order migration ----------

/**
 * Migrates a sidebar order array to ensure 'languages' is present.
 * Inserts 'languages' after 'skills' if possible, otherwise appends it.
 * Also filters out any IDs that are not in the known valid set, collapses
 * repeated IDs to their first occurrence, and appends any missing defaults.
 *
 * A repeated ID would otherwise render the same section twice and produce
 * duplicate React keys, so de-duplication happens before any insertion.
 */
export function migrateSidebarOrder(order: string[]): string[] {
  // Filter to only known valid IDs, keeping the first occurrence of each.
  // Set iteration order is insertion order, so the user's chosen order stands.
  const filtered = Array.from(
    new Set(
      order.filter((id): id is string =>
        VALID_SIDEBAR_IDS.includes(id as typeof VALID_SIDEBAR_IDS[number])
      )
    )
  )

  // No recognized IDs at all (empty or fully unrecognized input): fall back to
  // the canonical default order rather than building one up from scratch.
  // Without this, 'languages' would be pushed onto the empty array below and
  // become the first section, which is not the default the editor and the
  // templates use. VALID_SIDEBAR_IDS is declared in canonical default order,
  // so it doubles as that default — see the test that pins the order literally.
  if (filtered.length === 0) {
    return [...VALID_SIDEBAR_IDS]
  }

  // Ensure 'languages' is present
  if (!filtered.includes('languages')) {
    const skillsIndex = filtered.indexOf('skills')
    if (skillsIndex >= 0) {
      filtered.splice(skillsIndex + 1, 0, 'languages')
    } else {
      filtered.push('languages')
    }
  }

  // Add back any missing defaults that weren't in the original array
  for (const id of VALID_SIDEBAR_IDS) {
    if (!filtered.includes(id)) {
      filtered.push(id)
    }
  }

  return filtered
}

// ---------- custom_sections JSONB wrapping ----------

/**
 * Wrapper shape stored in custom_sections when layout settings are present.
 */
interface CustomSectionsWithLayout {
  items: unknown[]
  layoutSettings: ResumeLayoutSettings
}

/**
 * Type guard: returns true if the value is the wrapped object format
 * (has both `items` array and `layoutSettings` object).
 */
function isWrappedFormat(value: unknown): value is CustomSectionsWithLayout {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    'layoutSettings' in obj &&
    obj.layoutSettings !== null &&
    typeof obj.layoutSettings === 'object' &&
    !Array.isArray(obj.layoutSettings)
  )
}

/**
 * Extracts layout settings from the custom_sections JSONB value.
 *
 * Returns the ResumeLayoutSettings if the value uses the wrapped format,
 * or null if the value is a legacy array, null, or otherwise missing settings.
 *
 * READ ONLY. Nothing writes this shape any more — migration 007 gave layout
 * state its own column and `resolveResumeLayout` reads this only so that rows
 * written before 007 keep the section order their owner chose. The three
 * shapes a row can be in (null, a bare `CustomSection[]`, or the wrapped
 * object) are all handled: the first two carry no layout settings and return
 * null, which resolves to whatever the newer stores say.
 */
export function extractLayoutSettings(
  customSections: unknown
): ResumeLayoutSettings | null {
  if (!isWrappedFormat(customSections)) {
    return null
  }
  return customSections.layoutSettings
}

// ---------- Which layout controls a template applies ----------

/**
 * A group of layout-model keys that one editor control writes.
 *
 * Grouped rather than keyed per property because the editor's controls are
 * grouped: one drag-and-drop panel writes both sidebar-section keys. Gating per
 * group is gating per control, which is what FR-9 is about.
 *
 * The only control left is the sections panel. No Swiss template draws a
 * stored font, font scale, sidebar colour or per-property size
 * (swiss-cv-templates FR-4, FR-12), so the controls that wrote those keys were
 * removed with the legacy templates. The stored fields themselves remain in
 * the layout model and keep round-tripping: removing them is out of scope
 * (swiss-templates-only-page-fidelity, Out of Scope).
 */
export type LayoutControlId = 'sidebarSections'

/** The model keys each control writes. Nothing else may write them. */
export const LAYOUT_CONTROL_KEYS: Readonly<
  Record<LayoutControlId, readonly (keyof ResumeLayoutModel)[]>
> = Object.freeze({
  sidebarSections: Object.freeze(['sidebarOrder', 'hiddenSidebarSections'] as const),
})

/**
 * THE TEMPLATE x CONTROL MATRIX (Part 3 US-014, FR-9).
 *
 * Which of the grouped controls above the editor OFFERS for each template. A
 * control is offered exactly where the template applies it; where it is not
 * offered, the stored keys are left untouched and apply again the moment a
 * template that reads them is selected.
 *
 * Every Swiss template offers the sections panel for visibility only: every
 * row it lists is fixed in `TEMPLATE_EDITOR_SECTIONS`, so nothing reorders.
 *
 * NOT IN THIS MAP: the main-content panel, which the editor offers for every
 * template; which of its rows each template lists is `TEMPLATE_EDITOR_SECTIONS`.
 */
export const TEMPLATE_LAYOUT_CONTROLS: Readonly<
  Record<ResumeTemplate, readonly LayoutControlId[]>
> = Object.freeze({
  /**
   * swissVocational draws its sizes from its own design at scale 1.0 in its
   * own typeface, renders no in-Preview size input and paints no user colour. It has
   * no sidebar, but skills, languages and training are SIDEBAR ids in the
   * model and it honours their stored visibility on every surface, so the
   * sidebar panel is offered for their visibility toggles only: every row it
   * lists is fixed in `TEMPLATE_EDITOR_SECTIONS` below, so nothing reorders.
   */
  swissVocational: Object.freeze(['sidebarSections'] as const),
  /** swissCommerce: the same reasoning as swissVocational, with its own fixed rows below. */
  swissCommerce: Object.freeze(['sidebarSections'] as const),
  /**
   * swissTrades: the same reasoning as swissVocational. Its dark column is a
   * fixed part of its design, not the user's sidebar: it paints no user colour,
   * and every row it lists is fixed below.
   */
  swissTrades: Object.freeze(['sidebarSections'] as const),
  /** swissHealth: the same reasoning as swissVocational, with its own fixed rows below. */
  swissHealth: Object.freeze(['sidebarSections'] as const),
  /** swissFinance: the same reasoning as swissVocational, with its own fixed rows below. */
  swissFinance: Object.freeze(['sidebarSections'] as const),
  /**
   * swissEngineering: the same reasoning as swissTrades. Its light column is a
   * fixed part of its design, not the user's sidebar: it paints no user colour,
   * and every row it lists is fixed below.
   */
  swissEngineering: Object.freeze(['sidebarSections'] as const),
  /** swissIt: the same reasoning as swissVocational, with its own fixed rows below. */
  swissIt: Object.freeze(['sidebarSections'] as const),
  /** swissExecutive: the same reasoning as swissVocational, with its own fixed rows below. */
  swissExecutive: Object.freeze(['sidebarSections'] as const),
  /** swissAcademic: the same reasoning as swissVocational, with its own fixed rows below. */
  swissAcademic: Object.freeze(['sidebarSections'] as const),
  /**
   * swissFirstJob: the same reasoning as swissTrades. Its light violet sidebar
   * is a fixed part of its design, not the user's sidebar: it paints no user
   * colour, and every row it lists is fixed below.
   */
  swissFirstJob: Object.freeze(['sidebarSections'] as const),
})

/**
 * Whether the editor offers `control` while `template` is selected.
 *
 * Takes a `string` because `resumes.template` is stored text: a value outside
 * the ten identifiers still has to render. It resolves through
 * `resolveResumeTemplate`, as the editor's own template switch does.
 */
export function templateOffersLayoutControl(template: string, control: LayoutControlId): boolean {
  return TEMPLATE_LAYOUT_CONTROLS[resolveResumeTemplate(template)].includes(control)
}

/**
 * Whether a template draws the photo (swiss-cv-templates FR-5, FR-14): every
 * Swiss template except `swissAcademic`. The editor shows the
 * Contact tab's photo row exactly where this is true.
 *
 * A `Record` over the built templates, so a template added to the set fails
 * to compile here until its photo is stated.
 */
export const TEMPLATE_DRAWS_PHOTO: Readonly<Record<ResumeTemplate, boolean>> = Object.freeze({
  swissVocational: true,
  swissCommerce: true,
  swissTrades: true,
  swissHealth: true,
  swissFinance: true,
  swissEngineering: true,
  swissIt: true,
  swissExecutive: true,
  // The PRD's one exception to FR-5: no photo on any output, so the Contact
  // tab offers neither the photo row nor its tick for it (FR-3).
  swissAcademic: false,
  swissFirstJob: true,
})

/**
 * Whether `template` draws the photo. Takes a `string` and resolves an unknown
 * value like `templateOffersLayoutControl` does, through `resolveResumeTemplate`.
 */
export function templateDrawsPhoto(template: string): boolean {
  return TEMPLATE_DRAWS_PHOTO[resolveResumeTemplate(template)]
}

/** The per-property size keys the layout model stores. No Swiss template applies one. */
export type PerPropertySizeKey =
  | 'titleFontSize'
  | 'contactFontSize'
  | 'sectionTitleFontSize'
  | 'sectionDescFontSize'

/**
 * The per-property sizes each template APPLIES, which is not the same question
 * as which it offers a control for. No Swiss template applies a stored size: each
 * draws its own sizes, so the stored values are preserved and adjustable nowhere.
 */
export const TEMPLATE_APPLIED_SIZE_KEYS: Readonly<
  Record<ResumeTemplate, readonly PerPropertySizeKey[]>
> = Object.freeze({
  swissVocational: Object.freeze([] as const),
  swissCommerce: Object.freeze([] as const),
  swissTrades: Object.freeze([] as const),
  swissHealth: Object.freeze([] as const),
  swissFinance: Object.freeze([] as const),
  swissEngineering: Object.freeze([] as const),
  swissIt: Object.freeze([] as const),
  swissExecutive: Object.freeze([] as const),
  swissAcademic: Object.freeze([] as const),
  swissFirstJob: Object.freeze([] as const),
})

// ---------- Which section ids the editor's panels offer ----------

/**
 * Which section rows the editor's two drag-and-drop panels LIST for a
 * template, and which of those it lets the user drag (Part 3 US-015
 * criterion 7, FR-9).
 *
 * `TEMPLATE_LAYOUT_CONTROLS` above answers the same question one level
 * coarser — whether a whole panel is offered at all — and stays the place to
 * withdraw a panel. This map is for the case US-014 could not express: a panel
 * that is right to offer, listing only the ids the template renders, and
 * pinning those it draws in a fixed place.
 *
 * WHAT A GATE HERE MUST NOT DO. Hiding a row must not rewrite what is stored
 * for it (FR-6, and the PRD's "A stored layout value is deleted or rewritten
 * because its control is hidden"). So this is a DISPLAY filter only: the
 * editor's drag handler continues to splice the FULL stored order, and
 * `parseLayoutModel` continues to accept every id it accepted before.
 */
export interface TemplateEditorSections {
  /** Sidebar ids the panel lists, in the stored order's own sequence. */
  readonly sidebar: readonly EditorSidebarId[]
  /** Main ids the panel lists, in the stored order's own sequence. */
  readonly main: readonly EditorMainId[]
  /**
   * Of the ids listed above, those the template draws in a FIXED place: the
   * row keeps its visibility toggle and loses its drag handle, because the
   * template has nowhere else to draw it.
   */
  readonly fixed: readonly (EditorSidebarId | EditorMainId)[]
}

export const TEMPLATE_EDITOR_SECTIONS: Readonly<
  Record<ResumeTemplate, TemplateEditorSections>
> = Object.freeze({
  /**
   * swissVocational draws its sections in one fixed sequence (summary,
   * experience, education, training, then skills and languages), so every
   * row it lists keeps its visibility toggle and none can be dragged. It does
   * not draw keyAchievements, so that row is not listed.
   */
  swissVocational: Object.freeze({
    // In the order the template draws them: with every row fixed, the panel
    // lists them so (`listedEditorSections`), and its numbers are true.
    sidebar: Object.freeze(['training', 'skills', 'languages'] as const),
    main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
    fixed: Object.freeze([...DEFAULT_RESUME_LAYOUT.mainContentOrder, 'training', 'skills', 'languages'] as const),
  }),
  /**
   * swissCommerce draws summary, experience, education, skills, languages,
   * then training, in that fixed sequence: every row it lists is fixed. It
   * does not draw keyAchievements, so that row is not listed.
   */
  swissCommerce: Object.freeze({
    // In the order the template draws them, as for swissVocational.
    sidebar: Object.freeze(['skills', 'languages', 'training'] as const),
    main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
    fixed: Object.freeze([...DEFAULT_RESUME_LAYOUT.mainContentOrder, 'skills', 'languages', 'training'] as const),
  }),
  /**
   * swissTrades draws summary, experience and education in its main column,
   * and skills, certifications (`training`) and languages in its dark column,
   * each in a fixed sequence: every row it lists is fixed. It does not draw
   * keyAchievements, so that row is not listed.
   */
  swissTrades: Object.freeze({
    // In the order the template draws them, as for swissVocational.
    sidebar: Object.freeze(['skills', 'training', 'languages'] as const),
    main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
    fixed: Object.freeze([...DEFAULT_RESUME_LAYOUT.mainContentOrder, 'skills', 'training', 'languages'] as const),
  }),
  /**
   * swissHealth draws summary, education, experience, certifications
   * (`training`), then skills and languages side by side, in that fixed
   * sequence: every row it lists is fixed, and both panels list their rows in
   * the order it draws them — education before experience. It does not draw
   * keyAchievements, so that row is not listed.
   */
  swissHealth: Object.freeze({
    sidebar: Object.freeze(['training', 'skills', 'languages'] as const),
    main: Object.freeze(['summary', 'education', 'experience'] as const),
    fixed: Object.freeze(['summary', 'education', 'experience', 'training', 'skills', 'languages'] as const),
  }),
  /**
   * swissFinance draws summary, experience, education, certifications
   * (`training`), then skills and languages as the rows of one table, in that
   * fixed sequence: every row it lists is fixed. It does not draw
   * keyAchievements, so that row is not listed.
   */
  swissFinance: Object.freeze({
    // In the order the template draws them, as for swissVocational.
    sidebar: Object.freeze(['training', 'skills', 'languages'] as const),
    main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
    fixed: Object.freeze([...DEFAULT_RESUME_LAYOUT.mainContentOrder, 'training', 'skills', 'languages'] as const),
  }),
  /**
   * swissEngineering draws summary, the projects as key-achievement cards
   * (`keyAchievements`) and experience in its main column, then education,
   * skills, languages and certifications (`training`) in its light column, each
   * in a fixed sequence: every row it lists is fixed. It draws
   * keyAchievements, as swissIt does, so that row is listed: the projects
   * the editor's Projects tab collects are its content, and hiding the row
   * hides the cards and their heading.
   */
  swissEngineering: Object.freeze({
    // In the order the template draws them, as for swissVocational.
    sidebar: Object.freeze(['keyAchievements', 'skills', 'languages', 'training'] as const),
    main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
    fixed: Object.freeze([...DEFAULT_RESUME_LAYOUT.mainContentOrder, 'keyAchievements', 'skills', 'languages', 'training'] as const),
  }),
  /**
   * swissIt draws summary, skills, experience, the projects as cards
   * (`keyAchievements`, under its own `projects` heading), education, then one
   * last section for the languages and the certifications (`training`), in a
   * fixed sequence: every row it lists is fixed. Hiding the projects row hides
   * the cards and their heading; hiding languages or certifications drops that
   * part of the last section, and the section with both.
   */
  swissIt: Object.freeze({
    // In the order the template draws them, as for swissVocational.
    sidebar: Object.freeze(['skills', 'keyAchievements', 'languages', 'training'] as const),
    main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
    fixed: Object.freeze([...DEFAULT_RESUME_LAYOUT.mainContentOrder, 'skills', 'keyAchievements', 'languages', 'training'] as const),
  }),
  /**
   * swissExecutive draws the summary (in its box, with no heading), the
   * projects as key achievements (`keyAchievements`), experience, education,
   * then one last section for the languages and the certifications (`training`),
   * in a fixed sequence: every row it lists is fixed. Its mockup draws no
   * skills, so the template draws none and the skills row is not listed (FR-3):
   * a control for a section it does not draw is not offered. The skills the
   * editor's Skills tab holds stay stored, unchanged, for the other templates.
   */
  swissExecutive: Object.freeze({
    // In the order the template draws them, as for swissVocational.
    sidebar: Object.freeze(['keyAchievements', 'languages', 'training'] as const),
    main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
    fixed: Object.freeze([...DEFAULT_RESUME_LAYOUT.mainContentOrder, 'keyAchievements', 'languages', 'training'] as const),
  }),
  /**
   * swissAcademic draws summary, education, experience, the projects as its
   * numbered publications (`keyAchievements`), the certifications as its
   * distinctions (`training`), then one last section for the skills and the
   * languages, in a fixed sequence: every row it lists is fixed. Hiding
   * skills or languages drops that part of the last section, and the section
   * with both.
   */
  swissAcademic: Object.freeze({
    // In the order the template draws them, as for swissVocational.
    sidebar: Object.freeze(['keyAchievements', 'training', 'skills', 'languages'] as const),
    main: Object.freeze(['summary', 'education', 'experience'] as const),
    fixed: Object.freeze(['summary', 'education', 'experience', 'keyAchievements', 'training', 'skills', 'languages'] as const),
  }),
  /**
   * swissFirstJob draws summary, experience and education in its main column,
   * then skills, languages and certifications (`training`) in its sidebar, each
   * in a fixed sequence: every row it lists is fixed. Its mockup draws no
   * projects, so the template draws none and the projects row is not listed.
   */
  swissFirstJob: Object.freeze({
    // In the order the template draws them, as for swissVocational.
    sidebar: Object.freeze(['skills', 'languages', 'training'] as const),
    main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
    fixed: Object.freeze([...DEFAULT_RESUME_LAYOUT.mainContentOrder, 'skills', 'languages', 'training'] as const),
  }),
})

/**
 * The rows one of the editor's panels lists, in the order it lists them.
 *
 * Normally the stored order, filtered to the rows the template lists: the
 * panel is where that order is changed. A panel whose every row is FIXED
 * changes no order, and the template draws those rows in a sequence of its
 * own, so it lists them in that sequence (the template's declared list) and
 * its row numbers say where each section is drawn. Only the Swiss templates
 * have such a panel; every other template's panels list exactly as before.
 *
 * A display order only: nothing here is written back to the model.
 */
export function listedEditorSections<Id extends EditorSidebarId | EditorMainId>(
  storedOrder: readonly Id[],
  listed: readonly Id[],
  fixed: readonly (EditorSidebarId | EditorMainId)[],
): Id[] {
  if (listed.length > 0 && listed.every((id) => fixed.includes(id))) return [...listed]
  return storedOrder.filter((id) => listed.includes(id))
}

/**
 * The section rows the editor's panels offer while `template` is selected.
 *
 * Takes a `string` for the same reason as `templateOffersLayoutControl`:
 * `resumes.template` is stored text, and a value outside the ten identifiers
 * still has to render. It resolves the same way, through `resolveResumeTemplate`.
 */
export function templateEditorSections(template: string): TemplateEditorSections {
  return TEMPLATE_EDITOR_SECTIONS[resolveResumeTemplate(template)]
}
