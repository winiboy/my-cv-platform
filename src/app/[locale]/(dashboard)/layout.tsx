import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import type { Locale } from '@/lib/i18n'

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: Locale }
}) {
  const supabase = await createServerSupabaseClient()

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
    .single()

  return (
    <div className="flex h-screen bg-slate-50 print:h-auto print:bg-white">
      {/* Sidebar - Hidden when printing */}
      <div className="print:hidden">
        <DashboardSidebar locale={params.locale} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        {/* Header - Hidden when printing */}
        <div className="print:hidden">
          <DashboardHeader user={user} profile={profile} locale={params.locale} />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  )
}
