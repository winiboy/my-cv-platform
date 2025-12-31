'use client'

import { useState } from 'react'
import { ColorWheel } from './ColorWheel'

interface SidebarColorPickerProps {
  onColorChange: (color: string) => void
  initialHue?: number
}

export function SidebarColorPicker({ onColorChange, initialHue = 240 }: SidebarColorPickerProps) {
  const [currentColor, setCurrentColor] = useState({
    hex: '#0000ff',
    rgb: 'rgb(0, 0, 255)',
    hsl: 'hsl(240, 100%, 50%)',
    hue: 240
  })

  const handleColorChange = (color: { hex: string; rgb: string; hsl: string; hue: number }) => {
    setCurrentColor(color)
    // Apply to sidebar immediately
    onColorChange(color.hsl)
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <h3 className="text-lg font-semibold text-slate-800">Sidebar Color</h3>

      <ColorWheel
        onColorChange={handleColorChange}
        size={200}
        initialHue={initialHue}
      />

      <div className="text-sm space-y-1 text-slate-600 font-mono">
        <div>HEX: {currentColor.hex}</div>
        <div>RGB: {currentColor.rgb}</div>
        <div>HSL: {currentColor.hsl}</div>
      </div>

      <div
        className="w-full h-12 rounded-lg border-2 border-slate-200"
        style={{ backgroundColor: currentColor.hsl }}
      />
    </div>
  )
}
