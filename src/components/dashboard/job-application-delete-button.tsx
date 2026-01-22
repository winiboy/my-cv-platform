'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface JobApplicationDeleteButtonProps {
  jobApplicationId: string
  locale: string
  dict: Record<string, unknown>
}

/**
 * Client component for deleting a job application with confirmation
 */
export function JobApplicationDeleteButton({
  jobApplicationId,
  locale,
  dict,
}: JobApplicationDeleteButtonProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const jobsDict = (dict.jobs || {}) as Record<string, unknown>
  const commonDict = (dict.common || {}) as Record<string, unknown>

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
      .eq('id', jobApplicationId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting job application:', error)
      alert((jobsDict.deleteError as string) || 'Failed to delete job application')
      setIsDeleting(false)
      return
    }

    // Redirect to job applications list after successful deletion
    router.push(`/${locale}/dashboard/job-applications`)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="inline-flex items-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
    >
      {isDeleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      {isDeleting
        ? ((commonDict.deleting as string) || 'Deleting...')
        : ((jobsDict.delete as string) || 'Delete')}
    </button>
  )
}
