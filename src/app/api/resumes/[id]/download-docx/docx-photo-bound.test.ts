import { describe, expect, it } from 'vitest'
import { MAX_DOCX_PHOTO_LENGTH } from '@/lib/photo-for-docx'
import { boundedPhoto } from './docx-photo-bound'

const PAYLOAD = 'iVBORw0KGgo='

describe('boundedPhoto: the Word route accepts what Word embeds, and nothing else', () => {
  it.each(['jpeg', 'jpg', 'png', 'gif', 'bmp'])('accepts a data:image/%s photo, unchanged', (type) => {
    const photo = `data:image/${type};base64,${PAYLOAD}`
    expect(boundedPhoto(photo)).toBe(photo)
  })

  it.each(['webp', 'avif', 'svg+xml', 'tiff'])('refuses a data:image/%s photo', (type) => {
    expect(boundedPhoto(`data:image/${type};base64,${PAYLOAD}`)).toBeUndefined()
  })

  it('accepts raw base64, as it always has', () => {
    expect(boundedPhoto(PAYLOAD)).toBe(PAYLOAD)
  })

  it.each([undefined, null, 42, {}, '', 'data:image/png;base64,', 'data:image/png;base64,not base64!'])(
    'refuses %j',
    (value) => {
      expect(boundedPhoto(value)).toBeUndefined()
    }
  )

  it('accepts a photo at the size limit and refuses one a character over it', () => {
    const prefix = 'data:image/png;base64,'
    const atLimit = prefix + 'A'.repeat(MAX_DOCX_PHOTO_LENGTH - prefix.length)
    expect(boundedPhoto(atLimit)).toBe(atLimit)
    expect(boundedPhoto(atLimit + 'A')).toBeUndefined()
  })

  it('keeps the size limit at 8 MB of characters', () => {
    expect(MAX_DOCX_PHOTO_LENGTH).toBe(8 * 1024 * 1024)
  })
})
