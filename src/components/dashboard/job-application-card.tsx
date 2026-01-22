'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Briefcase,
  MoreVertical,
  Pencil,
  Trash2,
  FileText,
  Mail,
  MapPin,
  DollarSign,
  ChevronRight,
} from 'lucide-react'
import type { JobApplicationWithRelations, JobStatus } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ResumeLinkBadge, CoverLetterLinkBadge } from '@/components/dashboard/entity-link-badge'
import { JOB_STATUS_CONFIG, JOB_STATUSES } from '@/lib/constants/job-statuses'
import { cn } from '@/lib/utils'

interface JobApplicationCardProps {
  jobApplication: JobApplicationWithRelations
  locale: string
  dict: Record<string, unknown>
  onDelete?: (id: string) => void
  onStatusChange?: (id: string, status: JobStatus) => void
}

export function JobApplicationCard({
  jobApplication,
  locale,
  dict,
  onDelete,
  onStatusChange,
}: JobApplicationCardProps) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [showStatusSubmenu, setShowStatusSubmenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  /**
   * Close dropdown when clicking outside the menu container
   */
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
      setShowMenu(false)
      setShowStatusSubmenu(false)
    }
  }, [])

  useEffect(() => {
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu, handleClickOutside])

  const jobsDict = (dict.jobs || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>
  const statusesDict = (jobsDict.statuses || {}) as Record<string, string>

  /**
   * Get translated status label with fallback to English
   */
  const getStatusLabel = (status: JobStatus): string => {
    return statusesDict[status] || JOB_STATUS_CONFIG[status].label
  }

  /**
   * Handle job application deletion with confirmation
   */
  const handleDelete = async () => {
    const confirmMsg =
      (jobsDict.confirmDelete as string) ||
      'Are you sure you want to delete this job application?'
    if (!confirm(confirmMsg)) return

    setIsDeleting(true)
    const supabase = createClient()

    // Verify user is authenticated before performing delete
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert((commonDict.notLoggedIn as string) || 'You must be logged in to perform this action')
      setIsDeleting(false)
      return
    }

    const { error } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', jobApplication.id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting job application:', error)
      alert((jobsDict.deleteError as string) || 'Failed to delete job application')
      setIsDeleting(false)
      return
    }

    // Call optional callback if provided
    if (onDelete) {
      onDelete(jobApplication.id)
    }

    router.refresh()
  }

  /**
   * Handle status change
   */
  const handleStatusChange = async (newStatus: JobStatus) => {
    if (newStatus === jobApplication.status) {
      setShowStatusSubmenu(false)
      setShowMenu(false)
      return
    }

    setIsUpdatingStatus(true)
    const supabase = createClient()

    // Verify user is authenticated before performing update
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert((commonDict.notLoggedIn as string) || 'You must be logged in to perform this action')
      setIsUpdatingStatus(false)
      return
    }

    const updateData: { status: JobStatus; applied_date?: string } = {
      status: newStatus,
    }

    // Auto-set applied_date when status changes to 'applied' and no date is set
    if (newStatus === 'applied' && !jobApplication.applied_date) {
      updateData.applied_date = new Date().toISOString().split('T')[0]
    }

    const { error } = await supabase
      .from('job_applications')
      .update(updateData)
      .eq('id', jobApplication.id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error updating status:', error)
      alert((jobsDict.statusUpdateError as string) || 'Failed to update status')
      setIsUpdatingStatus(false)
      return
    }

    // Call optional callback if provided
    if (onStatusChange) {
      onStatusChange(jobApplication.id, newStatus)
    }

    setShowStatusSubmenu(false)
    setShowMenu(false)
    setIsUpdatingStatus(false)
    router.refresh()
  }

  /**
   * Format date for display using locale
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  const currentStatusConfig = JOB_STATUS_CONFIG[jobApplication.status]

  return (
    <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Status badge - top right */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <div
          className={cn(
            'px-2 py-1 text-xs font-medium rounded',
            currentStatusConfig.bgColor,
            currentStatusConfig.textColor
          )}
        >
          {getStatusLabel(jobApplication.status)}
        </div>
      </div>

      {/* Menu button - top left */}
      <div className="absolute top-4 left-4" ref={menuRef}>
        <button
          onClick={() => {
            setShowMenu(!showMenu)
            setShowStatusSubmenu(false)
          }}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
          disabled={isDeleting || isUpdatingStatus}
          aria-label="Job application actions"
        >
          <MoreVertical className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-10">
            {/* Edit */}
            <Link
              href={`/${locale}/dashboard/jobs/${jobApplication.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              {(jobsDict.edit as string) || 'Edit'}
            </Link>

            {/* Create CV for this Job */}
            <Link
              href={`/${locale}/dashboard/resumes/new?jobApplicationId=${jobApplication.id}`}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <FileText className="h-4 w-4" />
              {(jobsDict.createCVForJob as string) || 'Create CV for this Job'}
            </Link>

            {/* Create Cover Letter for this Job */}
            <Link
              href={`/${locale}/dashboard/cover-letters/new?jobApplicationId=${jobApplication.id}`}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Mail className="h-4 w-4" />
              {(jobsDict.createCoverLetterForJob as string) || 'Create Cover Letter for this Job'}
            </Link>

            <hr className="my-1 border-slate-200 dark:border-slate-700" />

            {/* Change Status - with submenu */}
            <div className="relative">
              <button
                onClick={() => setShowStatusSubmenu(!showStatusSubmenu)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                disabled={isUpdatingStatus}
              >
                <span className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  {(jobsDict.changeStatus as string) || 'Change Status'}
                </span>
                <ChevronRight className="h-4 w-4" />
              </button>

              {/* Status submenu - positioned below on mobile, to the right on larger screens */}
              {showStatusSubmenu && (
                <div className="absolute left-0 top-full mt-1 sm:left-full sm:top-0 sm:mt-0 sm:ml-1 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-20">
                  {JOB_STATUSES.map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      disabled={isUpdatingStatus}
                      className={cn(
                        'w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                        status === jobApplication.status
                          ? 'bg-slate-100 dark:bg-slate-700'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                      )}
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          JOB_STATUS_CONFIG[status].bgColor.replace('dark:bg-', '').split(' ')[0]
                        )}
                      />
                      {getStatusLabel(status)}
                      {status === jobApplication.status && (
                        <span className="ml-auto text-teal-600 dark:text-teal-400">
                          &#10003;
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <hr className="my-1 border-slate-200 dark:border-slate-700" />

            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting
                ? (commonDict.deleting as string) || 'Deleting...'
                : (jobsDict.delete as string) || 'Delete'}
            </button>
          </div>
        )}
      </div>

      {/* Card content */}
      <Link
        href={`/${locale}/dashboard/jobs/${jobApplication.id}/edit`}
        className="block"
      >
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg mb-1 truncate">
              {jobApplication.job_title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
              {jobApplication.company_name}
            </p>
          </div>
        </div>

        {/* Location and salary */}
        <div className="flex flex-wrap gap-3 mb-3 text-sm text-slate-500 dark:text-slate-400">
          {jobApplication.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {jobApplication.location}
            </span>
          )}
          {jobApplication.salary_range && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              {jobApplication.salary_range}
            </span>
          )}
        </div>

        {/* Linked entities badges - only show when entities ARE linked */}
        {(jobApplication.resume || jobApplication.cover_letter) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {jobApplication.resume && (
              <ResumeLinkBadge
                resumeTitle={jobApplication.resume.title}
                href={`/${locale}/dashboard/resumes/${jobApplication.resume.id}/edit`}
                dict={dict}
              />
            )}
            {jobApplication.cover_letter && (
              <CoverLetterLinkBadge
                count={1}
                href={`/${locale}/dashboard/cover-letters/${jobApplication.cover_letter.id}/edit`}
                dict={dict}
              />
            )}
          </div>
        )}

        {/* Date information */}
        <div className="text-xs text-slate-500 dark:text-slate-500">
          {jobApplication.applied_date ? (
            <>
              {(jobsDict.appliedOn as string) || 'Applied'}{' '}
              {formatDate(jobApplication.applied_date)}
            </>
          ) : (
            <>
              {(jobsDict.savedOn as string) || 'Saved'}{' '}
              {formatDate(jobApplication.created_at)}
            </>
          )}
        </div>
      </Link>
    </div>
  )
}
