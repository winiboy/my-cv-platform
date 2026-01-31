import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LogIn } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { locales, getTranslations } from "@/lib/i18n";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  GrammarCheckerClient,
  type GrammarCheckerTranslations,
} from "@/components/tools/grammar-checker-client";
import type { ResumeLinkerTranslations } from "@/components/tools/resume-linker";

interface ResumeGrammarCheckerPageProps {
  params: {
    locale: Locale;
  };
}

/**
 * Type definition for grammar checker translations.
 */
interface GrammarCheckerPageTranslations {
  title: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  auth: {
    title: string;
    description: string;
    benefits: {
      title: string;
      spelling: string;
      grammar: string;
      punctuation: string;
      phrasing: string;
    };
    loginButton: string;
    signupPrompt: string;
    signupLink: string;
  };
  authenticated: {
    placeholder: string;
  };
}

/**
 * Type definition for issue card translations within the UI.
 */
interface IssueCardUITranslations {
  typeLabels: {
    spelling: string;
    grammar: string;
    punctuation: string;
    tense: string;
    phrasing: string;
  };
  severityLabels: {
    error: string;
    warning: string;
    suggestion: string;
  };
  original: string;
  suggested: string;
  explanation: string;
  location: string;
}

/**
 * Type definition for results translations within the UI.
 */
interface ResultsUITranslations {
  grammarScore: string;
  issuesFound: string;
  noIssuesFound: string;
  filterAll: string;
  filterSpelling: string;
  filterGrammar: string;
  filterPunctuation: string;
  filterTense: string;
  filterPhrasing: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  noFilterResults: string;
}

/**
 * Type definition for grammar checker UI translations.
 */
interface GrammarCheckerUITranslations {
  inputSection: string;
  resultsSection: string;
  tabLinkResume: string;
  tabMyResumes: string;
  tabPasteText: string;
  tabUploadFile: string;
  checkButton: string;
  checkingButton: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  uploadLabel?: string;
  dragDropText?: string;
  browseText?: string;
  acceptedFilesText?: string;
  fileTooLargeError?: string;
  unsupportedFileError?: string;
  extractionFailedError?: string;
  extractingText?: string;
  removeFileLabel?: string;
  fileSizeLimit?: string;
  pasteLabel?: string;
  pastePlaceholder?: string;
  clearTextButton?: string;
  characterCount?: string;
  minCharactersWarning?: string;
  minCharsError?: string;
  loadingResumes?: string;
  loadError?: string;
  tryAgain?: string;
  noResumesFound?: string;
  noResumesDescription?: string;
  createResume?: string;
  updated?: string;
  loginRequired?: string;
  loadingResumeContent?: string;
  resumeLoadError?: string;
  extractedContent?: string;
  charactersExtracted?: string;
  issueCard?: IssueCardUITranslations;
  results?: ResultsUITranslations;
  analysisComplete?: string;
  analysisFailed?: string;
  checkAgainButton?: string;
}

/**
 * Type definition for tools translations including detail section.
 */
interface ToolsTranslations {
  detail: {
    backToTools: string;
  };
  grammarChecker: GrammarCheckerPageTranslations & {
    ui?: GrammarCheckerUITranslations;
  };
  grammarCheckerLinker?: ResumeLinkerTranslations;
}

/**
 * Generates static params for all locales.
 * Enables static generation at build time for all supported languages.
 */
export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}

/**
 * Builds the translations object for the GrammarCheckerClient component.
 * Combines UI translations with ResumeLinker translations.
 */
function buildClientTranslations(t: ToolsTranslations): GrammarCheckerTranslations {
  const ui = t.grammarChecker.ui;
  const linker = t.grammarCheckerLinker;

  // Default ResumeLinker translations (fallback if not provided)
  const defaultLinkerTranslations: ResumeLinkerTranslations = {
    selectResumeDropdown: "Select a resume",
    noResumesAvailable: "No resumes available",
    createResumePrompt: "Create a resume first",
    lastUpdated: "Last updated",
    loadingResumes: "Loading resumes...",
    tryAgain: "Try again",
    loginRequired: "Please sign in to access your resumes",
    loadError: "Failed to load resumes. Please try again.",
    createResume: "Create Resume",
    clearSelection: "Clear selection",
  };

  return {
    inputSection: ui?.inputSection || "Your Resume",
    resultsSection: ui?.resultsSection || "Grammar Check Results",
    tabLinkResume: ui?.tabLinkResume || "Link to Resume",
    tabMyResumes: ui?.tabMyResumes || "My Resumes",
    tabPasteText: ui?.tabPasteText || "Paste Text",
    tabUploadFile: ui?.tabUploadFile || "Upload File",
    checkButton: ui?.checkButton || "Check Grammar",
    checkingButton: ui?.checkingButton || "Checking...",
    emptyStateTitle: ui?.emptyStateTitle || "No Results Yet",
    emptyStateDescription:
      ui?.emptyStateDescription ||
      "Upload, paste, or select a resume to check for grammar and spelling errors.",
    uploadLabel: ui?.uploadLabel,
    dragDropText: ui?.dragDropText,
    browseText: ui?.browseText,
    acceptedFilesText: ui?.acceptedFilesText,
    fileTooLargeError: ui?.fileTooLargeError,
    unsupportedFileError: ui?.unsupportedFileError,
    extractionFailedError: ui?.extractionFailedError,
    extractingText: ui?.extractingText,
    removeFileLabel: ui?.removeFileLabel,
    fileSizeLimit: ui?.fileSizeLimit,
    pasteLabel: ui?.pasteLabel,
    pastePlaceholder: ui?.pastePlaceholder,
    clearTextButton: ui?.clearTextButton,
    characterCount: ui?.characterCount,
    minCharactersWarning: ui?.minCharactersWarning,
    minCharsError: ui?.minCharsError,
    loadingResumes: ui?.loadingResumes,
    loadError: ui?.loadError,
    tryAgain: ui?.tryAgain,
    noResumesFound: ui?.noResumesFound,
    noResumesDescription: ui?.noResumesDescription,
    createResume: ui?.createResume,
    updated: ui?.updated,
    loginRequired: ui?.loginRequired,
    loadingResumeContent: ui?.loadingResumeContent,
    resumeLoadError: ui?.resumeLoadError,
    extractedContent: ui?.extractedContent,
    charactersExtracted: ui?.charactersExtracted,
    resumeLinker: linker || defaultLinkerTranslations,
    // Results translations with nested issueCard translations
    results: {
      grammarScore: ui?.results?.grammarScore || "Grammar Score",
      issuesFound: ui?.results?.issuesFound || "{count} issues found",
      noIssuesFound: ui?.results?.noIssuesFound || "No issues found",
      filterAll: ui?.results?.filterAll || "All",
      filterSpelling: ui?.results?.filterSpelling || "Spelling",
      filterGrammar: ui?.results?.filterGrammar || "Grammar",
      filterPunctuation: ui?.results?.filterPunctuation || "Punctuation",
      filterTense: ui?.results?.filterTense || "Tense",
      filterPhrasing: ui?.results?.filterPhrasing || "Phrasing",
      emptyStateTitle: ui?.results?.emptyStateTitle || "Your resume looks great!",
      emptyStateDescription: ui?.results?.emptyStateDescription || "No grammar or spelling issues were found.",
      noFilterResults: ui?.results?.noFilterResults || "No {type} issues found",
      issueCard: {
        typeLabels: {
          spelling: ui?.issueCard?.typeLabels?.spelling || "Spelling",
          grammar: ui?.issueCard?.typeLabels?.grammar || "Grammar",
          punctuation: ui?.issueCard?.typeLabels?.punctuation || "Punctuation",
          tense: ui?.issueCard?.typeLabels?.tense || "Tense",
          phrasing: ui?.issueCard?.typeLabels?.phrasing || "Phrasing",
        },
        severityLabels: {
          error: ui?.issueCard?.severityLabels?.error || "Error",
          warning: ui?.issueCard?.severityLabels?.warning || "Warning",
          suggestion: ui?.issueCard?.severityLabels?.suggestion || "Suggestion",
        },
        original: ui?.issueCard?.original || "Original:",
        suggested: ui?.issueCard?.suggested || "Suggested:",
        explanation: ui?.issueCard?.explanation || "Why:",
        location: ui?.issueCard?.location || "Found in:",
      },
    },
    // Toast messages
    analysisComplete: ui?.analysisComplete || "Analysis complete",
    analysisFailed: ui?.analysisFailed || "Failed to analyze grammar",
    // Check again button
    checkAgainButton: ui?.checkAgainButton || "Check Another Resume",
  };
}

/**
 * Generates dynamic metadata for the resume grammar checker page.
 * Provides SEO-friendly title and description.
 */
export async function generateMetadata({
  params,
}: ResumeGrammarCheckerPageProps): Promise<Metadata> {
  const t = getTranslations(params.locale, "tools") as ToolsTranslations;
  const { metaTitle, metaDescription } = t.grammarChecker;

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
 * Resume Grammar Checker page with authentication gate.
 * Shows login prompt for unauthenticated users, or the main UI for authenticated users.
 * This is a Server Component.
 */
export default async function ResumeGrammarCheckerPage({
  params,
}: ResumeGrammarCheckerPageProps) {
  const { locale } = params;
  const t = getTranslations(locale, "tools") as ToolsTranslations;

  // Check authentication status using Supabase server client
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;
  const callbackUrl = encodeURIComponent(`/${locale}/tools/resume-grammar-checker`);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl text-center">
          {/* Back Link */}
          <Link
            href={`/${locale}/tools`}
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-teal-600 transition-colors hover:text-teal-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.detail.backToTools}
          </Link>

          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            {t.grammarChecker.title}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-xl text-slate-500">
            {t.grammarChecker.subtitle}
          </p>
        </div>
      </section>

      {/* Content Section - Auth-gated */}
      {isAuthenticated ? (
        <section className="px-4 py-12 sm:px-6 md:px-8 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-7xl">
            <GrammarCheckerClient
              locale={locale}
              translations={buildClientTranslations(t)}
            />
          </div>
        </section>
      ) : (
        <UnauthenticatedContent
          locale={locale}
          translations={t.grammarChecker}
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
  translations: GrammarCheckerPageTranslations;
  callbackUrl: string;
}) {
  const benefits = [
    translations.auth.benefits.spelling,
    translations.auth.benefits.grammar,
    translations.auth.benefits.punctuation,
    translations.auth.benefits.phrasing,
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
