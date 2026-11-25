import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DOCX_PHOTO_DATA_URL,
  DOCX_PHOTO_JPEG_QUALITY,
  DOCX_PHOTO_MAX_EDGE,
  MAX_DOCX_PHOTO_LENGTH,
  fitWithin,
  hasTransparency,
  photoForDocx,
  reencodeForDocx,
  type DocxPhotoReencoder,
} from './photo-for-docx'

const JPEG_OUT = 'data:image/jpeg;base64,/9j/4AAQ'
const PNG_OUT = 'data:image/png;base64,iVBORw0KGgo='

function stubReencoder(result: string | Error): DocxPhotoReencoder & { calls: string[] } {
  const calls: string[] = []
  const reencode = async (dataUrl: string) => {
    calls.push(dataUrl)
    if (result instanceof Error) throw result
    return result
  }
  return Object.assign(reencode, { calls })
}

describe('DOCX_PHOTO_DATA_URL: the types the Word route accepts', () => {
  it.each(['jpeg', 'jpg', 'png', 'gif', 'bmp'])('accepts image/%s', (type) => {
    expect(DOCX_PHOTO_DATA_URL.test(`data:image/${type};base64,AAAA`)).toBe(true)
  })

  it.each(['webp', 'avif', 'svg+xml', 'tiff', 'heic'])('refuses image/%s', (type) => {
    expect(DOCX_PHOTO_DATA_URL.test(`data:image/${type};base64,AAAA`)).toBe(false)
  })
})

describe('fitWithin', () => {
  it.each([
    [{ width: 3000, height: 4000 }, { width: 768, height: 1024 }],
    [{ width: 4000, height: 3000 }, { width: 1024, height: 768 }],
    [{ width: 2048, height: 2048 }, { width: 1024, height: 1024 }],
    [{ width: 1025, height: 10 }, { width: 1024, height: 10 }],
  ])('scales %j down to %j', (size, expected) => {
    expect(fitWithin(size)).toEqual(expected)
  })

  it.each([
    { width: 300, height: 400 },
    { width: 1024, height: 1024 },
    { width: 1, height: 1 },
  ])('never scales %j up', (size) => {
    expect(fitWithin(size)).toEqual(size)
  })

  it('keeps every edge at least 1 px', () => {
    expect(fitWithin({ width: 100_000, height: 10 })).toEqual({ width: 1024, height: 1 })
  })

  it('bounds the longer edge by DOCX_PHOTO_MAX_EDGE', () => {
    expect(DOCX_PHOTO_MAX_EDGE).toBe(1024)
  })
})

describe('hasTransparency', () => {
  it('is false when every pixel is opaque', () => {
    expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false)
  })

  it.each([0, 254])('is true when one pixel has alpha %i', (alpha) => {
    expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 0, 0, 0, alpha]))).toBe(true)
  })

  it('reads only the alpha channel', () => {
    expect(hasTransparency(new Uint8ClampedArray([0, 0, 0, 255, 254, 0, 1, 255]))).toBe(false)
  })
})

describe('photoForDocx', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['jpeg', 'jpg', 'png', 'gif', 'bmp'])('passes image/%s through unchanged, without decoding', async (type) => {
    const photo = `data:image/${type};base64,QUJDRA==`
    const reencode = stubReencoder(JPEG_OUT)
    expect(await photoForDocx(photo, reencode)).toBe(photo)
    expect(reencode.calls).toEqual([])
  })

  it.each([
    ['webp', JPEG_OUT],
    ['avif', JPEG_OUT],
    ['webp', PNG_OUT],
  ])('sends a re-encoded image/%s (%s)', async (type, output) => {
    const photo = `data:image/${type};base64,UklGRg==`
    const reencode = stubReencoder(output)
    expect(await photoForDocx(photo, reencode)).toBe(output)
    expect(reencode.calls).toEqual([photo])
  })

  it('sends nothing when the photo cannot be decoded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reencode = stubReencoder(new Error('Photo could not be decoded'))
    expect(await photoForDocx('data:image/webp;base64,AAAA', reencode)).toBeUndefined()
  })

  it.each(['data:,', 'data:image/webp;base64,AAAA', 'data:image/png;base64,', ''])(
    'sends nothing when the re-encode yields neither a JPEG nor a PNG (%j)',
    async (output) => {
      expect(await photoForDocx('data:image/webp;base64,AAAA', stubReencoder(output))).toBeUndefined()
    }
  )

  it('sends a re-encode at the size limit, and nothing when it is still over it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prefix = 'data:image/jpeg;base64,'
    const atLimit = prefix + 'A'.repeat(MAX_DOCX_PHOTO_LENGTH - prefix.length)
    expect(await photoForDocx('data:image/webp;base64,AAAA', stubReencoder(atLimit))).toBe(atLimit)
    expect(await photoForDocx('data:image/webp;base64,AAAA', stubReencoder(atLimit + 'A'))).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not decode an SVG, and sends nothing', async () => {
    const reencode = stubReencoder(PNG_OUT)
    expect(await photoForDocx('data:image/svg+xml;base64,PHN2Zz4=', reencode)).toBeUndefined()
    expect(reencode.calls).toEqual([])
  })

  it.each([null, undefined, ''])('sends nothing when there is no photo (%j)', async (stored) => {
    expect(await photoForDocx(stored, stubReencoder(PNG_OUT))).toBeUndefined()
  })

  it('leaves a value that is not a data URL for the route to judge', async () => {
    const reencode = stubReencoder(PNG_OUT)
    expect(await photoForDocx('QUJDRA==', reencode)).toBe('QUJDRA==')
    expect(reencode.calls).toEqual([])
  })
})

describe('reencodeForDocx', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  interface FakeCanvas {
    width: number
    height: number
    draws: unknown[][]
    encodes: unknown[][]
  }

  /**
   * A browser whose decoder yields an image of the given natural size, and
   * whose canvas reports `alpha` for every pixel and encodes to a data URL
   * naming the type, quality and canvas size it was asked for.
   */
  function stubBrowser(options: { decodes: boolean; width?: number; height?: number; alpha?: number; context?: boolean }) {
    const canvases: FakeCanvas[] = []
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = options.width ?? 0
      naturalHeight = options.height ?? 0
      set src(_value: string) {
        queueMicrotask(() => (options.decodes ? this.onload?.() : this.onerror?.()))
      }
    }
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        expect(tag).toBe('canvas')
        const canvas: FakeCanvas & Record<string, unknown> = {
          width: 0,
          height: 0,
          draws: [],
          encodes: [],
          getContext: (kind: string) => {
            expect(kind).toBe('2d')
            if (options.context === false) return null
            return {
              imageSmoothingQuality: 'low',
              drawImage: (...args: unknown[]) => void canvas.draws.push(args),
              getImageData: (_x: number, _y: number, w: number, h: number) => {
                const data = new Uint8ClampedArray(w * h * 4).fill(255)
                for (let i = 3; i < data.length; i += 4) data[i] = options.alpha ?? 255
                return { data }
              },
            }
          },
          toDataURL: (type: string, quality?: number) => {
            canvas.encodes.push([type, quality])
            return `data:${type};base64,${canvas.width}x${canvas.height}`
          },
        }
        canvases.push(canvas)
        return canvas
      },
    })
    return canvases
  }

  it('scales a large opaque photo down to a 1024 px long edge and encodes JPEG', async () => {
    const canvases = stubBrowser({ decodes: true, width: 3000, height: 4000 })
    expect(await reencodeForDocx('data:image/webp;base64,AAAA')).toBe('data:image/jpeg;base64,768x1024')
    expect(canvases).toHaveLength(1)
    expect(canvases[0].draws).toEqual([[expect.anything(), 0, 0, 768, 1024]])
    expect(canvases[0].encodes).toEqual([['image/jpeg', DOCX_PHOTO_JPEG_QUALITY]])
  })

  it('keeps a small photo at its natural size', async () => {
    stubBrowser({ decodes: true, width: 300, height: 400 })
    expect(await reencodeForDocx('data:image/webp;base64,AAAA')).toBe('data:image/jpeg;base64,300x400')
  })

  it('encodes PNG when the photo has transparency', async () => {
    const canvases = stubBrowser({ decodes: true, width: 2000, height: 1000, alpha: 0 })
    expect(await reencodeForDocx('data:image/avif;base64,AAAA')).toBe('data:image/png;base64,1024x512')
    expect(canvases[0].encodes).toEqual([['image/png', undefined]])
  })

  it('rejects when the browser cannot decode the photo', async () => {
    stubBrowser({ decodes: false })
    await expect(reencodeForDocx('data:image/avif;base64,AAAA')).rejects.toThrow('could not be decoded')
  })

  it('rejects an image with no intrinsic size', async () => {
    stubBrowser({ decodes: true, width: 0, height: 0 })
    await expect(reencodeForDocx('data:image/webp;base64,AAAA')).rejects.toThrow('no intrinsic size')
  })

  it('rejects when no 2D context is available', async () => {
    stubBrowser({ decodes: true, width: 10, height: 10, context: false })
    await expect(reencodeForDocx('data:image/webp;base64,AAAA')).rejects.toThrow('2D context')
  })
})
