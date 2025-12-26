'use client'

import { Download } from 'lucide-react'

interface DownloadPdfButtonProps {
  label: string
}

export function DownloadPdfButton({ label }: DownloadPdfButtonProps) {
  return (
    <button
      className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
      onClick={() => window.print()}
    >
      <Download className="h-4 w-4" />
      {label}
    </button>
  )
}
