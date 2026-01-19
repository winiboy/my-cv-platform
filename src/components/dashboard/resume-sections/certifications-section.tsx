import { Plus, Trash2, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { Resume, ResumeCertification } from '@/types/database'

interface CertificationsSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
}

export function CertificationsSection({
  resume,
  updateResume,
  dict,
}: CertificationsSectionProps) {
  const certifications = (resume.certifications as unknown as ResumeCertification[]) || []
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    certifications.length > 0 ? 0 : null
  )

  const addCertification = () => {
    const newCertification: ResumeCertification = {
      name: '',
      issuer: '',
      date: '',
      visible: true, // Default to visible
    }
    const updated = [...certifications, newCertification]
    updateResume({ certifications: updated as any })
    setExpandedIndex(certifications.length)
  }

  const toggleVisibility = (index: number) => {
    const updated = [...certifications]
    updated[index].visible = !(updated[index].visible ?? true)
    updateResume({ certifications: updated as any })
  }

  const updateCertification = (index: number, updates: Partial<ResumeCertification>) => {
    const updated = [...certifications]
    updated[index] = { ...updated[index], ...updates }
    updateResume({ certifications: updated as any })
  }

  const removeCertification = (index: number) => {
    const updated = certifications.filter((_, i) => i !== index)
    updateResume({ certifications: updated as any })
    if (expandedIndex === index) {
      setExpandedIndex(null)
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {dict.resumes?.editor?.sections?.certifications || 'Certifications'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {dict.resumes?.editor?.certificationsHint ||
              'Add professional certifications and licenses'}
          </p>
        </div>
        <button
          onClick={addCertification}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          {dict.resumes?.editor?.addCertification || 'Add Certification'}
        </button>
      </div>

      <div className="space-y-4">
        {certifications.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-600">
              {dict.resumes?.editor?.noCertifications || 'No certifications added yet'}
            </p>
          </div>
        )}

        {certifications.map((cert, index) => {
          const isExpanded = expandedIndex === index
          const isEmpty = !cert.name && !cert.issuer

          return (
            <div key={index} className="rounded-lg border border-slate-200 bg-white">
              <div
                className="flex cursor-pointer items-center justify-between p-6"
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">
                    {cert.name || dict.resumes?.editor?.newCertification || 'New Certification'}
                  </h3>
                  {cert.issuer && (
                    <p className="mt-1 text-sm text-slate-600">
                      {cert.issuer}
                      {cert.date && ` • ${cert.date}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleVisibility(index)
                    }}
                    className={`transition-colors ${cert.visible ?? true ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-slate-400'}`}
                    title={cert.visible ?? true ? (dict?.aria?.hideFromCV || 'Hide from CV') : (dict?.aria?.showInCV || 'Show in CV')}
                  >
                    {cert.visible ?? true ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeCertification(index)
                    }}
                    className="text-slate-400 hover:text-red-600"
                    title={dict.common?.delete || 'Delete'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="space-y-4 border-t border-slate-200 p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        {dict.resumes?.editor?.certificationName || 'Certification Name'}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={cert.name}
                        onChange={(e) => updateCertification(index, { name: e.target.value })}
                        placeholder={
                          dict.resumes?.editor?.certificationNamePlaceholder ||
                          'e.g., AWS Certified Solutions Architect'
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        {dict.resumes?.editor?.issuer || 'Issuing Organization'}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={cert.issuer}
                        onChange={(e) => updateCertification(index, { issuer: e.target.value })}
                        placeholder={
                          dict.resumes?.editor?.issuerPlaceholder || 'e.g., Amazon Web Services'
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        {dict.resumes?.editor?.issueDate || 'Issue Date'}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="month"
                        value={cert.date}
                        onChange={(e) => updateCertification(index, { date: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        {dict.resumes?.editor?.expiryDate || 'Expiry Date'}{' '}
                        <span className="text-slate-400">
                          ({dict.resumes?.editor?.optional || 'optional'})
                        </span>
                      </label>
                      <input
                        type="month"
                        value={cert.expiryDate || ''}
                        onChange={(e) => updateCertification(index, { expiryDate: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {dict.resumes?.editor?.credentialId || 'Credential ID'}{' '}
                      <span className="text-slate-400">
                        ({dict.resumes?.editor?.optional || 'optional'})
                      </span>
                    </label>
                    <input
                      type="text"
                      value={cert.credentialId || ''}
                      onChange={(e) => updateCertification(index, { credentialId: e.target.value })}
                      placeholder={dict.resumes?.editor?.credentialIdPlaceholder || 'e.g., ABC123456'}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      {dict.resumes?.editor?.certificationUrl || 'Certification URL'}{' '}
                      <span className="text-slate-400">
                        ({dict.resumes?.editor?.optional || 'optional'})
                      </span>
                    </label>
                    <input
                      type="url"
                      value={cert.url || ''}
                      onChange={(e) => updateCertification(index, { url: e.target.value })}
                      placeholder={
                        dict.resumes?.editor?.certificationUrlPlaceholder ||
                        'https://www.credential.net/...'
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
