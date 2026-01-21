'use client'

interface RecipientSectionProps {
  recipientName: string | null
  recipientTitle: string | null
  companyName: string | null
  companyAddress: string | null
  onChange: (field: string, value: string | null) => void
  dict: Record<string, unknown>
}

export function RecipientSection({
  recipientName,
  recipientTitle,
  companyName,
  companyAddress,
  onChange,
  dict,
}: RecipientSectionProps) {
  const editorDict = ((dict.coverLetters || {}) as Record<string, unknown>).editor as Record<string, unknown> || {}
  const recipientDict = (editorDict.recipient || {}) as Record<string, unknown>

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {(recipientDict.title as string) || 'Recipient Information'}
      </h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            {(recipientDict.nameLabel as string) || 'Recipient Name'}
          </label>
          <input
            type="text"
            value={recipientName || ''}
            onChange={(e) => onChange('recipient_name', e.target.value || null)}
            placeholder={(recipientDict.namePlaceholder as string) || 'e.g., John Smith'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {(recipientDict.titleLabel as string) || 'Recipient Title'}
          </label>
          <input
            type="text"
            value={recipientTitle || ''}
            onChange={(e) => onChange('recipient_title', e.target.value || null)}
            placeholder={(recipientDict.titlePlaceholder as string) || 'e.g., Hiring Manager'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {(recipientDict.companyLabel as string) || 'Company Name'}
          </label>
          <input
            type="text"
            value={companyName || ''}
            onChange={(e) => onChange('company_name', e.target.value || null)}
            placeholder={(recipientDict.companyPlaceholder as string) || 'e.g., Acme Corp'}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            {(recipientDict.addressLabel as string) || 'Company Address'}
          </label>
          <textarea
            value={companyAddress || ''}
            onChange={(e) => onChange('company_address', e.target.value || null)}
            placeholder={(recipientDict.addressPlaceholder as string) || '123 Main St\nCity, State 12345'}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 resize-none"
          />
        </div>
      </div>
    </div>
  )
}
