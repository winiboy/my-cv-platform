'use client'

import Link from 'next/link'
import pkg from '../../../package.json'
import { useTranslation } from '@/lib/hooks/use-translation'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { Button } from '@/components/ui/button'
import { Menu, X, LogOut, UserPlus, ChevronDown } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function Header() {
  const { t, locale } = useTranslation('common')
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  // Dynamic navigation based on auth status
  const navigation = useMemo(() => [
    ...(isLoggedIn ? [{ name: t('nav.dashboard'), href: `/${locale}/dashboard` }] : []),
    { name: t('nav.tools'), href: `/${locale}/tools` },
    { name: t('nav.resources'), href: `/${locale}/resources` },
    { name: t('nav.pricing'), href: `/${locale}/pricing` },
  ], [isLoggedIn, locale, t])

  // Check if user is logged in
  useEffect(() => {
    const supabase = createClient()

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setIsLoggedIn(!!user)
    }

    checkAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Logout function
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setAccountMenuOpen(false)
    router.push(`/${locale}`)
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex lg:flex-1">
          <Link href={`/${locale}`} className="-m-1.5 p-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-teal-500">CV Platform</span>
            <span className="text-xs font-medium text-slate-400">v{pkg.version}</span>
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-slate-700"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">{t('aria.openMainMenu') || 'Open main menu'}</span>
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Desktop navigation */}
        <div className="hidden lg:flex lg:gap-x-8">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-sm font-semibold leading-6 text-slate-900 transition-colors hover:text-teal-600"
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-end lg:gap-x-4 lg:ml-12">
          {isLoggedIn ? (
            <div className="relative">
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="flex items-center gap-2 text-sm font-semibold leading-6 text-slate-900 hover:text-teal-600 transition-colors"
              >
                {t('nav.login')}
                <ChevronDown className={`h-4 w-4 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {accountMenuOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setAccountMenuOpen(false)}
                  />

                  {/* Dropdown menu */}
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-20">
                    <Link
                      href={`/${locale}/login`}
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <UserPlus className="h-4 w-4" />
                      {t('nav.switchAccount')}
                    </Link>
                    <hr className="my-1 border-slate-200 dark:border-slate-700" />
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('nav.logout')}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              href={`/${locale}/login`}
              className="text-sm font-semibold leading-6 text-slate-900"
            >
              {t('nav.login')}
            </Link>
          )}

          <Button asChild>
            <Link href={`/${locale}/signup`}>{t('nav.signup')}</Link>
          </Button>

          <LanguageSwitcher />
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden">
          <div className="space-y-2 px-4 pb-3 pt-2">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="block rounded-md px-3 py-2 text-base font-medium text-slate-900 hover:bg-slate-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <div className="mt-4 flex flex-col gap-2">
              {isLoggedIn ? (
                <>
                  <Link
                    href={`/${locale}/login`}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium text-slate-900 hover:bg-slate-100"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <UserPlus className="h-4 w-4" />
                    {t('nav.switchAccount')}
                  </Link>
                  <hr className="border-slate-200" />
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false)
                      handleLogout()
                    }}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    {t('nav.logout')}
                  </button>
                </>
              ) : (
                <Link
                  href={`/${locale}/login`}
                  className="block rounded-md px-3 py-2 text-base font-medium text-slate-900 hover:bg-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('nav.login')}
                </Link>
              )}

              <Button asChild className="w-full">
                <Link href={`/${locale}/signup`} onClick={() => setMobileMenuOpen(false)}>
                  {t('nav.signup')}
                </Link>
              </Button>

              <div className="mt-2 flex justify-center">
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
