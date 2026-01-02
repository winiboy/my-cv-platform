import fr_common from '@/locales/fr/common.json'
import de_common from '@/locales/de/common.json'
import en_common from '@/locales/en/common.json'
import it_common from '@/locales/it/common.json'
import fr_marketing from '@/locales/fr/marketing.json'
import de_marketing from '@/locales/de/marketing.json'
import en_marketing from '@/locales/en/marketing.json'
import it_marketing from '@/locales/it/marketing.json'
import fr_jobs from '@/locales/fr/jobs.json'
import de_jobs from '@/locales/de/jobs.json'
import en_jobs from '@/locales/en/jobs.json'
import it_jobs from '@/locales/it/jobs.json'

export type Locale = 'fr' | 'de' | 'en' | 'it'
export type TranslationNamespace = 'common' | 'marketing' | 'jobs'

export const locales: Locale[] = ['fr', 'de', 'en', 'it']
export const defaultLocale: Locale = 'en'

const translations = {
  fr: {
    common: fr_common,
    marketing: fr_marketing,
    jobs: fr_jobs,
  },
  de: {
    common: de_common,
    marketing: de_marketing,
    jobs: de_jobs,
  },
  en: {
    common: en_common,
    marketing: en_marketing,
    jobs: en_jobs,
  },
  it: {
    common: it_common,
    marketing: it_marketing,
    jobs: it_jobs,
  },
}

export function getTranslations(locale: Locale, namespace: TranslationNamespace = 'common') {
  return translations[locale][namespace]
}

export function translate(locale: Locale, namespace: TranslationNamespace, key: string): string {
  const keys = key.split('.')
  let value: any = translations[locale][namespace]

  for (const k of keys) {
    value = value?.[k]
  }

  return value || key
}
