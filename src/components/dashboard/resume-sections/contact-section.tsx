import { useRef, type ChangeEvent } from 'react'
import type { Resume, ResumeContact } from '@/types/database'
import type { ContactFieldId } from '@/lib/contact-visibility'
import { readPhotoFile } from '@/lib/photo-upload'

interface ContactSectionProps {
  resume: Resume
  updateResume: (updates: Partial<Resume>) => void
  dict: any
  /** The layout model's `hiddenContactFields`: a ticked box is a field NOT in it. */
  hiddenContactFields: readonly ContactFieldId[]
  /** Ticks (`visible`) or unticks one field. */
  onContactFieldVisibleChange: (field: ContactFieldId, visible: boolean) => void
  /**
   * The photo row, passed only while the selected template draws a photo
   * (`templateDrawsPhoto`). `onChange` is the Editor's existing upload handler,
   * which stores the photo under its existing key and ticks the photo on.
   */
  photo?: { url: string; onChange: (dataUrl: string) => void }
}

const CHECKBOX_CLASS =
  'h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-teal-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600'

export function ContactSection({
  resume,
  updateResume,
  dict,
  hiddenContactFields,
  onContactFieldVisibleChange,
  photo,
}: ContactSectionProps) {
  const contact = (resume.contact as unknown as ResumeContact) || {}
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handlePhotoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset so the same file can be chosen again.
    event.target.value = ''
    if (!file || !photo) return
    readPhotoFile(file, photo.onChange, () => alert(dict?.resumes?.editor?.photoTooLarge))
  }

  /** The "show on CV" tick under one field. Ticked means the field is drawn. */
  const visibilityTick = (field: ContactFieldId) => (
    <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700 sm:min-h-0">
      <input
        type="checkbox"
        data-testid={`show-on-cv-${field}`}
        checked={!hiddenContactFields.includes(field)}
        onChange={(event) => onContactFieldVisibleChange(field, event.target.checked)}
        className={CHECKBOX_CLASS}
      />
      {dict?.resumes?.editor?.showOnCv?.[field]}
    </label>
  )

  const fields: Array<{ key: Exclude<ContactFieldId, 'title' | 'photo'> | 'name'; label: string; type: string; placeholder: string }> = [
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
        {photo && (
          <div data-testid="contact-photo-row">
            <p className="block text-sm font-medium text-slate-900">
              {dict?.resumes?.editor?.photoRow}
            </p>
            <div className="mt-1 flex items-center gap-4">
              {photo.url && (
                // eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise
                <img src={photo.url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              >
                {photo.url ? dict?.resumes?.editor?.changePhoto : dict?.resumes?.editor?.uploadPhoto}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handlePhotoSelect}
              />
            </div>
            {visibilityTick('photo')}
          </div>
        )}

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
          {visibilityTick('title')}
        </div>

        {fields.map((field) => (
          <div key={field.key}>
            <label htmlFor={field.key} className="block text-sm font-medium text-slate-900">
              {field.label}
            </label>
            <input
              type={field.type}
              id={field.key}
              value={(contact[field.key] as string) || ''}
              onChange={(e) => updateContact(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            {field.key !== 'name' && visibilityTick(field.key)}
          </div>
        ))}
      </div>
    </div>
  )
}
