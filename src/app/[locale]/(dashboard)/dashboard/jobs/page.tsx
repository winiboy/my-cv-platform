import { getTranslations, toLocale } from '@/lib/i18n'
import { templatePickerStrings } from '@/lib/template-picker-strings'
import { cvAdaptationStrings } from '@/lib/cv-adaptation-strings'
import { JobSearchLayout } from '@/components/jobs/job-search-layout'

export default async function JobSearchPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const locale = toLocale((await params).locale)
  const dict = getTranslations(locale, 'jobs')
  const templatePicker = templatePickerStrings(getTranslations(locale, 'common') as Record<string, unknown>)
  const cvAdaptation = cvAdaptationStrings(dict)

  return <JobSearchLayout initialJobs={[]} dict={dict} locale={locale} templatePicker={templatePicker} cvAdaptation={cvAdaptation} />
}
