import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_PX,
  canZoomIn,
  canZoomOut,
  clampZoomScale,
  fitPageScale,
  fitWidthScale,
  zoomInScale,
  zoomOutScale,
  zoomPercent,
} from './cover-letter-preview-zoom'

describe('cover-letter preview zoom (FR-3)', () => {
  it('holds a scale within 25% and 200%', () => {
    expect(clampZoomScale(0.1)).toBe(0.25)
    expect(clampZoomScale(3)).toBe(2)
    expect(clampZoomScale(0.63)).toBe(0.63)
  })

  it('reads the scale as the whole percentage displayed', () => {
    expect(zoomPercent(0.634)).toBe(63)
    expect(zoomPercent(0.7)).toBe(70)
    expect(zoomPercent(0.1 * 7)).toBe(70)
  })

  it('steps by 10 points from a step value', () => {
    expect(zoomPercent(zoomInScale(0.7))).toBe(80)
    expect(zoomPercent(zoomOutScale(0.7))).toBe(60)
    expect(zoomPercent(zoomInScale(1))).toBe(110)
    expect(zoomPercent(zoomOutScale(1))).toBe(90)
  })

  it('steps from a between-steps value to the next step value', () => {
    expect(zoomPercent(zoomInScale(0.634))).toBe(70)
    expect(zoomPercent(zoomOutScale(0.634))).toBe(60)
    expect(zoomPercent(zoomInScale(0.785))).toBe(80)
    expect(zoomPercent(zoomOutScale(0.785))).toBe(70)
  })

  it('reaches the bounds and goes no further', () => {
    expect(zoomPercent(zoomInScale(1.9))).toBe(MAX_ZOOM_PERCENT)
    expect(zoomPercent(zoomInScale(1.95))).toBe(MAX_ZOOM_PERCENT)
    expect(zoomPercent(zoomInScale(2))).toBe(MAX_ZOOM_PERCENT)
    expect(zoomPercent(zoomOutScale(0.3))).toBe(MIN_ZOOM_PERCENT)
    expect(zoomPercent(zoomOutScale(0.28))).toBe(MIN_ZOOM_PERCENT)
    expect(zoomPercent(zoomOutScale(0.25))).toBe(MIN_ZOOM_PERCENT)
    expect(zoomPercent(zoomInScale(0.25))).toBe(30)
  })

  it('walks every step from one bound to the other', () => {
    const up: number[] = []
    let scale = 0.25
    while (canZoomIn(scale)) {
      scale = zoomInScale(scale)
      up.push(zoomPercent(scale))
    }
    expect(up).toEqual([30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200])

    const down: number[] = []
    while (canZoomOut(scale)) {
      scale = zoomOutScale(scale)
      down.push(zoomPercent(scale))
    }
    expect(down).toEqual([190, 180, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 25])
  })

  it('disables the matching direction only at a bound', () => {
    expect(canZoomIn(2)).toBe(false)
    expect(canZoomOut(2)).toBe(true)
    expect(canZoomIn(0.25)).toBe(true)
    expect(canZoomOut(0.25)).toBe(false)
    expect(canZoomIn(1.99)).toBe(true)
    expect(canZoomOut(0.26)).toBe(true)
  })

  it('fits the page to a width, capped as the editor pane always has been', () => {
    expect(fitWidthScale(640, 0.85)).toBeCloseTo(640 / PAGE_WIDTH_PX)
    expect(fitWidthScale(1200, 0.85)).toBe(0.85)
    expect(fitWidthScale(100, 0.85)).toBe(0.25)
  })

  it('fits the whole first page in both dimensions', () => {
    const heightBound = fitPageScale(1000, 700)
    expect(heightBound).toBeCloseTo(700 / PAGE_HEIGHT_PX)
    expect(PAGE_WIDTH_PX * heightBound).toBeLessThanOrEqual(1000)
    expect(PAGE_HEIGHT_PX * heightBound).toBeLessThanOrEqual(700)

    const widthBound = fitPageScale(343, 750)
    expect(widthBound).toBeCloseTo(343 / PAGE_WIDTH_PX)
    expect(PAGE_WIDTH_PX * widthBound).toBeLessThanOrEqual(343)
    expect(PAGE_HEIGHT_PX * widthBound).toBeLessThanOrEqual(750)

    expect(fitPageScale(10_000, 10_000)).toBe(2)
    expect(fitPageScale(50, 50)).toBe(0.25)
  })
})
