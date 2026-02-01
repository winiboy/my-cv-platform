import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LogIn } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { locales, getTranslations } from "@/lib/i18n";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  CoverLetterGeneratorClient,
  type CoverLetterGeneratorTranslations,
} from "@/components/tools/cover-letter-generator-client";

interface CoverLetterGeneratorPageProps {
  params: {
    locale: Locale;
  };
}

/**
 * Type definition for cover letter generator translations.
 */
interface CoverLetterGeneratorPageTranslations {
  title: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  auth: {
    title: string;
    description: string;
    benefits: {
      title: string;
      tailored: string;
      professional: string;
      timeSaving: string;
      aiPowered: string;
    };
    loginButton: string;
    signupPrompt: string;
    signupLink: string;
  };
  ui: {
    inputSection: string;
    outputSection: string;
    settingsSection: string;
    resumeLabel: string;
    emptyStateTitle: string;
    emptyStateDescription: string;
    loadingResumeContent: string;
    resumeLoadError: string;
    extractedContent: string;
    charactersExtracted: string;
    // Resume input tab labels
    tabUploadFile: string;
    tabPasteText: string;
    tabMyResumes: string;
    // Resume file upload properties
    uploadLabel: string;
    dragDropText: string;
    browseText: string;
    acceptedFilesText: string;
    fileTooLargeError: string;
    unsupportedFileError: string;
    extractionFailedError: string;
    extractingText: string;
    removeFileLabel: string;
    // Resume text input properties
    resumePlaceholder: string;
    clearTextButton: string;
    // Job description input properties
    jobDescriptionLabel: string;
    jobDescriptionPlaceholder: string;
    tabJobPaste: string;
    tabJobLink: string;
    minCharsError: string;
    // Settings properties
    lengthLabel: string;
    lengthShort: string;
    lengthMedium: string;
    lengthLong: string;
    lengthShortDescription: string;
    lengthMediumDescription: string;
    lengthLongDescription: string;
    toneLabel: string;
    toneProfessional: string;
    toneEnthusiastic: string;
    toneConfident: string;
    toneConversational: string;
    toneProfessionalDescription: string;
    toneEnthusiasticDescription: string;
    toneConfidentDescription: string;
    toneConversationalDescription: string;
    outputLanguageLabel: string;
    outputLanguageEnglish: string;
    outputLanguageFrench: string;
    outputLanguageGerman: string;
    outputLanguageItalian: string;
    customPromptLabel: string;
    customPromptPlaceholder: string;
    // Generation action properties
    generateButton: string;
    generatingButton: string;
    generationComplete: string;
    generationFailed: string;
    connectionError: string;
    emptyResumeError: string;
    emptyJobDescriptionError: string;
    improveButton: string;
    improvingButton: string;
    retryButton: string;
    dismissError: string;
    resumeTooShortError: string;
    jobDescriptionTooShortError: string;
    jobDetails: {
      sectionTitle: string;
      sectionDescription: string;
      noDetailsFound: string;
      fewDetailsFound: string;
      selectToEmphasize: string;
      selectedCount: string;
    };
    emptyStates: {
      resumeHint: string;
      resumeDescription: string;
      jobDescriptionHint: string;
      jobDescriptionDescription: string;
      readyToGenerate: string;
      readyToGenerateDescription: string;
    };
  };
}

/**
 * Type definition for resume linker translations.
 */
interface ResumeLinkerTranslationsType {
  selectResumeDropdown: string;
  noResumesAvailable: string;
  createResumePrompt: string;
  lastUpdated: string;
  loadingResumes: string;
  tryAgain: string;
  loginRequired: string;
  loadError: string;
  createResume: string;
  clearSelection: string;
}

/**
 * Type definition for job linker translations.
 */
interface JobLinkerTranslationsType {
  selectJobDropdown: string;
  noJobsAvailable: string;
  createJobPrompt: string;
  company: string;
  loadingJobs: string;
  tryAgain: string;
  loginRequired: string;
  loadError: string;
  browseJobs: string;
  clearSelection: string;
}

/**
 * Type definition for tools translations including detail section.
 */
interface ToolsTranslations {
  detail: {
    backToTools: string;
  };
  coverLetterGenerator: CoverLetterGeneratorPageTranslations;
  resumeLinker: ResumeLinkerTranslationsType;
  jobLinker: JobLinkerTranslationsType;
}

/**
 * Generates static params for all locales.
 * Enables static generation at build time for all supported languages.
 */
export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}

/**
 * Builds the translation object for the client component.
 * Extracts and maps the required translations from the tools namespace.
 */
function buildClientTranslations(
  t: ToolsTranslations
): CoverLetterGeneratorTranslations {
  return {
    inputSection: t.coverLetterGenerator.ui.inputSection,
    outputSection: t.coverLetterGenerator.ui.outputSection,
    resumeLabel: t.coverLetterGenerator.ui.resumeLabel,
    emptyStateTitle: t.coverLetterGenerator.ui.emptyStateTitle,
    emptyStateDescription: t.coverLetterGenerator.ui.emptyStateDescription,
    loadingResumeContent: t.coverLetterGenerator.ui.loadingResumeContent,
    resumeLoadError: t.coverLetterGenerator.ui.resumeLoadError,
    extractedContent: t.coverLetterGenerator.ui.extractedContent,
    charactersExtracted: t.coverLetterGenerator.ui.charactersExtracted,
    // Resume input tab labels
    tabUploadFile: t.coverLetterGenerator.ui.tabUploadFile,
    tabPasteText: t.coverLetterGenerator.ui.tabPasteText,
    tabMyResumes: t.coverLetterGenerator.ui.tabMyResumes,
    // Resume input method translations
    resumeLinker: {
      selectResumeDropdown: t.resumeLinker.selectResumeDropdown,
      noResumesAvailable: t.resumeLinker.noResumesAvailable,
      createResumePrompt: t.resumeLinker.createResumePrompt,
      lastUpdated: t.resumeLinker.lastUpdated,
      loadingResumes: t.resumeLinker.loadingResumes,
      tryAgain: t.resumeLinker.tryAgain,
      loginRequired: t.resumeLinker.loginRequired,
      loadError: t.resumeLinker.loadError,
      createResume: t.resumeLinker.createResume,
      clearSelection: t.resumeLinker.clearSelection,
    },
    resumeFileUpload: {
      uploadLabel: t.coverLetterGenerator.ui.uploadLabel,
      dragDropText: t.coverLetterGenerator.ui.dragDropText,
      browseText: t.coverLetterGenerator.ui.browseText,
      acceptedFilesText: t.coverLetterGenerator.ui.acceptedFilesText,
      fileTooLargeError: t.coverLetterGenerator.ui.fileTooLargeError,
      unsupportedFileError: t.coverLetterGenerator.ui.unsupportedFileError,
      extractionFailedError: t.coverLetterGenerator.ui.extractionFailedError,
      extractingText: t.coverLetterGenerator.ui.extractingText,
      removeFileLabel: t.coverLetterGenerator.ui.removeFileLabel,
    },
    resumeTextInput: {
      resumeLabel: t.coverLetterGenerator.ui.resumeLabel,
      resumePlaceholder: t.coverLetterGenerator.ui.resumePlaceholder,
      minCharsError: t.coverLetterGenerator.ui.minCharsError,
    },
    // Job description input translations
    jobDescriptionLabel: t.coverLetterGenerator.ui.jobDescriptionLabel,
    tabJobPaste: t.coverLetterGenerator.ui.tabJobPaste,
    tabJobLink: t.coverLetterGenerator.ui.tabJobLink,
    jobDescriptionInput: {
      jobLabel: t.coverLetterGenerator.ui.jobDescriptionLabel,
      jobPlaceholder: t.coverLetterGenerator.ui.jobDescriptionPlaceholder,
      minCharsError: t.coverLetterGenerator.ui.minCharsError,
    },
    jobLinker: {
      selectJobDropdown: t.jobLinker.selectJobDropdown,
      noJobsAvailable: t.jobLinker.noJobsAvailable,
      createJobPrompt: t.jobLinker.createJobPrompt,
      company: t.jobLinker.company,
      loadingJobs: t.jobLinker.loadingJobs,
      tryAgain: t.jobLinker.tryAgain,
      loginRequired: t.jobLinker.loginRequired,
      loadError: t.jobLinker.loadError,
      browseJobs: t.jobLinker.browseJobs,
      clearSelection: t.jobLinker.clearSelection,
    },
    loadingJobDescription: t.coverLetterGenerator.ui.loadingResumeContent, // Reuse loading message
    jobLoadError: t.coverLetterGenerator.ui.resumeLoadError, // Reuse error message for now
    // Job details extraction translations
    jobDetails: {
      sectionTitle: t.coverLetterGenerator.ui.jobDetails.sectionTitle,
      sectionDescription: t.coverLetterGenerator.ui.jobDetails.sectionDescription,
      noDetailsFound: t.coverLetterGenerator.ui.jobDetails.noDetailsFound,
      fewDetailsFound: t.coverLetterGenerator.ui.jobDetails.fewDetailsFound,
      selectToEmphasize: t.coverLetterGenerator.ui.jobDetails.selectToEmphasize,
      selectedCount: t.coverLetterGenerator.ui.jobDetails.selectedCount,
    },
    // Empty states guidance translations
    emptyStates: {
      resumeHint: t.coverLetterGenerator.ui.emptyStates.resumeHint,
      resumeDescription: t.coverLetterGenerator.ui.emptyStates.resumeDescription,
      jobDescriptionHint: t.coverLetterGenerator.ui.emptyStates.jobDescriptionHint,
      jobDescriptionDescription: t.coverLetterGenerator.ui.emptyStates.jobDescriptionDescription,
      readyToGenerate: t.coverLetterGenerator.ui.emptyStates.readyToGenerate,
      readyToGenerateDescription: t.coverLetterGenerator.ui.emptyStates.readyToGenerateDescription,
    },
    // Settings translations
    settings: {
      settingsSection: t.coverLetterGenerator.ui.settingsSection,
      lengthLabel: t.coverLetterGenerator.ui.lengthLabel,
      lengthShort: t.coverLetterGenerator.ui.lengthShort,
      lengthMedium: t.coverLetterGenerator.ui.lengthMedium,
      lengthLong: t.coverLetterGenerator.ui.lengthLong,
      lengthShortDescription: t.coverLetterGenerator.ui.lengthShortDescription,
      lengthMediumDescription: t.coverLetterGenerator.ui.lengthMediumDescription,
      lengthLongDescription: t.coverLetterGenerator.ui.lengthLongDescription,
      toneLabel: t.coverLetterGenerator.ui.toneLabel,
      toneProfessional: t.coverLetterGenerator.ui.toneProfessional,
      toneEnthusiastic: t.coverLetterGenerator.ui.toneEnthusiastic,
      toneConfident: t.coverLetterGenerator.ui.toneConfident,
      toneConversational: t.coverLetterGenerator.ui.toneConversational,
      toneProfessionalDescription: t.coverLetterGenerator.ui.toneProfessionalDescription,
      toneEnthusiasticDescription: t.coverLetterGenerator.ui.toneEnthusiasticDescription,
      toneConfidentDescription: t.coverLetterGenerator.ui.toneConfidentDescription,
      toneConversationalDescription: t.coverLetterGenerator.ui.toneConversationalDescription,
      outputLanguageLabel: t.coverLetterGenerator.ui.outputLanguageLabel,
      outputLanguageEnglish: t.coverLetterGenerator.ui.outputLanguageEnglish,
      outputLanguageFrench: t.coverLetterGenerator.ui.outputLanguageFrench,
      outputLanguageGerman: t.coverLetterGenerator.ui.outputLanguageGerman,
      outputLanguageItalian: t.coverLetterGenerator.ui.outputLanguageItalian,
      customPromptLabel: t.coverLetterGenerator.ui.customPromptLabel,
      customPromptPlaceholder: t.coverLetterGenerator.ui.customPromptPlaceholder,
    },
    // Generation action translations
    generation: {
      generateButton: t.coverLetterGenerator.ui.generateButton,
      generatingButton: t.coverLetterGenerator.ui.generatingButton,
      generationComplete: t.coverLetterGenerator.ui.generationComplete,
      generationFailed: t.coverLetterGenerator.ui.generationFailed,
      connectionError: t.coverLetterGenerator.ui.connectionError,
      emptyResumeError: t.coverLetterGenerator.ui.emptyResumeError,
      emptyJobDescriptionError: t.coverLetterGenerator.ui.emptyJobDescriptionError,
      improveButton: t.coverLetterGenerator.ui.improveButton,
      improvingButton: t.coverLetterGenerator.ui.improvingButton,
      retryButton: t.coverLetterGenerator.ui.retryButton,
      dismissError: t.coverLetterGenerator.ui.dismissError,
      resumeTooShortError: t.coverLetterGenerator.ui.resumeTooShortError,
      jobDescriptionTooShortError: t.coverLetterGenerator.ui.jobDescriptionTooShortError,
    },
  };
}

/**
 * Generates dynamic metadata for the cover letter generator page.
 * Provides SEO-friendly title and description.
 */
export async function generateMetadata({
  params,
}: CoverLetterGeneratorPageProps): Promise<Metadata> {
  const t = getTranslations(params.locale, "tools") as ToolsTranslations;
  const { metaTitle, metaDescription } = t.coverLetterGenerator;

  return {
    title: metaTitle,
    description: metaDescription,
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      type: "website",
    },
  };
}

/**
 * Cover Letter Generator page with authentication gate.
 * Shows login prompt for unauthenticated users, or the generator interface for authenticated users.
 * This is a Server Component.
 */
export default async function CoverLetterGeneratorPage({
  params,
}: CoverLetterGeneratorPageProps) {
  const { locale } = params;
  const t = getTranslations(locale, "tools") as ToolsTranslations;

  // Check authentication status using Supabase server client
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;
  const callbackUrl = encodeURIComponent(`/${locale}/tools/cover-letter-generator`);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-600 via-teal-500 to-slate-600 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl text-center">
          {/* Back Link */}
          <Link
            href={`/${locale}/tools`}
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-teal-100 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.detail.backToTools}
          </Link>

          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {t.coverLetterGenerator.title}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-xl text-teal-100">
            {t.coverLetterGenerator.subtitle}
          </p>
        </div>
      </section>

      {/* Content Section - Auth-gated */}
      {isAuthenticated ? (
        <section className="px-4 py-12 sm:px-6 md:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-7xl">
            <CoverLetterGeneratorClient
              locale={locale}
              translations={buildClientTranslations(t)}
            />
          </div>
        </section>
      ) : (
        <UnauthenticatedContent
          locale={locale}
          translations={t.coverLetterGenerator}
          callbackUrl={callbackUrl}
        />
      )}
    </div>
  );
}

/**
 * Content shown to unauthenticated users.
 * Displays login prompt with benefits list and sign-in CTA.
 */
function UnauthenticatedContent({
  locale,
  translations,
  callbackUrl,
}: {
  locale: Locale;
  translations: CoverLetterGeneratorPageTranslations;
  callbackUrl: string;
}) {
  const benefits = [
    translations.auth.benefits.tailored,
    translations.auth.benefits.professional,
    translations.auth.benefits.timeSaving,
    translations.auth.benefits.aiPowered,
  ];

  return (
    <section className="px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
            <LogIn className="h-8 w-8 text-teal-600" />
          </div>

          {/* Title */}
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {translations.auth.title}
          </h2>

          {/* Description */}
          <p className="mx-auto mt-4 max-w-lg text-center text-slate-500">
            {translations.auth.description}
          </p>

          {/* Benefits List */}
          <div className="mt-8 rounded-xl bg-slate-50 p-6">
            <h3 className="mb-4 font-semibold text-slate-900">
              {translations.auth.benefits.title}
            </h3>
            <ul className="space-y-3">
              {benefits.map((benefit, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-500" />
                  <span className="text-slate-600">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Login Button */}
          <div className="mt-8 text-center">
            <Link
              href={`/${locale}/login?callbackUrl=${callbackUrl}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 px-8 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            >
              <LogIn className="h-5 w-5" />
              {translations.auth.loginButton}
            </Link>
          </div>

          {/* Signup Prompt */}
          <p className="mt-6 text-center text-sm text-slate-500">
            {translations.auth.signupPrompt}{" "}
            <Link
              href={`/${locale}/signup?callbackUrl=${callbackUrl}`}
              className="font-medium text-teal-600 hover:text-teal-700"
            >
              {translations.auth.signupLink}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
