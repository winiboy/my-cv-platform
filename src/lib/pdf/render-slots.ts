/**
 * How many PDF renders one server instance runs at once, across every route
 * that prints with `launchPdfBrowser` (the resume and the cover-letter PDF).
 *
 * Each render is a Chromium process. The limit belongs to the server process,
 * not to a route, because memory does: two routes with two slots each would let
 * four browsers start in a process sized for two. A request beyond the limit is
 * told to retry rather than allowed to exhaust memory. Where the platform runs
 * the two routes as separate functions, each has its own memory and its own
 * count, which is the same bound per function.
 */
export const MAX_CONCURRENT_PDF_RENDERS = 2

let activeRenders = 0

/** A claimed slot. `release` is idempotent, so a `finally` cannot free it twice. */
export interface PdfRenderSlot {
  release(): void
}

/**
 * Claims a slot, or returns `null` when all are taken. Synchronous on purpose:
 * the check and the claim happen with no await in between, so two requests
 * cannot both take the last slot.
 */
export function tryAcquirePdfRenderSlot(): PdfRenderSlot | null {
  if (activeRenders >= MAX_CONCURRENT_PDF_RENDERS) return null
  activeRenders++
  let released = false
  return {
    release() {
      if (released) return
      released = true
      activeRenders--
    },
  }
}
