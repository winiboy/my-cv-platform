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

export function FontCarousel3D({ selectedFont, onFontChange }: FontCarousel3DProps) {
  // Find current index based on selected font family
  const getCurrentIndex = useCallback(() => {
    const idx = FONTS.findIndex(f => f.family === selectedFont)
    return idx >= 0 ? idx : 4 // Default to Arial (index 4) if not found
  }, [selectedFont])

  const [currentIndex, setCurrentIndex] = useState(getCurrentIndex)
  const [rotationOffset, setRotationOffset] = useState(0) // For smooth animation
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

  const VISIBLE_ITEMS = 3 // Number of items visible at once (reduced for half height)
  const ITEM_HEIGHT = 24 // Height of each item
  const ROTATION_PER_ITEM = 360 / FONTS.length // Degrees per item

  // Animate to a target index
  const animateToIndex = useCallback((targetIndex: number) => {
    if (isAnimating) return

    // Normalize target index for infinite loop
    let normalizedTarget = ((targetIndex % FONTS.length) + FONTS.length) % FONTS.length

    setIsAnimating(true)

    // Calculate shortest rotation path
    let diff = normalizedTarget - currentIndex
    if (diff > FONTS.length / 2) diff -= FONTS.length
    if (diff < -FONTS.length / 2) diff += FONTS.length

    const startOffset = rotationOffset
    const targetOffset = startOffset + diff * ROTATION_PER_ITEM
    const duration = 200 // ms
    const startTime = performance.now()

    const animate = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)

      const newOffset = startOffset + (targetOffset - startOffset) * eased
      setRotationOffset(newOffset)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setCurrentIndex(normalizedTarget)
        setRotationOffset(0)
        setIsAnimating(false)
        onFontChange(FONTS[normalizedTarget].family)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [currentIndex, isAnimating, rotationOffset, onFontChange, ROTATION_PER_ITEM])

  // Handle wheel scroll
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (isAnimating) return

    if (e.deltaY > 0) {
      animateToIndex(currentIndex + 1)
    } else if (e.deltaY < 0) {
      animateToIndex(currentIndex - 1)
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

  // Navigate up
  const goUp = () => {
    if (!isAnimating) {
      animateToIndex(currentIndex - 1)
    }
  }

  // Navigate down
  const goDown = () => {
    if (!isAnimating) {
      animateToIndex(currentIndex + 1)
    }
  }

  // Calculate which items to show and their transforms
  const getVisibleItems = () => {
    const items = []
    const halfVisible = Math.floor(VISIBLE_ITEMS / 2)

    for (let offset = -halfVisible; offset <= halfVisible; offset++) {
      // Calculate the actual index in the fonts array (with wrapping)
      let itemIndex = ((currentIndex + offset) % FONTS.length + FONTS.length) % FONTS.length

      // Calculate rotation angle including animation offset
      const baseAngle = offset * ROTATION_PER_ITEM
      const animatedAngle = baseAngle - rotationOffset

      // 3D transform calculations
      const radius = 40 // Radius of the 3D drum (smaller for reduced height)
      const rotateX = animatedAngle
      const translateZ = radius
      const translateY = Math.sin((animatedAngle * Math.PI) / 180) * radius * 0.8

      // Opacity and scale based on position
      const normalizedPosition = Math.abs(animatedAngle) / (ROTATION_PER_ITEM * halfVisible)
      const opacity = Math.max(0.2, 1 - normalizedPosition * 0.6)
      const scale = Math.max(0.7, 1 - normalizedPosition * 0.25)

      // Is this the center (selected) item?
      const isCenter = Math.abs(animatedAngle) < ROTATION_PER_ITEM / 2

      items.push({
        font: FONTS[itemIndex],
        index: itemIndex,
        offset,
        style: {
          transform: `rotateX(${rotateX}deg) translateZ(${translateZ}px)`,
          opacity,
          scale,
          translateY,
          isCenter,
        },
      })
    }

    return items
  }

  const visibleItems = getVisibleItems()

  return (
    <div className="flex items-center gap-1 select-none">
      {/* 3D Carousel Container */}
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          width: '180px',
          height: `${VISIBLE_ITEMS * ITEM_HEIGHT}px`,
          perspective: '300px',
          perspectiveOrigin: 'center center',
          background: 'linear-gradient(to bottom, rgba(226, 232, 240, 0.98), rgba(203, 213, 225, 0.98))',
          borderRadius: '8px',
          cursor: 'ns-resize',
          border: '1px solid rgba(148, 163, 184, 0.5)',
        }}
      >
        {/* Gradient overlays for fade effect at top and bottom */}
        <div
          className="absolute inset-x-0 top-0 h-4 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(226, 232, 240, 0.98), transparent)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-4 z-10 pointer-events-none"
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

        {/* 3D Drum with items */}
        <div
          className="relative w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
          {visibleItems.map(({ font, index, style }) => (
            <div
              key={`${font.name}-${index}`}
              className="absolute inset-x-0 flex items-center justify-center transition-all duration-75"
              style={{
                top: '50%',
                height: `${ITEM_HEIGHT}px`,
                marginTop: `-${ITEM_HEIGHT / 2}px`,
                transform: `${style.transform} translateY(${style.translateY}px) scale(${style.scale})`,
                opacity: style.opacity,
                transformStyle: 'preserve-3d',
                backfaceVisibility: 'hidden',
              }}
            >
              <span
                className={`text-sm font-medium px-3 py-1 rounded whitespace-nowrap transition-colors ${
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
            </div>
          ))}
        </div>
      </div>

      {/* Up/Down Navigation Buttons */}
      <div className="flex flex-col gap-0.5">
        <button
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
