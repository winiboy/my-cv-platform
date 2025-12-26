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

  const handleWordDownload = async () => {
    try {
      const response = await fetch(`/api/resumes/${resumeId}/download-docx`)
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
