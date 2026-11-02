import { afterEach, describe, expect, it } from 'vitest'
import { MAX_CONCURRENT_PDF_RENDERS, tryAcquirePdfRenderSlot, type PdfRenderSlot } from './render-slots'

describe('tryAcquirePdfRenderSlot', () => {
  const held: PdfRenderSlot[] = []

  afterEach(() => {
    held.splice(0).forEach((slot) => slot.release())
  })

  it('grants exactly the limit, then refuses', () => {
    for (let i = 0; i < MAX_CONCURRENT_PDF_RENDERS; i++) {
      const slot = tryAcquirePdfRenderSlot()
      expect(slot).not.toBeNull()
      held.push(slot!)
    }
    expect(tryAcquirePdfRenderSlot()).toBeNull()
  })

  it('frees a slot on release, once only', () => {
    for (let i = 0; i < MAX_CONCURRENT_PDF_RENDERS; i++) held.push(tryAcquirePdfRenderSlot()!)
    const first = held.shift()!
    first.release()
    first.release()

    const again = tryAcquirePdfRenderSlot()
    expect(again).not.toBeNull()
    held.push(again!)
    // A second release of the first slot must not have freed another one.
    expect(tryAcquirePdfRenderSlot()).toBeNull()
  })
})
