import { describe, expect, it } from 'vitest'
import { planLayoutAdoption, type LayoutAdoptionPatch } from './layout-adoption'
import {
  DEFAULT_RESUME_LAYOUT,
  resolveResumeLayout,
  serializeLayoutModel,
  type PersistedLayoutSource,
} from './layout-settings'

/**
 * What a browser's pre-existing layout settings become on the account.
 *
 * The scenarios are split by whether they produce a write, because the two
 * invariants below only mean anything for a patch that exists. Asserting them
 * over a scenario that plans nothing would report passing cases that examine
 * nothing at all, so the scenarios that plan nothing assert exactly that, once.
 *
 *   PRESERVATION. After the write, a device that has never seen this browser
 *   resolves the resume to exactly what this browser is showing. Stated as an
 *   equality against `resolveResumeLayout` itself, so the planner cannot drift
 *   away from the precedence rule it is supposed to be migrating into.
 *
 *   IDEMPOTENCE. Loading again — with the account now holding the patch and the
 *   browser's cache rewritten to the full resolved model, which is what both
 *   surfaces do after every load — plans nothing. A naive "adopt whatever the
 *   column lacks" fails this: the re-cached model carries all nineteen
 *   properties, so such a planner would find fifteen more to adopt on the very
 *   next load and pin the row with values nobody chose.
 */

/** A resume row that has never had layout settings of any kind. */
const EMPTY_ROW: PersistedLayoutSource = { layout_settings: null, custom_sections: null }

function row(overrides: Partial<PersistedLayoutSource>): PersistedLayoutSource {
  return { ...EMPTY_ROW, ...overrides }
}

/** A localStorage blob, as the browser stores it. */
function cache(value: Record<string, unknown>): string {
  return JSON.stringify(value)
}

/**
 * What migration 007's backfill leaves behind: the four properties the legacy
 * `custom_sections.layoutSettings` blob could hold, and nothing else. This is
 * the state the per-property grain exists for.
 */
const BACKFILLED: LayoutAdoptionPatch = {
  sidebarOrder: ['training', 'skills', 'languages', 'keyAchievements'],
  mainContentOrder: ['experience', 'summary', 'education'],
  hiddenSidebarSections: [],
  hiddenMainSections: ['education'],
}

interface Scenario {
  name: string
  resume: PersistedLayoutSource
  cached: string | null
}

/** Scenarios that must produce a patch, and are held to both invariants. */
const WRITING_SCENARIOS: Scenario[] = [
  {
    name: 'the browser carries settings and the account has none',
    resume: EMPTY_ROW,
    cached: cache({ titleFontSize: 42, fontScale: 1.2 }),
  },
  {
    name: 'both carry settings, but different properties',
    resume: row({ layout_settings: { titleFontSize: 30 } }),
    cached: cache({ titleFontSize: 42, fontScale: 1.2 }),
  },
  {
    name: 'the account was backfilled and the browser holds the other fifteen',
    resume: row({ layout_settings: { ...BACKFILLED } }),
    cached: cache({
      titleFontSize: 42,
      fontScale: 1.2,
      fontFamily: 'Georgia, serif',
      sidebarHue: 17,
      sidebarOrder: ['skills', 'languages', 'training', 'keyAchievements'],
    }),
  },
  {
    name: 'the legacy custom_sections blob is the only thing the account has',
    resume: row({
      custom_sections: { items: [], layoutSettings: { hiddenMainSections: ['education'] } },
    }),
    cached: cache({ titleFontSize: 42, hiddenMainSections: [] }),
  },
]

/** Scenarios that must produce no write at all. */
const SILENT_SCENARIOS: Scenario[] = [
  {
    name: 'neither store carries anything',
    resume: EMPTY_ROW,
    cached: null,
  },
  {
    name: 'the account carries settings and the browser has none',
    resume: row({ layout_settings: { titleFontSize: 30 } }),
    cached: null,
  },
  {
    name: 'both carry the same property',
    resume: row({ layout_settings: { titleFontSize: 30 } }),
    cached: cache({ titleFontSize: 42 }),
  },
  {
    name: 'the browser carries nothing but documented defaults',
    resume: EMPTY_ROW,
    cached: cache(structuredClone({ ...DEFAULT_RESUME_LAYOUT })),
  },
  {
    name: 'the browser cache is not JSON at all',
    resume: EMPTY_ROW,
    cached: 'not json',
  },
]

describe('planLayoutAdoption', () => {
  describe.each(SILENT_SCENARIOS)('$name', (scenario) => {
    it('writes nothing', () => {
      expect(planLayoutAdoption(scenario.resume, scenario.cached)).toBeNull()
    })
  })

  describe.each(WRITING_SCENARIOS)('$name', (scenario) => {
    /**
     * The row this scenario's patch leaves behind.
     *
     * Throws rather than returning early when nothing was planned: a scenario
     * listed as writing that stops writing must fail the invariants below, not
     * quietly stop checking them.
     */
    function migratedRow(): PersistedLayoutSource {
      const patch = planLayoutAdoption(scenario.resume, scenario.cached)
      if (patch === null) {
        throw new Error(`Expected "${scenario.name}" to plan a write; it planned none.`)
      }
      return row({
        layout_settings: patch,
        custom_sections: scenario.resume.custom_sections,
      })
    }

    it('writes', () => {
      expect(planLayoutAdoption(scenario.resume, scenario.cached)).not.toBeNull()
    })

    it('leaves the resolved model exactly as it is', () => {
      // The account alone, on a device with no cache, must now resolve to what
      // this browser is looking at.
      expect(resolveResumeLayout(migratedRow(), null)).toEqual(
        resolveResumeLayout(scenario.resume, scenario.cached),
      )
    })

    it('plans nothing on the next load', () => {
      const migrated = migratedRow()
      // Both surfaces re-cache the RESOLVED model after every load, so this is
      // what the browser holds the second time around.
      const reCached = serializeLayoutModel(resolveResumeLayout(migrated, null))
      expect(planLayoutAdoption(migrated, reCached)).toBeNull()
    })
  })

  it('adopts only the properties the browser really chose', () => {
    const patch = planLayoutAdoption(
      EMPTY_ROW,
      cache({
        titleFontSize: 42,
        // Equal to the documented default. Writing it would turn "nobody chose
        // this" into "the user chose this" and pin the resume against any
        // future change to DEFAULT_RESUME_LAYOUT.
        fontScale: DEFAULT_RESUME_LAYOUT.fontScale,
        sidebarOrder: [...DEFAULT_RESUME_LAYOUT.sidebarOrder],
      }),
    )
    expect(patch).toEqual({ titleFontSize: 42 })
  })

  /**
   * The accepted cost of skipping default-valued properties, pinned so that it
   * stays a decision.
   *
   * Because a deliberate reset to the default is never written, the key stays
   * ABSENT on the account — indefinitely, not for one page load. A second
   * browser still holding the superseded non-default value can therefore adopt
   * it at any later date, and the browser that did the resetting then renders
   * the value it had just discarded. Between two stale caches the non-default
   * one wins no matter which is more recent, because neither carries recency.
   *
   * Writing the defaults instead is not the fix and must not be applied as one:
   * it changes the winner from "the non-default value" to "whichever browser
   * loaded first", closes nothing, and pins fifteen unchosen defaults onto
   * every migrated row. Deleting the skip to make this test pass differently
   * would trade a documented exposure for an undocumented one.
   */
  it('lets a stale non-default value outlive a deliberate reset on another browser', () => {
    // Device A: the user once set fontScale to 1.3, then deliberately put it
    // back to the documented default. Device B never saw the reset.
    const deviceA = cache({ titleFontSize: 42, fontScale: DEFAULT_RESUME_LAYOUT.fontScale })
    const deviceB = cache({ titleFontSize: 42, fontScale: 1.3 })

    // A loads first. Its deliberate default is not recorded.
    const fromA = planLayoutAdoption(EMPTY_ROW, deviceA)
    expect(fromA).toEqual({ titleFontSize: 42 })

    // So the account still holds no fontScale, and B's stale 1.3 is adoptable —
    // whether B loads a second later or a year later.
    const afterA = row({ layout_settings: fromA })
    const fromB = planLayoutAdoption(afterA, deviceB)
    expect(fromB).toEqual({ titleFontSize: 42, fontScale: 1.3 })

    // A's next load renders 1.3, having rendered the default before B appeared.
    const afterB = row({ layout_settings: fromB })
    expect(resolveResumeLayout(afterA, deviceA).fontScale).toBe(DEFAULT_RESUME_LAYOUT.fontScale)
    expect(resolveResumeLayout(afterB, deviceA).fontScale).toBe(1.3)
  })

  it('does not promote a local value over one the account already holds', () => {
    const patch = planLayoutAdoption(
      row({ layout_settings: { titleFontSize: 30 } }),
      cache({ titleFontSize: 42, fontScale: 1.2 }),
    )
    // The account's 30 survives; only the property it never held is adopted.
    expect(patch).toEqual({ titleFontSize: 30, fontScale: 1.2 })
  })

  it('does not promote a local value over one the legacy blob holds', () => {
    const patch = planLayoutAdoption(
      row({
        custom_sections: {
          items: [],
          layoutSettings: { hiddenMainSections: ['education'] },
        },
      }),
      cache({ hiddenMainSections: [], titleFontSize: 42 }),
    )
    expect(patch).toEqual({ titleFontSize: 42, hiddenMainSections: ['education'] })
  })

  it('keeps every property the account already held, so the write cannot delete one', () => {
    const patch = planLayoutAdoption(
      row({ layout_settings: { ...BACKFILLED } }),
      cache({ fontScale: 1.2 }),
    )
    expect(patch).toEqual({ ...BACKFILLED, fontScale: 1.2 })
  })

  it('ignores a local value that would not survive validation', () => {
    // Out of every accepted range, so `parseStoredLayout` drops it — and a
    // dropped value must not be able to trigger a write of its own.
    expect(planLayoutAdoption(EMPTY_ROW, cache({ titleFontSize: 1e9 }))).toBeNull()
  })

  it('writes properties in the model’s canonical order', () => {
    const patch = planLayoutAdoption(
      EMPTY_ROW,
      cache({ fontScale: 1.2, sidebarHue: 17, titleFontSize: 42 }),
    )
    expect(Object.keys(patch ?? {})).toEqual(['titleFontSize', 'sidebarHue', 'fontScale'])
  })

  it('copies the account’s arrays rather than aliasing them', () => {
    const legacyOrder = ['training', 'skills', 'languages', 'keyAchievements']
    const patch = planLayoutAdoption(
      row({ layout_settings: { sidebarOrder: legacyOrder } }),
      cache({ fontScale: 1.2 }),
    )
    expect(patch?.sidebarOrder).toEqual(legacyOrder)
    expect(patch?.sidebarOrder).not.toBe(legacyOrder)
  })
})
