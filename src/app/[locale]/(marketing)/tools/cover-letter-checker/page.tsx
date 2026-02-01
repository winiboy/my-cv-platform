import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LogIn } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { locales, getTranslations } from "@/lib/i18n";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  CoverLetterCheckerClient,
  type CoverLetterCheckerAllTranslations,
} from "@/components/tools/cover-letter-checker-client";

interface CoverLetterCheckerPageProps {
  params: {
    locale: Locale;
  };
}

/**
 * Type definition for cover letter checker translations.
 */
interface CoverLetterCheckerPageTranslations {
  title: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  auth: {
    title: string;
    description: string;
    benefits: string[];
    loginButton: string;
    signupButton: string;
  };
  ui: {
    tabs: {
      pasteText: string;
      uploadFile: string;
      linkCoverLetter: string;
    };
    tabJobLink: string;
    tabJobPaste: string;
    loadingCoverLetterContent: string;
    loadingJobDescription: string;
    jobLabel?: string;
    textareaPlaceholder: string;
    characterCount: string;
    minCharsWarning: string;
    jobDescriptionToggle: string;
    jobDescriptionPlaceholder: string;
    checkButton: string;
    checkingButton: string;
    dragDropText: string;
    browseText: string;
    acceptedFilesText: string;
    extractingText: string;
  };
  results: {
    overallScore: string;
    categories: {
      structure: string;
      tone: string;
      clarity: string;
      relevance: string;
      callToAction: string;
    };
    strengths: string;
    improvements: string;
  };
  jobMatch: {
    title: string;
    score: string;
    matchedKeywords: string;
    missingKeywords: string;
    suggestions: string;
  };
  error: {
    tooShort: string;
    uploadFailed: string;
    networkError: string;
    rateLimited: string;
    tryAgain: string;
    coverLetterLoadError?: string;
    jobDescriptionLoadError?: string;
  };
  empty: {
    noResults: string;
    getStarted: string;
  };
}

/**
 * Type definition for cover letter linker translations.
 */
interface CoverLetterLinkerTranslations {
  selectCoverLetterDropdown: string;
  noCoverLettersAvailable: string;
  createCoverLetterPrompt: string;
  company: string;
  lastUpdated: string;
  loadingCoverLetters: string;
  tryAgain: string;
  loginRequired: string;
  loadError: string;
  createCoverLetter: string;
  clearSelection: string;
}

/**
 * Type definition for job linker translations.
 */
interface JobLinkerTranslations {
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
 * Type definition for job URL extraction translations.
 */
interface JobUrlExtractionTranslations {
  label: string;
  placeholder: string;
  extract: string;
  extracting: string;
  clearUrl: string;
  invalidUrl: string;
  emptyUrl: string;
  extractionFailed: string;
  noDescriptionFound: string;
}

/**
 * Type definition for tools translations including detail section.
 */
interface ToolsTranslations {
  detail: {
    backToTools: string;
  };
  coverLetterChecker: CoverLetterCheckerPageTranslations;
  coverLetterCheckerLinker: CoverLetterLinkerTranslations;
  coverLetterCheckerJobLinker: JobLinkerTranslations;
  coverLetterCheckerJobUrlExtraction: JobUrlExtractionTranslations;
}

/**
 * Generates static params for all locales.
 * Enables static generation at build time for all supported languages.
 */
export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}

/**
 * Generates dynamic metadata for the cover letter checker page.
 * Provides SEO-friendly title and description.
 */
export async function generateMetadata({
  params,
}: CoverLetterCheckerPageProps): Promise<Metadata> {
  const t = getTranslations(params.locale, "tools") as ToolsTranslations;
  const { metaTitle, metaDescription } = t.coverLetterChecker;

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
 * Cover Letter Checker page with authentication gate.
 * Shows login prompt for unauthenticated users, or the main UI for authenticated users.
 * This is a Server Component.
 */
export default async function CoverLetterCheckerPage({
  params,
}: CoverLetterCheckerPageProps) {
  const { locale } = params;
  const t = getTranslations(locale, "tools") as ToolsTranslations;

  // Check authentication status using Supabase server client
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;
  const callbackUrl = encodeURIComponent(`/${locale}/tools/cover-letter-checker`);

  // Prepare translations for the client component
  const clientTranslations: CoverLetterCheckerAllTranslations = {
    ui: {
      ...t.coverLetterChecker.ui,
      jobLabel: t.coverLetterChecker.ui.jobLabel || "Job Description",
    },
    results: t.coverLetterChecker.results,
    jobMatch: t.coverLetterChecker.jobMatch,
    error: {
      ...t.coverLetterChecker.error,
      coverLetterLoadError: t.coverLetterChecker.error.coverLetterLoadError || "Failed to load cover letter",
      jobDescriptionLoadError: t.coverLetterChecker.error.jobDescriptionLoadError || "Failed to load job description",
    },
    empty: t.coverLetterChecker.empty,
    coverLetterLinker: t.coverLetterCheckerLinker,
    jobLinker: t.coverLetterCheckerJobLinker,
    jobUrlExtraction: t.coverLetterCheckerJobUrlExtraction,
  };

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
            {t.coverLetterChecker.title}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-xl text-teal-100">
            {t.coverLetterChecker.subtitle}
          </p>
        </div>
      </section>

      {/* Content Section - Auth-gated */}
      {isAuthenticated ? (
        <section className="px-4 py-12 sm:px-6 md:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-7xl">
            <CoverLetterCheckerClient locale={locale} translations={clientTranslations} />
          </div>
        </section>
      ) : (
        <UnauthenticatedContent
          locale={locale}
          translations={t.coverLetterChecker}
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
  translations: CoverLetterCheckerPageTranslations;
  callbackUrl: string;
}) {
  const benefits = translations.auth.benefits;

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
              What you will get:
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
            Don&apos;t have an account?{" "}
            <Link
              href={`/${locale}/signup?callbackUrl=${callbackUrl}`}
              className="font-medium text-teal-600 hover:text-teal-700"
            >
              {translations.auth.signupButton}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
