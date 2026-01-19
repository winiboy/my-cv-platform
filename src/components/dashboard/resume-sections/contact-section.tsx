import type { Resume, ResumeContact } from '@/types/database'

interface ContactSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
}

export function ContactSection({ resume, updateResume, dict }: ContactSectionProps) {
  const contact = (resume.contact as unknown as ResumeContact) || {}

  const updateContact = (field: keyof ResumeContact, value: string) => {
    updateResume({
      contact: {
        ...contact,
        [field]: value,
      },
    })
  }

  const updateTitle = (value: string) => {
    updateResume({ title: value })
  }

  const fields: Array<{ key: string; label: string; type: string; placeholder: string }> = [
    { key: 'name', label: dict?.resumes?.editor?.fullName || 'Full Name', type: 'text', placeholder: dict?.resumes?.editor?.fullNamePlaceholder || 'John Doe' },
    { key: 'email', label: dict?.resumes?.editor?.email || 'Email', type: 'email', placeholder: dict?.resumes?.editor?.emailPlaceholder || 'john@example.com' },
    { key: 'phone', label: dict?.resumes?.editor?.phone || 'Phone', type: 'tel', placeholder: dict?.resumes?.editor?.phonePlaceholder || '+1 (555) 123-4567' },
    { key: 'location', label: dict?.resumes?.editor?.locationLabel || 'Location', type: 'text', placeholder: dict?.resumes?.editor?.locationPlaceholder || 'San Francisco, CA' },
    { key: 'linkedin', label: dict?.resumes?.editor?.linkedin || 'LinkedIn', type: 'url', placeholder: dict?.resumes?.editor?.linkedinPlaceholder || 'linkedin.com/in/johndoe' },
    { key: 'github', label: dict?.resumes?.editor?.github || 'GitHub', type: 'url', placeholder: dict?.resumes?.editor?.githubPlaceholder || 'github.com/johndoe' },
    { key: 'website', label: dict?.resumes?.editor?.website || 'Website', type: 'url', placeholder: dict?.resumes?.editor?.websitePlaceholder || 'johndoe.com' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {dict.resumes?.editor?.sections?.contact || 'Contact Information'}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {dict.resumes?.editor?.contactHint || 'Add your contact details and professional links'}
        </p>
      </div>

      <div className="space-y-4">
        {/* CV Name / Professional Title */}
        <div>
          <label htmlFor="cvName" className="block text-sm font-medium text-slate-900">
            {dict.resumes?.editor?.cvName || 'CV Name'}
          </label>
          <input
            type="text"
            id="cvName"
            value={resume.title || ''}
            onChange={(e) => updateTitle(e.target.value)}
            placeholder={dict.resumes?.editor?.cvNamePlaceholder || 'Senior Software Engineer'}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
          <p className="mt-1 text-xs text-slate-500">
            {dict.resumes?.editor?.cvNameHint || 'This appears as your professional title on the CV'}
          </p>
        </div>

        {fields.map((field) => (
          <div key={field.key}>
            <label htmlFor={field.key} className="block text-sm font-medium text-slate-900">
              {field.label}
            </label>
            <input
              type={field.type}
              id={field.key}
              value={(contact[field.key as keyof ResumeContact] as string) || ''}
              onChange={(e) => updateContact(field.key as keyof ResumeContact, e.target.value)}
              placeholder={field.placeholder}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
