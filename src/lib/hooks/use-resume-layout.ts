'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_RESUME_LAYOUT,
  mapEditorOrderToModern,
  resolveResumeLayout,
  type EditorMainId,
  type EditorSidebarId,
  type ModernMappedOrder,
  type PersistedLayoutSource,
  type ResumeLayoutModel,
} from '@/lib/layout-settings'
import { adoptCachedLayout, usePersistedLayout } from '@/lib/hooks/use-persisted-layout'
import {
  applyLayoutChange,
  readLayoutCache,
  sidebarColorFrom,
  writeLayoutCache,
  type LayoutUpdate,
} from '@/lib/resume-layout-store'

/**
 * THE ONE OWNER OF A RESUME'S LAYOUT STATE.
 *
 * Two surfaces let a user change how a resume is laid out — the editor
 * (`resume-editor.tsx`, with its Live Preview) and the standalone preview
 * (`resume-preview-wrapper.tsx`). Until this hook existed they each declared
 * the same nineteen `useState` calls, seeded from the same defaults, loaded
 * them with the same effect, cached them with the same effect and persisted
 * them with the same hook — two authoritative copies of one thing, kept equal
 * only by two files being edited in step. That is the duplication US-002
 * removes: there is now ONE declaration of this state, and both surfaces read
 * it from here.
 *
 * WHY A HOOK AND NOT A CONTEXT
 *
 * A context would be the reflex, and it would buy nothing. The two surfaces
 * live on different routes (`/edit` and `/preview`) and never co-exist in one
 * document, so there is no tree for a provider to span and no second consumer
 * to share an instance with. What they need is one DEFINITION of the state, not
 * one INSTANCE of it — a hook gives exactly that, at the cost of no extra
 * component and no provider that a future surface could forget to mount.
 *
 * WHY ONE OBJECT AND NOT NINETEEN PIECES OF STATE
 *
 * Everything downstream already wanted the whole model: the localStorage cache
 * writes it, `usePersistedLayout` writes it, and both surfaces previously had
 * to reassemble it with a nineteen-entry `useMemo` whose dependency list was a
 * standing invitation to omit a property. One object makes the model the state
 * rather than a derivation of it, so a property cannot be held and then left
 * out of what is stored.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * The photo. It is not layout state, it stays browser-local by the decision the
 * PRD records, and each surface loads it under its own `resume_photo_*` key.
 * Also the two render switches: the editor renders the five templates itself
 * and the wrapper renders them through `resume-preview.tsx`. This hook makes
 * the two surfaces read the same STATE; unifying how they render it is a
 * separate question and is not in this story.
 */

/** A setter with `useState`'s two shapes: a value, or a function of the previous one. */
export type LayoutValueSetter<T> = (update: LayoutUpdate<T>) => void

/**
 * One setter per layout property.
 *
 * Named setters rather than a single `setLayout(key, value)` because that is
 * what the templates take: `classic-template.tsx` and the rest declare props
 * like `setTitleFontSize?: (size: number) => void` and wire them straight to a
 * range input. Handing them a named setter keeps the templates untouched, which
 * is what makes this refactor provably free of rendering change.
 */
export interface ResumeLayoutSetters {
  setTitleFontSize: LayoutValueSetter<number>
  setTitleGap: LayoutValueSetter<number>
  setContactFontSize: LayoutValueSetter<number>
  setSectionTitleFontSize: LayoutValueSetter<number>
  setSectionDescFontSize: LayoutValueSetter<number>
  setSectionGap: LayoutValueSetter<number>
  setHeaderGap: LayoutValueSetter<number>
  setSidebarHue: LayoutValueSetter<number>
  setSidebarSaturation: LayoutValueSetter<number>
  setSidebarBrightness: LayoutValueSetter<number>
  setFontScale: LayoutValueSetter<number>
  setFontFamily: LayoutValueSetter<string>
  setSidebarTopMargin: LayoutValueSetter<number>
  setMainContentTopMargin: LayoutValueSetter<number>
  setSidebarWidth: LayoutValueSetter<number>
  setSidebarOrder: LayoutValueSetter<readonly EditorSidebarId[]>
  setMainContentOrder: LayoutValueSetter<readonly EditorMainId[]>
  setHiddenSidebarSections: LayoutValueSetter<readonly EditorSidebarId[]>
  setHiddenMainSections: LayoutValueSetter<readonly EditorMainId[]>
}

export interface ResumeLayoutController {
  /** The complete, current model. Never partial, never undefined. */
  layout: ResumeLayoutModel
  setters: ResumeLayoutSetters
  /** `layout`'s three HSL components composed into one CSS colour. */
  sidebarColor: string
  /** `layout`'s editor-vocabulary section order translated to Modern's. */
  modern: ModernMappedOrder
  /**
   * False until the stores have been read.
   *
   * Both the cache write and the account write are gated on it, and they must
   * be: a write issued before the load effect has run would persist the
   * client-side defaults over whatever the account already holds.
   */
  isLoaded: boolean
}

/** The browser store, opened inside `resume-layout-store`'s own `try`. */
const openBrowserLayoutCache = () => window.localStorage

/**
 * @param resumeId The resume whose layout this is. Both stores, the cache key
 *                 and the account write are keyed on it.
 * @param source   The row's two persisted layout stores, as they arrived from
 *                 the server. Read on mount only — see the load effect.
 */
export function useResumeLayout(
  resumeId: string,
  source: PersistedLayoutSource,
): ResumeLayoutController {
  const [layout, setLayout] = useState<ResumeLayoutModel>(DEFAULT_RESUME_LAYOUT)
  const [isLoaded, setIsLoaded] = useState(false)

  /**
   * Change one property.
   *
   * Stable for the life of the surface — it closes over nothing but `setLayout`
   * — so every setter built from it is stable too, and a template that receives
   * one does not see a new function identity on each render.
   */
  const change = useCallback(
    <K extends keyof ResumeLayoutModel>(key: K, update: LayoutUpdate<ResumeLayoutModel[K]>) => {
      setLayout((current) => applyLayoutChange(current, key, update))
    },
    [],
  )

  const setters = useMemo<ResumeLayoutSetters>(
    () => ({
      setTitleFontSize: (update) => change('titleFontSize', update),
      setTitleGap: (update) => change('titleGap', update),
      setContactFontSize: (update) => change('contactFontSize', update),
      setSectionTitleFontSize: (update) => change('sectionTitleFontSize', update),
      setSectionDescFontSize: (update) => change('sectionDescFontSize', update),
      setSectionGap: (update) => change('sectionGap', update),
      setHeaderGap: (update) => change('headerGap', update),
      setSidebarHue: (update) => change('sidebarHue', update),
      setSidebarSaturation: (update) => change('sidebarSaturation', update),
      setSidebarBrightness: (update) => change('sidebarBrightness', update),
      setFontScale: (update) => change('fontScale', update),
      setFontFamily: (update) => change('fontFamily', update),
      setSidebarTopMargin: (update) => change('sidebarTopMargin', update),
      setMainContentTopMargin: (update) => change('mainContentTopMargin', update),
      setSidebarWidth: (update) => change('sidebarWidth', update),
      setSidebarOrder: (update) => change('sidebarOrder', update),
      setMainContentOrder: (update) => change('mainContentOrder', update),
      setHiddenSidebarSections: (update) => change('hiddenSidebarSections', update),
      setHiddenMainSections: (update) => change('hiddenMainSections', update),
    }),
    [change],
  )

  /**
   * Load the model from the stores, once per resume.
   *
   * The account's persisted settings and the browser's cached ones both go to
   * `resolveResumeLayout`, which owns the precedence between them — per
   * property, the account wins where the account has a value. Nothing here
   * layers the two itself, and nothing may start to: a second copy of that rule
   * is precisely what would let two surfaces disagree.
   *
   * `adoptCachedLayout` is called from inside this effect rather than from a
   * hook of its own so that it sees the same two stores and the same cache
   * STRING this line resolved from — and sees the cache before the effect below
   * begins overwriting it with the resolved model.
   *
   * Mount-only, keyed on the resume. `source` is read in full but deliberately
   * absent from the dependency list: from here on this hook's state is
   * authoritative and is written back to the row, so re-reading the stores when
   * the prop object is replaced would discard an in-progress edit and restore
   * whatever was loaded.
   */
  useEffect(() => {
    const cached = readLayoutCache(openBrowserLayoutCache, resumeId)

    setLayout(resolveResumeLayout(source, cached))
    adoptCachedLayout(resumeId, source, cached)
    setIsLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId])

  // Cache the model for a fast first paint on the next visit. A cache, not a
  // store: `resolveResumeLayout` lets the account override it.
  useEffect(() => {
    if (!isLoaded) return
    writeLayoutCache(openBrowserLayoutCache, resumeId, layout)
  }, [isLoaded, layout, resumeId])

  // Persist the model to the account. The one writer lives in that hook.
  usePersistedLayout(resumeId, layout, isLoaded)

  const sidebarColor = sidebarColorFrom(layout)

  /**
   * Memoized on the four section lists rather than on `layout`, so that a
   * colour or font change does not rebuild four arrays and hand
   * `modern-template.tsx` new props for a value that did not move.
   */
  const modern = useMemo(
    () =>
      mapEditorOrderToModern(
        layout.sidebarOrder,
        layout.mainContentOrder,
        layout.hiddenSidebarSections,
        layout.hiddenMainSections,
      ),
    [
      layout.sidebarOrder,
      layout.mainContentOrder,
      layout.hiddenSidebarSections,
      layout.hiddenMainSections,
    ],
  )

  return { layout, setters, sidebarColor, modern, isLoaded }
}
