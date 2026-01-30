import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { locales, getTranslations } from '@/lib/i18n'
import {
  ResumeJobMatchClient,
  type ResumeJobMatchTranslations,
} from '@/components/tools/resume-job-match-client'
import type { ResumeLinkerTranslations } from '@/components/tools/resume-linker'
import type { JobLinkerTranslations } from '@/components/tools/job-linker'

interface ResumeJobMatchPageProps {
  params: {
    locale: Locale
  }
}

/**
 * Type definition for the resume job match page translations.
 * Maps to the structure in tools.json resumeJobMatch section.
 */
interface ResumeJobMatchPageTranslations {
  title: string
  subtitle: string
  metaTitle: string
  metaDescription: string
  ui: {
    // Tab labels
    tabLinkResume: string
    tabPasteText: string
    tabUploadFile: string
    tabMyResumes: string
    // Resume input
    resumeLabel: string
    resumePlaceholder: string
    // File upload
    uploadLabel: string
    dragDropText: string
    browseText: string
    acceptedFilesText: string
    fileTooLargeError: string
    unsupportedFileError: string
    extractionFailedError: string
    extractingText: string
    removeFileLabel: string
    // Job description
    jobLabel: string
    jobPlaceholder: string
    // Buttons
    analyzeButton: string
    analyzingButton: string
    // Results
    matchScore: string
    matchedSkills: string
    missingSkills: string
    recommendations: string
    strengths: string
    minCharsError: string
    emptyState: string
    emptyStateTitle?: string
    backToTools: string
    // Resume selector
    selectSavedResume?: string
    orPasteManually?: string
    loadingResumeContent?: string
    resumeLoadError?: string
    // Section headers
    inputSection?: string
    resultsSection?: string
    // Toast messages
    analysisComplete?: string
    analysisFailed?: string
    connectionError?: string
    // Result fallbacks
    analyzedAt?: string
    noSkillsFound?: string
    noMissingSkills?: string
    noRecommendations?: string
    noStrengths?: string
    // Link to resume tab
    linkResumeTitle?: string
    linkResumeDescription?: string
    linkResumeLoginPrompt?: string
    // Job input tabs
    tabJobPaste?: string
    tabJobLink?: string
    linkJobTitle?: string
    linkJobDescription?: string
    linkJobLoginPrompt?: string
    // Job linker loading states
    loadingJobDescription?: string
    jobDescriptionLoadError?: string
  }
}

/**
 * Type definition for resume checker UI translations (shared with resume selector).
 */
interface ResumeCheckerUITranslations {
  loadingResumes: string
  tryAgain: string
  noResumesFound: string
  noResumesDescription: string
  createResume: string
  updated: string
  loginRequired: string
  loadError: string
}

/**
 * Type definition for tools translations including detail section.
 */
interface ToolsTranslations {
  detail: {
    backToTools: string
  }
  resumeJobMatch: ResumeJobMatchPageTranslations
  resumeChecker?: {
    ui?: ResumeCheckerUITranslations
  }
}

/**
 * Generates static params for all locales.
 * Enables static generation at build time for all supported languages.
 */
export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }))
}

/**
 * Generates dynamic metadata for the resume job match page.
 * Provides SEO-friendly title and description.
 */
export async function generateMetadata({
  params,
}: ResumeJobMatchPageProps): Promise<Metadata> {
  const t = getTranslations(params.locale, 'tools') as ToolsTranslations
  const { metaTitle, metaDescription } = t.resumeJobMatch

  return {
    title: metaTitle,
    description: metaDescription,
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      type: 'website',
    },
  }
}

/**
 * Resume Job Match page - public access, no authentication required.
 * Users can compare their resume text against job descriptions to find skill gaps.
 * This is a Server Component.
 */
export default async function ResumeJobMatchPage({
  params,
}: ResumeJobMatchPageProps) {
  const { locale } = params
  const t = getTranslations(locale, 'tools') as ToolsTranslations

  // Get resume checker translations for shared components (resume selector)
  const checkerUI = t.resumeChecker?.ui

  /**
   * Map the available JSON translations to the ResumeJobMatchTranslations interface.
   * Some fields are derived from existing translations or use sensible defaults
   * since not all interface fields exist in the current translation files.
   */
  const clientTranslations: ResumeJobMatchTranslations = {
    // Section headers - use translations or fallback
    inputSection: t.resumeJobMatch.ui.inputSection || 'Input',
    resultsSection: t.resumeJobMatch.ui.resultsSection || 'Results',

    // Tab labels
    tabLinkResume: t.resumeJobMatch.ui.tabLinkResume,
    tabPasteText: t.resumeJobMatch.ui.tabPasteText,
    tabUploadFile: t.resumeJobMatch.ui.tabUploadFile,
    tabMyResumes: t.resumeJobMatch.ui.tabMyResumes,

    // Resume input translations
    resumeLabel: t.resumeJobMatch.ui.resumeLabel,
    resumePlaceholder: t.resumeJobMatch.ui.resumePlaceholder,
    resumeMinCharsError: t.resumeJobMatch.ui.minCharsError,

    // File upload translations
    uploadLabel: t.resumeJobMatch.ui.uploadLabel,
    dragDropText: t.resumeJobMatch.ui.dragDropText,
    browseText: t.resumeJobMatch.ui.browseText,
    acceptedFilesText: t.resumeJobMatch.ui.acceptedFilesText,
    fileTooLargeError: t.resumeJobMatch.ui.fileTooLargeError,
    unsupportedFileError: t.resumeJobMatch.ui.unsupportedFileError,
    extractionFailedError: t.resumeJobMatch.ui.extractionFailedError,
    extractingText: t.resumeJobMatch.ui.extractingText,
    removeFileLabel: t.resumeJobMatch.ui.removeFileLabel,

    // Job description input translations
    jobLabel: t.resumeJobMatch.ui.jobLabel,
    jobPlaceholder: t.resumeJobMatch.ui.jobPlaceholder,
    jobMinCharsError: t.resumeJobMatch.ui.minCharsError,

    // Button translations
    analyzeButton: t.resumeJobMatch.ui.analyzeButton,
    analyzingButton: t.resumeJobMatch.ui.analyzingButton,

    // Result translations
    matchScore: t.resumeJobMatch.ui.matchScore,
    matchedSkills: t.resumeJobMatch.ui.matchedSkills,
    missingSkills: t.resumeJobMatch.ui.missingSkills,
    recommendations: t.resumeJobMatch.ui.recommendations,
    strengths: t.resumeJobMatch.ui.strengths,
    emptyStateTitle: t.resumeJobMatch.ui.emptyStateTitle || 'Ready to Analyze',
    emptyStateDescription: t.resumeJobMatch.ui.emptyState,
    analyzedAt: t.resumeJobMatch.ui.analyzedAt || 'Analyzed at',
    noSkillsFound: t.resumeJobMatch.ui.noSkillsFound || 'No matched skills found',
    noMissingSkills: t.resumeJobMatch.ui.noMissingSkills || 'No missing skills identified',
    noRecommendations: t.resumeJobMatch.ui.noRecommendations || 'No recommendations available',
    noStrengths: t.resumeJobMatch.ui.noStrengths || 'No strengths identified',

    // Toast messages
    analysisComplete: t.resumeJobMatch.ui.analysisComplete || 'Analysis complete',
    analysisFailed: t.resumeJobMatch.ui.analysisFailed || 'Analysis failed. Please try again.',
    connectionError: t.resumeJobMatch.ui.connectionError || 'Connection error. Please check your network and try again.',

    // Resume selector translations (reuse from resume checker or provide defaults)
    selectSavedResume:
      t.resumeJobMatch.ui.selectSavedResume || 'Select a saved resume',
    orPasteManually:
      t.resumeJobMatch.ui.orPasteManually || 'or paste manually',
    loadingResumes: checkerUI?.loadingResumes || 'Loading your resumes...',
    tryAgain: checkerUI?.tryAgain || 'Try again',
    noResumesFound: checkerUI?.noResumesFound || 'No resumes found',
    noResumesDescription:
      checkerUI?.noResumesDescription ||
      'Create your first resume to get started.',
    createResume: checkerUI?.createResume || 'Create Resume',
    updated: checkerUI?.updated || 'Updated',
    loginRequired: checkerUI?.loginRequired || 'Please log in to view your resumes',
    loadError: checkerUI?.loadError || 'Failed to load resumes. Please try again.',
    loadingResumeContent:
      t.resumeJobMatch.ui.loadingResumeContent || 'Loading resume content...',
    resumeLoadError:
      t.resumeJobMatch.ui.resumeLoadError || 'Failed to load resume content.',

    // Link to resume tab translations
    linkResumeTitle:
      t.resumeJobMatch.ui.linkResumeTitle || 'Link to a Saved Resume',
    linkResumeDescription:
      t.resumeJobMatch.ui.linkResumeDescription ||
      'Connect one of your saved resumes directly for quick analysis.',
    linkResumeLoginPrompt:
      t.resumeJobMatch.ui.linkResumeLoginPrompt ||
      'Sign in to link your saved resumes.',

    // Job input tab translations
    tabJobPaste: t.resumeJobMatch.ui.tabJobPaste || 'Paste text',
    tabJobLink: t.resumeJobMatch.ui.tabJobLink || 'Link to job',
    linkJobTitle: t.resumeJobMatch.ui.linkJobTitle || 'Link to a saved job',
    linkJobDescription:
      t.resumeJobMatch.ui.linkJobDescription ||
      'Select a job from your tracked applications',
    linkJobLoginPrompt:
      t.resumeJobMatch.ui.linkJobLoginPrompt ||
      'Sign in to link to your saved jobs',

    // ResumeLinker translations
    resumeLinker: {
      selectResumeDropdown: checkerUI?.loadingResumes ? 'Select a resume' : 'Select a resume',
      noResumesAvailable: checkerUI?.noResumesFound || 'No resumes found',
      createResumePrompt:
        checkerUI?.noResumesDescription ||
        'Create your first resume to get started.',
      lastUpdated: checkerUI?.updated || 'Updated',
      loadingResumes: checkerUI?.loadingResumes || 'Loading your resumes...',
      tryAgain: checkerUI?.tryAgain || 'Try again',
      loginRequired:
        checkerUI?.loginRequired || 'Please log in to view your resumes',
      loadError:
        checkerUI?.loadError || 'Failed to load resumes. Please try again.',
      createResume: checkerUI?.createResume || 'Create Resume',
      clearSelection: 'Clear selection',
    } satisfies ResumeLinkerTranslations,

    // JobLinker translations
    jobLinker: {
      selectJobDropdown: 'Select a job',
      noJobsAvailable: 'No jobs found',
      createJobPrompt: 'Save job applications to link them here.',
      company: 'Company',
      loadingJobs: 'Loading your jobs...',
      tryAgain: checkerUI?.tryAgain || 'Try again',
      loginRequired: checkerUI?.loginRequired || 'Please log in to view your jobs',
      loadError: 'Failed to load jobs. Please try again.',
      browseJobs: 'Browse Jobs',
      clearSelection: 'Clear selection',
    } satisfies JobLinkerTranslations,

    // Job description loading states
    loadingJobDescription:
      t.resumeJobMatch.ui.loadingJobDescription || 'Loading job description...',
    jobDescriptionLoadError:
      t.resumeJobMatch.ui.jobDescriptionLoadError || 'Failed to load job description.',
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 overflow-x-hidden">
      {/* Hero Section - Gradient from teal to slate */}
      <section className="bg-gradient-to-br from-teal-600 via-teal-500 to-slate-600 px-4 py-10 sm:px-6 sm:py-16 md:py-20 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl text-center">
          {/* Back Link */}
          <Link
            href={`/${locale}/tools`}
            className="mb-4 sm:mb-6 inline-flex items-center gap-2 text-sm font-medium text-teal-100 transition-colors hover:text-white min-h-[44px] px-2 -mx-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.detail.backToTools}
          </Link>

          <h1 className="mt-2 sm:mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">
            {t.resumeJobMatch.title}
          </h1>

          <p className="mx-auto mt-3 sm:mt-4 max-w-2xl text-base text-teal-100 sm:mt-6 sm:text-lg md:text-xl leading-relaxed">
            {t.resumeJobMatch.subtitle}
          </p>
        </div>
      </section>

      {/* Content Section - No auth required */}
      <section className="px-4 py-6 sm:px-6 sm:py-8 md:py-12 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <ResumeJobMatchClient
            locale={locale}
            translations={clientTranslations}
          />
        </div>
      </section>
    </div>
  )
}
