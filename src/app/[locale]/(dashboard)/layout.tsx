import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/marketing/header'
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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 print:min-h-0 print:bg-white">
      {/* Marketing Header - Sticky at top, hidden when printing */}
      <div className="sticky top-0 z-50 print:hidden">
        <Header />
      </div>

      {/* Dashboard content area - fills remaining viewport height below sticky header */}
      <div className="flex h-[calc(100vh-64px)] overflow-hidden print:h-auto print:overflow-visible">
        {/* Sidebar - Hidden when printing */}
        <div className="h-full print:hidden">
          <DashboardSidebar locale={params.locale} />
        </div>

        {/* Main content */}
        <div className="flex h-full flex-1 flex-col overflow-hidden print:overflow-visible">
          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">{children}</main>
        </div>
      </div>
    </div>
  )
}
