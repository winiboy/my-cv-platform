import { getTranslations, toLocale } from '@/lib/i18n'
import { JobSearchLayout } from '@/components/jobs/job-search-layout'

export default async function JobSearchPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const locale = toLocale((await params).locale)
  const dict = getTranslations(locale, 'jobs')

  return <JobSearchLayout initialJobs={[]} dict={dict} locale={locale} />
}
