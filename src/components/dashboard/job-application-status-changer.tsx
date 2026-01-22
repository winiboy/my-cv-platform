'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { JobStatus } from '@/types/database'
import { JOB_STATUS_CONFIG, JOB_STATUSES } from '@/lib/constants/job-statuses'
import { cn } from '@/lib/utils'

interface JobApplicationStatusChangerProps {
  jobApplicationId: string
  currentStatus: JobStatus
  dict: Record<string, unknown>
}

/**
 * Client component for changing job application status with dropdown
 */
export function JobApplicationStatusChanger({
  jobApplicationId,
  currentStatus,
  dict,
}: JobApplicationStatusChangerProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  /**
   * Close dropdown when clicking outside the container
   */
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsOpen(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, handleClickOutside])

  const jobsDict = (dict.jobs || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>
  const statusesDict = (jobsDict.statuses || {}) as Record<string, string>

  /**
   * Get translated status label with fallback
   */
  const getStatusLabel = (status: JobStatus): string => {
    return statusesDict[status] || JOB_STATUS_CONFIG[status].label
  }

  /**
   * Handle status change
   */
  const handleStatusChange = async (newStatus: JobStatus) => {
    if (newStatus === currentStatus) {
      setIsOpen(false)
      return
    }

    setIsUpdating(true)
    const supabase = createClient()

    // Verify user is authenticated before performing update
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert((commonDict.notLoggedIn as string) || 'You must be logged in to perform this action')
      setIsUpdating(false)
      return
    }

    const updateData: { status: JobStatus; applied_date?: string } = {
      status: newStatus,
    }

    // Auto-set applied_date when status changes to 'applied' and it wasn't set before
    if (newStatus === 'applied') {
      updateData.applied_date = new Date().toISOString().split('T')[0]
    }

    const { error } = await supabase
      .from('job_applications')
      .update(updateData)
      .eq('id', jobApplicationId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error updating status:', error)
      alert((jobsDict.statusUpdateError as string) || 'Failed to update status')
      setIsUpdating(false)
      return
    }

    setIsOpen(false)
    setIsUpdating(false)
    router.refresh()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isUpdating}
        className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50"
      >
        {isUpdating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        {(jobsDict.changeStatus as string) || 'Change Status'}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-20">
          {JOB_STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              disabled={isUpdating}
              className={cn(
                'w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                status === currentStatus
                  ? 'bg-slate-100 dark:bg-slate-700'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-700'
              )}
            >
              <span
                className={cn(
                  'w-3 h-3 rounded-full',
                  JOB_STATUS_CONFIG[status].bgColor
                )}
              />
              <span className="flex-1 text-left">{getStatusLabel(status)}</span>
              {status === currentStatus && (
                <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
