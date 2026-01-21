'use client'

interface SignatureSectionProps {
  signOff: string
  senderName: string | null
  onChange: (field: string, value: string | null) => void
  dict: Record<string, unknown>
}

export function SignatureSection({
  signOff,
  senderName,
  onChange,
  dict,
}: SignatureSectionProps) {
  const editorDict = ((dict.coverLetters || {}) as Record<string, unknown>).editor as Record<string, unknown> || {}
  const signatureDict = (editorDict.signature || {}) as Record<string, unknown>

  const signOffOptions = [
    'Sincerely,',
    'Best regards,',
    'Kind regards,',
    'Yours faithfully,',
    'Respectfully,',
    'With appreciation,',
  ]

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {(signatureDict.title as string) || 'Signature'}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            {(signatureDict.signOffLabel as string) || 'Sign-off'}
          </label>
          <select
            value={signOff}
            onChange={(e) => onChange('sign_off', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          >
            {signOffOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {(signatureDict.nameLabel as string) || 'Your Name'}
          </label>
          <input
            type="text"
            value={senderName || ''}
            onChange={(e) => onChange('sender_name', e.target.value || null)}
            placeholder={(signatureDict.namePlaceholder as string) || 'Your full name'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          />
        </div>
      </div>
    </div>
  )
}
