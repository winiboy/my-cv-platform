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

  const fields: Array<{ key: string; label: string; type: string; placeholder: string }> = [
    { key: 'name', label: 'Full Name', type: 'text', placeholder: 'John Doe' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
    { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 (555) 123-4567' },
    { key: 'location', label: 'Location', type: 'text', placeholder: 'San Francisco, CA' },
    { key: 'linkedin', label: 'LinkedIn', type: 'url', placeholder: 'linkedin.com/in/johndoe' },
    { key: 'github', label: 'GitHub', type: 'url', placeholder: 'github.com/johndoe' },
    { key: 'website', label: 'Website', type: 'url', placeholder: 'johndoe.com' },
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
        {fields.map((field) => (
          <div key={field.key}>
            <label htmlFor={field.key} className="block text-sm font-medium text-slate-900">
              {field.label}
            </label>
            <input
              type={field.type}
              id={field.key}
              value={contact[field.key as keyof ResumeContact] || ''}
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
