import { getTranslations } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import { JobSearchLayout } from '@/components/jobs/job-search-layout'

export default async function JobSearchPage({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  const dict = getTranslations(locale, 'jobs')

  return <JobSearchLayout initialJobs={[]} dict={dict} locale={locale} />
}
