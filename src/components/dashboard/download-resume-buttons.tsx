'use client'

import { Download, FileText } from 'lucide-react'
import { useParams } from 'next/navigation'

interface DownloadResumeButtonsProps {
  pdfLabel: string
  wordLabel: string
}

export function DownloadResumeButtons({ pdfLabel, wordLabel }: DownloadResumeButtonsProps) {
  const params = useParams()
  const resumeId = params?.id as string
  const locale = params?.locale as string

  const handleWordDownload = async () => {
    try {
      // Read styling settings from localStorage (same key used by resume-editor and resume-preview-wrapper)
      const savedSettings = localStorage.getItem(`resume_slider_settings_${resumeId}`)

      // Build query params
      const queryParams = new URLSearchParams()
      queryParams.set('locale', locale || 'fr')

      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings)

          // Typography settings
          if (settings.fontFamily) queryParams.set('fontFamily', settings.fontFamily)
          if (settings.fontScale !== undefined) queryParams.set('fontScale', String(settings.fontScale))

          // Color settings (pass hue and brightness separately for HSL conversion)
          if (settings.sidebarHue !== undefined) queryParams.set('sidebarHue', String(settings.sidebarHue))
          if (settings.sidebarBrightness !== undefined) queryParams.set('sidebarBrightness', String(settings.sidebarBrightness))

          // Layout settings
          if (settings.sidebarWidth !== undefined) queryParams.set('sidebarWidth', String(settings.sidebarWidth))
          if (settings.sidebarTopMargin !== undefined) queryParams.set('sidebarTopMargin', String(settings.sidebarTopMargin))
          if (settings.mainContentTopMargin !== undefined) queryParams.set('mainContentTopMargin', String(settings.mainContentTopMargin))

          // Section ordering (as JSON)
          if (settings.sidebarOrder) queryParams.set('sidebarOrder', JSON.stringify(settings.sidebarOrder))
          if (settings.mainContentOrder) queryParams.set('mainContentOrder', JSON.stringify(settings.mainContentOrder))

          // Hidden sections (as JSON)
          if (settings.hiddenSidebarSections) queryParams.set('hiddenSidebarSections', JSON.stringify(settings.hiddenSidebarSections))
          if (settings.hiddenMainSections) queryParams.set('hiddenMainSections', JSON.stringify(settings.hiddenMainSections))
        } catch (e) {
          console.error('Failed to parse saved settings:', e)
        }
      }

      const response = await fetch(`/api/resumes/${resumeId}/download-docx?${queryParams.toString()}`)
      if (!response.ok) throw new Error('Failed to download')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resume.docx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading Word document:', error)
      alert('Failed to download Word document. Please try again.')
    }
  }

  return (
    <div className="flex gap-2">
      <button
        className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        onClick={() => window.print()}
      >
        <Download className="h-4 w-4" />
        {pdfLabel}
      </button>
      <button
        className="flex items-center gap-2 rounded-lg border border-teal-600 bg-white px-4 py-2 text-sm font-medium text-teal-600 transition-colors hover:bg-teal-50"
        onClick={handleWordDownload}
      >
        <FileText className="h-4 w-4" />
        {wordLabel}
      </button>
    </div>
  )
}
