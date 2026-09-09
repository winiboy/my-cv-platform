/**
 * The debounced writer that keeps `resumes.layout_settings` up to date, with no
 * React in it.
 *
 * `usePersistedLayout` is a thin adapter over this: the hook owns the React
 * lifecycle (when to submit, when a surface is going away) and this owns the
 * rules — what counts as a change, how long to wait, what is still owed, and
 * what to do when a write does not land.
 *
 * It lives apart from the hook because those rules are the part that can be
 * wrong, and the repository has no DOM test environment: the unit suite runs in
 * `node` and there is no renderer for hooks. Framework-free, the state machine
 * below is directly testable — including the case that matters most, a pending
 * write at the moment its surface disappears.
 *
 * WHY A PENDING WRITE IS FLUSHED RATHER THAN DROPPED
 *
 * The debounce window is half a second, and a user who drags a slider and then
 * leaves is inside it. Discarding the timer at that moment does not merely
 * delay the write, it abandons it: nothing is sent, so neither failure path
 * below runs and nothing is reported. Worse, the value survives in the
 * localStorage cache, where `resolveResumeLayout` ranks it BELOW a fully
 * persisted account row — so the next load silently reverts the user's most
 * recent change. `flush` exists so that "the surface went away" ends in a write
 * attempt like every other outcome.
 *
 * WHAT HAPPENS WHEN A WRITE FAILS
 *
 * It is reported and nothing else. There is deliberately no retry and no
 * queue: the accepted cost, recorded in the PRD, is that a layout edit whose
 * persist call FAILS is discarded on the next load. Reporting is what stops
 * that from also being invisible. An edit that was never attempted is a
 * different case, and is the one `flush` removes.
 */

import type { ResumeLayoutModel } from './layout-settings'

/**
 * Long enough to collapse a slider drag or a drag-and-drop reorder into one
 * write, short enough that a user who edits and immediately opens another
 * device does not race it. Matches the debounce the editor already used for
 * the narrower `custom_sections` write this replaces.
 */
export const PERSIST_DEBOUNCE_MS = 500

/**
 * Issues one write and reports what the store said.
 *
 * Shaped after the PostgREST call it wraps: the returned thenable RESOLVES
 * with a non-null `error` when the server refused the write, and REJECTS when
 * the request never completed at all. Both are failures and both are reported;
 * they are distinguished only so the message can say which happened.
 */
export type LayoutWriter = (
  resumeId: string,
  model: ResumeLayoutModel,
) => PromiseLike<{ error: unknown }>

export interface LayoutPersister {
  /**
   * Offer the current model. Call on every change; the debounce and the
   * "don't write what we just read" rule are applied here, not by the caller.
   *
   * @param resumeId The resume the model belongs to. A different id than the
   *                 last call means the caller moved to another resume: any
   *                 write still owed to the previous one is issued first.
   * @param payload  `serializeLayoutModel(model)`. Passed in rather than
   *                 recomputed because the caller already needs it as a change
   *                 key, and serializing twice per render is wasted work in a
   *                 slider drag. It must be that model's serialization.
   * @param model    The model itself, which is what the writer sends.
   */
  submit(resumeId: string, payload: string, model: ResumeLayoutModel): void

  /**
   * Issue whatever is owed, now, without waiting out the debounce.
   *
   * Idempotent and safe to call when nothing is pending, because the callers
   * are events that can arrive in any combination and more than once — a tab
   * hidden, then hidden again, then unmounted.
   */
  flush(): void
}

/** A write that has been decided on but not yet issued. */
interface PendingWrite {
  readonly resumeId: string
  readonly payload: string
  readonly model: ResumeLayoutModel
}

export function createLayoutPersister(
  write: LayoutWriter,
  delayMs: number = PERSIST_DEBOUNCE_MS,
): LayoutPersister {
  /**
   * The resume the state below describes, or null before the first submit.
   * Tracked here rather than by the caller so that moving to another resume
   * cannot reset the baseline without first settling what the old one is owed.
   */
  let currentResumeId: string | null = null

  /**
   * Whether the loaded model for `currentResumeId` has been seen yet.
   *
   * The first model after loading is adopted as the baseline WITHOUT being
   * written: it is what the stores just told us, so writing it back would turn
   * every page view into a write, and — for a resume whose account row is still
   * empty — would write client-side defaults over it. Adopting local values
   * into the account is a deliberate one-time migration, not a side effect of
   * rendering; that is US-004's job, not this module's.
   */
  let baselineTaken = false

  /**
   * The last payload issued, or `null` when the account's value is unknown —
   * before the baseline is taken, and after an attempt that did not land.
   *
   * Comparing serialized models rather than object identity is what makes this
   * safe to drive from a value the caller rebuilds every render: an unchanged
   * model produces an unchanged string, so a re-render for an unrelated reason
   * neither restarts the debounce nor issues a write. `null` can never equal a
   * payload, so "unknown" always writes on the next change.
   */
  let lastSent: string | null = null

  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: PendingWrite | null = null

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function issue(target: PendingWrite): void {
    // Recorded at issue time, not on success, so that a rapid second change is
    // compared against what is in flight rather than against what last landed.
    // The handlers below undo it if the attempt failed.
    lastSent = target.payload

    /**
     * Forget an attempt that did not land.
     *
     * Not a retry: nothing is re-sent here, and a failed edit is still lost on
     * the next load. It only stops the failure from being STICKY — a user who
     * undoes a change back to the value whose write failed would otherwise
     * produce a payload equal to `lastSent` and no write at all, leaving the
     * account diverged until some different value happened to be produced.
     *
     * Guarded on identity because by the time a response arrives this may
     * already hold a newer, in-flight payload, which it must not clear.
     */
    const forgetLastSent = () => {
      if (lastSent === target.payload) lastSent = null
    }

    write(target.resumeId, target.model).then(
      ({ error }) => {
        if (error) {
          forgetLastSent()
          console.error(
            `Failed to persist layout settings for resume ${target.resumeId}; ` +
              `this edit will be lost on the next load.`,
            error,
          )
        }
      },
      // A rejection rather than an `error` result — the request never
      // completed. Reported for the same reason and handled here rather than
      // left to become an unhandled rejection, which would be a silent loss
      // dressed up as a framework warning.
      (reason: unknown) => {
        forgetLastSent()
        console.error(
          `Could not reach the server to persist layout settings for resume ` +
            `${target.resumeId}; this edit will be lost on the next load.`,
          reason,
        )
      },
    )
  }

  const persister: LayoutPersister = {
    submit(resumeId, payload, model) {
      if (resumeId !== currentResumeId) {
        // Whatever the resume being left still owes is addressed to that
        // resume, so it is issued rather than discarded; `pending` carries its
        // own id, so nothing can be written to the wrong row.
        persister.flush()
        currentResumeId = resumeId
        baselineTaken = false
        lastSent = null
      }

      // A newer value from the same resume supersedes what was waiting. This
      // is also what makes an undone edit safe: submitting A, then B, then A
      // again inside the window leaves nothing pending, so a later flush
      // cannot resurrect B.
      clearTimer()
      pending = null

      if (!baselineTaken) {
        baselineTaken = true
        lastSent = payload
        return
      }
      if (lastSent === payload) return

      const target: PendingWrite = { resumeId, payload, model }
      pending = target
      timer = setTimeout(() => {
        timer = null
        pending = null
        issue(target)
      }, delayMs)
    },

    flush() {
      if (pending === null) return
      const target = pending
      pending = null
      clearTimer()
      issue(target)
    },
  }

  return persister
}
