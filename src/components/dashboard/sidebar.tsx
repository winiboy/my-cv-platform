'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FileText, Briefcase, Target, Settings } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { Locale } from '@/lib/i18n'
import { useMemo } from 'react'

interface DashboardSidebarProps {
  locale: Locale
}

export function DashboardSidebar({ locale }: DashboardSidebarProps) {
  const { t } = useTranslation('common')
  const pathname = usePathname()

  const navigation = useMemo(() => [
    {
      name: t('dashboard.nav.home'),
      href: `/${locale}/dashboard`,
      icon: Home,
    },
    {
      name: t('dashboard.nav.resumes'),
      href: `/${locale}/dashboard/resumes`,
      icon: FileText,
    },
    {
      name: t('dashboard.nav.jobs'),
      href: `/${locale}/dashboard/jobs`,
      icon: Briefcase,
    },
    {
      name: t('dashboard.nav.goals'),
      href: `/${locale}/dashboard/goals`,
      icon: Target,
    },
    {
      name: t('dashboard.nav.settings'),
      href: `/${locale}/dashboard/settings`,
      icon: Settings,
    },
  ], [locale, t])

  return (
    <aside className="w-64 border-r border-slate-200 bg-white">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-slate-200 px-6">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600" />
            <span className="text-lg font-bold text-slate-900">CV Platform</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4">
          <p className="text-xs text-slate-500">© 2025 CV Platform</p>
        </div>
      </div>
    </aside>
  )
}
