import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_LENGTH, boundedPdfPhoto, pdfPhotoProblem } from './photo'

describe('pdfPhotoProblem', () => {
  it.each(['jpeg', 'jpg', 'png', 'gif', 'bmp', 'webp', 'avif'])('has none for a %s data URL', (type) => {
    expect(pdfPhotoProblem(`data:image/${type};base64,QUJD`)).toBeNull()
  })

  it.each([
    ['SVG', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['TIFF', 'data:image/tiff;base64,QUJD'],
    ['a remote URL', 'https://example.com/x.webp'],
    ['bare base64', 'QUJD'],
    ['a malformed payload', 'data:image/webp;base64,QU JD'],
    ['an empty string', ''],
    ['a non-string', 42],
  ])('calls %s unsupported', (_label, value) => {
    expect(pdfPhotoProblem(value)).toBe('unsupported')
  })

  it('calls a photo over the bound too large, whatever its type', () => {
    expect(pdfPhotoProblem(`data:image/png;base64,${'A'.repeat(MAX_PHOTO_LENGTH)}`)).toBe('too-large')
    expect(pdfPhotoProblem(`data:image/svg+xml;base64,${'A'.repeat(MAX_PHOTO_LENGTH)}`)).toBe('too-large')
  })

  it('agrees with boundedPdfPhoto, which the route applies', () => {
    for (const value of ['data:image/webp;base64,QUJD', 'data:image/svg+xml;base64,PHN2Zz4=', '', 42]) {
      expect(boundedPdfPhoto(value) !== undefined).toBe(pdfPhotoProblem(value) === null)
    }
  })
})
