'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

// Font definitions with CSS font-family stacks (all with web font fallbacks)
export const FONTS = [
  { name: 'Inter', family: "'Inter', sans-serif" },
  { name: 'Helvetica', family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { name: 'Calibri', family: "'Calibri', 'Outfit', sans-serif" },
  { name: 'Source Sans', family: "'Source Sans 3', 'Source Sans Pro', sans-serif" },
  { name: 'Arial', family: "Arial, Helvetica, sans-serif" },
  { name: 'IBM Plex Sans', family: "'IBM Plex Sans', sans-serif" },
  { name: 'Roboto', family: "'Roboto', sans-serif" },
  { name: 'Segoe UI', family: "'Segoe UI', 'Open Sans', sans-serif" },
  { name: 'Lato', family: "'Lato', sans-serif" },
  { name: 'Open Sans', family: "'Open Sans', sans-serif" },
  { name: 'Avenir', family: "'Avenir Next', Avenir, 'Nunito Sans', sans-serif" },
  { name: 'PT Sans', family: "'PT Sans', sans-serif" },
  { name: 'Noto Sans', family: "'Noto Sans', sans-serif" },
  { name: 'Verdana', family: "Verdana, Geneva, sans-serif" },
] as const

export type FontName = typeof FONTS[number]['name']

interface FontCarousel3DProps {
  selectedFont: string
  onFontChange: (fontFamily: string) => void
}

const VISIBLE_ITEMS = 5
const HALF_VISIBLE = 2
const ITEM_HEIGHT = 22
// Per-slot vertical distance in the flat stack: keeps ±1 neighbors clearly
// above/below the teal center bar without visual overlap.
const SLOT_SPACING = 30

// Wrap scroll renders the same list across slots via modulo. If the list is
// shorter than the visible window, a single font would appear in multiple
// slots simultaneously — a confusing duplicate. Guard against that at module
// load so a future edit that trims FONTS trips immediately.
if (FONTS.length < VISIBLE_ITEMS) {
  throw new Error(
    `FontCarousel3D: FONTS.length (${FONTS.length}) must be >= VISIBLE_ITEMS (${VISIBLE_ITEMS}) for wrap scroll to render unique entries per slot.`
  )
}

export function FontCarousel3D({ selectedFont, onFontChange }: FontCarousel3DProps) {
  // Find current index based on selected font family
  const getCurrentIndex = useCallback(() => {
    const idx = FONTS.findIndex(f => f.family === selectedFont)
    return idx >= 0 ? idx : 4 // Default to Arial (index 4) if not found
  }, [selectedFont])

  const [currentIndex, setCurrentIndex] = useState(getCurrentIndex)
  // Vertical pixel offset during slot-to-slot animation (0 when at rest).
  const [slotOffset, setSlotOffset] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)

  // Sync with external selectedFont changes
  useEffect(() => {
    const newIndex = getCurrentIndex()
    if (newIndex !== currentIndex && !isAnimating) {
      setCurrentIndex(newIndex)
    }
  }, [selectedFont, getCurrentIndex, currentIndex, isAnimating])

  // Animate to a target index using shortest-path wrap logic.
  const animateToIndex = useCallback((targetIndex: number) => {
    if (isAnimating) return
    if (targetIndex === currentIndex) return

    setIsAnimating(true)

    // Shortest-path diff across the circular list: prefer the direction that
    // travels fewer slots. Ties (|diff| === FONTS.length / 2, e.g. 7 for 14)
    // are intentionally left with the raw sign from `targetIndex - currentIndex`
    // — the strict `>` / `<` comparisons below do NOT trigger on equality, so
    // a click that is exactly half the list away animates in the "natural"
    // signed direction of the subtraction. Do not change to `>=` / `<=`;
    // that would flip tie direction and feel inconsistent.
    const rawDiff = targetIndex - currentIndex
    let diff = rawDiff
    if (diff > FONTS.length / 2) {
      diff -= FONTS.length
    } else if (diff < -FONTS.length / 2) {
      diff += FONTS.length
    }
    const targetOffset = diff * SLOT_SPACING
    const duration = 200 // ms
    const startTime = performance.now()

    const animate = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)

      setSlotOffset(targetOffset * eased)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setCurrentIndex(targetIndex)
        setSlotOffset(0)
        onFontChange(FONTS[targetIndex].family)
        setIsAnimating(false)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [currentIndex, isAnimating, onFontChange])

  // Handle wheel scroll with wrap in both directions.
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (isAnimating) return

    if (e.deltaY > 0) {
      animateToIndex((currentIndex + 1) % FONTS.length)
    } else if (e.deltaY < 0) {
      animateToIndex((currentIndex - 1 + FONTS.length) % FONTS.length)
    }
  }, [currentIndex, isAnimating, animateToIndex])

  // Attach wheel listener
  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false })
      return () => container.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  // Navigate up (wrap)
  const goUp = () => {
    if (isAnimating) return
    animateToIndex((currentIndex - 1 + FONTS.length) % FONTS.length)
  }

  // Navigate down (wrap)
  const goDown = () => {
    if (isAnimating) return
    animateToIndex((currentIndex + 1) % FONTS.length)
  }

  // Wrap window: iterate fixed slot positions [-HALF_VISIBLE, +HALF_VISIBLE]
  // and map each slot to a font via modulo, so the list cycles continuously.
  const visibleItems: Array<{
    font: (typeof FONTS)[number]
    index: number
    slot: number
    style: { itemY: number; opacity: number; scale: number; isCenter: boolean }
  }> = []
  for (let s = -HALF_VISIBLE; s <= HALF_VISIBLE; s++) {
    const itemIndex = (currentIndex + s + FONTS.length) % FONTS.length

    const itemY = s * SLOT_SPACING - slotOffset
    const dist = Math.abs(s - slotOffset / SLOT_SPACING)
    const opacity = Math.max(0.15, 1 - dist * 0.35)
    const scale = Math.max(0.85, 1 - dist * 0.08)
    const isCenter = Math.abs(s * SLOT_SPACING - slotOffset) < SLOT_SPACING / 2

    visibleItems.push({
      font: FONTS[itemIndex],
      index: itemIndex,
      slot: s,
      style: {
        itemY,
        opacity,
        scale,
        isCenter,
      },
    })
  }

  return (
    <div className="flex items-center gap-1 select-none">
      {/* Flat vertical stack container */}
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          width: '180px',
          height: `${VISIBLE_ITEMS * SLOT_SPACING}px`,
          background: 'linear-gradient(to bottom, rgba(226, 232, 240, 0.98), rgba(203, 213, 225, 0.98))',
          borderRadius: '8px',
          cursor: 'ns-resize',
          border: '1px solid rgba(148, 163, 184, 0.5)',
        }}
      >
        {/* Gradient overlays for fade effect at top and bottom */}
        <div
          className="absolute inset-x-0 top-0 h-5 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(226, 232, 240, 0.98), transparent)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-5 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(203, 213, 225, 0.98), transparent)',
          }}
        />

        {/* Center highlight bar */}
        <div
          className="absolute inset-x-0 z-5 pointer-events-none"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            height: `${ITEM_HEIGHT + 2}px`,
            background: 'linear-gradient(to right, rgba(14, 165, 165, 0.15), rgba(20, 184, 166, 0.15))',
            borderTop: '1px solid rgba(20, 184, 166, 0.4)',
            borderBottom: '1px solid rgba(20, 184, 166, 0.4)',
          }}
        />

        {/* Flat stack items */}
        <div className="relative w-full h-full">
          {visibleItems.map(({ font, index, slot, style }) => (
            <button
              type="button"
              key={`slot-${slot}`}
              onClick={() => animateToIndex(index)}
              disabled={isAnimating}
              aria-label={`Select font ${font.name}`}
              aria-current={index === currentIndex ? 'true' : undefined}
              className="flex items-center justify-center transition-all duration-75 bg-transparent border-0 p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
              style={{
                position: 'absolute',
                top: '50%',
                left: 0,
                width: '100%',
                height: `${ITEM_HEIGHT}px`,
                marginTop: `-${ITEM_HEIGHT / 2}px`,
                transform: `translateY(${style.itemY}px) scale(${style.scale})`,
                opacity: style.opacity,
                cursor: index === currentIndex ? 'default' : 'pointer',
              }}
            >
              <span
                className={`text-sm font-medium px-3 py-0.5 rounded whitespace-nowrap transition-colors ${
                  style.isCenter
                    ? 'text-slate-800'
                    : 'text-slate-400'
                }`}
                style={{
                  fontFamily: font.family,
                  textShadow: style.isCenter ? '0 1px 2px rgba(0, 0, 0, 0.1)' : 'none',
                }}
              >
                {font.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Up/Down Navigation Buttons */}
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={goUp}
          disabled={isAnimating}
          className="w-6 h-6 flex items-center justify-center rounded bg-slate-200 hover:bg-slate-300 active:bg-slate-400 transition-colors disabled:opacity-50"
          style={{
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
            border: '1px solid rgba(148, 163, 184, 0.5)',
          }}
        >
          <ChevronUp className="w-4 h-4 text-slate-600" />
        </button>
        <button
          type="button"
          onClick={goDown}
          disabled={isAnimating}
          className="w-6 h-6 flex items-center justify-center rounded bg-slate-200 hover:bg-slate-300 active:bg-slate-400 transition-colors disabled:opacity-50"
          style={{
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
            border: '1px solid rgba(148, 163, 184, 0.5)',
          }}
        >
          <ChevronDown className="w-4 h-4 text-slate-600" />
        </button>
      </div>
    </div>
  )
}
