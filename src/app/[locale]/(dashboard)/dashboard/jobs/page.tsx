import { getTranslations } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import { JobSearchLayout } from '@/components/jobs/job-search-layout'
import { mockSwissJobs } from '@/lib/mock-jobs'

export default async function JobSearchPage({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  const { locale } = await params
  const dict = getTranslations(locale, 'jobs')

  return <JobSearchLayout initialJobs={mockSwissJobs} dict={dict} locale={locale} />
}
