import { describe, expect, it } from 'vitest'
import type { ResumeLayoutSettings } from '@/types/database'
import {
  embedLayoutSettings,
  extractLayoutSettings,
  mapEditorOrderToModern,
  migrateSidebarOrder,
} from './layout-settings'

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
