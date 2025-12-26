'use client'

import { useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

const languages = [
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
]

export function LanguageSwitcher() {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const currentLocale = params?.locale || 'en'
  const [isOpen, setIsOpen] = useState(false)

  const switchLocale = (newLocale: string) => {
    if (!pathname) return

    // Replace current locale in pathname
    const newPathname = pathname.replace(`/${currentLocale}`, `/${newLocale}`)

    // Set cookie
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`

    // Navigate
    router.push(newPathname)
    setIsOpen(false)
  }

  const currentLanguage =
    languages.find((lang) => lang.code === currentLocale) || languages[2]

  return (
    <div className="relative inline-block">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Globe className="h-4 w-4" />
        <span>{currentLanguage.label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown menu */}
          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-20">
            {languages.map((language) => (
              <button
                key={language.code}
                onClick={() => switchLocale(language.code)}
                className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                  currentLocale === language.code
                    ? 'bg-slate-50 dark:bg-slate-700/50'
                    : ''
                }`}
              >
                <span>{language.label}</span>
                {currentLocale === language.code && (
                  <Check className="h-4 w-4 text-teal-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
