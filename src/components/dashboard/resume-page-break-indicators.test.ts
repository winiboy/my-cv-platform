import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import { PAGE_HEIGHT_PX } from '@/lib/resume-page-size'
import { ResumePageBreakIndicators } from './resume-page-break-indicators'

function render(documentHeight: number | null): string {
  return renderToStaticMarkup(
    createElement(ResumePageBreakIndicators, {
      documentHeight,
      scale: 0.5,
      labelTemplate: en.resumes.pageBreakLabel,
    })
  )
}

describe('ResumePageBreakIndicators', () => {
  it.each([null, 0, PAGE_HEIGHT_PX])('renders nothing for one page (%s)', (height) => {
    expect(render(height)).toBe('')
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'renders nothing instead of throwing for an invalid measurement (%s)',
    (height) => {
      expect(render(height)).toBe('')
    }
  )

  it('renders one labelled, decorative indicator per sheet edge', () => {
    const html = render(2 * PAGE_HEIGHT_PX + 2)
    expect(html).toContain('aria-hidden="true"')
    expect(html.match(/data-testid="page-break-indicator"/g)).toHaveLength(2)
    expect(html).toContain('data-page="2"')
    expect(html).toContain('data-page="3"')
    expect(html).toContain('>Page 2<')
    expect(html).toContain('>Page 3<')
    expect(html).toContain(`top:${PAGE_HEIGHT_PX}px`)
    expect(html).toContain(`top:${2 * PAGE_HEIGHT_PX}px`)
  })
})
