'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  serializeLayoutModel,
  toStoredLayout,
  type ResumeLayoutModel,
} from '@/lib/layout-settings'
import {
  createLayoutPersister,
  type LayoutPersister,
} from '@/lib/layout-persistence'

/**
 * Persist a resume's layout model to the account.
 *
 * This is the only writer of `resumes.layout_settings`. Both surfaces that let
 * a user change layout — the editor and the preview wrapper — call it, so the
 * debounce, the "don't write what we just read" rule and the failure reporting
 * exist once rather than twice.
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
 * One PostgREST update, in the shape `createLayoutPersister` expects: it
 * resolves with the store's `{ error }` and rejects when the request never
 * completed.
 *
 * Declared at module scope because it closes over nothing — the persister
 * passes the resume and the model in — so every mounted surface shares it and
 * no render allocates another.
 */
function writeLayoutSettings(resumeId: string, model: ResumeLayoutModel) {
  return createClient()
    .from('resumes')
    .update({ layout_settings: toStoredLayout(model) })
    .eq('id', resumeId)
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
