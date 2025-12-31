'use client'

import { Settings } from 'lucide-react'

interface ControlsToggleProps {
  showControls: boolean
  onToggle: (show: boolean) => void
  label?: string
}

export function ControlsToggle({ showControls, onToggle, label = 'Show Controls' }: ControlsToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <Settings className="h-4 w-4 text-slate-500" />
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <div className="relative">
          <input
            type="checkbox"
            checked={showControls}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-teal-600 peer-focus:ring-4 peer-focus:ring-teal-300 transition-all"></div>
          <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:translate-x-5"></div>
        </div>
      </label>
    </div>
  )
}
