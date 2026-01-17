'use client'

import { MapPin, Briefcase, DollarSign, Calendar, Bookmark, ExternalLink, CheckCircle, Sparkles, FilePlus, Loader2 } from 'lucide-react'
import type { JobListing } from '@/types/jobs'
import type { Locale } from '@/lib/i18n'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CVAdaptationModal } from '@/components/dashboard/cv-adaptation-modal'
import { ResumeSelectorModal } from './resume-selector-modal'
import { createClient } from '@/lib/supabase/client'
import type { CVAdaptationPatch } from '@/types/cv-adaptation'
import { useRouter } from 'next/navigation'

interface JobDetailPanelProps {
  job: JobListing
  dict: any
  locale: Locale
}

export function JobDetailPanel({ job, dict, locale }: JobDetailPanelProps) {
  const router = useRouter()
  const [isSaved, setIsSaved] = useState(job.is_saved || false)
  const [isTracked, setIsTracked] = useState(false)
  const [showAdaptationModal, setShowAdaptationModal] = useState(false)
  const [showResumeSelector, setShowResumeSelector] = useState(false)
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [isCreateCVMode, setIsCreateCVMode] = useState(false)
  const [isCreateNewCVMode, setIsCreateNewCVMode] = useState(false)
  const [isFetchingJob, setIsFetchingJob] = useState(false)
  const [fetchedJobData, setFetchedJobData] = useState<{
    description: string
    title: string
    company: string
  } | null>(null)
  const [showCreateNewCVModal, setShowCreateNewCVModal] = useState(false)

  const handleSave = () => {
    setIsSaved(!isSaved)
    // TODO: Persist to backend
  }

  const handleTrack = () => {
    setIsTracked(!isTracked)
    // TODO: Persist to backend (create job_application record with status 'saved')
  }

  const handleApply = () => {
    if (job.application_url && job.application_url !== '#') {
      window.open(job.application_url, '_blank')
    }
    // TODO: Track application
  }

  const handleAdaptCV = async () => {
    try {
      // Get current user
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Redirect to login
        router.push(`/${locale}/auth/signin`)
        return
      }

      setUserId(user.id)

      // Fetch user's resumes
      const { data: resumes, error } = await supabase
        .from('resumes')
        .select('id')
        .eq('user_id', user.id) as { data: { id: string }[] | null; error: any }

      if (error) {
        console.error('Error fetching resumes:', error)
        alert(dict?.cvAdaptation?.noResumesError || 'Failed to load resumes')
        return
      }

      if (!resumes || resumes.length === 0) {
        // No resumes found
        alert(dict?.cvAdaptation?.noResumesError || 'Please create a CV first before adapting it to a job.')
        return
      }

      if (resumes.length === 1 && resumes[0]) {
        // Only one resume, auto-select and show adaptation modal
        setSelectedResumeId(resumes[0].id)
        setShowAdaptationModal(true)
      } else {
        // Multiple resumes, show selector
        setShowResumeSelector(true)
      }
    } catch (error) {
      console.error('Error in handleAdaptCV:', error)
      alert('An error occurred. Please try again.')
    }
  }

  const handleResumeSelected = (resumeId: string) => {
    setSelectedResumeId(resumeId)
    setShowResumeSelector(false)
    setShowAdaptationModal(true)
  }

  const handleApplyChanges = (patch: CVAdaptationPatch, selectedPatches: string[]) => {
    // Redirect to resume editor with adaptation data in URL query
    // The resume editor will handle applying the changes
    const adaptationData = encodeURIComponent(JSON.stringify({
      patch,
      selectedPatches
    }))
    router.push(`/${locale}/dashboard/resumes/${selectedResumeId}/edit?adaptation=${adaptationData}`)
  }

  const handleCreateCV = async () => {
    if (!job.application_url || job.application_url === '#') {
      alert(dict?.createCV?.noUrlError || 'No external job URL available')
      return
    }

    try {
      // Get current user
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/${locale}/auth/signin`)
        return
      }

      setUserId(user.id)
      setIsFetchingJob(true)
      setIsCreateCVMode(true)

      // Fetch full job description from external URL (invisible to user)
      const response = await fetch('/api/jobs/fetch-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: job.application_url,
          targetLanguage: locale,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        // Fallback to existing job data if fetch fails
        setFetchedJobData({
          description: job.description,
          title: job.title,
          company: job.company,
        })
      } else {
        setFetchedJobData({
          description: data.jobDescription || job.description,
          title: data.jobTitle || job.title,
          company: data.company || job.company,
        })
      }

      // Fetch user's resumes
      const { data: resumes, error } = await supabase
        .from('resumes')
        .select('id')
        .eq('user_id', user.id) as { data: { id: string }[] | null; error: any }

      if (error) {
        console.error('Error fetching resumes:', error)
        alert(dict?.cvAdaptation?.noResumesError || 'Failed to load resumes')
        setIsFetchingJob(false)
        setIsCreateCVMode(false)
        return
      }

      setIsFetchingJob(false)

      if (!resumes || resumes.length === 0) {
        alert(dict?.cvAdaptation?.noResumesError || 'Please create a CV first.')
        setIsCreateCVMode(false)
        return
      }

      if (resumes.length === 1 && resumes[0]) {
        setSelectedResumeId(resumes[0].id)
        setShowAdaptationModal(true)
      } else {
        setShowResumeSelector(true)
      }
    } catch (error) {
      console.error('Error in handleCreateCV:', error)
      alert('An error occurred. Please try again.')
      setIsFetchingJob(false)
      setIsCreateCVMode(false)
    }
  }

  const handleCloseModal = () => {
    setShowAdaptationModal(false)
    setIsCreateCVMode(false)
    setFetchedJobData(null)
  }

  const handleCreateNewCVFromSelector = async () => {
    // Close the resume selector first
    setShowResumeSelector(false)

    if (!job.application_url || job.application_url === '#') {
      // Use existing job data if no external URL
      setFetchedJobData({
        description: job.description,
        title: job.title,
        company: job.company,
      })
      setIsCreateNewCVMode(true)
      setShowCreateNewCVModal(true)
      return
    }

    try {
      setIsFetchingJob(true)

      // Fetch full job description from external URL (invisible to user)
      const response = await fetch('/api/jobs/fetch-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: job.application_url,
          targetLanguage: locale,
        }),
      })

      const data = await response.json()

      let jobDataToUse = {
        description: job.description,
        title: job.title,
        company: job.company,
      }

      if (response.ok && data.success) {
        jobDataToUse = {
          description: data.jobDescription || job.description,
          title: data.jobTitle || job.title,
          company: data.company || job.company,
        }
      }

      setFetchedJobData(jobDataToUse)
      setIsFetchingJob(false)
      setIsCreateNewCVMode(true)
      setShowCreateNewCVModal(true)
    } catch (error) {
      console.error('Error fetching job for new CV:', error)
      setIsFetchingJob(false)
      // Fallback: use existing job data
      setFetchedJobData({
        description: job.description,
        title: job.title,
        company: job.company,
      })
      setIsCreateNewCVMode(true)
      setShowCreateNewCVModal(true)
    }
  }

  const handleCloseCreateNewCVModal = () => {
    setShowCreateNewCVModal(false)
    setIsCreateNewCVMode(false)
    setFetchedJobData(null)
  }

  // Parse description into paragraphs
  const descriptionParagraphs = job.description.split('\n\n')

  return (
    <div className="h-full overflow-y-auto rounded-lg border border-slate-200 bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 p-6">
        <h2 className="text-2xl font-bold text-slate-900">{job.title}</h2>
        <p className="mt-2 text-lg text-slate-700">{job.company}</p>

        {/* Meta Information */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            <span>{job.location_full || `${job.location_city}, Switzerland`}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4" />
            <span>{dict?.employmentTypes?.[job.employment_type] || job.employment_type}</span>
          </div>
          {job.salary_range && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" />
              <span>{job.salary_range}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            <span>{new Date(job.posted_date).toLocaleDateString('en-GB')}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={handleApply} className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            {dict?.apply || 'Apply'}
          </Button>

          <Button
            onClick={handleTrack}
            variant={isTracked ? 'default' : 'outline'}
            className="flex items-center gap-2"
          >
            <CheckCircle className={`h-4 w-4 ${isTracked ? 'fill-current' : ''}`} />
            {isTracked ? (dict?.tracked || 'Tracked') : (dict?.track || 'Track')}
          </Button>

          <Button
            onClick={handleSave}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
            {isSaved ? (dict?.saved || 'Saved') : (dict?.save || 'Save')}
          </Button>

          <Button
            onClick={handleAdaptCV}
            variant="outline"
            className="flex items-center gap-2 border-purple-600 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
          >
            <Sparkles className="h-4 w-4" />
            {dict?.cvAdaptation?.adaptCV || 'Adapt My CV'}
          </Button>

          <Button
            onClick={handleCreateCV}
            disabled={isFetchingJob}
            variant="outline"
            className="flex items-center gap-2 border-teal-600 text-teal-600 hover:bg-teal-50 hover:text-teal-700"
          >
            {isFetchingJob ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FilePlus className="h-4 w-4" />
            )}
            {isFetchingJob
              ? (dict?.createCV?.fetching || 'Fetching job details...')
              : (dict?.createCV?.button || 'Créer un CV')}
          </Button>
        </div>
      </div>

      {/* Job Description */}
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {dict?.jobDescription || 'Job Description'}
          </h3>
          <span className="text-xs text-slate-500">
            {dict?.preview || 'Preview'}
          </span>
        </div>

        <div className="mt-4 space-y-4 text-slate-700 whitespace-pre-wrap">
          {descriptionParagraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        {/* View Full Details CTA */}
        {job.application_url && job.application_url !== '#' && (
          <div className="mt-6 rounded-lg border-2 border-teal-200 bg-teal-50 p-6 text-center">
            <p className="mb-4 text-sm font-medium text-teal-900">
              {dict?.fullDetailsNote || 'The complete job description with all details is available on the employer\'s website.'}
            </p>
            <Button
              onClick={() => window.open(job.application_url, '_blank')}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700"
              size="lg"
            >
              <ExternalLink className="h-5 w-5" />
              {dict?.viewFullDetails || 'View Full Job Details'}
            </Button>
          </div>
        )}

        {/* Requirements Section (if present in description) */}
        {job.requirements && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-slate-900">
              {dict?.requirements || 'Requirements'}
            </h3>
            <div className="mt-4 whitespace-pre-wrap text-slate-700">
              {job.requirements}
            </div>
          </div>
        )}

        {/* Additional Information */}
        <div className="mt-8 rounded-lg bg-slate-50 p-4">
          <p className="text-sm text-slate-600">
            {dict?.locationNote || 'This position is located in Switzerland and requires legal authorization to work in Switzerland.'}
          </p>
        </div>
      </div>

      {/* Resume Selector Modal */}
      <ResumeSelectorModal
        isOpen={showResumeSelector}
        onClose={() => setShowResumeSelector(false)}
        onSelectResume={handleResumeSelected}
        onCreateNewCV={handleCreateNewCVFromSelector}
        userId={userId}
        showCreateNewOption={true}
        dict={{
          ...dict?.cvAdaptation,
          selectResumeTitleWithCreate: dict?.createCV?.selectResumeTitleWithCreate,
          newCV: dict?.createCV?.newCV,
          newCVDescription: dict?.createCV?.newCVDescription,
        }}
      />

      {/* CV Adaptation Modal */}
      {selectedResumeId && (
        <CVAdaptationModal
          isOpen={showAdaptationModal}
          onClose={handleCloseModal}
          resumeId={selectedResumeId}
          initialJobDescription={isCreateCVMode && fetchedJobData ? fetchedJobData.description : job.description}
          initialJobTitle={isCreateCVMode && fetchedJobData ? fetchedJobData.title : job.title}
          initialCompany={isCreateCVMode && fetchedJobData ? fetchedJobData.company : job.company}
          locale={locale}
          onApplyChanges={handleApplyChanges}
          dict={dict?.cvAdaptation}
          isCreateMode={isCreateCVMode}
          createModeTitle={dict?.createCV?.modalTitle || 'Create CV from Job'}
        />
      )}

      {/* Create New CV Modal */}
      <CVAdaptationModal
        isOpen={showCreateNewCVModal}
        onClose={handleCloseCreateNewCVModal}
        resumeId={null}
        initialJobDescription={fetchedJobData?.description || job.description}
        initialJobTitle={fetchedJobData?.title || job.title}
        initialCompany={fetchedJobData?.company || job.company}
        locale={locale}
        dict={{
          ...dict?.cvAdaptation,
          createCVButton: dict?.createCV?.createButton,
          creatingCV: dict?.createCV?.creating,
          createCVHelpText: dict?.createCV?.helpText,
        }}
        isCreateMode={true}
        isCreateNewCV={true}
        createModeTitle={dict?.createCV?.modalTitle || 'Create CV from Job'}
      />
    </div>
  )
}
