/**
 * The one-time migration of a browser's layout settings into the account.
 *
 * Before US-003 the only home layout state had was the
 * `resume_slider_settings_${id}` localStorage blob. US-003 gave it a column and
 * made the account outrank the browser, but deliberately wrote nothing on load:
 * `createLayoutPersister` adopts the first model it sees as a baseline and
 * issues no write for it. So a user who customized their resume before that
 * shipped has real settings the account has never heard of, and a device that
 * has never seen this browser resolves them from defaults.
 *
 * This module decides what, if anything, to write on load so that stops being
 * true. It is pure and framework-free for the same reason `layout-persistence`
 * is: the rules are the part that can be wrong, and they are directly testable
 * without a renderer.
 *
 * WHY THE DECISION IS PER PROPERTY
 *
 * "Does this resume have persisted settings?" is not a usable question after
 * migration 007. Its backfill copied the four properties the legacy
 * `custom_sections.layoutSettings` blob could hold into the new column, so a
 * previously customized resume has a NON-NULL `layout_settings` carrying four
 * of nineteen keys. Answering per resume — "the column is not null, so adopt
 * nothing" — would leave the other fifteen resolving from defaults and would
 * destroy exactly the customization this migration exists to save.
 *
 * Per property is also the grain `resolveResumeLayout` already resolves at, and
 * matching it is not optional: adoption writes what the user is looking at, so
 * it has to agree with the function that decided what they are looking at.
 * That agreement is not restated here — the values written are TAKEN from
 * `resolveResumeLayout` — and `layout-adoption.test.ts` asserts the resulting
 * column reproduces the same model on a device with no cache at all.
 *
 * WHAT IS DELIBERATELY NOT WRITTEN
 *
 * A property no store carries, and a property carried at exactly its documented
 * default. Writing that default would turn "nobody has ever chosen this" into
 * "the user chose this", pinning the resume against any future change to
 * `DEFAULT_RESUME_LAYOUT`.
 *
 * The omission is lossless FOR THE ADOPTING BROWSER AT THE MOMENT OF ADOPTION:
 * the key stays absent, and an absent key resolves to the same default it would
 * have been written with, so nothing that browser is looking at changes.
 *
 * It is NOT lossless across browsers, and the claim must not be widened. The
 * key stays absent indefinitely, so a second browser holding a stale
 * non-default value for the same property can still adopt it, at any later
 * date — the non-default value wins over a deliberate reset to the default
 * regardless of which happened last. Writing the defaults would not fix this;
 * it would only change the winner from "the non-default value" to "whichever
 * browser loaded first", and neither cache carries recency. The skip is kept
 * and the exposure is recorded as the third residual risk on
 * `adoptCachedLayout`, with `layout-adoption.test.ts` pinning the sequence.
 *
 * That omission is also what makes this idempotent without a marker of any
 * kind — see `planLayoutAdoption`.
 *
 * The photo is not layout state and is not here. It stays in localStorage under
 * its own keys, as the named exception the PRD records.
 */

import {
  DEFAULT_RESUME_LAYOUT,
  extractLayoutSettings,
  parseStoredLayout,
  resolveResumeLayout,
  toStoredLayout,
  type PersistedLayoutSource,
  type ResumeLayoutModel,
  type StoredLayoutModel,
} from './layout-settings'

/**
 * The value to write into `resumes.layout_settings`, carrying only the
 * properties some store actually holds.
 *
 * Partial rather than complete on purpose, and legal: the column already holds
 * partial values — migration 007's backfill wrote four keys — and every reader
 * goes through `parseStoredLayout`, which fills anything absent from the
 * documented defaults.
 */
export type LayoutAdoptionPatch = Partial<StoredLayoutModel>

/** Every layout property, in `toStoredLayout`'s fixed order. */
const LAYOUT_KEYS = Object.keys(
  toStoredLayout(DEFAULT_RESUME_LAYOUT),
) as (keyof StoredLayoutModel)[]

/**
 * Copies one property across, typed by the key rather than by a cast.
 *
 * The generic is what makes this safe: `source[key]` and `target[key]` are the
 * same `K`, so no property can be written into another's slot.
 */
function copyKey<K extends keyof StoredLayoutModel>(
  target: LayoutAdoptionPatch,
  source: StoredLayoutModel,
  key: K,
): void {
  target[key] = source[key]
}

/**
 * Whether a stored value is indistinguishable from the documented default.
 *
 * Compares the four list properties element by element — they are the reason a
 * plain `===` is not enough, since two equal orders are different array
 * objects. Everything else is a number or a string.
 */
function equalsDefault(key: keyof ResumeLayoutModel, value: unknown): boolean {
  const fallback: unknown = DEFAULT_RESUME_LAYOUT[key]
  if (Array.isArray(fallback)) {
    return (
      Array.isArray(value) &&
      value.length === fallback.length &&
      value.every((entry, index) => entry === fallback[index])
    )
  }
  return value === fallback
}

/**
 * Decide what this resume's account row should hold, given what the browser
 * has cached for it. Returns null when there is nothing to migrate, which is
 * the common case and must not produce a write.
 *
 * THE RULE
 *
 *   A property is ADOPTED when the browser carries it, the account carries no
 *   value for it, and the browser's value is not merely the default.
 *
 *   If nothing is adoptable, nothing is written at all.
 *
 *   Otherwise the write carries the adopted properties AND every property the
 *   account already held, each at the value `resolveResumeLayout` resolved it
 *   to. Re-stating the account's own values costs nothing and keeps the write
 *   a single whole-column value rather than a read-modify-write.
 *
 * WHY THE ACCOUNT'S KEYS ARE RE-STATED RATHER THAN LEFT ALONE
 *
 * `layout_settings` is written as a whole value, so a patch containing only the
 * adopted keys would DELETE the ones the backfill put there. They are carried
 * through at their resolved value, which for a key the account holds is the
 * account's own value — the local one loses, as US-003 requires.
 *
 * WHY THIS IS IDEMPOTENT WITHOUT A MARKER (AC-2)
 *
 * The persister's `lastSent` baseline is no help here: it suppresses a
 * duplicate write from the persister, and the persister never writes a baseline
 * at all. So idempotency has to come from the decision itself, and it does —
 * from the shape of the row afterwards rather than from a flag that could be
 * lost, cleared or absent on another device.
 *
 * After a write, every adopted key is in the account. Both surfaces then
 * re-cache the RESOLVED model, so the next load's cache carries all nineteen
 * properties — but each one is now either present in the account (skipped) or
 * equal to its default (skipped). Nothing is adoptable, and no second write is
 * issued.
 *
 * A planner without the default-skip would still converge — the re-cached model
 * carries all nineteen properties, so it would issue one further write on the
 * next load, after which the account holds every key and nothing is adoptable.
 * What it would cost is not termination but the row: it would be pinned with
 * fifteen values nobody chose, against any future change to
 * `DEFAULT_RESUME_LAYOUT`. That, and not a write loop, is why the skip is here.
 *
 * The same reasoning covers the case that matters more: a value changed on
 * ANOTHER device after this browser adopted. That property is in the account,
 * so this browser's now-stale cache cannot promote itself over it.
 *
 * @param resume  The row's two persisted stores.
 * @param cached  The `resume_slider_settings_${id}` localStorage string, or
 *                null when this browser has none.
 * @returns The value to write, or null when nothing should be written.
 */
export function planLayoutAdoption(
  resume: PersistedLayoutSource,
  cached: string | null,
): LayoutAdoptionPatch | null {
  /**
   * Which properties the ACCOUNT carries — the column and the legacy blob
   * together, since both are the account speaking and either one means the
   * browser does not get to supply that property.
   *
   * Key presence only. Which value wins is not decided here; it is read off
   * `resolveResumeLayout` below, so there is one precedence rule and not two.
   */
  const accountKeys = new Set<string>([
    ...Object.keys(parseStoredLayout(extractLayoutSettings(resume.custom_sections))),
    ...Object.keys(parseStoredLayout(resume.layout_settings)),
  ])

  const local = parseStoredLayout(cached)

  const carried = new Set<string>(accountKeys)
  let adoptedAny = false
  for (const key of Object.keys(local) as (keyof ResumeLayoutModel)[]) {
    if (accountKeys.has(key)) continue
    if (equalsDefault(key, local[key])) continue
    carried.add(key)
    adoptedAny = true
  }

  if (!adoptedAny) return null

  // The values come from the precedence rule itself rather than from a merge
  // repeated here, so the column cannot end up disagreeing with what the user
  // is looking at while this runs.
  const resolved = toStoredLayout(resolveResumeLayout(resume, cached))

  const patch: LayoutAdoptionPatch = {}
  // Iterated in the model's canonical key order rather than in insertion order,
  // so the same inputs always serialize to the same value.
  for (const key of LAYOUT_KEYS) {
    if (carried.has(key)) copyKey(patch, resolved, key)
  }
  return patch
}
