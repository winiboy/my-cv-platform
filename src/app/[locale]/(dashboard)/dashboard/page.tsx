import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FileText, Briefcase, Target, TrendingUp } from 'lucide-react'
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

  const userName = profile?.full_name || user.email?.split('@')[0] || 'there'

  const stats = [
    {
      name: t.dashboard.nav.resumes,
      value: resumeCount || 0,
      icon: FileText,
      href: `/${params.locale}/dashboard/resumes`,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50',
    },
    {
      name: t.dashboard.nav.jobs,
      value: jobCount || 0,
      icon: Briefcase,
      href: `/${params.locale}/dashboard/jobs`,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      name: t.dashboard.nav.goals,
      value: goalCount || 0,
      icon: Target,
      href: `/${params.locale}/dashboard/goals`,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {t.dashboard.welcome}, {userName}!
        </h1>
        <p className="mt-2 text-slate-600">
          {params.locale === 'fr'
            ? 'Voici un aperçu de votre parcours professionnel'
            : params.locale === 'de'
              ? 'Hier ist eine Übersicht über Ihren beruflichen Werdegang'
              : 'Here\'s an overview of your career journey'}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Link
              key={stat.name}
              href={stat.href}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 transition-all hover:shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">{stat.name}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`rounded-lg ${stat.bgColor} p-3`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-slate-500 group-hover:text-teal-600">
                <span>
                  {params.locale === 'fr'
                    ? 'Voir tout'
                    : params.locale === 'de'
                      ? 'Alle anzeigen'
                      : 'View all'}
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
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {params.locale === 'fr'
            ? 'Actions rapides'
            : params.locale === 'de'
              ? 'Schnellaktionen'
              : 'Quick Actions'}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href={`/${params.locale}/dashboard/resumes`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-all hover:border-teal-500 hover:bg-teal-50"
          >
            <div className="rounded-lg bg-teal-100 p-2">
              <FileText className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {params.locale === 'fr'
                  ? 'Créer un CV'
                  : params.locale === 'de'
                    ? 'Lebenslauf erstellen'
                    : 'Create Resume'}
              </p>
              <p className="text-xs text-slate-500">
                {params.locale === 'fr'
                  ? 'Nouveau CV professionnel'
                  : params.locale === 'de'
                    ? 'Neuer professioneller Lebenslauf'
                    : 'New professional resume'}
              </p>
            </div>
          </Link>

          <Link
            href={`/${params.locale}/dashboard/jobs`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-all hover:border-purple-500 hover:bg-purple-50"
          >
            <div className="rounded-lg bg-purple-100 p-2">
              <Briefcase className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {params.locale === 'fr'
                  ? 'Ajouter une candidature'
                  : params.locale === 'de'
                    ? 'Bewerbung hinzufügen'
                    : 'Add Job Application'}
              </p>
              <p className="text-xs text-slate-500">
                {params.locale === 'fr'
                  ? 'Suivre une nouvelle offre'
                  : params.locale === 'de'
                    ? 'Neue Stelle verfolgen'
                    : 'Track a new position'}
              </p>
            </div>
          </Link>

          <Link
            href={`/${params.locale}/dashboard/goals`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition-all hover:border-orange-500 hover:bg-orange-50"
          >
            <div className="rounded-lg bg-orange-100 p-2">
              <Target className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                {params.locale === 'fr'
                  ? 'Définir un objectif'
                  : params.locale === 'de'
                    ? 'Ziel setzen'
                    : 'Set a Goal'}
              </p>
              <p className="text-xs text-slate-500">
                {params.locale === 'fr'
                  ? 'Planifier votre carrière'
                  : params.locale === 'de'
                    ? 'Planen Sie Ihre Karriere'
                    : 'Plan your career path'}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Getting started guide (only show if user has no data) */}
      {!resumeCount && !jobCount && !goalCount && (
        <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-teal-100 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-teal-500 p-2">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900">
                {params.locale === 'fr'
                  ? 'Commencez votre parcours'
                  : params.locale === 'de'
                    ? 'Starten Sie Ihre Reise'
                    : 'Get Started'}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {params.locale === 'fr'
                  ? 'Créez votre premier CV pour commencer à postuler aux offres d\'emploi qui vous correspondent.'
                  : params.locale === 'de'
                    ? 'Erstellen Sie Ihren ersten Lebenslauf, um sich auf passende Stellenangebote zu bewerben.'
                    : 'Create your first resume to start applying to jobs that match your skills and goals.'}
              </p>
              <Link
                href={`/${params.locale}/dashboard/resumes`}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
              >
                {params.locale === 'fr'
                  ? 'Créer mon premier CV'
                  : params.locale === 'de'
                    ? 'Meinen ersten Lebenslauf erstellen'
                    : 'Create My First Resume'}
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
