'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface ColorWheelProps {
  onColorChange: (color: { hex: string; rgb: string; hsl: string; hue: number; lightness: number }) => void
  size?: number
  initialHue?: number
  initialLightness?: number
  dict?: any
}

export function ColorWheel({ onColorChange, size = 200, initialHue = 240, initialLightness = 35, dict }: ColorWheelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedHue, setSelectedHue] = useState(initialHue)
  const [selectedLightness, setSelectedLightness] = useState(initialLightness)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const outerRadius = size / 2
  const innerRadius = 0 // Start from center for full lightness range
  const ringThickness = outerRadius - innerRadius

  // Convert hue to RGB
  const hueToRgb = (hue: number): { r: number; g: number; b: number } => {
    const h = hue / 60
    const c = 1 // Chroma at full saturation and 50% lightness
    const x = 1 - Math.abs((h % 2) - 1)

    let r = 0, g = 0, b = 0

    if (h >= 0 && h < 1) { r = c; g = x; b = 0 }
    else if (h >= 1 && h < 2) { r = x; g = c; b = 0 }
    else if (h >= 2 && h < 3) { r = 0; g = c; b = x }
    else if (h >= 3 && h < 4) { r = 0; g = x; b = c }
    else if (h >= 4 && h < 5) { r = x; g = 0; b = c }
    else if (h >= 5 && h < 6) { r = c; g = 0; b = x }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    }
  }

  // Convert RGB to HEX
  const rgbToHex = (r: number, g: number, b: number): string => {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
  }

  // Convert HSL to RGB
  const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
    s /= 100
    l /= 100
    const k = (n: number) => (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))

    return {
      r: Math.round(255 * f(0)),
      g: Math.round(255 * f(8)),
      b: Math.round(255 * f(4))
    }
  }

  // Get color values from hue and lightness
  const getColorFromHue = useCallback((hue: number, lightness: number) => {
    const saturation = 85 // Fixed saturation
    const rgb = hslToRgb(hue, saturation, lightness)
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b)
    const rgbString = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    const hslString = `hsl(${hue}, ${saturation}%, ${lightness}%)`

    return { hex, rgb: rgbString, hsl: hslString, hue, lightness }
  }, [])

  // Calculate angle from mouse position
  const getAngleFromPosition = useCallback((clientX: number, clientY: number): number => {
    if (!containerRef.current) return 0

    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.left + outerRadius
    const centerY = rect.top + outerRadius

    const x = clientX - centerX
    const y = clientY - centerY

    // Calculate angle using atan2 (returns -π to π, 0 = right, π/2 = down)
    let angle = Math.atan2(y, x) * (180 / Math.PI)

    // Adjust to 0-360 range, with 0° at top
    // atan2: 0° = right, 90° = down, -90° = up
    // We want: 0° = up (top), 90° = right, 180° = down, 270° = left
    angle = angle + 90

    // Normalize to 0-360 range
    while (angle < 0) angle += 360
    while (angle >= 360) angle -= 360

    return angle
  }, [outerRadius])

  // Calculate lightness from distance from center
  const getLightnessFromDistance = useCallback((clientX: number, clientY: number): number => {
    if (!containerRef.current) return 35

    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.left + outerRadius
    const centerY = rect.top + outerRadius

    const x = clientX - centerX
    const y = clientY - centerY
    const distance = Math.sqrt(x * x + y * y)

    // Clamp distance to outerRadius
    const clampedDistance = Math.min(distance, outerRadius)

    // Map distance to lightness: center (0) = 15%, outer (outerRadius) = 65%
    const minLightness = 15
    const maxLightness = 65
    const lightness = minLightness + (clampedDistance / outerRadius) * (maxLightness - minLightness)

    return Math.round(lightness)
  }, [outerRadius])

  // Check if point is within the outer circle (more forgiving than just the ring)
  const isPointInCircle = useCallback((clientX: number, clientY: number): boolean => {
    if (!containerRef.current) return false

    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.left + outerRadius
    const centerY = rect.top + outerRadius

    const x = clientX - centerX
    const y = clientY - centerY
    const distance = Math.sqrt(x * x + y * y)

    return distance <= outerRadius
  }, [outerRadius])

  // Handle color selection
  const selectColor = useCallback((clientX: number, clientY: number) => {
    if (!isPointInCircle(clientX, clientY)) return

    const angle = getAngleFromPosition(clientX, clientY)
    const lightness = getLightnessFromDistance(clientX, clientY)
    setSelectedHue(angle)
    setSelectedLightness(lightness)
    onColorChange(getColorFromHue(angle, lightness))
  }, [isPointInCircle, getAngleFromPosition, getLightnessFromDistance, getColorFromHue, onColorChange])

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    selectColor(e.clientX, e.clientY)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault()
      selectColor(e.clientX, e.clientY)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Add global mouse event listeners for better drag handling
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        selectColor(e.clientX, e.clientY)
      }
    }

    const handleGlobalMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove)
      window.addEventListener('mouseup', handleGlobalMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, selectColor])

  // Draw the color wheel on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, size, size)

    // Draw the hue wheel with radial lightness gradient
    const centerX = outerRadius
    const centerY = outerRadius

    // Draw each hue segment with radial gradient from dark (center) to bright (edge)
    const segments = 360
    for (let i = 0; i < segments; i++) {
      const startAngle = (i / segments) * 2 * Math.PI - Math.PI / 2
      const endAngle = ((i + 1) / segments) * 2 * Math.PI - Math.PI / 2
      const hue = (i / segments) * 360

      // Create radial gradient for this hue segment
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius)

      // Add color stops from dark (center) to bright (edge)
      const minLightness = 15
      const maxLightness = 65
      const saturation = 85

      gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${minLightness}%)`)
      gradient.addColorStop(1, `hsl(${hue}, ${saturation}%, ${maxLightness}%)`)

      ctx.beginPath()
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle)
      ctx.lineTo(centerX, centerY)
      ctx.closePath()

      ctx.fillStyle = gradient
      ctx.fill()
    }

    // Draw selection indicator
    const indicatorAngle = (selectedHue - 90) * (Math.PI / 180)
    // Calculate indicator position based on lightness
    const minLightness = 15
    const maxLightness = 65
    const lightnessRatio = (selectedLightness - minLightness) / (maxLightness - minLightness)
    const indicatorRadius = lightnessRatio * outerRadius
    const indicatorX = centerX + Math.cos(indicatorAngle) * indicatorRadius
    const indicatorY = centerY + Math.sin(indicatorAngle) * indicatorRadius

    ctx.beginPath()
    ctx.arc(indicatorX, indicatorY, 8, 0, 2 * Math.PI)
    ctx.fillStyle = 'white'
    ctx.fill()
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.stroke()
  }, [size, outerRadius, selectedHue, selectedLightness])

  // Preset professional CV colors
  const presetColors = [
    { nameKey: 'petrolBlue', hue: 208, lightness: 18 },
    { nameKey: 'charcoal', hue: 220, lightness: 28 },
    { nameKey: 'forestGreen', hue: 140, lightness: 32 },
    { nameKey: 'burgundy', hue: 350, lightness: 30 },
    { nameKey: 'teal', hue: 180, lightness: 35 },
    { nameKey: 'slate', hue: 200, lightness: 30 },
    { nameKey: 'deepPurple', hue: 270, lightness: 33 },
    { nameKey: 'darkBrown', hue: 25, lightness: 28 },
    { nameKey: 'wineRed', hue: 0, lightness: 32 },
    { nameKey: 'olive', hue: 60, lightness: 30 },
  ]

  const handlePresetClick = (hue: number, lightness: number) => {
    setSelectedHue(hue)
    setSelectedLightness(lightness)
    onColorChange(getColorFromHue(hue, lightness))
  }

  return (
    <div style={{ width: size }}>
      {/* Color Wheel */}
      <div
        ref={containerRef}
        style={{
          width: size,
          height: size,
          cursor: 'crosshair',
          position: 'relative',
          userSelect: 'none'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          style={{
            display: 'block',
            width: size,
            height: size
          }}
        />
      </div>

      {/* Preset Colors */}
      <div style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>
          {dict?.resumes?.colorWheel?.presetColors || 'Preset Colors'}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '6px'
        }}>
          {presetColors.map((preset, index) => (
            <button
              key={index}
              onClick={() => handlePresetClick(preset.hue, preset.lightness)}
              title={dict?.resumes?.colorWheel?.presets?.[preset.nameKey] || preset.nameKey}
              style={{
                width: '100%',
                aspectRatio: '1',
                border: '2px solid #e2e8f0',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: `hsl(${preset.hue}, 85%, ${preset.lightness}%)`,
                boxShadow: selectedHue === preset.hue && selectedLightness === preset.lightness
                  ? '0 0 0 2px #3b82f6'
                  : 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)'
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = selectedHue === preset.hue && selectedLightness === preset.lightness
                  ? '0 0 0 2px #3b82f6'
                  : 'none'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
