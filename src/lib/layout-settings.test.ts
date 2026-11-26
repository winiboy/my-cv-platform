import { describe, expect, it } from 'vitest'
import type { ResumeLayoutSettings } from '@/types/database'
import {
  DEFAULT_RESUME_LAYOUT,
  extractLayoutSettings,
  LAYOUT_CONTROL_KEYS,
  LAYOUT_CONTROL_RANGES,
  MAX_LAYOUT_BLOB_LENGTH,
  migrateSidebarOrder,
  parseLayoutModel,
  parseStoredLayout,
  resolveLayoutModel,
  resolveResumeLayout,
  serializeLayoutModel,
  TEMPLATE_APPLIED_SIZE_KEYS,
  TEMPLATE_EDITOR_SECTIONS,
  templateEditorSections,
  TEMPLATE_DRAWS_PHOTO,
  TEMPLATE_LAYOUT_CONTROLS,
  templateDrawsPhoto,
  templateOffersLayoutControl,
  toStoredLayout,
  type EditorMainId,
  type ResumeLayoutModel,
} from './layout-settings'
import { CONTACT_FIELD_IDS } from './contact-visibility'
import { RESUME_TEMPLATES } from './resume-templates'

/**
 * The default sidebar order declared at every editor/preview call site
 * (resume-editor, resume-preview-wrapper, resume-preview, download-docx route). Written out literally rather than imported, so that
 * reordering VALID_SIDEBAR_IDS in the module under test fails these tests
 * instead of silently redefining the default.
 */
const CANONICAL_SIDEBAR_ORDER = ['keyAchievements', 'skills', 'languages', 'training']

const SETTINGS: ResumeLayoutSettings = {
  sidebarOrder: ['skills', 'languages'],
  mainContentOrder: ['summary', 'experience'],
  hiddenSidebarSections: ['training'],
  hiddenMainSections: [],
}

describe('migrateSidebarOrder', () => {
  it('preserves the order the user chose', () => {
    const result = migrateSidebarOrder(['training', 'skills', 'languages', 'keyAchievements'])
    expect(result).toEqual(['training', 'skills', 'languages', 'keyAchievements'])
  })

  it('inserts languages directly after skills when it is missing', () => {
    const result = migrateSidebarOrder(['keyAchievements', 'skills', 'training'])
    expect(result).toEqual(['keyAchievements', 'skills', 'languages', 'training'])
  })

  it('appends languages when skills is absent', () => {
    const result = migrateSidebarOrder(['keyAchievements', 'training'])
    expect(result.indexOf('languages')).toBeGreaterThan(-1)
    expect(result.slice(0, 2)).toEqual(['keyAchievements', 'training'])
  })

  it('drops unknown section ids', () => {
    const result = migrateSidebarOrder(['skills', 'notASection', 'training'])
    expect(result).not.toContain('notASection')
  })

  it('appends every missing known section', () => {
    const result = migrateSidebarOrder(['skills'])
    expect([...result].sort()).toEqual(
      ['keyAchievements', 'languages', 'skills', 'training'].sort(),
    )
  })

  it('always returns the full set of known sections', () => {
    for (const input of [[], ['skills'], ['bogus'], ['training', 'skills']]) {
      const result = migrateSidebarOrder(input)
      expect([...result].sort()).toEqual(
        ['keyAchievements', 'languages', 'skills', 'training'].sort(),
      )
    }
  })

  it('does not mutate its input argument', () => {
    const input = ['skills', 'training']
    const snapshot = [...input]
    migrateSidebarOrder(input)
    expect(input).toEqual(snapshot)
  })

  it('collapses a repeated section id to a single entry', () => {
    const result = migrateSidebarOrder(['skills', 'skills'])
    expect(result).toEqual(['skills', 'languages', 'keyAchievements', 'training'])
  })

  it('treats a duplicated input the same as the de-duplicated equivalent', () => {
    expect(migrateSidebarOrder(['skills', 'skills'])).toEqual(migrateSidebarOrder(['skills']))
    expect(migrateSidebarOrder(['languages', 'languages', 'skills'])).toEqual(
      migrateSidebarOrder(['languages', 'skills']),
    )
  })

  it('keeps the first occurrence when an id repeats later', () => {
    const result = migrateSidebarOrder(['training', 'skills', 'training'])
    expect(result).toEqual(['training', 'skills', 'languages', 'keyAchievements'])
  })

  it('collapses a fully repeated input to one entry', () => {
    const result = migrateSidebarOrder(['training', 'training', 'training'])
    expect(result).toEqual(['training', 'languages', 'keyAchievements', 'skills'])
  })

  it('falls back to the canonical default when the input is empty', () => {
    expect(migrateSidebarOrder([])).toEqual(CANONICAL_SIDEBAR_ORDER)
  })

  it('falls back to the canonical default when every id is unrecognized', () => {
    expect(migrateSidebarOrder(['legacyId'])).toEqual(CANONICAL_SIDEBAR_ORDER)
    expect(migrateSidebarOrder(['contact', 'education'])).toEqual(CANONICAL_SIDEBAR_ORDER)
  })

  it('returns the canonical order unchanged when it is given verbatim', () => {
    expect(migrateSidebarOrder([...CANONICAL_SIDEBAR_ORDER])).toEqual(CANONICAL_SIDEBAR_ORDER)
  })

  it('still honours a customized order that contains a recognized id', () => {
    expect(migrateSidebarOrder(['training', 'skills'])).toEqual([
      'training',
      'skills',
      'languages',
      'keyAchievements',
    ])
    expect(migrateSidebarOrder(['skills', 'bogus', 'keyAchievements'])).toEqual([
      'skills',
      'languages',
      'keyAchievements',
      'training',
    ])
  })

  it('never returns a duplicate section id', () => {
    const inputs = [
      [],
      ['skills', 'skills'],
      ['languages', 'languages', 'skills'],
      ['training', 'training', 'training'],
      ['skills', 'bogus', 'skills', 'bogus'],
      ['keyAchievements', 'skills', 'languages', 'training', 'keyAchievements'],
    ]
    for (const input of inputs) {
      const result = migrateSidebarOrder(input)
      expect(new Set(result).size).toBe(result.length)
      expect(result).toHaveLength(4)
    }
  })
})

describe('extractLayoutSettings', () => {
  it('returns settings from the wrapped format', () => {
    expect(extractLayoutSettings({ items: [], layoutSettings: SETTINGS })).toEqual(SETTINGS)
  })

  it('returns null for the legacy array format', () => {
    expect(extractLayoutSettings([{ title: 'Volunteering' }])).toBeNull()
  })

  it('returns null for null and undefined', () => {
    expect(extractLayoutSettings(null)).toBeNull()
    expect(extractLayoutSettings(undefined)).toBeNull()
  })

  it('returns null when layoutSettings is absent, null, or not an object', () => {
    expect(extractLayoutSettings({ items: [] })).toBeNull()
    expect(extractLayoutSettings({ items: [], layoutSettings: null })).toBeNull()
    expect(extractLayoutSettings({ items: [], layoutSettings: ['nope'] })).toBeNull()
  })
})

describe('parseStoredLayout', () => {
  it('reads a blob given as JSON text, which is what localStorage returns', () => {
    expect(parseStoredLayout(JSON.stringify({ fontScale: 1.2 }))).toEqual({ fontScale: 1.2 })
  })

  it('reads a blob given already parsed, which is what a JSONB column returns', () => {
    expect(parseStoredLayout({ fontScale: 1.2 })).toEqual({ fontScale: 1.2 })
  })

  it('carries nothing for an absent blob', () => {
    expect(parseStoredLayout(null)).toEqual({})
    expect(parseStoredLayout(undefined)).toEqual({})
  })

  it('carries nothing for text that is not JSON, instead of throwing', () => {
    expect(parseStoredLayout('{ not json')).toEqual({})
    expect(parseStoredLayout('')).toEqual({})
  })

  it('carries nothing for a value that is not an object', () => {
    expect(parseStoredLayout(42)).toEqual({})
    expect(parseStoredLayout(['skills'])).toEqual({})
    expect(parseStoredLayout('"a bare JSON string"')).toEqual({})
  })

  it('rejects an oversized blob whole, in either representation', () => {
    // Valid in every respect except size. The point is that a blob nobody
    // should be storing carries nothing at all, rather than being walked.
    const oversized = { fontScale: 1.2, filler: 'x'.repeat(MAX_LAYOUT_BLOB_LENGTH) }
    expect(parseStoredLayout(oversized)).toEqual({})
    expect(parseStoredLayout(JSON.stringify(oversized))).toEqual({})
  })

  /**
   * What the bound has to admit, measured rather than asserted in prose.
   *
   * `MAX_LAYOUT_BLOB_LENGTH` and its server-side twin in migration 007 both
   * claim a worst case of about 1 KB. Nothing tested that claim, so the
   * constant could have been narrowed to a few hundred and the suite would
   * still have passed — while rejecting a legitimate maximal model on the next
   * page load, which resets the user's resume.
   *
   * Byte length, not string length, because `resumes_layout_settings_check`
   * counts UTF-8 bytes and the two bounds must not disagree in the direction
   * that rejects a value the database accepted.
   */
  const LONGEST_FONT_STACK = `'${'F'.repeat(198)}'`

  it('admits the largest model the layout controls can produce', () => {
    // Every list full and the longest font stack the validation accepts.
    // Measured at 849 bytes against a bound of 4096.
    const worstCase = serializeLayoutModel({
      ...DEFAULT_RESUME_LAYOUT,
      fontFamily: LONGEST_FONT_STACK,
      hiddenSidebarSections: [...DEFAULT_RESUME_LAYOUT.sidebarOrder],
      hiddenMainSections: [...DEFAULT_RESUME_LAYOUT.mainContentOrder],
      hiddenContactFields: [...CONTACT_FIELD_IDS],
    })
    expect(LONGEST_FONT_STACK).toHaveLength(200)
    expect(Buffer.byteLength(worstCase, 'utf8')).toBeLessThan(MAX_LAYOUT_BLOB_LENGTH)
    // Admitted, not merely small: the bound must let it back out again.
    expect(parseStoredLayout(worstCase).fontFamily).toBe(LONGEST_FONT_STACK)
  })

  it('admits the largest model the reader will accept at all', () => {
    // The controls emit short numbers, but `parseLayoutModel` accepts any
    // finite value in range, and a double can print eighteen characters. This
    // is the real ceiling on a blob this application can be handed and still
    // read back in full. Measured at 1074 bytes against a bound of 4096.
    const LONG_DOUBLE = 1.2999999999999998
    expect(JSON.stringify(LONG_DOUBLE)).toHaveLength(18)

    // Driven from the control table, which is a Record over every numeric
    // property, so a property added to the model later cannot escape this.
    const numericKeys = Object.keys(LAYOUT_CONTROL_RANGES) as (keyof typeof LAYOUT_CONTROL_RANGES)[]
    for (const key of numericKeys) {
      // In range for every numeric property, so none of them is quietly
      // dropped and shortened by this construction.
      expect(
        parseLayoutModel({ [key]: LONG_DOUBLE }),
        `${key} must accept ${LONG_DOUBLE}`,
      ).toEqual({ [key]: LONG_DOUBLE })
    }
    const widestNumbers = Object.fromEntries(
      numericKeys.map((key) => [key, LONG_DOUBLE]),
    ) as Pick<ResumeLayoutModel, (typeof numericKeys)[number]>

    const serialized = serializeLayoutModel({
      ...DEFAULT_RESUME_LAYOUT,
      ...widestNumbers,
      fontFamily: LONGEST_FONT_STACK,
      hiddenSidebarSections: [...DEFAULT_RESUME_LAYOUT.sidebarOrder],
      hiddenMainSections: [...DEFAULT_RESUME_LAYOUT.mainContentOrder],
      hiddenContactFields: [...CONTACT_FIELD_IDS],
    })
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThan(MAX_LAYOUT_BLOB_LENGTH)
    expect(parseStoredLayout(serialized).titleFontSize).toBe(LONG_DOUBLE)
  })

  it('accepts a blob of exactly the maximum length and rejects one character more', () => {
    // The boundary itself, in both representations. `filler` is not a model
    // property, so it is dropped on the way through — what is asserted is that
    // the SIZE decision falls on the right side of the limit.
    const envelope = JSON.stringify({ fontScale: 1.2, filler: '' }).length
    const sized = (length: number) => ({
      fontScale: 1.2,
      filler: 'x'.repeat(length - envelope),
    })

    const atLimit = JSON.stringify(sized(MAX_LAYOUT_BLOB_LENGTH))
    expect(atLimit).toHaveLength(MAX_LAYOUT_BLOB_LENGTH)
    expect(parseStoredLayout(atLimit)).toEqual({ fontScale: 1.2 })
    expect(parseStoredLayout(sized(MAX_LAYOUT_BLOB_LENGTH))).toEqual({ fontScale: 1.2 })

    const overLimit = JSON.stringify(sized(MAX_LAYOUT_BLOB_LENGTH + 1))
    expect(overLimit).toHaveLength(MAX_LAYOUT_BLOB_LENGTH + 1)
    expect(parseStoredLayout(overLimit)).toEqual({})
    expect(parseStoredLayout(sized(MAX_LAYOUT_BLOB_LENGTH + 1))).toEqual({})
  })

  it('leaves a complete serialized model intact, well under the bound', () => {
    const serialized = serializeLayoutModel(DEFAULT_RESUME_LAYOUT)
    expect(serialized.length).toBeLessThan(MAX_LAYOUT_BLOB_LENGTH)
    expect(parseStoredLayout(serialized)).toEqual({ ...DEFAULT_RESUME_LAYOUT })
  })
})

describe('resolveResumeLayout', () => {
  const NO_PERSISTED = { layout_settings: null, custom_sections: [] }

  it('falls back to the documented defaults when no store carries anything', () => {
    expect(resolveResumeLayout(NO_PERSISTED, null)).toEqual({ ...DEFAULT_RESUME_LAYOUT })
  })

  it('adopts the cached value for a property the account has never persisted', () => {
    const resolved = resolveResumeLayout(NO_PERSISTED, JSON.stringify({ fontScale: 1.25 }))
    expect(resolved.fontScale).toBe(1.25)
  })

  it('lets the account win over the cache for a property both carry', () => {
    const resolved = resolveResumeLayout(
      { layout_settings: { fontScale: 0.8 }, custom_sections: [] },
      JSON.stringify({ fontScale: 1.25 }),
    )
    expect(resolved.fontScale).toBe(0.8)
  })

  /**
   * The qualification, and the reason precedence is decided per property.
   *
   * A row backfilled by migration 007 has the four properties the old
   * `custom_sections` blob could hold and none of the other fifteen. An
   * unqualified "persisted wins" would resolve those fifteen from defaults and
   * silently discard a customization the user had really made.
   */
  it('does not let a partially-persisted account overwrite the cache with defaults', () => {
    const resolved = resolveResumeLayout(
      { layout_settings: { sidebarOrder: ['training', 'skills'] }, custom_sections: [] },
      JSON.stringify({ fontScale: 1.25, sidebarHue: 12, sidebarOrder: ['skills'] }),
    )
    // Persisted, so the account wins.
    expect(resolved.sidebarOrder).toEqual(['training', 'skills', 'languages', 'keyAchievements'])
    // Not persisted, so the local customization survives rather than resetting.
    expect(resolved.fontScale).toBe(1.25)
    expect(resolved.sidebarHue).toBe(12)
    // Carried by neither store.
    expect(resolved.fontFamily).toBe(DEFAULT_RESUME_LAYOUT.fontFamily)
  })

  it('reads the legacy custom_sections blob for a row written before 007', () => {
    const resolved = resolveResumeLayout(
      { layout_settings: null, custom_sections: { items: [], layoutSettings: SETTINGS } },
      null,
    )
    expect(resolved.hiddenSidebarSections).toEqual(['training'])
    expect(resolved.mainContentOrder).toEqual(['summary', 'experience'])
  })

  /**
   * The legacy blob speaks for the account and the cache speaks for this
   * browser, so the account wins — even though only the editor, and only under
   * a since-removed pre-Swiss template, ever wrote the legacy blob, which means it can be the
   * older of the two. That is the inversion US-003 asks for, not the failure
   * the previous test guards: the value that wins here is a real choice the
   * user made, not an empty default.
   */
  it('lets the legacy blob outrank the cache, because both speak for the account', () => {
    const resolved = resolveResumeLayout(
      {
        layout_settings: null,
        custom_sections: { items: [], layoutSettings: { hiddenMainSections: ['education'] } },
      },
      JSON.stringify({ hiddenMainSections: [] }),
    )
    expect(resolved.hiddenMainSections).toEqual(['education'])
  })

  it('lets the new column outrank the legacy blob for the same property', () => {
    const resolved = resolveResumeLayout(
      {
        layout_settings: { hiddenMainSections: ['summary'] },
        custom_sections: { items: [], layoutSettings: { hiddenMainSections: ['education'] } },
      },
      null,
    )
    expect(resolved.hiddenMainSections).toEqual(['summary'])
  })

  it('handles every legacy custom_sections shape without failing', () => {
    for (const customSections of [null, [], [{ title: 'Awards' }], { items: [] }]) {
      expect(resolveResumeLayout({ layout_settings: null, custom_sections: customSections }, null))
        .toEqual({ ...DEFAULT_RESUME_LAYOUT })
    }
  })

  it('degrades a malformed or oversized persisted value to defaults', () => {
    const oversized = { fontScale: 1.2, filler: 'x'.repeat(MAX_LAYOUT_BLOB_LENGTH) }
    for (const persisted of ['not an object', 42, ['skills'], oversized]) {
      const resolved = resolveResumeLayout(
        { layout_settings: persisted, custom_sections: [] },
        null,
      )
      expect(resolved).toEqual({ ...DEFAULT_RESUME_LAYOUT })
    }
  })

  it('keeps an unusable persisted property from beating a usable cached one', () => {
    // A single bad value must not take the whole blob down with it, nor win.
    const resolved = resolveResumeLayout(
      { layout_settings: { fontScale: Number.NaN, sidebarHue: 999 }, custom_sections: [] },
      JSON.stringify({ fontScale: 1.25, sidebarHue: 12 }),
    )
    expect(resolved.fontScale).toBe(1.25)
    expect(resolved.sidebarHue).toBe(12)
  })

  it('returns a fresh model rather than the frozen default object', () => {
    // The arrays inside may still be the shared frozen ones — they are declared
    // `readonly` for exactly that reason, and every caller copies them — but
    // the model itself must be the caller's own, or writing one property would
    // change the default for every later reader.
    const resolved = resolveResumeLayout(NO_PERSISTED, null)
    expect(resolved).not.toBe(DEFAULT_RESUME_LAYOUT)
    expect(Object.isFrozen(resolved)).toBe(false)
  })
})

describe('toStoredLayout', () => {
  it('writes every model property in a fixed key order', () => {
    const a = toStoredLayout({ ...DEFAULT_RESUME_LAYOUT })
    const b = toStoredLayout({ ...DEFAULT_RESUME_LAYOUT })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(Object.keys(a).sort()).toEqual(Object.keys(DEFAULT_RESUME_LAYOUT).sort())
  })

  it('copies the arrays rather than sharing the frozen defaults', () => {
    const stored = toStoredLayout({ ...DEFAULT_RESUME_LAYOUT })
    expect(stored.sidebarOrder).not.toBe(DEFAULT_RESUME_LAYOUT.sidebarOrder)
    expect(stored.sidebarOrder).toEqual([...DEFAULT_RESUME_LAYOUT.sidebarOrder])
  })

  it('round-trips through JSON, as the JSONB column requires', () => {
    const stored = toStoredLayout({ ...DEFAULT_RESUME_LAYOUT, fontScale: 1.15 })
    const readBack = parseStoredLayout(JSON.parse(JSON.stringify(stored)) as unknown)
    expect(readBack).toEqual({ ...DEFAULT_RESUME_LAYOUT, fontScale: 1.15 })
  })

  it('stays well inside the bound the database enforces', () => {
    // The worst case a control can produce: every list full and the longest
    // accepted font stack. If this ever approaches the limit, the constraint in
    // migration 007 has to move before a user hits it.
    const worstCase = toStoredLayout({
      ...DEFAULT_RESUME_LAYOUT,
      fontFamily: `'${'F'.repeat(190)}'`,
      hiddenSidebarSections: [...DEFAULT_RESUME_LAYOUT.sidebarOrder],
      hiddenMainSections: [...DEFAULT_RESUME_LAYOUT.mainContentOrder],
    })
    expect(JSON.stringify(worstCase).length).toBeLessThan(MAX_LAYOUT_BLOB_LENGTH / 2)
  })
})

/**
 * Part 3 US-002, criterion 3: the stored main-content order is the editor's
 * vocabulary only. Every stored value that parsed before still parses to the
 * same thing, and nothing new is admitted — which is what keeps every saved
 * resume loadable and every stored order intact.
 */
describe('stored main-content order', () => {
  it('round-trips a stored order and hidden list unchanged', () => {
    const stored = {
      ...toStoredLayout(DEFAULT_RESUME_LAYOUT),
      mainContentOrder: ['experience', 'summary', 'education'],
      hiddenMainSections: ['education'],
    }
    const parsed = parseStoredLayout(JSON.stringify(stored))
    expect(parsed.mainContentOrder).toEqual(['experience', 'summary', 'education'])
    expect(parsed.hiddenMainSections).toEqual(['education'])
    expect(JSON.parse(serializeLayoutModel(resolveLayoutModel(stored)))).toEqual(stored)
  })

  it('admits no id outside the editor vocabulary into the stored main lists', () => {
    const parsed = parseLayoutModel({
      mainContentOrder: ['skills', 'summary', 'projects', 'languagesAndCerts'],
      hiddenMainSections: ['skills', 'projects'],
    })
    expect(parsed.mainContentOrder).toEqual(['summary'])
    expect(parsed.hiddenMainSections).toEqual([])
  })

  it('leaves the shared default order, which every template is handed, as it was', () => {
    expect(DEFAULT_RESUME_LAYOUT.mainContentOrder).toEqual(['summary', 'experience', 'education'])
  })
})

/**
 * The layout defaults as they stood before US-002 consolidated them, written
 * out literally rather than imported.
 *
 * The point of this story was to prove that the separate copies of these
 * values agreed and to leave exactly one behind. If the surviving copy is
 * edited, this literal is what catches it — importing the constant and
 * comparing it to itself would assert nothing. Every value here was read off
 * the code that declared it: `resume-preview-wrapper.tsx` (lines 29-45),
 * `resume-editor.tsx` (176-192), `resume-preview.tsx` (59-86) and
 * `download-docx/route.ts` (33-50).
 */
const HISTORICAL_DEFAULTS: ResumeLayoutModel = {
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
  sidebarOrder: ['keyAchievements', 'skills', 'languages', 'training'],
  mainContentOrder: ['summary', 'experience', 'education'],
  hiddenSidebarSections: [],
  hiddenMainSections: [],
  // Not one of the consolidated copies: added by swiss-cv-templates FR-14,
  // empty so that every CV stored before it renders as it did.
  hiddenContactFields: [],
}

/**
 * The font stacks the editor's font picker offered before it was removed with
 * the legacy templates. Stored resumes still carry them, and the stored
 * `fontFamily` field and its validation stay (swiss-templates-only-page-fidelity,
 * Out of Scope), so no stack a resume was saved with may become invalid.
 *
 * The editor's default font was written as the fifth of them while the preview
 * wrapper and the DOCX route wrote the literal `'Arial, Helvetica, sans-serif'`.
 * The two were byte-identical, and the case below pins that.
 */
const SHIPPED_FONT_STACKS = [
  "'Inter', sans-serif",
  "'Helvetica Neue', Helvetica, Arial, sans-serif",
  "'Calibri', 'Outfit', sans-serif",
  "'Source Sans 3', 'Source Sans Pro', sans-serif",
  'Arial, Helvetica, sans-serif',
  "'IBM Plex Sans', sans-serif",
  "'Roboto', sans-serif",
  "'Segoe UI', 'Open Sans', sans-serif",
  "'Lato', sans-serif",
  "'Open Sans', sans-serif",
  "'Avenir Next', Avenir, 'Nunito Sans', sans-serif",
  "'PT Sans', sans-serif",
  "'Noto Sans', sans-serif",
  'Verdana, Geneva, sans-serif',
]

describe('DEFAULT_RESUME_LAYOUT', () => {
  it('still holds every value the separate copies held', () => {
    expect(DEFAULT_RESUME_LAYOUT).toEqual(HISTORICAL_DEFAULTS)
  })

  it('matches the editor default font, which was written as the fifth picker stack', () => {
    expect(DEFAULT_RESUME_LAYOUT.fontFamily).toBe(SHIPPED_FONT_STACKS[4])
  })

  it('describes exactly the properties the stored blob carries', () => {
    expect(Object.keys(DEFAULT_RESUME_LAYOUT).sort()).toEqual(
      Object.keys(HISTORICAL_DEFAULTS).sort(),
    )
  })

  it('is frozen, along with its arrays, so no consumer can corrupt it', () => {
    expect(Object.isFrozen(DEFAULT_RESUME_LAYOUT)).toBe(true)
    expect(Object.isFrozen(DEFAULT_RESUME_LAYOUT.sidebarOrder)).toBe(true)
    expect(Object.isFrozen(DEFAULT_RESUME_LAYOUT.mainContentOrder)).toBe(true)
    expect(Object.isFrozen(DEFAULT_RESUME_LAYOUT.hiddenSidebarSections)).toBe(true)
    expect(Object.isFrozen(DEFAULT_RESUME_LAYOUT.hiddenMainSections)).toBe(true)
  })
})

describe('parseLayoutModel - input that cannot hold settings', () => {
  it('returns nothing for primitives', () => {
    for (const input of [null, undefined, 0, 1, '', 'settings', true, false, NaN]) {
      expect(parseLayoutModel(input)).toEqual({})
    }
  })

  it('returns nothing for an array, which is the legacy custom_sections shape', () => {
    expect(parseLayoutModel([])).toEqual({})
    expect(parseLayoutModel([{ titleFontSize: 40 }])).toEqual({})
  })

  it('never throws, whatever it is handed', () => {
    const hostile: unknown[] = [
      { titleFontSize: { valueOf: () => 40 } },
      { sidebarOrder: 'skills' },
      { sidebarOrder: [null, undefined, 3, {}, 'skills'] },
      { fontFamily: 12 },
      Object.create(null),
      new Date(),
    ]
    for (const input of hostile) {
      expect(() => parseLayoutModel(input)).not.toThrow()
    }
  })
})

describe('parseLayoutModel - partial input', () => {
  it('returns only the keys the blob actually carried', () => {
    expect(parseLayoutModel({ fontScale: 1.2 })).toEqual({ fontScale: 1.2 })
  })

  it('does not fill absent keys, so a partial blob cannot overwrite another source', () => {
    const result = parseLayoutModel({ sidebarHue: 10 })
    expect(Object.keys(result)).toEqual(['sidebarHue'])
  })

  it('keeps the valid half of a blob whose other half is unusable', () => {
    expect(parseLayoutModel({ fontScale: 1.1, sidebarHue: 'blue' })).toEqual({ fontScale: 1.1 })
  })

  it('ignores keys that are not part of the model', () => {
    expect(
      parseLayoutModel({ titleFontSize: 30, photoUrl: 'data:image/png;base64,AAA' }),
    ).toEqual({ titleFontSize: 30 })
  })

  it('reads back every property of a complete blob unchanged', () => {
    expect(parseLayoutModel({ ...HISTORICAL_DEFAULTS })).toEqual(HISTORICAL_DEFAULTS)
  })
})

describe('parseLayoutModel - malformed numbers', () => {
  it('drops values that are not numbers', () => {
    for (const value of ['24', null, undefined, [], {}, true]) {
      expect(parseLayoutModel({ titleFontSize: value })).toEqual({})
    }
  })

  it('drops NaN and the infinities rather than letting them reach a style attribute', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(parseLayoutModel({ sectionGap: value })).toEqual({})
    }
  })

  it('drops a font size that is zero or negative', () => {
    expect(parseLayoutModel({ titleFontSize: 0 })).toEqual({})
    expect(parseLayoutModel({ titleFontSize: -12 })).toEqual({})
  })

  it('drops a negative gap but keeps a gap of zero, which is meaningful', () => {
    expect(parseLayoutModel({ sectionGap: -1 })).toEqual({})
    expect(parseLayoutModel({ sectionGap: 0 })).toEqual({ sectionGap: 0 })
  })

  it('drops colour components outside their domain', () => {
    expect(parseLayoutModel({ sidebarHue: 361 })).toEqual({})
    expect(parseLayoutModel({ sidebarHue: -1 })).toEqual({})
    expect(parseLayoutModel({ sidebarSaturation: 101 })).toEqual({})
    expect(parseLayoutModel({ sidebarBrightness: 101 })).toEqual({})
  })

  it('keeps the endpoints of each colour domain', () => {
    expect(parseLayoutModel({ sidebarHue: 0 })).toEqual({ sidebarHue: 0 })
    expect(parseLayoutModel({ sidebarHue: 360 })).toEqual({ sidebarHue: 360 })
    expect(parseLayoutModel({ sidebarSaturation: 100 })).toEqual({ sidebarSaturation: 100 })
    expect(parseLayoutModel({ sidebarBrightness: 0 })).toEqual({ sidebarBrightness: 0 })
  })

  it('drops an absurd font scale but keeps everything the slider can produce', () => {
    expect(parseLayoutModel({ fontScale: 0 })).toEqual({})
    expect(parseLayoutModel({ fontScale: 1e9 })).toEqual({})
    // The editor's font-scale slider runs 0.7 to 1.3.
    for (const value of [0.7, 0.85, 1, 1.15, 1.3]) {
      expect(parseLayoutModel({ fontScale: value })).toEqual({ fontScale: value })
    }
  })

  /**
   * Control-range coverage, driven from `LAYOUT_CONTROL_RANGES` rather than
   * from hand-picked values.
   *
   * The previous version of these tests picked comfortable interior values and
   * the shipped defaults, and so read as complete while never touching a drag
   * range. That is exactly where the bug was: `mainContentTopMargin` has a
   * NEGATIVE floor (-20, the main-content drag) and the accepted range
   * started at 0, so every value from -20 to -1 was rejected and restored as
   * the default 24 — a silent 44px jump with no user action.
   *
   * Iterating the table means a key added later cannot quietly opt out.
   */
  it('keeps both endpoints of every control range', () => {
    for (const key of Object.keys(LAYOUT_CONTROL_RANGES) as (keyof typeof LAYOUT_CONTROL_RANGES)[]) {
      const control = LAYOUT_CONTROL_RANGES[key]
      if (control === null) continue
      for (const value of control) {
        expect(parseLayoutModel({ [key]: value }), `${key} must accept ${value}`).toEqual({
          [key]: value,
        })
      }
    }
  })

  it('keeps every integer a margin or width drag can land on', () => {
    // A drag reports whole-pixel deltas, so every integer in the clamp is
    // reachable and must round-trip. The negative half of the main-content
    // range is the regression this covers.
    const dragKeys = ['sidebarTopMargin', 'mainContentTopMargin', 'sidebarWidth'] as const
    for (const key of dragKeys) {
      const control = LAYOUT_CONTROL_RANGES[key]
      expect(control, `${key} must declare a control range`).not.toBeNull()
      const [min, max] = control as readonly [number, number]
      for (let value = min; value <= max; value++) {
        expect(parseLayoutModel({ [key]: value }), `${key} must accept ${value}`).toEqual({
          [key]: value,
        })
      }
    }
  })

  it('restores a main content margin dragged above the default unchanged', () => {
    // The end-to-end shape of the regression: drag up to the floor, reload.
    expect(resolveLayoutModel({ mainContentTopMargin: -20 }).mainContentTopMargin).toBe(-20)
    expect(resolveLayoutModel({ mainContentTopMargin: -1 }).mainContentTopMargin).toBe(-1)
  })

  it('accepts every control range inside its declared bound', () => {
    // The invariant behind the table: an accepted range that does not contain
    // its control range is a rendering regression waiting to happen, so assert
    // it directly rather than only through sampled values.
    for (const key of Object.keys(LAYOUT_CONTROL_RANGES) as (keyof typeof LAYOUT_CONTROL_RANGES)[]) {
      const control = LAYOUT_CONTROL_RANGES[key]
      if (control === null) continue
      const [min, max] = control
      expect(min, `${key} control range is inverted`).toBeLessThanOrEqual(max)
      // Just outside the control range must still round-trip, so retuning a
      // clamp slightly does not invalidate blobs already saved in the field.
      expect(parseLayoutModel({ [key]: min })).toEqual({ [key]: min })
      expect(parseLayoutModel({ [key]: max })).toEqual({ [key]: max })
    }
  })

  it('keeps the margins and sizes the templates ship with', () => {
    expect(parseLayoutModel({ sidebarTopMargin: 64, mainContentTopMargin: 24 })).toEqual({
      sidebarTopMargin: 64,
      mainContentTopMargin: 24,
    })
    // The original templates' size controls stored h1 sizes between 22 and 48.
    for (const value of [22, 24, 36, 48]) {
      expect(parseLayoutModel({ titleFontSize: value })).toEqual({ titleFontSize: value })
    }
  })

  it('drops rather than clamps a value outside the accepted bound', () => {
    // Clamping would be an output change of its own; the contract is omission,
    // so the caller falls back to the documented default.
    expect(parseLayoutModel({ mainContentTopMargin: -1e6 })).toEqual({})
    expect(parseLayoutModel({ mainContentTopMargin: 1e6 })).toEqual({})
    expect(resolveLayoutModel({ mainContentTopMargin: -1e6 }).mainContentTopMargin).toBe(
      DEFAULT_RESUME_LAYOUT.mainContentTopMargin,
    )
  })
})

describe('parseLayoutModel - fontFamily', () => {
  it('accepts every stack the font picker can produce', () => {
    for (const family of SHIPPED_FONT_STACKS) {
      expect(parseLayoutModel({ fontFamily: family })).toEqual({ fontFamily: family })
    }
  })

  it('rejects a value that is not a non-empty string', () => {
    for (const value of ['', '   ', 12, null, [], {}]) {
      expect(parseLayoutModel({ fontFamily: value })).toEqual({})
    }
  })

  it('rejects a stack long enough to be a payload rather than a font name', () => {
    expect(parseLayoutModel({ fontFamily: 'A'.repeat(201) })).toEqual({})
    expect(parseLayoutModel({ fontFamily: 'A'.repeat(200) })).toEqual({
      fontFamily: 'A'.repeat(200),
    })
  })

  it('rejects characters that would be meaningful in CSS or markup', () => {
    const hostile = [
      'Arial</style><script>alert(1)</script>',
      'Arial; background: url(evil)',
      'Arial} body { display: none } .x {',
      '@import url(evil)',
      'url(/evil)',
    ]
    for (const family of hostile) {
      expect(parseLayoutModel({ fontFamily: family })).toEqual({})
    }
  })

  it('rejects control characters and newlines', () => {
    expect(parseLayoutModel({ fontFamily: 'Ari\nal' })).toEqual({})
    expect(parseLayoutModel({ fontFamily: `Ari${String.fromCharCode(0)}al` })).toEqual({})
    expect(parseLayoutModel({ fontFamily: `Ari${String.fromCharCode(127)}al` })).toEqual({})
  })
})

describe('parseLayoutModel - section order and visibility', () => {
  it('applies the sidebar migration a stored order has always been given', () => {
    expect(parseLayoutModel({ sidebarOrder: ['skills'] }).sidebarOrder).toEqual(
      migrateSidebarOrder(['skills']),
    )
  })

  it('ignores non-string entries in a sidebar order', () => {
    expect(parseLayoutModel({ sidebarOrder: ['skills', 3, null, {}] }).sidebarOrder).toEqual(
      migrateSidebarOrder(['skills']),
    )
  })

  it('drops a sidebar order that is not an array', () => {
    expect(parseLayoutModel({ sidebarOrder: 'skills' })).toEqual({})
    expect(parseLayoutModel({ sidebarOrder: null })).toEqual({})
  })

  it('keeps a valid main order exactly as stored', () => {
    expect(parseLayoutModel({ mainContentOrder: ['experience', 'summary', 'education'] })).toEqual({
      mainContentOrder: ['experience', 'summary', 'education'],
    })
  })

  it('drops unknown ids from a main order', () => {
    expect(parseLayoutModel({ mainContentOrder: ['summary', 'contact', 'experience'] })).toEqual({
      mainContentOrder: ['summary', 'experience'],
    })
  })

  it('collapses a repeated id in a main order, which would duplicate a React key', () => {
    expect(parseLayoutModel({ mainContentOrder: ['summary', 'summary'] })).toEqual({
      mainContentOrder: ['summary'],
    })
  })

  it('falls back to the default when a main order survives with nothing in it', () => {
    // An empty main order renders an empty document, so it is treated as
    // unusable and the caller sees no key at all.
    expect(parseLayoutModel({ mainContentOrder: [] })).toEqual({})
    expect(parseLayoutModel({ mainContentOrder: ['nonsense'] })).toEqual({})
    expect(resolveLayoutModel({ mainContentOrder: [] }).mainContentOrder).toEqual(
      HISTORICAL_DEFAULTS.mainContentOrder,
    )
  })

  it('keeps an empty hidden list, which is the meaningful default', () => {
    expect(parseLayoutModel({ hiddenSidebarSections: [] })).toEqual({ hiddenSidebarSections: [] })
    expect(parseLayoutModel({ hiddenMainSections: [] })).toEqual({ hiddenMainSections: [] })
  })

  it('drops unknown and repeated ids from the hidden lists', () => {
    expect(parseLayoutModel({ hiddenSidebarSections: ['skills', 'skills', 'contact'] })).toEqual({
      hiddenSidebarSections: ['skills'],
    })
    expect(parseLayoutModel({ hiddenMainSections: ['education', 'training'] })).toEqual({
      hiddenMainSections: ['education'],
    })
  })

  it('drops a hidden list that is not an array', () => {
    expect(parseLayoutModel({ hiddenMainSections: 'education' })).toEqual({})
  })

  it('does not alias the arrays it was given', () => {
    const stored = { hiddenMainSections: ['education'] }
    const parsed = parseLayoutModel(stored)
    expect(parsed.hiddenMainSections).not.toBe(stored.hiddenMainSections)
    expect(parsed.hiddenMainSections).toEqual(['education'])
  })
})

describe('resolveLayoutModel', () => {
  it('produces a complete model from nothing at all', () => {
    expect(resolveLayoutModel(null)).toEqual(HISTORICAL_DEFAULTS)
    expect(resolveLayoutModel(undefined)).toEqual(HISTORICAL_DEFAULTS)
    expect(resolveLayoutModel('corrupt')).toEqual(HISTORICAL_DEFAULTS)
    expect(resolveLayoutModel({})).toEqual(HISTORICAL_DEFAULTS)
  })

  it('degrades only the unusable parts, keeping the rest of the user choices', () => {
    const result = resolveLayoutModel({
      fontScale: 1.2,
      titleFontSize: 'huge',
      sidebarHue: 9999,
      hiddenMainSections: ['education'],
    })
    expect(result.fontScale).toBe(1.2)
    expect(result.hiddenMainSections).toEqual(['education'])
    expect(result.titleFontSize).toBe(HISTORICAL_DEFAULTS.titleFontSize)
    expect(result.sidebarHue).toBe(HISTORICAL_DEFAULTS.sidebarHue)
  })

  it('never hands back an array a caller could mutate into the shared default', () => {
    // A key the blob carried is parsed into a fresh array...
    const carried = resolveLayoutModel({ hiddenMainSections: [] })
    expect(carried.hiddenMainSections).not.toBe(DEFAULT_RESUME_LAYOUT.hiddenMainSections)

    // ...but a key it omitted resolves to the frozen default BY REFERENCE.
    // That is why the model declares these arrays readonly: mutating this one
    // would corrupt the default for every later reader, and it is frozen, so
    // in production it throws inside a render instead. The type now rejects it
    // at compile time; the freeze below is the runtime backstop.
    const omitted = resolveLayoutModel({})
    expect(omitted.hiddenMainSections).toBe(DEFAULT_RESUME_LAYOUT.hiddenMainSections)
    expect(Object.isFrozen(omitted.hiddenMainSections)).toBe(true)
    expect(DEFAULT_RESUME_LAYOUT.hiddenMainSections).toEqual([])
  })
})

describe('serializeLayoutModel', () => {
  it('round-trips a customized model through storage unchanged', () => {
    const model: ResumeLayoutModel = {
      ...HISTORICAL_DEFAULTS,
      fontScale: 1.15,
      sidebarHue: 12,
      fontFamily: "'Roboto', sans-serif",
      sidebarOrder: ['training', 'skills', 'languages', 'keyAchievements'],
      mainContentOrder: ['experience', 'summary', 'education'],
      hiddenSidebarSections: ['languages'],
      hiddenMainSections: ['education'],
    }
    expect(resolveLayoutModel(JSON.parse(serializeLayoutModel(model)))).toEqual(model)
  })

  it('round-trips the defaults, so a first write does not alter them', () => {
    expect(
      resolveLayoutModel(JSON.parse(serializeLayoutModel({ ...HISTORICAL_DEFAULTS }))),
    ).toEqual(HISTORICAL_DEFAULTS)
  })

  it('writes the same string for two equal models regardless of key order', () => {
    const reversed = Object.fromEntries(
      Object.entries(HISTORICAL_DEFAULTS).reverse(),
    ) as unknown as ResumeLayoutModel
    expect(serializeLayoutModel(reversed)).toBe(serializeLayoutModel({ ...HISTORICAL_DEFAULTS }))
  })

  it('writes every model property and nothing else', () => {
    const written = JSON.parse(serializeLayoutModel({ ...HISTORICAL_DEFAULTS }))
    expect(Object.keys(written).sort()).toEqual(Object.keys(HISTORICAL_DEFAULTS).sort())
  })

  it('does not carry an unrelated key from an earlier blob back to storage', () => {
    const withExtra = { ...HISTORICAL_DEFAULTS, photoUrl: 'data:image/png;base64,AAA' }
    const written = JSON.parse(serializeLayoutModel(withExtra as ResumeLayoutModel))
    expect('photoUrl' in written).toBe(false)
  })

  it('copies the arrays it is given rather than aliasing them', () => {
    // Held as a mutable local so the later push is legal; the model itself
    // exposes the array as readonly.
    const hiddenMainSections: EditorMainId[] = ['education']
    const model: ResumeLayoutModel = { ...HISTORICAL_DEFAULTS, hiddenMainSections }
    const written = JSON.parse(serializeLayoutModel(model))
    hiddenMainSections.push('summary')
    expect(written.hiddenMainSections).toEqual(['education'])
  })
})

describe('which layout controls a template offers (Part 3 US-014)', () => {
  it.each(RESUME_TEMPLATES)('%s offers the sidebar sections panel and nothing else (FR-12)', (template) => {
    expect(TEMPLATE_LAYOUT_CONTROLS[template]).toEqual(['sidebarSections'])
    expect(templateOffersLayoutControl(template, 'sidebarSections')).toBe(true)
  })

  it('defines no font, colour or size control: no template draws those stored values (FR-12)', () => {
    expect(Object.keys(LAYOUT_CONTROL_KEYS)).toEqual(['sidebarSections'])
  })

  it('resolves a template identifier it does not know as the default template, swissCommerce', () => {
    // `resumes.template` is stored text; a value outside the ten identifiers
    // still renders, as swissCommerce on every surface.
    for (const stored of ['brochure', 'modern', 'professional', '', 'toString']) {
      expect(templateOffersLayoutControl(stored, 'sidebarSections'), stored).toBe(
        templateOffersLayoutControl('swissCommerce', 'sidebarSections'),
      )
    }
  })

  it('names a real model key for every control', () => {
    for (const keys of Object.values(LAYOUT_CONTROL_KEYS)) {
      for (const key of keys) expect(key in DEFAULT_RESUME_LAYOUT).toBe(true)
    }
    expect(LAYOUT_CONTROL_KEYS.sidebarSections).toEqual(['sidebarOrder', 'hiddenSidebarSections'])
  })

  it('applies no per-property size on any template: each draws its own sizes', () => {
    for (const template of RESUME_TEMPLATES) expect(TEMPLATE_APPLIED_SIZE_KEYS[template], template).toEqual([])
  })

  it('covers every template exactly once', () => {
    expect(Object.keys(TEMPLATE_LAYOUT_CONTROLS).sort()).toEqual([...RESUME_TEMPLATES].sort())
    expect(Object.keys(TEMPLATE_APPLIED_SIZE_KEYS).sort()).toEqual([...RESUME_TEMPLATES].sort())
  })
})

describe('contact visibility in the layout model (swiss-cv-templates FR-14)', () => {
  it('defaults to nothing hidden, so a CV that never set it renders as before', () => {
    expect(DEFAULT_RESUME_LAYOUT.hiddenContactFields).toEqual([])
    expect(resolveLayoutModel({}).hiddenContactFields).toEqual([])
    expect(parseLayoutModel({ fontScale: 1.1 })).not.toHaveProperty('hiddenContactFields')
    expect(resolveResumeLayout({ layout_settings: null, custom_sections: null }, null).hiddenContactFields).toEqual([])
  })

  it('keeps every known field, in the order stored, without repeats', () => {
    expect(parseLayoutModel({ hiddenContactFields: ['photo', 'email', 'title', 'email'] }).hiddenContactFields).toEqual([
      'photo',
      'email',
      'title',
    ])
    expect(parseLayoutModel({ hiddenContactFields: [...CONTACT_FIELD_IDS] }).hiddenContactFields).toEqual([...CONTACT_FIELD_IDS])
  })

  it('drops unknown and non-string entries, and the full name, which cannot be hidden', () => {
    expect(
      parseLayoutModel({ hiddenContactFields: ['name', 'nationality', 7, null, 'phone', { email: true }] }).hiddenContactFields,
    ).toEqual(['phone'])
  })

  it('keeps an explicitly empty list, and ignores a value that is not a list', () => {
    expect(parseLayoutModel({ hiddenContactFields: [] })).toEqual({ hiddenContactFields: [] })
    expect(parseLayoutModel({ hiddenContactFields: 'email' })).toEqual({})
  })

  it('round-trips through the stored blob and the account column', () => {
    const model = { ...DEFAULT_RESUME_LAYOUT, hiddenContactFields: ['email', 'photo'] as const }
    expect(toStoredLayout(model).hiddenContactFields).toEqual(['email', 'photo'])
    expect(parseStoredLayout(serializeLayoutModel(model)).hiddenContactFields).toEqual(['email', 'photo'])
    expect(
      resolveResumeLayout({ layout_settings: toStoredLayout(model), custom_sections: null }, null).hiddenContactFields,
    ).toEqual(['email', 'photo'])
  })

  it('lets the account win over the browser cache, as for every property', () => {
    const cached = serializeLayoutModel({ ...DEFAULT_RESUME_LAYOUT, hiddenContactFields: ['phone'] })
    expect(
      resolveResumeLayout({ layout_settings: { hiddenContactFields: ['website'] }, custom_sections: null }, cached).hiddenContactFields,
    ).toEqual(['website'])
  })
})

describe('which templates draw the photo (swiss-cv-templates FR-5, FR-14)', () => {
  it('is every template except swissAcademic', () => {
    expect(TEMPLATE_DRAWS_PHOTO).toEqual({
      swissVocational: true,
      swissCommerce: true,
      swissTrades: true,
      swissHealth: true,
      swissFinance: true,
      swissEngineering: true,
      swissIt: true,
      swissExecutive: true,
      swissAcademic: false,
      swissFirstJob: true,
    })
  })

  it('covers every template', () => {
    expect(Object.keys(TEMPLATE_DRAWS_PHOTO).sort()).toEqual([...RESUME_TEMPLATES].sort())
  })

  it('resolves an unknown template as swissCommerce, which every surface draws for it', () => {
    expect(templateDrawsPhoto('swissAcademic')).toBe(false)
    expect(templateDrawsPhoto('swissCommerce')).toBe(true)
    for (const stored of ['brochure', 'classic', 'professional', '', 'constructor']) {
      expect(templateDrawsPhoto(stored), stored).toBe(TEMPLATE_DRAWS_PHOTO.swissCommerce)
    }
  })
})

describe('a hidden control keeps its stored value (Part 3 US-014)', () => {
  // The editor gates what it RENDERS and never writes the model back, so the
  // value a hidden control wrote survives a template switch and applies again.
  // Asserted on the model rather than on the editor because this suite runs in
  // node with no renderer — see resume-layout-store.ts's docblock.
  const PER_PROPERTY_SIZE_KEYS = [
    'titleFontSize',
    'contactFontSize',
    'sectionTitleFontSize',
    'sectionDescFontSize',
  ] as const satisfies readonly (keyof ResumeLayoutModel)[]
  // The stored fields whose editor controls were removed with the legacy
  // templates. They stay in the model and must still be written and reloaded.
  const UNOFFERED_STORED_KEYS = [
    'fontFamily',
    'fontScale',
    'sidebarHue',
    'sidebarSaturation',
    'sidebarBrightness',
    ...PER_PROPERTY_SIZE_KEYS,
  ] as const satisfies readonly (keyof ResumeLayoutModel)[]
  const chosen: ResumeLayoutModel = {
    ...DEFAULT_RESUME_LAYOUT,
    sidebarHue: 12,
    sidebarSaturation: 34,
    sidebarBrightness: 45,
    titleFontSize: 31,
    sectionTitleFontSize: 21,
    sectionDescFontSize: 11,
  }

  it('persists and reloads the sidebar colour, which no template offers a control for', () => {
    // What the editor writes: the model as loaded, the hidden values included.
    const stored = toStoredLayout(chosen)
    expect(stored.sidebarHue).toBe(12)
    expect(stored.sidebarSaturation).toBe(34)
    expect(stored.sidebarBrightness).toBe(45)

    const reloaded = resolveResumeLayout({ layout_settings: stored, custom_sections: null }, null)
    expect(reloaded.sidebarHue).toBe(12)
    expect(reloaded.sidebarSaturation).toBe(34)
    expect(reloaded.sidebarBrightness).toBe(45)
  })

  it('persists and reloads the per-property sizes, which no template offers a control for', () => {
    const stored = toStoredLayout(chosen)
    const reloaded = resolveResumeLayout({ layout_settings: stored, custom_sections: null }, null)
    for (const key of PER_PROPERTY_SIZE_KEYS) {
      expect(reloaded[key]).toBe(chosen[key])
    }
  })

  it('serializes the hidden keys for every template, so nothing is dropped on the way out', () => {
    const written = JSON.parse(serializeLayoutModel(chosen))
    for (const key of [...UNOFFERED_STORED_KEYS, ...LAYOUT_CONTROL_KEYS.sidebarSections]) {
      expect(key in written, key).toBe(true)
    }
  })
})

describe('the section rows the editor lists for a template', () => {
  it('resolves an unknown stored template as swissCommerce, as the editor switch does', () => {
    for (const stored of ['something-else', 'modern', 'creative', '', 'toString']) {
      expect(templateEditorSections(stored), stored).toBe(TEMPLATE_EDITOR_SECTIONS.swissCommerce)
    }
  })

  it('lists, for every template, only rows it fixes in place', () => {
    for (const template of RESUME_TEMPLATES) {
      const sections = TEMPLATE_EDITOR_SECTIONS[template]
      for (const id of [...sections.sidebar, ...sections.main]) expect(sections.fixed, `${template} ${id}`).toContain(id)
    }
  })

  it('does not narrow what may be stored: every editor id still parses', () => {
    // The listing is a DISPLAY filter. A resume must not lose the positions it
    // already holds for the ids its template does not render.
    const parsed = parseLayoutModel({
      sidebarOrder: ['training', 'keyAchievements', 'skills', 'languages'],
      hiddenSidebarSections: ['training'],
      hiddenMainSections: ['summary'],
    })
    expect(parsed.sidebarOrder).toEqual(['training', 'keyAchievements', 'skills', 'languages'])
    expect(parsed.hiddenSidebarSections).toEqual(['training'])
    expect(parsed.hiddenMainSections).toEqual(['summary'])
  })
})
