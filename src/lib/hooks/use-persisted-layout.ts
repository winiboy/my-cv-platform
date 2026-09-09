'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  serializeLayoutModel,
  toStoredLayout,
  type PersistedLayoutSource,
  type ResumeLayoutModel,
  type StoredLayoutModel,
} from '@/lib/layout-settings'
import {
  createLayoutPersister,
  type LayoutPersister,
} from '@/lib/layout-persistence'
import { planLayoutAdoption } from '@/lib/layout-adoption'

/**
 * Persist a resume's layout model to the account.
 *
 * This module owns every write to `resumes.layout_settings`, and there are
 * exactly two: the ongoing one that follows a user's edits (`usePersistedLayout`)
 * and the one-time adoption of a browser's pre-existing settings
 * (`adoptCachedLayout`). Both surfaces that let a user change layout — the
 * editor and the preview wrapper — call both, so the debounce, the "don't write
 * what we just read" rule and the failure reporting exist once rather than
 * twice.
 *
 * The rules themselves live in `@/lib/layout-persistence`, which has no React
 * in it and is unit-tested directly. What remains here is the lifecycle: when
 * to offer the current model, and when a surface is disappearing and owes a
 * write it has not yet issued.
 *
 * WHY THE WRITE GOES STRAIGHT TO POSTGREST
 *
 * There is no API route in front of this, and it does not need one. Ownership
 * is decided by the UPDATE policy on `public.resumes` from `auth.uid()`, never
 * from anything the client sends; the payload's shape and size are bounded by
 * `resumes_layout_settings_check`; and every reader passes the value through
 * `parseStoredLayout` before it can reach rendering. A user can therefore put
 * odd JSON in their own row and the only consequence is that their own resume
 * falls back to documented defaults.
 */

/**
 * The single PostgREST update behind both writers above.
 *
 * Takes the column's value rather than a model because the two callers carry
 * different amounts of it: the persister always writes the complete model,
 * while adoption writes only the properties some store actually holds. The
 * parameter is therefore typed as the column's contract — a partial model —
 * rather than as either caller's own shape. Keeping one function means
 * ownership, the column name and the row filter are stated once.
 */
function updateLayoutSettings(resumeId: string, value: Partial<StoredLayoutModel>) {
  return createClient().from('resumes').update({ layout_settings: value }).eq('id', resumeId)
}

/**
 * One PostgREST update, in the shape `createLayoutPersister` expects: it
 * resolves with the store's `{ error }` and rejects when the request never
 * completed.
 *
 * Declared at module scope because it closes over nothing — the persister
 * passes the resume and the model in — so every mounted surface shares it and
 * no render allocates another.
 */
function writeLayoutSettings(resumeId: string, model: ResumeLayoutModel) {
  const value: StoredLayoutModel = toStoredLayout(model)
  return updateLayoutSettings(resumeId, value)
}

/**
 * Move this browser's pre-existing layout settings onto the account, once.
 *
 * WHY THIS IS A PLAIN FUNCTION AND NOT A HOOK
 *
 * It has to see the localStorage blob as it was BEFORE the surface starts
 * caching the resolved model over it, and it must read the same two stores the
 * surface just resolved from. Both surfaces already do that reading in one
 * mount effect, so this is called from inside it with those exact values.
 * A hook of its own would run in its own effect, in an order neither surface
 * controls, against a cache the other effect may already have rewritten.
 *
 * Calling it there also settles the race with a user edit: this runs before any
 * interaction is possible, and issues its write immediately, while the
 * persister's earliest write is a debounce window after a change that cannot
 * precede mount. The request therefore leaves at least `PERSIST_DEBOUNCE_MS`
 * ahead of any edit's. Two independent requests still have no ordering
 * guarantee on the wire, so the accepted residual risk is precise: a single
 * edit made inside that first window, with no further edit after it, could be
 * overwritten by this patch. Any later edit rewrites the complete model.
 *
 * Fire and forget, like the persister's writes and for the same reason: there
 * is no retry and no queue, and a failure is REPORTED rather than hidden. An
 * adoption that does not land costs nothing that was not already lost — the
 * browser keeps its cache, the resume renders identically, and the next load
 * tries again.
 *
 * A third accepted residual risk sits beside those two, and unlike them it has
 * no time bound and no failure to report. `planLayoutAdoption` deliberately skips a property
 * whose cached value equals its documented default, so a user who set a value
 * on one browser and then deliberately RESET it never puts that default on the
 * account — the key simply stays absent. Another browser that still holds the
 * old non-default value can therefore adopt it later, on any load, months
 * afterwards, and the reset browser will then render the superseded value.
 * Between two stale caches the non-default one wins regardless of which is more
 * recent. Writing the defaults instead would not fix it: it would make the
 * winner "whichever browser loaded first", and no cache carries a timestamp to
 * choose between them. Closing this needs recency in the stores, which US-004
 * does not add; the skip is kept because pinning fifteen unchosen defaults onto
 * every migrated row is the worse of the two costs.
 *
 * @param resumeId The resume being loaded.
 * @param resume   Its two persisted stores, as they arrived on the row.
 * @param cached   The `resume_slider_settings_${id}` string this browser holds,
 *                 or null.
 */
export function adoptCachedLayout(
  resumeId: string,
  resume: PersistedLayoutSource,
  cached: string | null,
): void {
  const patch = planLayoutAdoption(resume, cached)
  if (patch === null) return

  updateLayoutSettings(resumeId, patch).then(
    ({ error }) => {
      if (error) {
        console.error(
          `Failed to adopt this browser's layout settings for resume ${resumeId}; ` +
            `they remain local to this browser and will be retried on the next load.`,
          error,
        )
      }
    },
    (reason: unknown) => {
      console.error(
        `Could not reach the server to adopt this browser's layout settings for ` +
          `resume ${resumeId}; they remain local to this browser and will be ` +
          `retried on the next load.`,
        reason,
      )
    },
  )
}

/**
 * @param resumeId  The resume being edited.
 * @param model     Its current, complete layout model.
 * @param enabled   False until the surface has finished loading its initial
 *                  state. A write issued before then would persist defaults
 *                  over whatever the account already holds.
 */
export function usePersistedLayout(
  resumeId: string,
  model: ResumeLayoutModel,
  enabled: boolean,
): void {
  // One persister per mounted surface, created lazily so a re-render does not
  // allocate another and so nothing is constructed for a surface that never
  // enables persistence.
  const persisterRef = useRef<LayoutPersister | null>(null)
  if (persisterRef.current === null) {
    persisterRef.current = createLayoutPersister(writeLayoutSettings)
  }
  const persister = persisterRef.current

  /**
   * The model as text.
   *
   * Serializing here rather than depending on the object is what makes this
   * effect safe against a caller that rebuilds the model every render: an
   * unchanged model produces an unchanged string, so a re-render for an
   * unrelated reason does not restart the debounce.
   */
  const payload = serializeLayoutModel(model)

  useEffect(() => {
    if (!enabled) return
    persister.submit(resumeId, payload, model)
    // No cleanup, deliberately. Superseding a pending write is `submit`'s job
    // and it does that on the next call; cancelling the timer here instead
    // would leave the unmount case — the one below — with nothing to issue.
    //
    // `model` is intentionally absent from the deps: `payload` is its
    // serialization and is the value that decides whether anything changed.
    // Depending on the object as well would restart the debounce on every
    // render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, payload, resumeId, persister])

  /**
   * Issue whatever is still owed when this surface stops being able to.
   *
   * A debounced write that is merely CANCELLED is the worst of the outcomes
   * available: the edit is lost, and because no request was ever made, neither
   * failure path reports it. Half a second is easily long enough to contain a
   * user's last slider drag before they navigate or close the tab, so all three
   * ways that can happen issue the write instead:
   *
   *   - unmount, which is a client-side route change away from the surface;
   *   - the tab being hidden, which is the last moment the page is reliably
   *     alive and running — closing a tab, switching tabs and backgrounding a
   *     mobile browser all pass through it;
   *   - `pagehide`, the last-ditch attempt for a full-page navigation that
   *     never went through `hidden`.
   *
   * `flush` is idempotent, so the overlap between these costs nothing.
   *
   * `navigator.sendBeacon` would be the textbook answer for the final one and
   * is not usable here: it sends POST with no custom headers, so it can carry
   * neither the `Authorization` bearer token nor the `apikey` PostgREST needs,
   * and cannot express the PATCH this update is. Routing it through a
   * keepalive `fetch` is equally unavailable — `createBrowserClient` returns a
   * process-wide singleton, so a client configured with one would either be
   * ignored or silently apply keepalive to every Supabase request the app
   * makes. A fire-and-forget issue through the one existing writer is what is
   * left, and it is what `hidden` firing first makes good enough.
   *
   * Declared after the effect above so that on unmount React has already run
   * that effect's (absent) cleanup: nothing has touched what is pending.
   */
  useEffect(() => {
    const flush = () => persister.flush()
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') persister.flush()
    }

    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flushWhenHidden)
      flush()
    }
  }, [persister])
}
