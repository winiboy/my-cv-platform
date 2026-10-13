import { describe, expect, it } from 'vitest'
import { cleanPdfBasename, pdfContentDisposition } from './filename'

/** The two parameters of a disposition, decoded the way a browser reads them. */
function parse(header: string): { type: string; ascii: string; unicode: string } {
  const type = header.split(';')[0]
  const ascii = /filename="([^"]*)"/.exec(header)?.[1]
  const encoded = /filename\*=UTF-8''([^;\s]+)/.exec(header)?.[1]
  if (ascii === undefined || encoded === undefined) throw new Error(`Malformed disposition: ${header}`)
  return { type, ascii, unicode: decodeURIComponent(encoded) }
}

describe('pdfContentDisposition', () => {
  it('is an attachment named after the title', () => {
    expect(pdfContentDisposition('Senior Engineer CV')).toBe(
      `attachment; filename="Senior Engineer CV.pdf"; filename*=UTF-8''Senior%20Engineer%20CV.pdf`,
    )
  })

  it('RFC 5987-encodes a non-ASCII title and gives an accent-stripped ASCII fallback', () => {
    const header = pdfContentDisposition('CV Zoë – Zürich 日本')
    const { type, ascii, unicode } = parse(header)
    expect(type).toBe('attachment')
    expect(unicode).toBe('CV Zoë – Zürich 日本.pdf')
    expect(ascii).toBe('CV Zoe _ Zurich __.pdf')
    // The header itself is plain ASCII.
    expect(header).toMatch(/^[\x20-\x7e]+$/)
  })

  it('neutralizes quotes and backslashes, so the quoted fallback cannot be broken out of', () => {
    const header = pdfContentDisposition('My "best" CV\\"; filename="evil.exe')
    const { ascii, unicode } = parse(header)
    expect(ascii).not.toMatch(/["\\]/)
    expect(unicode).not.toMatch(/["\\]/)
    expect(header.match(/"/g)).toHaveLength(2)
    expect(ascii.endsWith('.pdf')).toBe(true)
  })

  it('removes control characters, so CR/LF cannot split the header', () => {
    const header = pdfContentDisposition('CV\r\nSet-Cookie: a=b\u0000')
    expect(header).not.toMatch(/[\r\n\u0000]/)
    expect(parse(header).unicode).toBe('CV Set-Cookie_ a=b.pdf')
  })

  it('encodes the RFC 5987 reserved characters encodeURIComponent leaves alone', () => {
    expect(pdfContentDisposition("Jo's (2026) *CV*")).toContain(
      `filename*=UTF-8''Jo%27s%20%282026%29%20_CV_.pdf`,
    )
  })

  it.each([
    ['an empty title', ''],
    ['a null title', null],
    ['an undefined title', undefined],
    ['whitespace only', '   \t '],
    ['dots only', '...'],
    ['control characters only', '\u0001\u0002'],
  ])('gives resume.pdf for %s', (_label, title) => {
    expect(pdfContentDisposition(title)).toBe(`attachment; filename="resume.pdf"; filename*=UTF-8''resume.pdf`)
  })

  it('falls back to resume.pdf in the ASCII parameter only when nothing ASCII is left', () => {
    const { ascii, unicode } = parse(pdfContentDisposition('履歴書'))
    expect(unicode).toBe('履歴書.pdf')
    expect(ascii).toBe('___.pdf')
  })
})

describe('cleanPdfBasename', () => {
  it('replaces path separators and reserved characters', () => {
    expect(cleanPdfBasename('../../etc/passwd')).toBe('.._.._etc_passwd')
    expect(cleanPdfBasename('a<b>c:d|e?f*g')).toBe('a_b_c_d_e_f_g')
  })

  it('drops trailing dots and spaces, which Windows strips from file names', () => {
    expect(cleanPdfBasename('My CV. . ')).toBe('My CV')
  })

  it('bounds the length by code point without splitting a surrogate pair', () => {
    const name = cleanPdfBasename('😀'.repeat(500))
    expect(Array.from(name)).toHaveLength(120)
    expect(() => encodeURIComponent(name)).not.toThrow()
  })
})
