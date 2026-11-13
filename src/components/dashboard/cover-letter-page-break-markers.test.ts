import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import {
  COVER_LETTER_CONTINUATION_PAGE_PX,
  COVER_LETTER_FIRST_PAGE_BOTTOM_PX,
  type CoverLetterLayout,
} from '@/lib/cover-letter-page-breaks'
import { SWISS_LETTER_LAYOUT_PX } from '@/lib/cover-letter-swiss-letter'
import {
  CoverLetterPageBreakMarkers,
  PAGE_BREAK_LABEL_ROOM_PX,
  hasRoomForPageBreakLabels,
} from './cover-letter-page-break-markers'

/** Content without lines, breaking at each page end. */
const THREE_PAGES: CoverLetterLayout = {
  lines: [],
  contentBottom: COVER_LETTER_FIRST_PAGE_BOTTOM_PX + COVER_LETTER_CONTINUATION_PAGE_PX + 200,
}

function render(
  layout: CoverLetterLayout | null,
  { showLabels = true, labelTemplate = en.coverLetters.editor.pageBreakLabel } = {},
): string {
  return renderToStaticMarkup(
    createElement(CoverLetterPageBreakMarkers, { layout, scale: 0.5, labelTemplate, showLabels }),
  )
}

describe('CoverLetterPageBreakMarkers', () => {
  it.each([
    null,
    { lines: [], contentBottom: 0 },
    { lines: [{ block: 0, top: 100, bottom: 120 }], contentBottom: COVER_LETTER_FIRST_PAGE_BOTTOM_PX },
  ])('renders nothing for one page (%#)', (layout) => {
    expect(render(layout)).toBe('')
  })

  it.each([
    { lines: [], contentBottom: Number.NaN },
    { lines: [{ block: 0, top: 20, bottom: 10 }], contentBottom: 2_000 },
    { lines: [{ block: 0, top: Number.POSITIVE_INFINITY, bottom: 10 }], contentBottom: 2_000 },
  ])('renders nothing instead of throwing for an invalid measurement (%#)', (layout) => {
    expect(render(layout)).toBe('')
  })

  it('draws a marker at the top of the first line moved to the next page', () => {
    const L = SWISS_LETTER_LAYOUT_PX.lineHeight
    const straddling = { block: 1, top: COVER_LETTER_FIRST_PAGE_BOTTOM_PX - 5, bottom: COVER_LETTER_FIRST_PAGE_BOTTOM_PX - 5 + L }
    const html = render({
      lines: [
        { block: 0, top: 100, bottom: 100 + L },
        straddling,
        { block: 2, top: straddling.bottom + L, bottom: straddling.bottom + 2 * L },
      ],
      contentBottom: straddling.bottom + 2 * L,
    })
    expect(html.match(/data-testid="page-break-indicator"/g)).toHaveLength(1)
    expect(html).toContain(`top:${straddling.top}px`)
  })

  it('renders one labelled, decorative marker per page end, at the printed edges', () => {
    const html = render(THREE_PAGES)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('pointer-events-none')
    expect(html).toContain('select-none')
    expect(html).toContain('print:hidden')
    expect(html.match(/data-testid="page-break-indicator"/g)).toHaveLength(2)
    expect(html).toContain('data-page="2"')
    expect(html).toContain('data-page="3"')
    expect(html).toContain('>Page 2<')
    expect(html).toContain('>Page 3<')
    expect(html).toContain(`top:${COVER_LETTER_FIRST_PAGE_BOTTOM_PX}px`)
    expect(html).toContain(`top:${COVER_LETTER_FIRST_PAGE_BOTTOM_PX + COVER_LETTER_CONTINUATION_PAGE_PX}px`)
  })

  it('keeps a constant on-screen line by counter-scaling a 1 px border to the screen', () => {
    // At scale 0.5: twice the sheet's width, drawn at half size.
    const html = render(THREE_PAGES)
    expect(html).toContain('border-t border-dashed border-teal-500/70')
    expect(html).toContain('width:50%;transform:scale(2)')
    expect(html).not.toContain('border-top-width')
  })

  it.each([
    [fr, 'Page 2'],
    [en, 'Page 2'],
    [de, 'Seite 2'],
    [it_, 'Pagina 2'],
  ])('labels the page from the interface dictionary (%#)', (dict, label) => {
    expect(render(THREE_PAGES, { labelTemplate: dict.coverLetters.editor.pageBreakLabel })).toContain(`>${label}<`)
  })

  it('draws the lines but no label when the gutter has no room', () => {
    const html = render(THREE_PAGES, { showLabels: false })
    expect(html.match(/data-testid="page-break-indicator"/g)).toHaveLength(2)
    expect(html).not.toContain('page-break-label')
  })
})

describe('hasRoomForPageBreakLabels', () => {
  it('needs the label room on the right of the centred sheet', () => {
    expect(hasRoomForPageBreakLabels(400 + 2 * PAGE_BREAK_LABEL_ROOM_PX, 400)).toBe(true)
    expect(hasRoomForPageBreakLabels(400 + 2 * PAGE_BREAK_LABEL_ROOM_PX - 1, 400)).toBe(false)
  })

  it('has no room for a sheet fitted to the width, or wider than the area', () => {
    expect(hasRoomForPageBreakLabels(600, 600)).toBe(false)
    expect(hasRoomForPageBreakLabels(600, 900)).toBe(false)
  })
})
