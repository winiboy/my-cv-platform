import type { Locale } from '@/lib/i18n'

/**
 * The Intl locale Job Search formats its listing dates and, outside en, its
 * counts with.
 *
 * en is `en-GB` because that is the day-first format the page has always
 * shown; keeping it leaves the English page unchanged. The other locales use
 * their bare language tag, which gives fr "15/01/2026", de "15.1.2026" and
 * it "15/01/2026" (or "15/1/2026", depending on the runtime's ICU data).
 */
const JOB_SEARCH_INTL_LOCALES: Record<Locale, string> = {
  en: 'en-GB',
  fr: 'fr',
  de: 'de',
  it: 'it',
}

export function jobSearchIntlLocale(locale: Locale): string {
  return JOB_SEARCH_INTL_LOCALES[locale]
}

/** A date from a job listing or a resume row (ISO string), formatted for the page locale. */
export function formatJobSearchDate(value: string, locale: Locale): string {
  return new Date(value).toLocaleDateString(jobSearchIntlLocale(locale))
}

/**
 * The job count of the "all N jobs loaded" line.
 *
 * The English line always used `toLocaleString()` with no argument (the
 * runtime's default locale); en keeps exactly that call so its text is
 * unchanged. fr, de and it group digits per the page locale (de "1.234").
 */
export function formatJobSearchCount(value: number, locale: Locale): string {
  return locale === 'en' ? value.toLocaleString(undefined) : value.toLocaleString(jobSearchIntlLocale(locale))
}

/**
 * The "updated" date of a resume in the resume selector.
 *
 * Unlike the listing dates, the English selector always formatted this date
 * with the runtime's default locale (`toLocaleDateString()` with no argument).
 * en keeps exactly that call so its text is unchanged; fr, de and it use the
 * page locale.
 */
export function formatResumeUpdatedDate(value: string, locale: Locale): string {
  const date = new Date(value)
  return locale === 'en' ? date.toLocaleDateString(undefined) : date.toLocaleDateString(jobSearchIntlLocale(locale))
}

/**
 * Replace each `{name}` placeholder of a translated template with its value.
 * A placeholder without a value is left as written, so a mismatch between a
 * translation and its caller stays visible instead of disappearing.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : placeholder,
  )
}

/**
 * The location line of a job: the listing's own full location when it has
 * one, otherwise its city in the translated "{city}, Switzerland" template.
 */
export function jobLocationLabel(
  job: { location_full?: string | null; location_city: string },
  locationTemplate: string,
): string {
  return job.location_full || fillTemplate(locationTemplate, { city: job.location_city })
}
