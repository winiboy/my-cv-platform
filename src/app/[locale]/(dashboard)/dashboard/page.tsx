import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FileText, Briefcase, Target, TrendingUp, Mail } from 'lucide-react'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n'
import { getTranslations } from '@/lib/i18n'
import type { Profile } from '@/types/database'

export default async function DashboardPage({
  params,
}: {
  params: { locale: Locale }
}) {
  const supabase = await createServerSupabaseClient()
  const t = getTranslations(params.locale, 'common') as any

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/${params.locale}/login`)
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: Profile | null }

  // Get user stats
  const { count: resumeCount } = await supabase
    .from('resumes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: jobCount } = await supabase
    .from('job_applications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: goalCount } = await supabase
    .from('career_goals')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: coverLetterCount } = await supabase
    .from('cover_letters')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const userName = profile?.full_name || user.email?.split('@')[0] || 'there'

  const stats = [
    {
      name: t.dashboard.nav.resumes,
      value: resumeCount || 0,
      icon: FileText,
      href: `/${params.locale}/dashboard/resumes`,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50',
      darkColor: 'dark:text-teal-400',
      darkBgColor: 'dark:bg-teal-900/30',
    },
    {
      name: t.dashboard.nav.coverLetters,
      value: coverLetterCount || 0,
      icon: Mail,
      href: `/${params.locale}/dashboard/cover-letters`,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      darkColor: 'dark:text-purple-400',
      darkBgColor: 'dark:bg-purple-900/30',
    },
    {
      name: t.dashboard.nav.jobs,
      value: jobCount || 0,
      icon: Briefcase,
      href: `/${params.locale}/dashboard/jobs`,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      darkColor: 'dark:text-blue-400',
      darkBgColor: 'dark:bg-blue-900/30',
    },
    {
      name: t.dashboard.nav.goals,
      value: goalCount || 0,
      icon: Target,
      href: `/${params.locale}/dashboard/goals`,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      darkColor: 'dark:text-orange-400',
      darkBgColor: 'dark:bg-orange-900/30',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          {t.dashboard.welcome}, {userName}!
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          {t.dashboard.overview}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Link
              key={stat.name}
              href={stat.href}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 transition-all hover:shadow-lg dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{stat.name}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{stat.value}</p>
                </div>
                <div className={`rounded-lg ${stat.bgColor} ${stat.darkBgColor} p-3`}>
                  <Icon className={`h-6 w-6 ${stat.color} ${stat.darkColor}`} />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-slate-500 group-hover:text-teal-600 dark:text-slate-400 dark:group-hover:text-teal-400">
                <span>
                  {t.dashboard.viewAll}
                </span>
                <svg
                  className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t.dashboard.quickActions}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href={`/${params.locale}/dashboard/resumes`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-all hover:border-teal-500 hover:bg-teal-50 dark:border-slate-700 dark:hover:border-teal-500 dark:hover:bg-teal-900/30"
          >
            <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/50">
              <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {t.dashboard.actions.createResume.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.dashboard.actions.createResume.description}
              </p>
            </div>
          </Link>

          <Link
            href={`/${params.locale}/dashboard/cover-letters/new`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-all hover:border-purple-500 hover:bg-purple-50 dark:border-slate-700 dark:hover:border-purple-500 dark:hover:bg-purple-900/30"
          >
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/50">
              <Mail className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {t.dashboard.actions.createCoverLetter.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.dashboard.actions.createCoverLetter.description}
              </p>
            </div>
          </Link>

          <Link
            href={`/${params.locale}/dashboard/jobs`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-all hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-900/30"
          >
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
              <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {t.dashboard.actions.addJob.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.dashboard.actions.addJob.description}
              </p>
            </div>
          </Link>

          <Link
            href={`/${params.locale}/dashboard/goals`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-all hover:border-orange-500 hover:bg-orange-50 dark:border-slate-700 dark:hover:border-orange-500 dark:hover:bg-orange-900/30"
          >
            <div className="rounded-lg bg-orange-100 p-2 dark:bg-orange-900/50">
              <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {t.dashboard.actions.setGoal.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.dashboard.actions.setGoal.description}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Getting started guide (only show if user has no data) */}
      {!resumeCount && !coverLetterCount && !jobCount && !goalCount && (
        <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-teal-100 p-6 dark:border-teal-800 dark:from-teal-900/30 dark:to-teal-800/30">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-teal-500 p-2 dark:bg-teal-600">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t.dashboard.gettingStarted.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {t.dashboard.gettingStarted.description}
              </p>
              <Link
                href={`/${params.locale}/dashboard/resumes`}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
              >
                {t.dashboard.gettingStarted.cta}
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
