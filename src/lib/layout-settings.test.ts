import { describe, expect, it } from 'vitest'
import type { ResumeLayoutSettings } from '@/types/database'
import {
  DEFAULT_RESUME_LAYOUT,
  embedLayoutSettings,
  extractLayoutSettings,
  LAYOUT_CONTROL_RANGES,
  mapEditorOrderToModern,
  migrateSidebarOrder,
  parseLayoutModel,
  resolveLayoutModel,
  serializeLayoutModel,
  type EditorMainId,
  type ResumeLayoutModel,
} from './layout-settings'

/**
 * The default sidebar order declared at every editor/preview call site
 * (resume-editor, resume-preview-wrapper, resume-preview, professional-template,
 * download-docx route). Written out literally rather than imported, so that
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

describe('embedLayoutSettings', () => {
  it('wraps null and undefined as an empty item list', () => {
    expect(embedLayoutSettings(null, SETTINGS)).toEqual({ items: [], layoutSettings: SETTINGS })
    expect(embedLayoutSettings(undefined, SETTINGS)).toEqual({ items: [], layoutSettings: SETTINGS })
  })

  it('preserves legacy array contents as items', () => {
    const legacy = [{ title: 'Volunteering' }, { title: 'Awards' }]
    expect(embedLayoutSettings(legacy, SETTINGS)).toEqual({
      items: legacy,
      layoutSettings: SETTINGS,
    })
  })

  it('preserves items when re-wrapping an already-wrapped value', () => {
    const existing = { items: [{ title: 'Awards' }], layoutSettings: SETTINGS }
    const next: ResumeLayoutSettings = { ...SETTINGS, sidebarOrder: ['training'] }
    expect(embedLayoutSettings(existing, next)).toEqual({
      items: [{ title: 'Awards' }],
      layoutSettings: next,
    })
  })

  it('replaces rather than merges the previous settings', () => {
    const existing = { items: [], layoutSettings: SETTINGS }
    const sparse: ResumeLayoutSettings = { sidebarOrder: ['skills'] }
    const result = embedLayoutSettings(existing, sparse)
    expect(result.layoutSettings).toEqual(sparse)
    expect(result.layoutSettings.hiddenSidebarSections).toBeUndefined()
  })

  it('does not mutate the value it was given', () => {
    const existing = { items: [{ title: 'Awards' }], layoutSettings: SETTINGS }
    const snapshot = JSON.parse(JSON.stringify(existing))
    embedLayoutSettings(existing, { sidebarOrder: ['training'] })
    expect(existing).toEqual(snapshot)
  })
})

describe('embed/extract round trip', () => {
  it('returns the original settings for every supported input shape', () => {
    for (const input of [null, undefined, [], [{ title: 'Awards' }], { items: [] }]) {
      expect(extractLayoutSettings(embedLayoutSettings(input, SETTINGS))).toEqual(SETTINGS)
    }
  })

  it('survives a JSON serialization cycle, as the JSONB column requires', () => {
    const stored = JSON.parse(JSON.stringify(embedLayoutSettings([{ title: 'Awards' }], SETTINGS)))
    expect(extractLayoutSettings(stored)).toEqual(SETTINGS)
  })
})

describe('mapEditorOrderToModern', () => {
  it('always leads the sidebar with contact then education', () => {
    const { modernSidebarOrder } = mapEditorOrderToModern(
      ['skills', 'languages', 'training'],
      ['summary', 'experience'],
      [],
      [],
    )
    expect(modernSidebarOrder.slice(0, 2)).toEqual(['contact', 'education'])
  })

  it('keeps the editor order of the shared sidebar sections', () => {
    const { modernSidebarOrder } = mapEditorOrderToModern(
      ['training', 'languages', 'skills'],
      ['summary'],
      [],
      [],
    )
    expect(modernSidebarOrder).toEqual([
      'contact',
      'education',
      'training',
      'languages',
      'skills',
    ])
  })

  it('drops keyAchievements, which the Modern sidebar does not have', () => {
    const { modernSidebarOrder } = mapEditorOrderToModern(
      ['keyAchievements', 'skills'],
      ['summary'],
      [],
      [],
    )
    expect(modernSidebarOrder).not.toContain('keyAchievements')
    expect(modernSidebarOrder).toEqual(['contact', 'education', 'skills'])
  })

  it('moves education out of main, since Modern renders it in the sidebar', () => {
    const { modernMainOrder } = mapEditorOrderToModern(
      ['skills'],
      ['summary', 'education', 'experience'],
      [],
      [],
    )
    expect(modernMainOrder).toEqual(['summary', 'experience'])
  })

  it('hides education in the Modern sidebar when it is hidden in editor main', () => {
    const { hiddenModernSidebar } = mapEditorOrderToModern(
      ['skills'],
      ['summary', 'experience'],
      [],
      ['education'],
    )
    expect(hiddenModernSidebar).toContain('education')
  })

  it('carries hidden shared sidebar sections across', () => {
    const { hiddenModernSidebar } = mapEditorOrderToModern(
      ['skills', 'languages', 'training'],
      ['summary'],
      ['languages'],
      [],
    )
    expect(hiddenModernSidebar).toContain('languages')
    expect(hiddenModernSidebar).not.toContain('skills')
  })

  it('does not report a hidden section that is absent from the order', () => {
    const { hiddenModernSidebar } = mapEditorOrderToModern(
      ['skills'],
      ['summary'],
      ['training'],
      [],
    )
    expect(hiddenModernSidebar).not.toContain('training')
  })

  it('never reports a hidden section the template cannot render', () => {
    const { modernSidebarOrder, hiddenModernSidebar, hiddenModernMain } =
      mapEditorOrderToModern(
        ['keyAchievements', 'skills'],
        ['summary', 'education'],
        ['keyAchievements'],
        ['education'],
      )
    expect(hiddenModernSidebar).not.toContain('keyAchievements')
    expect(hiddenModernMain).not.toContain('education')
    for (const id of hiddenModernSidebar) {
      expect(modernSidebarOrder).toContain(id)
    }
  })

  it('handles fully empty input without producing a broken sidebar', () => {
    const result = mapEditorOrderToModern([], [], [], [])
    expect(result.modernSidebarOrder).toEqual(['contact', 'education'])
    expect(result.modernMainOrder).toEqual([])
    expect(result.hiddenModernSidebar).toEqual([])
    expect(result.hiddenModernMain).toEqual([])
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
}

/**
 * The font stacks offered by `FONTS` in `components/ui/font-carousel-3d.tsx`,
 * copied rather than imported: that module is a client component and this
 * suite runs in a Node environment with no JSX transform.
 *
 * They are here because the editor's default font used to be written as
 * `FONTS[4].family` while the preview wrapper and the DOCX route wrote the
 * literal `'Arial, Helvetica, sans-serif'`. The two were byte-identical, and
 * the case below pins that. The rest exist so that no stack the font picker
 * can produce is ever rejected by the font-family validation.
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

  it('matches the editor default font, which was written as FONTS[4].family', () => {
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
   * NEGATIVE floor (-20, professional-template.tsx:168) and the accepted range
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
    // The five templates seed h1 sizes between 22 and 48.
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
