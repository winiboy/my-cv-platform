'use client'

import { UserMenu } from './user-menu'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'
import type { Locale } from '@/lib/i18n'

interface DashboardHeaderProps {
  user: User
  profile: Profile | null
  locale: Locale
}

export function DashboardHeader({ user, profile, locale }: DashboardHeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-4">
        {/* Breadcrumb or page title can go here */}
      </div>

      <div className="flex items-center gap-4">
        <UserMenu user={user} profile={profile} locale={locale} />
      </div>
    </header>
  )
}
