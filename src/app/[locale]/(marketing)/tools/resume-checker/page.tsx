import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileCheck, LogIn } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { locales, getTranslations } from "@/lib/i18n";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface ResumeCheckerPageProps {
  params: {
    locale: Locale;
  };
}

/**
 * Type definition for resume checker translations.
 */
interface ResumeCheckerTranslations {
  title: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
  auth: {
    title: string;
    description: string;
    benefits: {
      title: string;
      completeness: string;
      formatting: string;
      ats: string;
      suggestions: string;
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
 * Type definition for tools translations including detail section.
 */
interface ToolsTranslations {
  detail: {
    backToTools: string;
  };
  resumeChecker: ResumeCheckerTranslations;
}

/**
 * Generates static params for all locales.
 * Enables static generation at build time for all supported languages.
 */
export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}

/**
 * Generates dynamic metadata for the resume checker page.
 * Provides SEO-friendly title and description.
 */
export async function generateMetadata({
  params,
}: ResumeCheckerPageProps): Promise<Metadata> {
  const t = getTranslations(params.locale, "tools") as ToolsTranslations;
  const { metaTitle, metaDescription } = t.resumeChecker;

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
 * Resume Checker page with authentication gate.
 * Shows login prompt for unauthenticated users, or the main UI for authenticated users.
 * This is a Server Component.
 */
export default async function ResumeCheckerPage({
  params,
}: ResumeCheckerPageProps) {
  const { locale } = params;
  const t = getTranslations(locale, "tools") as ToolsTranslations;

  // Check authentication status using Supabase server client
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;
  const callbackUrl = encodeURIComponent(`/${locale}/tools/resume-checker`);

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
            {t.resumeChecker.title}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-xl text-slate-500">
            {t.resumeChecker.subtitle}
          </p>
        </div>
      </section>

      {/* Content Section - Auth-gated */}
      {isAuthenticated ? (
        <AuthenticatedContent translations={t.resumeChecker} />
      ) : (
        <UnauthenticatedContent
          locale={locale}
          translations={t.resumeChecker}
          callbackUrl={callbackUrl}
        />
      )}
    </div>
  );
}

/**
 * Content shown to authenticated users.
 * Currently displays a placeholder for the upcoming UI.
 */
function AuthenticatedContent({
  translations,
}: {
  translations: ResumeCheckerTranslations;
}) {
  return (
    <section className="px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-12 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
            <FileCheck className="h-8 w-8 text-teal-600" />
          </div>

          <p className="text-lg text-slate-600">
            {translations.authenticated.placeholder}
          </p>
        </div>
      </div>
    </section>
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
  translations: ResumeCheckerTranslations;
  callbackUrl: string;
}) {
  const benefits = [
    translations.auth.benefits.completeness,
    translations.auth.benefits.formatting,
    translations.auth.benefits.ats,
    translations.auth.benefits.suggestions,
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
