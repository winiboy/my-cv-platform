import { describe, expect, it, vi } from 'vitest'
import { parseHtmlToDocxRuns } from '@/app/api/resumes/[id]/download-docx/docx-helpers'
import { renderFormattedText } from './format-text'
import { decodeHtmlEntities } from './html-entities'

/**
 * The decoder the Preview (`renderFormattedText`) and Word
 * (`parseHtmlToDocxRuns`) share (rich-text-single-line-entities FR-2).
 *
 * The module is wrapped in a spy so the last case can show both callers reach
 * this one function rather than a copy of it. This suite runs in the node
 * environment, which has no `document` or `window`: the decoder runs during
 * server rendering, so it must not need them.
 */
vi.mock('./html-entities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./html-entities')>()
  return { ...actual, decodeHtmlEntities: vi.fn(actual.decodeHtmlEntities) }
})
// `renderFormattedText` imports SanitizedHtml, whose helpers need `document`;
// only the plain-text branch is exercised here.
vi.mock('./html-utils', () => ({
  sanitizeHtml: (html: string) => html,
  migrateTextToHtml: (text: string) => text,
}))

const ALL = { nbsp: true }
const WORD = { nbsp: false }

describe('decodeHtmlEntities', () => {
  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
    expect(decodeHtmlEntities('R&amp;D &lt; 5%', ALL)).toBe('R&D < 5%')
  })

  it('decodes the entities the editor writes, a no-break space included', () => {
    expect(decodeHtmlEntities('&amp;&lt;&gt;&quot;&#39;&#x27;', ALL)).toBe('&<>"\'\'')
    expect(decodeHtmlEntities('a&nbsp;b', ALL)).toBe('a b')
  })

  it('leaves &nbsp; as text with nbsp: false, and decodes the rest the same', () => {
    expect(decodeHtmlEntities('a&nbsp;b', WORD)).toBe('a&nbsp;b')
    expect(decodeHtmlEntities('&amp;&lt;&gt;&quot;&#39;&#x27;', WORD)).toBe('&<>"\'\'')
  })

  it('decodes in one pass, so a decoded & never starts a second entity', () => {
    for (const options of [ALL, WORD]) {
      expect(decodeHtmlEntities('&amp;lt;', options)).toBe('&lt;')
      expect(decodeHtmlEntities('&amp;amp;', options)).toBe('&amp;')
      expect(decodeHtmlEntities('&amp;nbsp;', options)).toBe('&nbsp;')
    }
  })

  it('leaves entities outside its set, and text without entities, as they are', () => {
    expect(decodeHtmlEntities('&eacute; &#233; &notanentity; & ;', ALL)).toBe('&eacute; &#233; &notanentity; & ;')
    expect(decodeHtmlEntities('First line\nSecond line', ALL)).toBe('First line\nSecond line')
  })

  it('is the one function both the Preview and Word decode with', () => {
    const spy = vi.mocked(decodeHtmlEntities)

    renderFormattedText('R&amp;D &lt; 5%')
    expect(spy).toHaveBeenCalledWith('R&amp;D &lt; 5%', ALL)

    spy.mockClear()
    parseHtmlToDocxRuns('R&amp;D &lt; 5%', { size: 20, color: '333333', font: 'Arial' })
    expect(spy).toHaveBeenCalledWith('R&amp;D &lt; 5%', WORD)
  })
})
