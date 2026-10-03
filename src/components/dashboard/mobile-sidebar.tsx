'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { PanelLeftOpen, X } from 'lucide-react'
import { DashboardSidebar } from './sidebar'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { Locale } from '@/lib/i18n'

interface DashboardMobileSidebarProps {
  locale: Locale
}

/**
 * The dashboard navigation below the `md` breakpoint, where the fixed 256px
 * sidebar would leave too little room for the page itself.
 *
 * A native modal `<dialog>` provides the drawer: `showModal()` makes the rest
 * of the page inert and closes it on Escape, returning focus to the trigger,
 * so the keyboard and screen-reader behaviour comes from the platform rather
 * than from a hand-rolled focus trap.
 */
export function DashboardMobileSidebar({ locale }: DashboardMobileSidebarProps) {
  const { t } = useTranslation('common')
  const pathname = usePathname()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => {
    dialogRef.current?.showModal()
    setIsOpen(true)
    // showModal() would focus the first focusable element, the logo link;
    // the close button is the more predictable landing point.
    closeButtonRef.current?.focus()
  }, [])

  const close = useCallback(() => {
    dialogRef.current?.close()
  }, [])

  // A navigation that does not come from a click inside the drawer (back/
  // forward) must not leave it covering the destination page.
  useEffect(() => {
    close()
  }, [pathname, close])

  const handleDialogClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      const target = event.target as Element
      // The dialog element itself only receives clicks that land on the
      // backdrop. A link closes the drawer even when it points at the current
      // page, where no navigation would close it.
      if (target === event.currentTarget || target.closest('a')) close()
    },
    [close]
  )

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-2 md:hidden print:hidden">
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="dashboard-mobile-sidebar"
        className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
        {t('dashboard.nav.menu')}
      </button>

      <dialog
        id="dashboard-mobile-sidebar"
        ref={dialogRef}
        aria-label={t('dashboard.nav.menu')}
        onClick={handleDialogClick}
        onClose={() => setIsOpen(false)}
        className="m-0 h-full max-h-none w-64 max-w-[85vw] border-0 p-0 backdrop:bg-slate-900/50"
      >
        <div className="relative h-full">
          {/* First in DOM order so Tab continues from it into the links. */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label={t('dashboard.nav.closeMenu')}
            className="absolute right-1 top-2.5 flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <DashboardSidebar locale={locale} variant="drawer" />
        </div>
      </dialog>
    </div>
  )
}
