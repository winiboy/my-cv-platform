/**
 * Zoom arithmetic for the cover-letter preview (cover-letter-preview-and-card-language,
 * US-002, FR-3). Pure, so the bounds and steps are unit-tested without a browser.
 *
 * A scale is a factor of the page's natural size: 1 is 100%. Steps are taken on
 * the whole percentage the controls display, so the button the user presses
 * always moves from the number they read: 63% goes in to 70% and out to 60%.
 */

import { SWISS_LETTER_PAGE_PX } from './cover-letter-swiss-letter'

/**
 * The letter template's page at 96dpi, as `ModernLetterTemplate` draws it:
 * the A4 sheet of the Swiss letter (`SWISS_LETTER_PAGE_PX`). "Show all" fits
 * this first page; a longer letter continues below it on the same sheet.
 */
export const PAGE_WIDTH_PX = SWISS_LETTER_PAGE_PX.width
export const PAGE_HEIGHT_PX = SWISS_LETTER_PAGE_PX.height

export const MIN_ZOOM_PERCENT = 25
export const MAX_ZOOM_PERCENT = 200
export const ZOOM_STEP_PERCENT = 10

const MIN_SCALE = MIN_ZOOM_PERCENT / 100
const MAX_SCALE = MAX_ZOOM_PERCENT / 100

/** The scale held within the FR-3 bounds. */
export function clampZoomScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** The scale as the whole percentage the controls display. */
export function zoomPercent(scale: number): number {
  return Math.round(scale * 100)
}

/** The next step above `scale`: the next multiple of the step, at most the upper bound. */
export function zoomInScale(scale: number): number {
  const percent = zoomPercent(scale)
  const next = Math.floor(percent / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT + ZOOM_STEP_PERCENT
  return clampZoomScale(next / 100)
}

/** The next step below `scale`: the previous multiple of the step, at least the lower bound. */
export function zoomOutScale(scale: number): number {
  const percent = zoomPercent(scale)
  const next = Math.ceil(percent / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT - ZOOM_STEP_PERCENT
  return clampZoomScale(next / 100)
}

export function canZoomIn(scale: number): boolean {
  return zoomPercent(scale) < MAX_ZOOM_PERCENT
}

export function canZoomOut(scale: number): boolean {
  return zoomPercent(scale) > MIN_ZOOM_PERCENT
}

/**
 * The editor pane's starting scale, unchanged from before zoom existed: the
 * page fitted to `width`, never above `maxScale`.
 */
export function fitWidthScale(width: number, maxScale: number): number {
  return clampZoomScale(Math.min(width / PAGE_WIDTH_PX, maxScale))
}

/** The largest scale at which the whole first page fits in `width` x `height`. */
export function fitPageScale(width: number, height: number): number {
  return clampZoomScale(Math.min(width / PAGE_WIDTH_PX, height / PAGE_HEIGHT_PX))
}
