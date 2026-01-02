'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Settings, User as UserIcon } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'
import type { Locale } from '@/lib/i18n'

interface UserMenuProps {
  user: User
  profile: Profile | null
  locale: Locale
}

export function UserMenu({ user, profile, locale }: UserMenuProps) {
  const { t } = useTranslation('common')
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
      setIsOpen(false)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClickOutside])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(`/${locale}`)
    router.refresh()
  }

  // Get user initials for avatar fallback
  const getInitials = () => {
    if (profile?.full_name) {
      const names = profile.full_name.split(' ')
      if (names.length >= 2) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
      }
      return profile.full_name.substring(0, 2).toUpperCase()
    }
    return user.email?.substring(0, 2).toUpperCase() || 'U'
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* User button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-50"
      >
        {/* Avatar */}
        <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-teal-500 to-teal-600">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name || 'User avatar'}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">
              {getInitials()}
            </div>
          )}
        </div>

        {/* User info */}
        <div className="hidden text-left md:block">
          <div className="text-sm font-medium text-slate-900">
            {profile?.full_name || user.email?.split('@')[0]}
          </div>
          <div className="text-xs text-slate-500">{user.email}</div>
        </div>

        {/* Dropdown arrow */}
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5">
          <div className="p-2">
            {/* User info header */}
            <div className="border-b border-slate-100 px-3 py-3 md:hidden">
              <div className="text-sm font-medium text-slate-900">
                {profile?.full_name || user.email?.split('@')[0]}
              </div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>

            {/* Menu items */}
            <div className="space-y-1 py-1">
              <button
                onClick={() => {
                  setIsOpen(false)
                  router.push(`/${locale}/dashboard/settings`)
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <Settings className="h-4 w-4" />
                {t('dashboard.nav.settings')}
              </button>

              <button
                onClick={() => {
                  setIsOpen(false)
                  router.push(`/${locale}/dashboard/settings`)
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <UserIcon className="h-4 w-4" />
                {t('dashboard.account')}
              </button>
            </div>

            {/* Logout button */}
            <div className="border-t border-slate-100 pt-1">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                {t('dashboard.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
