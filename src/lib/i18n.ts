import fr_common from '@/locales/fr/common.json'
import de_common from '@/locales/de/common.json'
import en_common from '@/locales/en/common.json'
import it_common from '@/locales/it/common.json'
import fr_marketing from '@/locales/fr/marketing.json'
import de_marketing from '@/locales/de/marketing.json'
import en_marketing from '@/locales/en/marketing.json'
import it_marketing from '@/locales/it/marketing.json'

export type Locale = 'fr' | 'de' | 'en' | 'it'
export type TranslationNamespace = 'common' | 'marketing'

export const locales: Locale[] = ['fr', 'de', 'en', 'it']
export const defaultLocale: Locale = 'en'

const translations = {
  fr: {
    common: fr_common,
    marketing: fr_marketing,
  },
  de: {
    common: de_common,
    marketing: de_marketing,
  },
  en: {
    common: en_common,
    marketing: en_marketing,
  },
  it: {
    common: it_common,
    marketing: it_marketing,
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
