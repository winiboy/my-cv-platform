/**
 * The rules the one layout-state owner applies, with no React in them.
 *
 * `useResumeLayout` is a thin adapter over this module: the hook owns the React
 * lifecycle (when to load, when to cache, which surface is mounted) and this
 * owns the decisions — what the browser cache is keyed on, how a single
 * property is changed, and what sidebar colour a model denotes.
 *
 * It lives apart from the hook for the same reason `layout-persistence.ts`
 * lives apart from `use-persisted-layout.ts`: the rules are the part that can
 * be wrong, and this repository has no DOM test environment. `vitest.config.mts`
 * runs `environment: 'node'` and there is no renderer for hooks, so anything
 * expressed inside a component is unreachable by the unit suite. Framework-free,
 * every decision below is asserted directly in `resume-layout-store.test.ts`.
 *
 * WHY STORAGE ARRIVES AS A THUNK
 *
 * `localStorage` can throw on PROPERTY ACCESS, not only on `getItem` — a
 * Chromium profile with site data blocked raises `SecurityError` the moment
 * `window.localStorage` is read. The surfaces this replaced already had that
 * access inside their `try`, so the thunk keeps it there: the call that opens
 * the store happens inside this module's `try`, and a browser that refuses
 * storage degrades to "no cache" instead of failing the render.
 */

import {
  serializeLayoutModel,
  type ResumeLayoutModel,
} from './layout-settings'

/** The two Web Storage methods this module uses. */
export interface LayoutCacheStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Opens the browser store. Called inside a `try`, so an implementation that
 * throws is a supported outcome rather than a bug — see the module docblock.
 */
export type OpenLayoutCache = () => LayoutCacheStorage

/**
 * The localStorage key the layout cache lives under.
 *
 * Stated once here because three things have to agree on it: the read on
 * mount, the write after every change, and `adoptCachedLayout`, which is handed
 * the string this key produced. A second spelling of it would silently give one
 * of them a different browser's worth of settings.
 */
export function layoutCacheKey(resumeId: string): string {
  return `resume_slider_settings_${resumeId}`
}

/**
 * The browser's cached layout blob for a resume, or null when it has none.
 *
 * Returns the RAW STRING rather than a parsed model on purpose: `adoptCachedLayout`
 * needs the blob exactly as the browser holds it, and `resolveResumeLayout` owns
 * the parsing and the precedence. Parsing here would put a second reader between
 * them.
 *
 * A storage failure is reported and treated as an absent cache. It is not fatal:
 * the account's settings are still readable, and this is a cache of them.
 */
export function readLayoutCache(open: OpenLayoutCache, resumeId: string): string | null {
  try {
    return open().getItem(layoutCacheKey(resumeId))
  } catch (error) {
    console.error('Failed to read cached layout settings:', error)
    return null
  }
}

/**
 * Cache the model for a fast first paint on the next visit.
 *
 * A cache, not a store: `resolveResumeLayout` ranks it BELOW the account, so a
 * full or disabled localStorage costs a fast first paint and nothing else — the
 * account write is what actually keeps a user's settings.
 */
export function writeLayoutCache(
  open: OpenLayoutCache,
  resumeId: string,
  model: ResumeLayoutModel,
): void {
  try {
    open().setItem(layoutCacheKey(resumeId), serializeLayoutModel(model))
  } catch (error) {
    console.error('Failed to cache layout settings:', error)
  }
}

/**
 * A new value, or a function from the current one — the same two shapes
 * `useState`'s setter accepts.
 *
 * Preserved deliberately. The editor's section-visibility toggles are written
 * as `setHiddenSidebarSections(previous => previous.filter(...))`, and a setter
 * that only took a bare value would force those to be rewritten against a
 * captured render's value, which is exactly the stale-closure bug the
 * functional form exists to avoid.
 */
export type LayoutUpdate<T> = T | ((previous: T) => T)

/** The model with its `readonly` array modifiers dropped, for assembly here. */
type WritableLayoutModel = {
  -readonly [K in keyof ResumeLayoutModel]: ResumeLayoutModel[K]
}

/**
 * Change exactly one property of a layout model.
 *
 * Returns the SAME OBJECT when the value did not change. That identity is
 * load-bearing rather than an optimisation: the cache write and the account
 * write are both driven off the model's identity, so a setter called with the
 * value already in place must not manufacture a new object and make two
 * surfaces look as though they had edited something. It reproduces what
 * `useState` already did when nineteen separate primitives held this state —
 * React bails out of a re-render when a setter is handed the current value.
 *
 * `Object.is` rather than `===` so that the numeric edge cases behave the way
 * React's own bail-out does; the arrays are never compared by content, because
 * a reorder always produces a new array and a caller that hands back the same
 * array has genuinely changed nothing.
 */
export function applyLayoutChange<K extends keyof ResumeLayoutModel>(
  model: ResumeLayoutModel,
  key: K,
  update: LayoutUpdate<ResumeLayoutModel[K]>,
): ResumeLayoutModel {
  const previous = model[key]
  const next =
    typeof update === 'function'
      ? (update as (previous: ResumeLayoutModel[K]) => ResumeLayoutModel[K])(previous)
      : update

  if (Object.is(next, previous)) return model

  const updated: WritableLayoutModel = { ...model }
  updated[key] = next
  return updated
}

/**
 * The sidebar colour a model denotes.
 *
 * Colour is stored as its three HSL components, so every surface that paints a
 * sidebar has to compose them the same way. The editor and the preview wrapper
 * each held their own copy of this expression; it is one expression here so
 * that a change to how colour is composed cannot reach one surface and not the
 * other.
 */
export function sidebarColorFrom(model: ResumeLayoutModel): string {
  return `hsl(${model.sidebarHue}, ${model.sidebarSaturation}%, ${model.sidebarBrightness}%)`
}
