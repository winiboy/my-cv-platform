import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createLayoutPersister,
  PERSIST_DEBOUNCE_MS,
  type LayoutWriter,
} from './layout-persistence'
import {
  DEFAULT_RESUME_LAYOUT,
  serializeLayoutModel,
  type ResumeLayoutModel,
} from './layout-settings'

/**
 * The one writer of `resumes.layout_settings`, exercised without React.
 *
 * The hook that wraps this module is nineteen lines of lifecycle wiring; the
 * rules live here, and so do the failures that matter. The one this suite
 * exists for is the third block below: a write still inside the debounce
 * window when its surface goes away used to be discarded, which lost the edit
 * AND reported nothing, because no attempt was ever made.
 */

const RESUME_A = 'resume-a'
const RESUME_B = 'resume-b'

function model(overrides: Partial<ResumeLayoutModel> = {}): ResumeLayoutModel {
  return { ...DEFAULT_RESUME_LAYOUT, ...overrides }
}

/** A writer that records its calls and resolves as PostgREST does on success. */
function recordingWriter(): {
  writer: LayoutWriter
  calls: Array<{ resumeId: string; model: ResumeLayoutModel }>
} {
  const calls: Array<{ resumeId: string; model: ResumeLayoutModel }> = []
  const writer: LayoutWriter = (resumeId, written) => {
    calls.push({ resumeId, model: written })
    return Promise.resolve({ error: null })
  }
  return { writer, calls }
}

/**
 * Submit a model as the caller does: the payload is its serialization, so the
 * two can never disagree.
 */
function submit(
  persister: { submit: (id: string, payload: string, m: ResumeLayoutModel) => void },
  resumeId: string,
  value: ResumeLayoutModel,
): void {
  persister.submit(resumeId, serializeLayoutModel(value), value)
}

/**
 * Let the writer's promise handlers run. Promises are not faked, so yielding
 * the microtask queue is enough and does not depend on any timer.
 */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createLayoutPersister - what is and is not written', () => {
  it('adopts the first model as a baseline without writing it back', () => {
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    submit(persister, RESUME_A, model())
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS * 4)

    expect(calls).toEqual([])
  })

  it('writes a change once the debounce window has passed', () => {
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    submit(persister, RESUME_A, model())
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))

    expect(calls).toEqual([])
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)

    expect(calls).toHaveLength(1)
    expect(calls[0].resumeId).toBe(RESUME_A)
    expect(calls[0].model.fontScale).toBe(1.2)
  })

  it('collapses a burst of changes into one write carrying the last value', () => {
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    submit(persister, RESUME_A, model())
    for (const titleFontSize of [26, 28, 30, 32]) {
      submit(persister, RESUME_A, model({ titleFontSize }))
      vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS - 1)
    }
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)

    expect(calls).toHaveLength(1)
    expect(calls[0].model.titleFontSize).toBe(32)
  })

  it('does not write a model equal to the one it already sent', () => {
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    submit(persister, RESUME_A, model())
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)
    expect(calls).toHaveLength(1)

    // Re-rendered for an unrelated reason: same values, new object, new string.
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS * 4)

    expect(calls).toHaveLength(1)
  })
})

describe('createLayoutPersister - a pending write when the surface goes away', () => {
  /**
   * THE REGRESSION.
   *
   * Before `flush` existed the caller discarded the timer here, so an edit made
   * within half a second of navigating away was never sent at all — no request,
   * no error, no report. The value stayed in the localStorage cache, which
   * `resolveResumeLayout` ranks below a fully persisted account row, so the
   * next load quietly showed the OLD value back.
   */
  it('issues an edit that the debounce has not released yet', () => {
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    submit(persister, RESUME_A, model())
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    // Still inside the window: nothing has been sent.
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS - 1)
    expect(calls).toEqual([])

    persister.flush()

    expect(calls).toHaveLength(1)
    expect(calls[0].resumeId).toBe(RESUME_A)
    expect(calls[0].model.fontScale).toBe(1.2)
  })

  it('does not also write when the abandoned timer would have fired', () => {
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    submit(persister, RESUME_A, model())
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    persister.flush()
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS * 4)

    expect(calls).toHaveLength(1)
  })

  it('is idempotent, because hidden-then-unmount delivers it more than once', () => {
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    submit(persister, RESUME_A, model())
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    persister.flush()
    persister.flush()
    persister.flush()

    expect(calls).toHaveLength(1)
  })

  it('does nothing when there is nothing owed', () => {
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    persister.flush()
    submit(persister, RESUME_A, model())
    persister.flush()

    expect(calls).toEqual([])
  })

  it('never resurrects a value the user undid inside the window', () => {
    // Drag the slider and drag it back before the debounce releases. The
    // account already holds the original, so the correct number of writes is
    // zero — a flush that replayed the abandoned intermediate value would be a
    // worse bug than the one it fixes.
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    submit(persister, RESUME_A, model({ fontScale: 1 }))
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    submit(persister, RESUME_A, model({ fontScale: 1 }))
    persister.flush()
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS * 4)

    expect(calls).toEqual([])
  })

  it('writes what is owed to a resume before adopting a baseline for another', () => {
    // The editor replaces its resume object from a localStorage draft, so the
    // id can change under a mounted surface. The pending write belongs to the
    // resume being left and must reach that row, not the new one.
    const { writer, calls } = recordingWriter()
    const persister = createLayoutPersister(writer)

    submit(persister, RESUME_A, model())
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    submit(persister, RESUME_B, model({ fontScale: 0.9 }))

    expect(calls).toHaveLength(1)
    expect(calls[0].resumeId).toBe(RESUME_A)
    expect(calls[0].model.fontScale).toBe(1.2)

    // The new resume's first model is only a baseline, so it is not written.
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS * 4)
    expect(calls).toHaveLength(1)
  })
})

describe('createLayoutPersister - a write that does not land', () => {
  it('reports a refused write and lets the same value be written again', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const calls: string[] = []
    const persister = createLayoutPersister((resumeId, written) => {
      calls.push(serializeLayoutModel(written))
      return Promise.resolve({ error: { message: 'permission denied' } })
    })

    submit(persister, RESUME_A, model())
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)
    await settle()
    expect(errors).toHaveBeenCalledTimes(1)
    expect(errors.mock.calls[0][0]).toContain(RESUME_A)

    // Undo back to the value whose write failed. The account never received it,
    // so this must produce a write rather than being suppressed as unchanged.
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)

    expect(calls).toHaveLength(2)
    errors.mockRestore()
  })

  it('reports a request that never completed rather than leaving it unhandled', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const persister = createLayoutPersister(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    )

    submit(persister, RESUME_A, model())
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)

    await settle()
    expect(errors).toHaveBeenCalledTimes(1)
    expect(errors.mock.calls[0][0]).toContain('Could not reach the server')
    errors.mockRestore()
  })

  it('reports a flushed write that fails, which the discarded one never could', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const persister = createLayoutPersister(() =>
      Promise.resolve({ error: { message: 'permission denied' } }),
    )

    submit(persister, RESUME_A, model())
    submit(persister, RESUME_A, model({ fontScale: 1.2 }))
    persister.flush()

    await settle()
    expect(errors).toHaveBeenCalledTimes(1)
    errors.mockRestore()
  })
})
