import { Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import type { Resume, ResumeLanguage } from '@/types/database'

interface LanguagesSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
}

const languageLevels: ResumeLanguage['level'][] = [
  'Native',
  'Fluent',
  'Professional',
  'Intermediate',
  'Basic',
]

export function LanguagesSection({ resume, updateResume, dict }: LanguagesSectionProps) {
  const languages = (resume.languages as unknown as ResumeLanguage[]) || []

  const addLanguage = () => {
    const newLanguage: ResumeLanguage = {
      language: '',
      level: 'Intermediate',
      visible: true, // Default to visible
    }
    updateResume({ languages: [...languages, newLanguage] as any })
  }

  const toggleVisibility = (index: number) => {
    const updated = [...languages]
    updated[index].visible = !(updated[index].visible ?? true)
    updateResume({ languages: updated as any })
  }

  const updateLanguage = (index: number, updates: Partial<ResumeLanguage>) => {
    const updated = [...languages]
    updated[index] = { ...updated[index], ...updates }
    updateResume({ languages: updated as any })
  }

  const removeLanguage = (index: number) => {
    const updated = languages.filter((_, i) => i !== index)
    updateResume({ languages: updated as any })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {dict.resumes?.editor?.sections?.languages || 'Languages'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {dict.resumes?.editor?.languagesHint || 'Add languages you speak and your proficiency level'}
          </p>
        </div>
        <button
          onClick={addLanguage}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          {dict.resumes?.editor?.addLanguage || 'Add Language'}
        </button>
      </div>

      <div className="space-y-4">
        {languages.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-600">
              {dict.resumes?.editor?.noLanguages || 'No languages added yet'}
            </p>
          </div>
        )}

        {languages.map((language, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {dict.resumes?.editor?.language || 'Language'}
                  </label>
                  <input
                    type="text"
                    value={language.language}
                    onChange={(e) => updateLanguage(index, { language: e.target.value })}
                    placeholder={dict.resumes?.editor?.languagePlaceholder || 'e.g., English, Spanish, Mandarin'}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {dict.resumes?.editor?.proficiencyLevel || 'Proficiency Level'}
                  </label>
                  <select
                    value={language.level}
                    onChange={(e) =>
                      updateLanguage(index, { level: e.target.value as ResumeLanguage['level'] })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  >
                    {languageLevels.map((level) => (
                      <option key={level} value={level}>
                        {dict.resumes?.editor?.levels?.[level.toLowerCase()] || level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleVisibility(index)}
                  className={`transition-colors ${language.visible ?? true ? 'text-slate-600 hover:text-slate-800' : 'text-slate-300 hover:text-slate-400'}`}
                  title={language.visible ?? true ? (dict?.aria?.hideFromCV || 'Hide from CV') : (dict?.aria?.showInCV || 'Show in CV')}
                >
                  {language.visible ?? true ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => removeLanguage(index)}
                  className="text-slate-400 hover:text-red-600"
                  title={dict.common?.delete || 'Delete'}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
