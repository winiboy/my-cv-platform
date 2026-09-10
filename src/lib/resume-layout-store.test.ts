import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RESUME_LAYOUT,
  parseStoredLayout,
  type ResumeLayoutModel,
} from './layout-settings'
import {
  applyLayoutChange,
  layoutCacheKey,
  readLayoutCache,
  sidebarColorFrom,
  writeLayoutCache,
  type LayoutCacheStorage,
} from './resume-layout-store'

/**
 * The rules the one layout-state owner applies.
 *
 * These are the decisions `useResumeLayout` makes on every edit and every
 * mount, tested where they can be reached: the hook itself needs a DOM and a
 * renderer, neither of which this suite has, which is why the decisions were
 * extracted here rather than left inside the component.
 */

/** An in-memory Web Storage stand-in that records what was written. */
function fakeStorage(initial: Record<string, string> = {}): LayoutCacheStorage & {
  entries: Map<string, string>
} {
  const entries = new Map(Object.entries(initial))
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
  }
}

/** A store whose very first access throws, as a privacy-locked browser does. */
function hostileStorage(): never {
  throw new DOMException('storage is not available', 'SecurityError')
}

describe('layoutCacheKey', () => {
  it('is the key both surfaces have always used', () => {
    // Pinned as a literal rather than composed, because changing it silently
    // orphans every layout blob already in a user's browser: the read would
    // miss, the resume would resolve from the account or from defaults, and
    // nothing would report a thing.
    expect(layoutCacheKey('abc-123')).toBe('resume_slider_settings_abc-123')
  })
})

describe('readLayoutCache', () => {
  it('returns the blob verbatim, unparsed', () => {
    // Verbatim matters: `adoptCachedLayout` is handed this exact string and
    // decides what the account has never heard of from it. A model parsed here
    // would be a second reader between the store and that decision.
    const blob = '{"titleFontSize":42}'
    const storage = fakeStorage({ [layoutCacheKey('r1')]: blob })

    expect(readLayoutCache(() => storage, 'r1')).toBe(blob)
  })

  it('returns null when this browser holds nothing for the resume', () => {
    const storage = fakeStorage({ [layoutCacheKey('other')]: '{"titleFontSize":42}' })

    expect(readLayoutCache(() => storage, 'r1')).toBeNull()
  })

  it('reports a store that refuses access and reads as an absent cache', () => {
    // A browser with site data blocked throws on `window.localStorage` itself,
    // before any method is called. The failure must not reach the render: the
    // account's settings are still readable and this is only a cache of them.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(readLayoutCache(hostileStorage, 'r1')).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)

    error.mockRestore()
  })
})

describe('writeLayoutCache', () => {
  it('writes the complete model under the resume key', () => {
    const storage = fakeStorage()

    writeLayoutCache(() => storage, 'r1', DEFAULT_RESUME_LAYOUT)

    const written = storage.entries.get(layoutCacheKey('r1'))
    expect(written).toBeTypeOf('string')
    // Round-tripped through the reader the application really uses, so this
    // asserts the blob is USABLE rather than merely present.
    expect(parseStoredLayout(written)).toEqual({ ...DEFAULT_RESUME_LAYOUT })
  })

  it('reports a store that refuses the write and does not throw', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => writeLayoutCache(hostileStorage, 'r1', DEFAULT_RESUME_LAYOUT)).not.toThrow()
    expect(error).toHaveBeenCalledTimes(1)

    error.mockRestore()
  })
})

describe('applyLayoutChange', () => {
  it('changes exactly one property and leaves the rest alone', () => {
    const next = applyLayoutChange(DEFAULT_RESUME_LAYOUT, 'titleFontSize', 42)

    expect(next.titleFontSize).toBe(42)
    expect({ ...next, titleFontSize: DEFAULT_RESUME_LAYOUT.titleFontSize }).toEqual({
      ...DEFAULT_RESUME_LAYOUT,
    })
  })

  it('does not mutate the model it was given', () => {
    // DEFAULT_RESUME_LAYOUT is frozen and shared by reference across the whole
    // application; a writer that mutated it would corrupt every later reader.
    applyLayoutChange(DEFAULT_RESUME_LAYOUT, 'fontScale', 1.3)

    expect(DEFAULT_RESUME_LAYOUT.fontScale).toBe(1)
  })

  it('accepts a function of the previous value', () => {
    // The editor's visibility toggles are written this way. A setter that only
    // took a bare value would push them back onto a captured render's copy,
    // which is the stale-closure bug the functional form exists to avoid.
    const hidden = applyLayoutChange(
      DEFAULT_RESUME_LAYOUT,
      'hiddenSidebarSections',
      (previous) => [...previous, 'skills'],
    )

    expect(hidden.hiddenSidebarSections).toEqual(['skills'])

    const restored = applyLayoutChange(hidden, 'hiddenSidebarSections', (previous) =>
      previous.filter((id) => id !== 'skills'),
    )

    expect(restored.hiddenSidebarSections).toEqual([])
  })

  it('returns the same object when the value did not change', () => {
    /**
     * Identity is load-bearing, not an optimisation.
     *
     * The localStorage cache and the account write are both driven off the
     * model's identity. A setter handed the value already in place must not
     * manufacture a new object, or every no-op interaction would look like an
     * edit to both writers. This is what `useState` already did when nineteen
     * separate primitives held this state.
     */
    const same = applyLayoutChange(DEFAULT_RESUME_LAYOUT, 'sidebarHue', 240)

    expect(same).toBe(DEFAULT_RESUME_LAYOUT)
  })

  it('treats a returned identical array as no change', () => {
    const same = applyLayoutChange(
      DEFAULT_RESUME_LAYOUT,
      'sidebarOrder',
      (previous) => previous,
    )

    expect(same).toBe(DEFAULT_RESUME_LAYOUT)
  })

  it('treats an equal but distinct array as a change', () => {
    // A reorder always produces a new array, and the only honest reading of a
    // fresh array is that something moved. Comparing contents instead would
    // make a genuine drag that happened to end where it started invisible to
    // the writers, which is the wrong error to make.
    const next = applyLayoutChange(DEFAULT_RESUME_LAYOUT, 'sidebarOrder', [
      ...DEFAULT_RESUME_LAYOUT.sidebarOrder,
    ])

    expect(next).not.toBe(DEFAULT_RESUME_LAYOUT)
    expect(next.sidebarOrder).toEqual([...DEFAULT_RESUME_LAYOUT.sidebarOrder])
  })

  it('applies changes to every property of the model', () => {
    /**
     * Nineteen properties, one setter each, and no property that silently does
     * nothing. The failure this forecloses is a property that the owner holds
     * but cannot change — which is how a control ends up moving on screen while
     * nothing reaches the cache or the account.
     */
    const model: ResumeLayoutModel = { ...DEFAULT_RESUME_LAYOUT }
    const changed: Partial<Record<keyof ResumeLayoutModel, unknown>> = {
      titleFontSize: 30,
      titleGap: 10,
      contactFontSize: 14,
      sectionTitleFontSize: 18,
      sectionDescFontSize: 16,
      sectionGap: 14,
      headerGap: 16,
      sidebarHue: 120,
      sidebarSaturation: 40,
      sidebarBrightness: 25,
      fontScale: 1.2,
      fontFamily: 'Georgia, serif',
      sidebarTopMargin: 100,
      mainContentTopMargin: -20,
      sidebarWidth: 45,
      sidebarOrder: ['skills', 'languages', 'training', 'keyAchievements'],
      mainContentOrder: ['experience', 'summary', 'education'],
      hiddenSidebarSections: ['training'],
      hiddenMainSections: ['education'],
    }

    const keys = Object.keys(model) as (keyof ResumeLayoutModel)[]
    expect(keys).toHaveLength(19)

    for (const key of keys) {
      const value = changed[key]
      expect(value, `no replacement value declared for ${key}`).toBeDefined()
      const next = applyLayoutChange(
        model,
        key,
        value as ResumeLayoutModel[typeof key],
      )
      expect(next[key], `${key} was not changed`).toEqual(value)
    }
  })
})

describe('sidebarColorFrom', () => {
  it('composes the three HSL components the model stores', () => {
    // The editor and the preview wrapper each held their own copy of this
    // expression. One expression means a change to how colour is composed
    // cannot reach one surface and not the other.
    expect(sidebarColorFrom(DEFAULT_RESUME_LAYOUT)).toBe('hsl(240, 85%, 35%)')
  })

  it('follows the model rather than a cached string', () => {
    const model = applyLayoutChange(
      applyLayoutChange(DEFAULT_RESUME_LAYOUT, 'sidebarHue', 12),
      'sidebarBrightness',
      22,
    )

    expect(sidebarColorFrom(model)).toBe('hsl(12, 85%, 22%)')
  })
})
