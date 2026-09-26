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
 * Section IDs are the EDITOR vocabulary. The Modern, Classic and Minimal DOCX
 * generators each render a different set of sections and map into it from
 * these IDs; those vocabularies are template identity, not a competing copy
 * of this default.
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
   * reference — `resume-preview.tsx` and `professional-template.tsx` use these
   * very arrays as prop defaults. A mutable declared type would let a future
   * `.sort()` type-check and then throw at render time in production; readonly
   * turns that into a compile error. Call sites that need to mutate copy with
   * `[...]`, which they already do.
   */
  readonly sidebarOrder: readonly EditorSidebarId[]
  readonly mainContentOrder: readonly EditorMainId[]
  readonly hiddenSidebarSections: readonly EditorSidebarId[]
  readonly hiddenMainSections: readonly EditorMainId[]
}

/**
 * The single set of layout defaults.
 *
 * Every value here is the value that was previously duplicated across
 * `resume-preview-wrapper.tsx`, `resume-editor.tsx`, `resume-preview.tsx`,
 * `professional-template.tsx` and `download-docx/route.ts`. Nothing changed
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
 * Every entry mirrors a specific expression in a component, named here so the
 * two can be checked against each other. `null` means no control writes the
 * key today: `resume-preview.tsx` declares `setTitleGap`, `setSectionGap` and
 * `setHeaderGap` as props but never forwards them to any template, so the only
 * values that reach storage for those three are the default and whatever an
 * older blob already holds.
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
  // classic-template.tsx:74, creative-template.tsx:75, minimal-template.tsx:74
  titleFontSize: [16, 48],
  titleGap: null,
  // classic-template.tsx:121, creative-template.tsx:109, minimal-template.tsx:110
  contactFontSize: [10, 18],
  // classic-template.tsx:173, creative-template.tsx:182, minimal-template.tsx:145
  sectionTitleFontSize: [12, 24],
  // classic-template.tsx:242, creative-template.tsx:213, minimal-template.tsx:219
  sectionDescFontSize: [10, 18],
  sectionGap: null,
  headerGap: null,
  // resume-editor.tsx:1516-1517 slider; the eyedropper rounds a full turn to 0-360.
  sidebarHue: [0, 360],
  // resume-editor.tsx:282 — no slider; the eyedropper yields Math.round(s * 100).
  sidebarSaturation: [0, 100],
  // resume-editor.tsx:1491-1492 slider; hexToHsl clamps the eyedropper to the same range.
  sidebarBrightness: [20, 50],
  // resume-editor.tsx:1637-1638
  fontScale: [0.7, 1.3],
  // professional-template.tsx:144
  sidebarTopMargin: [24, 200],
  // professional-template.tsx:168 — the floor is NEGATIVE; main content can be
  // dragged up past the top of its own box, and -20 is an ordinary saved value.
  mainContentTopMargin: [-20, 80],
  // professional-template.tsx:218
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
 * value. 4096 against a worst case of 977 bytes — nineteen properties with
 * every list full, the longest accepted font stack, and every number as wide
 * as a double can print inside its accepted range. The model the CONTROLS can
 * actually produce is 752 bytes. Both are asserted in `layout-settings.test.ts`
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
  }
}

/**
 * Serializes a layout model for a string-valued store (localStorage).
 */
export function serializeLayoutModel(model: ResumeLayoutModel): string {
  return JSON.stringify(toStoredLayout(model))
}

// ---------- Whether the owner chose a font ----------

/**
 * The font the owner CHOSE, or null when they chose none.
 *
 * HOW "CHOSEN" IS REPRESENTED, AND WHY IT NEEDS NO MIGRATION (Part 3 US-012).
 *
 * `fontFamily` carries the answer itself. A stored stack equal to
 * `DEFAULT_RESUME_LAYOUT.fontFamily` records "no font chosen"; any other
 * accepted stack records the font chosen. That is the owner's decision of
 * 2026-09-15 stated as code, and it is the whole representation: no twentieth
 * property, no new column, no change to what a blob may hold. The
 * `resumes.layout_settings` JSONB keeps exactly the shape and the 4096-byte
 * `resumes_layout_settings_check` that migration 007 gave it, so NO SCHEMA
 * MIGRATION IS REQUIRED and no stored row has to be rewritten.
 *
 * A separate flag — a boolean key, or `fontFamily: null` — was rejected on two
 * grounds. It would have to be added to the model, to `toStoredLayout`, to the
 * localStorage blob and to every reader; and it would still have to decide what
 * a row written before it means, which is the same question this rule answers,
 * reached by way of a backfill. The sentinel answers it for every existing row
 * at once, and answers it the way criterion 1 requires: no resume changes font
 * merely because this shipped.
 *
 * WHAT IT COSTS, STATED PLAINLY. "The template default" and "the default stack"
 * are one state, not two. An owner who chooses a font and then chooses the
 * default stack again is back to not having chosen — which is the behaviour the
 * product wants (the template's own font returns) and the only reading under
 * which a user cannot get stuck with a choice they cannot undo. What it cannot
 * express is an owner who deliberately wants Arial ON A TEMPLATE WHOSE OWN FONT
 * IS NOT ARIAL: they get the template's font instead. Naming the same stack
 * under a second label would express it, and is the change to make if that is
 * ever asked for; nothing else here would move.
 *
 * Loading and saving is therefore a fixed point: `toStoredLayout` writes the
 * stack back unchanged, so the answer after a round trip is the answer before
 * it. `layout-settings.test.ts` pins that, and the back-to-default case above.
 *
 * Takes the stack rather than a whole model so that the Preview, which receives
 * `fontFamily` as a prop, and the DOCX generators, which receive it in
 * `DocxGeneratorSettings`, apply the one rule rather than two copies of it.
 */
export function chosenFontFamily(fontFamily: string): string | null {
  return fontFamily === DEFAULT_RESUME_LAYOUT.fontFamily ? null : fontFamily
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

// ---------- Section dispatch exhaustiveness ----------

/**
 * Compile-time exhaustiveness guard for every `switch` that renders a section
 * by its id — the DOCX generators' dispatches and `modern-template.tsx`'s.
 *
 * Called from `default`, where a `switch` narrows its subject to `never` only
 * while every member of the union has a case. Both ways a vocabulary can move
 * are therefore compile errors at every dispatch that calls it:
 *
 *  - REMOVING a member leaves a case clause naming something the union no
 *    longer has: `TS2678: Type '"training"' is not comparable to type
 *    'ModernSidebarId'`.
 *
 *  - ADDING a member leaves `default` reachable with it: `TS2345: Argument of
 *    type '"awards"' is not assignable to parameter of type 'never'`. Sharing
 *    the union alone does not catch this direction — an unguarded `default`
 *    has no notion of being complete, so the new section silently renders
 *    nothing on that surface while the build stays green.
 *
 * A RENAME is both at once.
 *
 * One definition, because the guarantee only reaches the dispatches that call
 * it. It lives here rather than in `docx-helpers.ts` because the Preview needs
 * it too, and a client component must not import from `src/app/api/**` — that
 * module also imports `docx`, which would enter the browser bundle.
 *
 * It deliberately does NOT throw. The unions describe values that arrive at
 * runtime as strings — `DocxGeneratorSettings` types the order arrays as
 * `string[]` — so a stray id is representable. The route filters every list
 * through `resolveResumeLayout` and the Preview's come from
 * `mapEditorOrderToModern`, so nothing valid lands here; throwing would only
 * turn stray stored layout state into a failed download or a broken Preview.
 * An unknown id renders nothing, exactly as it did before the guard existed.
 */
export function assertExhaustiveSection(sectionId: never): void {
  // Referenced so the parameter is not reported unused; intentionally inert.
  return sectionId
}

// ---------- Editor → Modern template section-ID mapping ----------

/**
 * Modern template sidebar section IDs.
 *
 * Exported so the Modern DOCX generator can name the same vocabulary this
 * module already produces, instead of restating the union a third time. A
 * private copy in a generator compiles happily while this one moves, which is
 * exactly how an export comes to render a section list the Preview does not.
 */
export type ModernSidebarId = 'contact' | 'education' | 'skills' | 'languages' | 'training'

/** Modern template main-content section IDs. Exported for the same reason. */
export type ModernMainId = 'summary' | 'experience'

/** IDs shared between editor sidebar and Modern sidebar. */
const SHARED_SIDEBAR_IDS: ReadonlySet<string> = new Set(['skills', 'languages', 'training'])

/** IDs valid in Modern main content. */
const VALID_MODERN_MAIN_IDS: ReadonlySet<string> = new Set(['summary', 'experience'])

/**
 * Exported so the one layout-state owner can name what it returns. The arrays
 * are mutable because they are freshly built below and handed straight to
 * `modern-template.tsx`, whose props are declared mutable.
 */
export interface ModernMappedOrder {
  modernSidebarOrder: ModernSidebarId[]
  modernMainOrder: ModernMainId[]
  hiddenModernSidebar: ModernSidebarId[]
  hiddenModernMain: ModernMainId[]
}

/**
 * Maps editor-level section order and visibility to the Modern template's
 * section IDs, which differ from the editor's generic set.
 *
 * Key differences:
 * - Modern sidebar always starts with 'contact', then 'education',
 *   followed by the shared sections (skills, languages, training)
 *   in the order the user chose in the editor.
 * - Modern sidebar does NOT have 'keyAchievements'.
 * - Modern main only contains 'summary' and 'experience'
 *   ('education' lives in the Modern sidebar).
 * - Hidden-section mapping follows the same rules, plus:
 *   if 'education' is hidden in the editor main, it becomes
 *   hidden in the Modern sidebar.
 */
export function mapEditorOrderToModern(
  editorSidebarOrder: readonly EditorSidebarId[],
  editorMainOrder: readonly EditorMainId[],
  hiddenSidebar: readonly EditorSidebarId[],
  hiddenMain: readonly EditorMainId[],
): ModernMappedOrder {
  // --- Sidebar order ---
  // 'contact' is always first, 'education' always second,
  // then the shared IDs in the user's chosen order.
  const sharedInOrder = editorSidebarOrder.filter(
    (id): id is ModernSidebarId & EditorSidebarId => SHARED_SIDEBAR_IDS.has(id),
  )
  const modernSidebarOrder: ModernSidebarId[] = ['contact', 'education', ...sharedInOrder]

  // --- Main order ---
  const modernMainOrder = editorMainOrder.filter(
    (id): id is ModernMainId => VALID_MODERN_MAIN_IDS.has(id),
  )

  // --- Hidden sidebar ---
  const hiddenSidebarSet = new Set<string>(hiddenSidebar)
  const hiddenModernSidebar: ModernSidebarId[] = []
  // If 'education' is hidden in editor main, hide it in Modern sidebar too
  if ((hiddenMain as readonly string[]).includes('education')) {
    hiddenModernSidebar.push('education')
  }
  for (const id of sharedInOrder) {
    if (hiddenSidebarSet.has(id)) {
      hiddenModernSidebar.push(id)
    }
  }

  // --- Hidden main ---
  const hiddenModernMain = hiddenMain.filter(
    (id): id is ModernMainId => VALID_MODERN_MAIN_IDS.has(id),
  )

  return { modernSidebarOrder, modernMainOrder, hiddenModernSidebar, hiddenModernMain }
}

/**
 * The Modern template's default section orders, DERIVED from the shared
 * default rather than restated.
 *
 * `mapEditorOrderToModern` is the one rule that turns an editor order into a
 * Modern one, so feeding it `DEFAULT_RESUME_LAYOUT` produces the Modern default
 * by construction. Both Modern surfaces fall back to these: `modern-template.tsx`
 * when it is given no order, `docx-modern.ts` when the mapped main order comes
 * back empty. They previously held a literal and a private derivation that
 * agreed only by inspection; `layout-settings.test.ts` pins both values
 * literally.
 *
 * Frozen because, like `DEFAULT_RESUME_LAYOUT`, they are shared by reference.
 */
const DEFAULT_MODERN_ORDER: ModernMappedOrder = mapEditorOrderToModern(
  DEFAULT_RESUME_LAYOUT.sidebarOrder,
  DEFAULT_RESUME_LAYOUT.mainContentOrder,
  DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  DEFAULT_RESUME_LAYOUT.hiddenMainSections,
)

export const DEFAULT_MODERN_SIDEBAR_ORDER: readonly ModernSidebarId[] = Object.freeze(
  DEFAULT_MODERN_ORDER.modernSidebarOrder,
)

export const DEFAULT_MODERN_MAIN_ORDER: readonly ModernMainId[] = Object.freeze(
  DEFAULT_MODERN_ORDER.modernMainOrder,
)

/**
 * The main order Modern actually draws, given whatever `mapEditorOrderToModern`
 * produced for the stored order.
 *
 * An empty result is unusable rather than a choice: a stored `mainContentOrder`
 * of `['education']` survives `parseLayoutModel` and then loses its only member
 * to the mapping, because Modern draws education in the sidebar, and no editor
 * action asks for a resume with neither summary nor experience — the editor
 * keeps every main section in the order and expresses removal through
 * `hiddenMainSections`. `parseLayoutModel` already answers the same question the
 * same way for an order that validates to empty.
 *
 * Here rather than in each caller (Part 3 US-010): the Preview, the DOCX
 * generator and the parity model's reference each applied their own condition,
 * and the Preview's differed, so the two surfaces drew different documents for
 * one stored value. Hidden sections are NOT applied here; they are a separate
 * choice each caller filters with afterwards, and hiding everything still
 * empties the column.
 */
export function resolveModernMainOrder(
  mapped: readonly ModernMainId[] | undefined,
): readonly ModernMainId[] {
  return mapped && mapped.length > 0 ? mapped : DEFAULT_MODERN_MAIN_ORDER
}

// ---------- Editor → single-column template section-ID mapping ----------

/**
 * Section IDs of the two single-column templates, Classic and Minimal.
 *
 * Both render the same six sections, and both collapse languages and
 * certifications into one `languagesAndCerts` section rendered as a two-column
 * grid. What they do NOT share is where those sections sit on the page —
 * `minimal-template.tsx` renders `projects` between `experience` and
 * `education`, `classic-template.tsx` after `skills` — but that is an ORDER,
 * stated per template by `CLASSIC_SEQUENCE` and `MINIMAL_SEQUENCE` below, not a
 * MEMBERSHIP. A union's declaration order is invisible to the compiler, so one
 * union states the membership truthfully, where two would be two copies of one
 * set free to drift apart.
 *
 * Exported for the same reason as `ModernSidebarId`. A private copy inside a
 * generator compiles happily while this one moves, which is exactly how an
 * export comes to render a section list the Preview does not.
 */
export type SingleColumnMainId =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'languagesAndCerts'

/**
 * Classic's and Minimal's own names for the shared vocabulary.
 *
 * Each generator names its template's contract rather than the shared one, so
 * that if the two ever genuinely diverge, replacing one alias with a union of
 * its own moves that template and leaves the other where it is (FR-6).
 *
 * What the separate names do NOT buy is mutual exclusion. TypeScript is
 * structural: even written out as two identical unions, either would be
 * accepted where the other is expected. They are a seam, not a wall.
 */
export type ClassicMainId = SingleColumnMainId
export type MinimalMainId = SingleColumnMainId

/**
 * Where a single-column template draws each of its sections, top to bottom,
 * as a rank per section.
 *
 * A `Record` over the whole union rather than a list, so that adding, removing
 * or renaming a member of `SingleColumnMainId` fails to compile here until the
 * template's position for it is stated — a list would accept a missing member
 * silently, which is exactly how a section comes to be dropped from an export.
 * `layout-settings.test.ts` pins what each sequence yields for the shared
 * default order, literally.
 */
type SingleColumnSequence = Readonly<Record<SingleColumnMainId, number>>

/**
 * `classic-template.tsx`: summary, experience, education, skills, projects,
 * then languages and certifications side by side.
 */
const CLASSIC_SEQUENCE: SingleColumnSequence = Object.freeze({
  summary: 0,
  experience: 1,
  education: 2,
  skills: 3,
  projects: 4,
  languagesAndCerts: 5,
})

/**
 * `minimal-template.tsx`: summary, experience, PROJECTS, education, skills,
 * then languages and certifications side by side.
 */
const MINIMAL_SEQUENCE: SingleColumnSequence = Object.freeze({
  summary: 0,
  experience: 1,
  projects: 2,
  education: 3,
  skills: 4,
  languagesAndCerts: 5,
})

/** Whether the editor's main-content order can position `id` at all. */
function isEditorMainId(id: string): id is EditorMainId {
  return (VALID_MAIN_IDS as readonly string[]).includes(id)
}

/**
 * Maps an editor main-content order onto a single-column template's sections.
 *
 * THE RULE
 *
 *   The template's sequence is a row of slots. The sections the input
 *   positions fill the slots those same sections occupy, in the input's order.
 *   A section the editor cannot position keeps its own slot. An editor section
 *   the input leaves out is not rendered.
 *
 * So the user's order permutes summary, experience and education among the
 * three places the template draws them, and skills, projects and the combined
 * languages-and-certifications section stay where the template draws them.
 * For the shared default order the result IS the template's sequence, which is
 * what each Preview renders.
 *
 * DECISION (Part 3 US-002): THE FILTERING CHANGED, NOT THE VOCABULARY
 *
 * Skills and projects were unreachable because this function took its
 * MEMBERSHIP from the editor's main-content order, which `parseLayoutModel`
 * filters to `VALID_MAIN_IDS` — summary, experience, education. Only
 * `languagesAndCerts` escaped, by being appended. Both DOCX exports therefore
 * dropped two sections both Previews render.
 *
 * Membership now comes from the template's own sequence, and the editor order
 * decides only the positions it can name. The alternative — adding `skills`
 * and `projects` to `VALID_MAIN_IDS` — was rejected on the evidence:
 *
 *  - The editor offers neither in its main-content panel on any template, so no
 *    writer would ever produce them there. Widening the vocabulary would not by
 *    itself put them into a single resume's order.
 *  - `VALID_MAIN_IDS` is also the editor's vocabulary for professional, modern
 *    and creative, and `DEFAULT_RESUME_LAYOUT.mainContentOrder` is built from
 *    it. Changing it changes the default order, the editor's main panel and
 *    what every other template is handed — a template-isolation breach (FR-5)
 *    for a defect confined to two templates.
 *  - `skills` is already a SIDEBAR id. Admitting it to the main list would give
 *    one section two competing positions in one stored model.
 *
 * `parseLayoutModel`'s filter is left exactly as it is: it guards stored,
 * untrusted state (FR-6) and is correct for the vocabulary it guards.
 *
 * WHY THE FIXED SLOTS FOLLOW THE PREVIEW
 *
 * The Preview is the fidelity contract for exports (FR-3). Since Part 3 US-009
 * both Previews render THIS function's result — `classic-template.tsx` and
 * `minimal-template.tsx` call their wrapper below and filter
 * `hiddenMainSections` from it, exactly as the two generators do — so the
 * sequences recorded above are the one statement of where each template draws
 * each section, and no surface restates them. The editor offers no control that
 * orders or hides skills and projects on these templates — `skills` appears
 * only in the sidebar panel, which neither single-column template reads on any
 * surface — so the only hiding a user can do for those two is per item, and
 * every surface honours it.
 *
 * DECISION (Part 3 US-009): WHERE `projects` SITS UNDER A REORDERED MAIN LIST
 *
 * US-002 left this undetermined. It is settled here as: `projects` keeps the
 * slot its own template draws it in — third for minimal, fifth for classic —
 * whatever the user does to the main order. The rule above is unchanged; this
 * records that it was chosen rather than inherited.
 *
 * The two templates therefore keep DIFFERENT projects placements, which is the
 * conflict US-009 names. One placement for both was rejected: the placement is
 * template identity, not layout state, and collapsing it would silently move
 * the section on one of the two templates for every existing resume — a
 * template-isolation breach (FR-5) and a visible change to documents whose
 * owners changed nothing. The shared vocabulary states which sections exist,
 * `CLASSIC_SEQUENCE` and `MINIMAL_SEQUENCE` state where each one is drawn, and
 * that separation is what lets one rule serve two designs.
 *
 * Anchoring `projects` to a neighbour instead — "always after experience" —
 * was rejected too: the model expresses no such relation, so the anchor would
 * be a second, implicit ordering rule living beside the sequence, and it has no
 * answer at all when its neighbour is hidden.
 *
 * What the decision costs, plainly: a user who moves `education` above
 * `summary` on minimal sees `projects` stay where it was, between the second
 * and third slots, rather than travelling with any section. That is the same
 * answer on the Preview, the print and the DOCX, which is what US-009 asks.
 *
 * WHY THE PARAMETER IS `readonly string[]`, WHERE THE MODERN MAPPING TAKES UNIONS
 *
 * `mapEditorOrderToModern` takes `EditorSidebarId` / `EditorMainId` because
 * every id it can receive is one. This function also accepts `'skills'`,
 * `'projects'`, `'languages'`, `'certifications'` and `'languagesAndCerts'`,
 * none of which is an `EditorMainId`. Those five are unreachable from the
 * application — the DOCX route and the parity reference resolve their lists
 * through `resolveResumeLayout` — and are kept as Part 2 kept them: dropping an
 * out-of-vocabulary id is a decision about stored state, not about this
 * omission. When one does arrive it is positioned like any other: it takes a
 * slot in the input's order instead of keeping its own.
 *
 * NO CAST ON THE PUSH. A `switch` over a `string` narrows the subject to the
 * case literals, so `positioned.push(id)` type-checks as written, and removing
 * or renaming a member of `SingleColumnMainId` fails on that line with TS2345.
 *
 * The result is never empty: every section the editor cannot position keeps
 * its slot, so on any input it holds at least skills, projects and
 * `languagesAndCerts` — a property both `generateClassicDocx` and
 * `generateMinimalDocx` rely on, and one the empty-input case pins.
 */
function mapEditorOrderToSingleColumn(
  rawOrder: readonly string[],
  sequence: SingleColumnSequence,
): SingleColumnMainId[] {
  const positioned: SingleColumnMainId[] = []
  const seen = new Set<SingleColumnMainId>()

  for (const id of rawOrder) {
    switch (id) {
      case 'summary':
      case 'experience':
      case 'education':
      case 'skills':
      case 'projects':
        if (!seen.has(id)) {
          positioned.push(id)
          seen.add(id)
        }
        break
      // Languages and certifications are treated as a combined section
      case 'languages':
      case 'certifications':
      case 'languagesAndCerts':
        if (!seen.has('languagesAndCerts')) {
          positioned.push('languagesAndCerts')
          seen.add('languagesAndCerts')
        }
        break
      default:
        // Ignore unknown section IDs
        break
    }
  }

  const slots = (Object.keys(sequence) as SingleColumnMainId[]).sort(
    (a, b) => sequence[a] - sequence[b],
  )

  // Every positioned id is a member of the union and therefore has exactly one
  // slot, so the positioned ids are consumed exactly once each, in order. The
  // index is still checked rather than asserted: this runs inside document
  // generation, where being one short must drop a section rather than write
  // `undefined` into a dispatch.
  const mapped: SingleColumnMainId[] = []
  let next = 0
  for (const slot of slots) {
    if (seen.has(slot)) {
      const positionedId: SingleColumnMainId | undefined = positioned[next]
      next += 1
      if (positionedId !== undefined) mapped.push(positionedId)
    } else if (!isEditorMainId(slot)) {
      mapped.push(slot)
    }
  }

  return mapped
}

/** Classic's section order for an editor main-content order; see `mapEditorOrderToSingleColumn`. */
export function mapEditorOrderToClassic(rawOrder: readonly string[]): ClassicMainId[] {
  return mapEditorOrderToSingleColumn(rawOrder, CLASSIC_SEQUENCE)
}

/** Minimal's section order for an editor main-content order; see `mapEditorOrderToSingleColumn`. */
export function mapEditorOrderToMinimal(rawOrder: readonly string[]): MinimalMainId[] {
  return mapEditorOrderToSingleColumn(rawOrder, MINIMAL_SEQUENCE)
}

// ---------- Editor → Creative template section-ID mapping ----------

/**
 * Creative's seven sections, as three vocabularies matching the three places
 * the template actually draws (Part 3 US-015).
 *
 * WHY THREE AND NOT ONE. `creative-template.tsx` is a gradient header above a
 * `grid-cols-3` body: one column of 1/3 and one of 2/3. A section cannot move
 * between those boxes without moving between two different widths and two
 * different heading sizes (`mb-4` and a `h-6` bar on the left, `mb-5` and a
 * `h-8` bar on the right), so "whatever the vocabulary allows must be
 * expressible in creative's actual layout" (criterion 2) means one vocabulary
 * per box. `docx-creative.ts` builds the same three boxes as a header table and
 * a two-cell body table, so the same division is the one the export can honour.
 *
 * THE `summary` DECISION: FIXED, NOT ORDERABLE (criterion 2).
 *
 * The Preview draws the summary inside the gradient header, between the name
 * and the contact line, in `text-white/90` on the gradient. It is not in either
 * column. Making it orderable would mean either moving it into a column — a
 * redesign of the template, which this story is not, and which would change
 * every existing creative resume — or inventing an order WITHIN the header,
 * where the only other occupants are the name and the contact rows, neither of
 * which the editor's vocabulary names. Neither is a layout the model can
 * express today.
 *
 * So `summary` is declared FIXED IN THE HEADER and carries visibility only: its
 * eye toggle applies on both surfaces, and the editor does not offer to drag it
 * while creative is selected (`TEMPLATE_EDITOR_SECTIONS` below), because a drag
 * that cannot move it is the dead control this story exists to remove.
 */
export type CreativeHeaderId = 'summary'

/** Creative's left column (1/3), top to bottom in the template's own order. */
export type CreativeSidebarId = 'skills' | 'languages' | 'certifications'

/** Creative's right column (2/3), top to bottom in the template's own order. */
export type CreativeMainId = 'experience' | 'projects' | 'education'

/** All seven sections creative renders. */
export type CreativeSectionId = CreativeHeaderId | CreativeSidebarId | CreativeMainId

/**
 * Where creative draws each column's sections, top to bottom, as a rank per
 * section — the same shape as `SingleColumnSequence` and for the same reason: a
 * `Record` over the whole union fails to compile when a member is added,
 * removed or renamed until its position is stated, where a list would silently
 * drop it from an export.
 */
type CreativeColumnSequence<T extends string> = Readonly<Record<T, number>>

/** `creative-template.tsx` left column: skills, languages, certifications. */
const CREATIVE_SIDEBAR_SEQUENCE: CreativeColumnSequence<CreativeSidebarId> = Object.freeze({
  skills: 0,
  languages: 1,
  certifications: 2,
})

/** `creative-template.tsx` right column: experience, projects, education. */
const CREATIVE_MAIN_SEQUENCE: CreativeColumnSequence<CreativeMainId> = Object.freeze({
  experience: 0,
  projects: 1,
  education: 2,
})

/**
 * Creative's section order and visibility, as the two surfaces consume it.
 *
 * Mutable arrays because they are freshly built by `mapEditorOrderToCreative`
 * and handed straight to `creative-template.tsx`, whose props are declared
 * readonly, and to `docx-creative.ts`, which iterates them.
 */
export interface CreativeMappedOrder {
  creativeSidebarOrder: CreativeSidebarId[]
  creativeMainOrder: CreativeMainId[]
  hiddenCreativeSidebar: CreativeSidebarId[]
  hiddenCreativeMain: CreativeMainId[]
  /** `summary` is fixed in the header; only its visibility is controllable. */
  summaryHidden: boolean
}

/**
 * Fills one creative column's slots from an editor order.
 *
 * THE RULE, which is `mapEditorOrderToSingleColumn`'s rule (Part 3 US-002)
 * applied per column rather than to one column:
 *
 *   The column's sequence is a row of slots. The sections the editor can
 *   position fill the slots those same sections occupy, in the editor's order.
 *   A section the editor cannot position keeps its own slot.
 *
 * So `certifications` stays third in the left column and `projects` stays
 * second in the right one — neither has an editor id, so neither can be
 * positioned — while skills/languages and experience/education permute among
 * the slots they already occupy. Feeding the shared default in therefore
 * reproduces exactly the sequence both surfaces hardcoded before this story,
 * which is what criterion 8 asks for.
 *
 * It was preferred to appending the unpositionable sections at the end, which
 * would move `certifications` above nothing but would move `projects` below
 * `education` on a default resume — a rendering change for every existing
 * creative resume, from a story that must change none.
 *
 * `editorPositions` is a predicate rather than a second list so the caller
 * names one vocabulary, the editor's, and this function asks about it.
 */
function mapEditorOrderToCreativeColumn<T extends string>(
  rawOrder: readonly string[],
  sequence: CreativeColumnSequence<T>,
  editorPositions: (id: string) => boolean,
): T[] {
  const slots = (Object.keys(sequence) as T[]).sort((a, b) => sequence[a] - sequence[b])
  const inColumn = new Set<string>(slots)

  const positioned: T[] = []
  const seen = new Set<string>()
  for (const id of rawOrder) {
    if (!inColumn.has(id)) continue
    if (!editorPositions(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    positioned.push(id as T)
  }

  // Every positioned id is a member of the column and therefore has exactly one
  // slot, so the positioned ids are consumed exactly once each, in order. The
  // index is still checked rather than asserted: this runs inside document
  // generation, where being one short must drop a section rather than write
  // `undefined` into a dispatch.
  const mapped: T[] = []
  let next = 0
  for (const slot of slots) {
    if (seen.has(slot)) {
      const positionedId: T | undefined = positioned[next]
      next += 1
      if (positionedId !== undefined) mapped.push(positionedId)
    } else if (!editorPositions(slot)) {
      mapped.push(slot)
    }
  }

  return mapped
}

/** Whether the editor's sidebar order can position `id` at all. */
function isEditorSidebarId(id: string): id is EditorSidebarId {
  return (VALID_SIDEBAR_IDS as readonly string[]).includes(id)
}

/**
 * Maps editor-level section order and visibility onto creative's three boxes.
 *
 * The editor's vocabulary and creative's overlap only partly, which is the
 * whole of this story's difficulty:
 *
 *  - `skills` and `languages` are editor SIDEBAR ids and creative left-column
 *    sections. They permute.
 *  - `experience` and `education` are editor MAIN ids and creative right-column
 *    sections. They permute.
 *  - `certifications` and `projects` are creative sections with no editor id.
 *    They keep their slots and cannot be hidden from here; per-item visibility
 *    is the only hiding available for them, on both surfaces, as before.
 *  - `summary` is an editor main id drawn in creative's header: hideable, not
 *    orderable. See the `summary` decision above.
 *  - `keyAchievements` and `training` are editor sidebar ids creative does not
 *    render at all. They are dropped here and, since this story, not offered by
 *    the editor while creative is selected.
 */
export function mapEditorOrderToCreative(
  editorSidebarOrder: readonly EditorSidebarId[],
  editorMainOrder: readonly EditorMainId[],
  hiddenSidebar: readonly EditorSidebarId[],
  hiddenMain: readonly EditorMainId[],
): CreativeMappedOrder {
  const creativeSidebarOrder = mapEditorOrderToCreativeColumn(
    editorSidebarOrder,
    CREATIVE_SIDEBAR_SEQUENCE,
    isEditorSidebarId,
  )
  const creativeMainOrder = mapEditorOrderToCreativeColumn(
    editorMainOrder,
    CREATIVE_MAIN_SEQUENCE,
    isEditorMainId,
  )

  const hiddenSidebarSet = new Set<string>(hiddenSidebar)
  const hiddenCreativeSidebar = creativeSidebarOrder.filter((id) => hiddenSidebarSet.has(id))

  const hiddenMainSet = new Set<string>(hiddenMain)
  const hiddenCreativeMain = creativeMainOrder.filter((id) => hiddenMainSet.has(id))

  return {
    creativeSidebarOrder,
    creativeMainOrder,
    hiddenCreativeSidebar,
    hiddenCreativeMain,
    summaryHidden: hiddenMainSet.has('summary'),
  }
}

/**
 * Creative's default section orders, DERIVED from the shared default rather
 * than restated — the same construction as `DEFAULT_MODERN_SIDEBAR_ORDER`.
 *
 * Both creative surfaces fall back to these when given no order, so a caller
 * that passes nothing renders what the template rendered before this story.
 * `layout-settings.test.ts` pins both values literally, so a change to the
 * mapping that would move a default creative resume fails the suite instead of
 * moving every existing one.
 */
const DEFAULT_CREATIVE_ORDER: CreativeMappedOrder = mapEditorOrderToCreative(
  DEFAULT_RESUME_LAYOUT.sidebarOrder,
  DEFAULT_RESUME_LAYOUT.mainContentOrder,
  DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  DEFAULT_RESUME_LAYOUT.hiddenMainSections,
)

export const DEFAULT_CREATIVE_SIDEBAR_ORDER: readonly CreativeSidebarId[] = Object.freeze(
  DEFAULT_CREATIVE_ORDER.creativeSidebarOrder,
)

export const DEFAULT_CREATIVE_MAIN_ORDER: readonly CreativeMainId[] = Object.freeze(
  DEFAULT_CREATIVE_ORDER.creativeMainOrder,
)

// ---------- Which layout controls a template applies ----------

/**
 * A group of layout-model keys that one editor control writes.
 *
 * Grouped rather than keyed per property because the editor's controls are
 * grouped: one colour picker writes all three sidebar-colour components, and
 * one drag-and-drop panel writes both sidebar-section keys. Gating per group is
 * gating per control, which is what FR-9 is about.
 */
export type LayoutControlId = 'sidebarColour' | 'perPropertySize' | 'sidebarSections'

/** The model keys each control writes. Nothing else may write them. */
export const LAYOUT_CONTROL_KEYS: Readonly<
  Record<LayoutControlId, readonly (keyof ResumeLayoutModel)[]>
> = Object.freeze({
  sidebarColour: Object.freeze(['sidebarHue', 'sidebarSaturation', 'sidebarBrightness'] as const),
  perPropertySize: Object.freeze([
    'titleFontSize',
    'contactFontSize',
    'sectionTitleFontSize',
    'sectionDescFontSize',
  ] as const),
  sidebarSections: Object.freeze(['sidebarOrder', 'hiddenSidebarSections'] as const),
})

/**
 * THE TEMPLATE × CONTROL MATRIX (Part 3 US-014, FR-9).
 *
 * Which of the grouped controls above the editor OFFERS for each template. A
 * control is offered exactly where the template applies it; where it is not
 * offered, the stored keys are left untouched and apply again the moment a
 * template that reads them is selected.
 *
 * Read off the code, not inferred. `resume-editor.tsx`'s template switch is the
 * one place a layout value reaches a Preview, and `download-docx/route.ts` hands
 * each generator the same model, so what a template is PASSED and what its
 * generator READS is the whole of the question:
 *
 *                     professional  modern   classic  minimal  creative
 *   sidebarColour          yes       yes       no       no       no
 *   perPropertySize        no        no        yes      yes      yes
 *   sidebarSections        yes       yes       no       no       yes
 *
 * sidebarColour — professional and modern are the only templates the editor
 *   passes `sidebarColor` to, and the only DOCX generators that paint a sidebar
 *   fill. Classic, minimal and creative receive it on no surface.
 *
 * perPropertySize — classic, minimal and creative render the in-Preview size
 *   inputs themselves, gated on the `set*FontSize` props this editor passes
 *   them. Professional is passed no size prop at all; modern is passed the
 *   setters but renders no input for any of them. Modern nonetheless APPLIES
 *   two of the stored sizes (`titleFontSize` on its document title,
 *   `sectionDescFontSize` on its body text) and ignores the other two, so the
 *   stored values are not inert there — they are simply not adjustable. That
 *   asymmetry is the DECISION the parity check records for professional's three
 *   sizes and modern's section heading; it is not closed by hiding anything,
 *   because there is nothing rendered to hide.
 *
 * sidebarSections — classic and minimal draw no sidebar on any surface:
 *   neither template, and neither `docx-classic.ts` nor `docx-minimal.ts`,
 *   mentions `sidebarOrder` or `hiddenSidebarSections`, and
 *   `mapEditorOrderToSingleColumn` above takes only the MAIN order. The panel is
 *   dead there permanently. Creative keeps it: it ignores section state on every
 *   surface today, which is Part 3 US-015's defect to close, not a control to
 *   withdraw.
 *
 * NOT IN THIS MAP, deliberately. `fontScale` and `fontFamily` do not reach the
 * classic, minimal and creative Previews today, and the main-content panel does
 * not reach those three either. Each is a live divergence owned by another Part
 * 3 story — US-011, US-012 and US-009/US-015 respectively — which closes it by
 * making the control APPLY. Hiding them here would pre-empt those stories and
 * remove capability the product is about to gain.
 */
export const TEMPLATE_LAYOUT_CONTROLS: Readonly<
  Record<ResumeTemplate, readonly LayoutControlId[]>
> = Object.freeze({
  professional: Object.freeze(['sidebarColour', 'sidebarSections'] as const),
  modern: Object.freeze(['sidebarColour', 'sidebarSections'] as const),
  classic: Object.freeze(['perPropertySize'] as const),
  minimal: Object.freeze(['perPropertySize'] as const),
  creative: Object.freeze(['perPropertySize', 'sidebarSections'] as const),
})

/**
 * Whether the editor offers `control` while `template` is selected.
 *
 * Takes a `string` because `resumes.template` is stored text: a row holding
 * something outside the five identifiers still has to render. It resolves like
 * the editor's own template switch, whose `default` branch draws modern.
 */
export function templateOffersLayoutControl(template: string, control: LayoutControlId): boolean {
  const offered =
    template in TEMPLATE_LAYOUT_CONTROLS
      ? TEMPLATE_LAYOUT_CONTROLS[template as ResumeTemplate]
      : TEMPLATE_LAYOUT_CONTROLS.modern
  return offered.includes(control)
}

/** The per-property size keys, in the order `LAYOUT_CONTROL_KEYS` lists them. */
export type PerPropertySizeKey =
  | 'titleFontSize'
  | 'contactFontSize'
  | 'sectionTitleFontSize'
  | 'sectionDescFontSize'

/**
 * The per-property sizes each template APPLIES, which is not the same question
 * as which it offers a control for — see the matrix above for why modern is the
 * one template where the two answers differ.
 *
 * Stated so the parity check can tell a size that no surface applies (a
 * recorded decision: stored, preserved, adjustable nowhere) from one that a
 * Preview applies and an export does not (Part 3 US-011's divergence).
 */
export const TEMPLATE_APPLIED_SIZE_KEYS: Readonly<
  Record<ResumeTemplate, readonly PerPropertySizeKey[]>
> = Object.freeze({
  professional: Object.freeze([] as const),
  modern: Object.freeze(['titleFontSize', 'sectionDescFontSize'] as const),
  classic: LAYOUT_CONTROL_KEYS.perPropertySize as readonly PerPropertySizeKey[],
  minimal: LAYOUT_CONTROL_KEYS.perPropertySize as readonly PerPropertySizeKey[],
  creative: LAYOUT_CONTROL_KEYS.perPropertySize as readonly PerPropertySizeKey[],
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
 * that is right to offer, listing an id the template does not render. Creative
 * is the only template with that shape, so it is the only row that deviates.
 *
 * WHAT A GATE HERE MUST NOT DO. Hiding a row must not rewrite what is stored
 * for it (FR-6, and the PRD's "A stored layout value is deleted or rewritten
 * because its control is hidden"). So this is a DISPLAY filter only: the
 * editor's drag handler continues to splice the FULL stored order, and
 * `parseLayoutModel` continues to accept every id it accepted before. A
 * creative user who reorders skills and languages leaves `keyAchievements` and
 * `training` exactly where their order already had them, and selecting
 * professional again shows them there.
 *
 *                     professional  modern   classic  minimal  creative
 *   keyAchievements       yes        yes       yes      yes       NO
 *   training              yes        yes       yes      yes       NO
 *   summary               drag       drag      drag     drag     hide only
 *
 * Classic and minimal are listed with the full vocabulary although they are
 * offered no sidebar panel at all — `TEMPLATE_LAYOUT_CONTROLS` already
 * withdraws it, and restating the withdrawal here would be a second copy of
 * that decision free to disagree with it.
 */
export interface TemplateEditorSections {
  /** Sidebar ids the panel lists, in the stored order's own sequence. */
  readonly sidebar: readonly EditorSidebarId[]
  /** Main ids the panel lists, in the stored order's own sequence. */
  readonly main: readonly EditorMainId[]
  /**
   * Of the ids listed above, those the template draws in a FIXED place: the
   * row keeps its visibility toggle and loses its drag handle, because the
   * template has nowhere else to draw it. Creative's `summary`, which lives in
   * the gradient header — see the decision on `CreativeHeaderId`.
   */
  readonly fixed: readonly (EditorSidebarId | EditorMainId)[]
}

const ALL_EDITOR_SECTIONS: TemplateEditorSections = Object.freeze({
  sidebar: DEFAULT_RESUME_LAYOUT.sidebarOrder,
  main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
  fixed: Object.freeze([] as const),
})

export const TEMPLATE_EDITOR_SECTIONS: Readonly<
  Record<ResumeTemplate, TemplateEditorSections>
> = Object.freeze({
  professional: ALL_EDITOR_SECTIONS,
  modern: ALL_EDITOR_SECTIONS,
  classic: ALL_EDITOR_SECTIONS,
  minimal: ALL_EDITOR_SECTIONS,
  creative: Object.freeze({
    sidebar: Object.freeze(['skills', 'languages'] as const),
    main: DEFAULT_RESUME_LAYOUT.mainContentOrder,
    fixed: Object.freeze(['summary'] as const),
  }),
})

/**
 * The section rows the editor's panels offer while `template` is selected.
 *
 * Takes a `string` for the same reason as `templateOffersLayoutControl`:
 * `resumes.template` is stored text, and a row holding something outside the
 * five identifiers still has to render. It resolves the same way — like the
 * editor's own template switch, whose `default` branch draws modern.
 */
export function templateEditorSections(template: string): TemplateEditorSections {
  return template in TEMPLATE_EDITOR_SECTIONS
    ? TEMPLATE_EDITOR_SECTIONS[template as ResumeTemplate]
    : TEMPLATE_EDITOR_SECTIONS.modern
}
