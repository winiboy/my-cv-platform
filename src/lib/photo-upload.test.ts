import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_PHOTO_BYTES, readPhotoFile } from './photo-upload'

/** A file of `size` bytes, without allocating them. */
function fileOfSize(size: number): File {
  return { size } as File
}

class FakeFileReader {
  result: string | null = null
  onload: (() => void) | null = null
  readAsDataURL() {
    this.result = 'data:image/png;base64,AAAA'
    this.onload?.()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readPhotoFile', () => {
  it('reads a photo up to the limit and hands over its data URL', () => {
    vi.stubGlobal('FileReader', FakeFileReader)
    const onLoad = vi.fn()
    const onTooLarge = vi.fn()
    readPhotoFile(fileOfSize(MAX_PHOTO_BYTES), onLoad, onTooLarge)
    expect(onLoad).toHaveBeenCalledWith('data:image/png;base64,AAAA')
    expect(onTooLarge).not.toHaveBeenCalled()
  })

  it('refuses a photo over 2 MB without reading it', () => {
    const reader = vi.fn()
    vi.stubGlobal('FileReader', reader)
    const onLoad = vi.fn()
    const onTooLarge = vi.fn()
    readPhotoFile(fileOfSize(MAX_PHOTO_BYTES + 1), onLoad, onTooLarge)
    expect(onTooLarge).toHaveBeenCalledTimes(1)
    expect(onLoad).not.toHaveBeenCalled()
    expect(reader).not.toHaveBeenCalled()
    expect(MAX_PHOTO_BYTES).toBe(2 * 1024 * 1024)
  })
})
