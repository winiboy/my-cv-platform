'use client'

import { MapPin, Briefcase, DollarSign, Calendar, Bookmark, ExternalLink, Sparkles, FilePlus, Loader2, Eye } from 'lucide-react'
import type { JobListing } from '@/types/jobs'
import type { Locale } from '@/lib/i18n'
import { useState, useCallback } from 'react'
import { isRedirectContent } from '@/lib/adzuna-client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { CVAdaptationModal } from '@/components/dashboard/cv-adaptation-modal'
import { ResumeSelectorModal } from './resume-selector-modal'
import { createClient } from '@/lib/supabase/client'
import type { CVAdaptationPatch } from '@/types/cv-adaptation'
import { useRouter } from 'next/navigation'

/**
 * Response from the job-applications POST endpoint
 */
interface SaveJobResponse {
  jobApplication?: {
    id: string
  }
  error?: string
  isDuplicate?: boolean
  message?: string
}

/**
 * Dictionary type for job detail panel translations
 * Uses specific types for type safety while maintaining flexibility
 */
interface JobDetailPanelDict {
  jobAlreadySaved?: string
  jobSavedSuccess?: string
  jobSaveError?: string
  saving?: string
  saved?: string
  save?: string
  apply?: string
  jobDescription?: string
  preview?: string
  fullDetailsNote?: string
  viewFullDetails?: string
  requirements?: string
  locationNote?: string
  viewInApplications?: string
  employmentTypes?: Record<string, string>
  createCV?: {
    noUrlError?: string
    noDescriptionError?: string
    fetching?: string
    button?: string
    modalTitle?: string
    selectResumeTitleWithCreate?: string
    newCV?: string
    newCVDescription?: string
    createButton?: string
    creating?: string
    helpText?: string
  }
  cvAdaptation?: {
    fetching?: string
    adaptCV?: string
    noResumesError?: string
    [key: string]: string | undefined
  }
}

interface JobDetailPanelProps {
  job: JobListing
  dict: JobDetailPanelDict
  locale: Locale
}

/**
 * Validate that a job description is usable (not redirect content)
 * Returns the description if valid, or null if it's redirect/tainted content
 */
function getValidDescription(description: string | undefined): string | null {
  if (!description || description.trim().length === 0) return null
  if (isRedirectContent(description)) return null
  return description
}

export function JobDetailPanel({ job, dict, locale }: JobDetailPanelProps) {
  const router = useRouter()
  const toast = useToast()
  const [isSaved, setIsSaved] = useState(job.is_saved || false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedJobId, setSavedJobId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
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

  /**
   * Saves a job to the user's job applications
   * Creates a new record with status 'saved'
   */
  const saveJobToApplications = useCallback(async (): Promise<SaveJobResponse> => {
    // Extract salary values from salary_range string if available
    // Format is typically "X - Y CHF" from Adzuna
    let salaryMin: number | null = null
    let salaryMax: number | null = null

    if (job.salary_range) {
      const salaryMatch = job.salary_range.match(/(\d[\d\s']*)/g)
      if (salaryMatch && salaryMatch.length >= 1) {
        salaryMin = parseInt(salaryMatch[0].replace(/[\s']/g, ''), 10) || null
        if (salaryMatch.length >= 2) {
          salaryMax = parseInt(salaryMatch[1].replace(/[\s']/g, ''), 10) || null
        }
      }
    }

    const response = await fetch('/api/job-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_title: job.title,
        company_name: job.company,
        location: job.location_full || `${job.location_city}, Switzerland`,
        salary_min: salaryMin,
        salary_max: salaryMax,
        job_url: job.application_url || null,
        job_description: job.description || null,
        source: 'Adzuna',
      }),
    })

    return response.json()
  }, [job])

  const handleSave = async () => {
    // If already saved, just toggle the visual state (no unsave API yet)
    if (isSaved) {
      return
    }

    setSaveError(null)
    setIsSaving(true)

    try {
      const result = await saveJobToApplications()

      if (result.error) {
        if (result.isDuplicate) {
          // Job already saved, update state to reflect this
          setIsSaved(true)
          if (result.jobApplication?.id) {
            setSavedJobId(result.jobApplication.id)
          }
          toast.info(dict?.jobAlreadySaved || 'This job is already in your saved applications.')
        } else {
          setSaveError(result.error)
          toast.error(result.error)
        }
        return
      }

      // Success
      setIsSaved(true)
      if (result.jobApplication?.id) {
        setSavedJobId(result.jobApplication.id)
      }
      toast.success(dict?.jobSavedSuccess || 'Job saved to your applications!')
    } catch (error) {
      console.error('Error saving job:', error)
      setSaveError('Failed to save job')
      toast.error(dict?.jobSaveError || 'Failed to save job. Please try again.')
    } finally {
      setIsSaving(false)
    }
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
      setIsFetchingJob(true)

      // Fetch full job description from external URL (same as handleCreateCV)
      if (job.application_url && job.application_url !== '#') {
        try {
          const response = await fetch('/api/jobs/fetch-external', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: job.application_url,
              targetLanguage: locale,
            }),
          })

          const data = await response.json()

          // Determine the best available job description
          let finalDescription: string | null = null
          let finalTitle = job.title
          let finalCompany = job.company

          if (response.ok && data.success) {
            // API succeeded, validate the fetched description
            finalDescription = getValidDescription(data.jobDescription)
            finalTitle = data.jobTitle || job.title
            finalCompany = data.company || job.company
          }

          // If API failed or returned redirect content, try fallback
          if (!finalDescription) {
            finalDescription = getValidDescription(job.description)
          }

          // If no valid description available at all, show error and return
          if (!finalDescription) {
            console.error('[handleAdaptCV] No valid job description available - both fetched and fallback are redirect content')
            toast.error(dict?.createCV?.noDescriptionError || 'Unable to retrieve job description. Please visit the job listing directly for more details.')
            setIsFetchingJob(false)
            return
          }

          setFetchedJobData({
            description: finalDescription,
            title: finalTitle,
            company: finalCompany,
          })
        } catch (fetchError) {
          console.error('Error fetching external job:', fetchError)
          // Fallback to existing job data, but validate it first
          const validDescription = getValidDescription(job.description)
          if (!validDescription) {
            toast.error(dict?.createCV?.noDescriptionError || 'Unable to retrieve job description. Please visit the job listing directly for more details.')
            setIsFetchingJob(false)
            return
          }
          setFetchedJobData({
            description: validDescription,
            title: job.title,
            company: job.company,
          })
        }
      } else {
        // No external URL, use existing job data but validate it first
        const validDescription = getValidDescription(job.description)
        if (!validDescription) {
          toast.error(dict?.createCV?.noDescriptionError || 'Unable to retrieve job description. Please visit the job listing directly for more details.')
          setIsFetchingJob(false)
          return
        }
        setFetchedJobData({
          description: validDescription,
          title: job.title,
          company: job.company,
        })
      }

      // Fetch user's resumes
      const { data: resumes, error } = await supabase
        .from('resumes')
        .select('id')
        .eq('user_id', user.id) as { data: { id: string }[] | null; error: any }

      setIsFetchingJob(false)

      if (error) {
        console.error('Error fetching resumes:', error)
        toast.error(dict?.cvAdaptation?.noResumesError || 'Failed to load resumes')
        return
      }

      if (!resumes || resumes.length === 0) {
        // No resumes found
        toast.warning(dict?.cvAdaptation?.noResumesError || 'Please create a CV first before adapting it to a job.')
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
      setIsFetchingJob(false)
      toast.error('An error occurred. Please try again.')
    }
  }

  const handleResumeSelected = (resumeId: string) => {
    setSelectedResumeId(resumeId)
    setShowResumeSelector(false)
    setShowAdaptationModal(true)
  }

  const handleApplyChanges = (patch: CVAdaptationPatch, selectedPatches: string[]) => {
    // Store adaptation data in sessionStorage (avoids URL length limits)
    // The resume editor will read and apply the changes
    const adaptationData = {
      patch,
      selectedPatches,
      resumeId: selectedResumeId,
      timestamp: Date.now(),
    }
    sessionStorage.setItem('cv_adaptation_pending', JSON.stringify(adaptationData))

    // Navigate to editor with a flag indicating pending adaptation
    router.push(`/${locale}/dashboard/resumes/${selectedResumeId}/edit?applyAdaptation=true`)
  }

  const handleCreateCV = async () => {
    if (!job.application_url || job.application_url === '#') {
      toast.error(dict?.createCV?.noUrlError || 'No external job URL available')
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

      // Determine the best available job description
      let finalDescription: string | null = null
      let finalTitle = job.title
      let finalCompany = job.company

      if (response.ok && data.success) {
        // API succeeded, validate the fetched description
        finalDescription = getValidDescription(data.jobDescription)
        finalTitle = data.jobTitle || job.title
        finalCompany = data.company || job.company
      }

      // If API failed or returned redirect content, try fallback
      if (!finalDescription) {
        finalDescription = getValidDescription(job.description)
      }

      // If no valid description available at all, show error
      if (!finalDescription) {
        console.error('[handleCreateCV] No valid job description available - both fetched and fallback are redirect content')
        toast.error(dict?.createCV?.noDescriptionError || 'Unable to retrieve job description. Please visit the job listing directly for more details.')
        setIsFetchingJob(false)
        setIsCreateCVMode(false)
        return
      }

      setFetchedJobData({
        description: finalDescription,
        title: finalTitle,
        company: finalCompany,
      })

      // Fetch user's resumes
      const { data: resumes, error } = await supabase
        .from('resumes')
        .select('id')
        .eq('user_id', user.id) as { data: { id: string }[] | null; error: any }

      if (error) {
        console.error('Error fetching resumes:', error)
        toast.error(dict?.cvAdaptation?.noResumesError || 'Failed to load resumes')
        setIsFetchingJob(false)
        setIsCreateCVMode(false)
        return
      }

      setIsFetchingJob(false)

      // Always show the create new CV modal for "Créer un CV" button
      // This bypasses any existing CV comparison and creates a fresh CV
      setIsCreateCVMode(false)
      setIsCreateNewCVMode(true)
      setShowCreateNewCVModal(true)
    } catch (error) {
      console.error('Error in handleCreateCV:', error)
      toast.error('An error occurred. Please try again.')
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
      // Use existing job data if no external URL, but validate it first
      const validDescription = getValidDescription(job.description)
      if (!validDescription) {
        toast.error(dict?.createCV?.noDescriptionError || 'Unable to retrieve job description. Please visit the job listing directly for more details.')
        return
      }
      setFetchedJobData({
        description: validDescription,
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

      // Determine the best available job description
      let finalDescription: string | null = null
      let finalTitle = job.title
      let finalCompany = job.company

      if (response.ok && data.success) {
        // API succeeded, validate the fetched description
        finalDescription = getValidDescription(data.jobDescription)
        finalTitle = data.jobTitle || job.title
        finalCompany = data.company || job.company
      }

      // If API failed or returned redirect content, try fallback
      if (!finalDescription) {
        finalDescription = getValidDescription(job.description)
      }

      // If no valid description available at all, show error
      if (!finalDescription) {
        console.error('[handleCreateNewCVFromSelector] No valid job description available - both fetched and fallback are redirect content')
        toast.error(dict?.createCV?.noDescriptionError || 'Unable to retrieve job description. Please visit the job listing directly for more details.')
        setIsFetchingJob(false)
        return
      }

      setFetchedJobData({
        description: finalDescription,
        title: finalTitle,
        company: finalCompany,
      })
      setIsFetchingJob(false)
      setIsCreateNewCVMode(true)
      setShowCreateNewCVModal(true)
    } catch (error) {
      console.error('Error fetching job for new CV:', error)
      setIsFetchingJob(false)
      // Fallback: use existing job data, but validate it first
      const validDescription = getValidDescription(job.description)
      if (!validDescription) {
        toast.error(dict?.createCV?.noDescriptionError || 'Unable to retrieve job description. Please visit the job listing directly for more details.')
        return
      }
      setFetchedJobData({
        description: validDescription,
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

        {/* Action Buttons - Grid layout for better mobile responsiveness */}
        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          {/* Primary action - Apply */}
          <Button onClick={handleApply} className="flex items-center justify-center gap-2">
            <ExternalLink className="h-4 w-4" />
            <span className="truncate">{dict?.apply || 'Apply'}</span>
          </Button>

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={isSaving || isSaved}
            variant="outline"
            className="flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bookmark className={`h-4 w-4 flex-shrink-0 ${isSaved ? 'fill-current' : ''}`} />
            )}
            <span className="truncate">
              {isSaving
                ? (dict?.saving || 'Saving...')
                : isSaved
                  ? (dict?.saved || 'Saved')
                  : (dict?.save || 'Save')}
            </span>
          </Button>

          {/* Adapt CV button */}
          <Button
            onClick={handleAdaptCV}
            disabled={isFetchingJob}
            variant="outline"
            className="flex items-center justify-center gap-2 border-purple-600 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
          >
            {isFetchingJob ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 flex-shrink-0" />
            )}
            <span className="truncate">
              {isFetchingJob
                ? (dict?.cvAdaptation?.fetching || 'Loading...')
                : (dict?.cvAdaptation?.adaptCV || 'Adapt CV')}
            </span>
          </Button>

          {/* Create CV button */}
          <Button
            onClick={handleCreateCV}
            disabled={isFetchingJob}
            variant="outline"
            className="flex items-center justify-center gap-2 border-teal-600 text-teal-600 hover:bg-teal-50 hover:text-teal-700"
          >
            {isFetchingJob ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FilePlus className="h-4 w-4 flex-shrink-0" />
            )}
            <span className="truncate">
              {isFetchingJob
                ? (dict?.createCV?.fetching || 'Loading...')
                : (dict?.createCV?.button || 'Create CV')}
            </span>
          </Button>

          {/* View in applications - only shown when saved, spans full width on mobile */}
          {isSaved && savedJobId && (
            <Button
              onClick={() => router.push(`/${locale}/dashboard/applications`)}
              variant="ghost"
              className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 text-teal-600 hover:text-teal-700"
            >
              <Eye className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{dict?.viewInApplications || 'View in Applications'}</span>
            </Button>
          )}
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
          initialJobDescription={fetchedJobData ? fetchedJobData.description : job.description}
          initialJobTitle={fetchedJobData ? fetchedJobData.title : job.title}
          initialCompany={fetchedJobData ? fetchedJobData.company : job.company}
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
