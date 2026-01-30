import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { locales, getTranslations } from "@/lib/i18n";

/**
 * Valid tool slugs for the career tools section.
 * Used for static generation and validation.
 */
const VALID_TOOL_SLUGS = [
  "resume-checker",
  "resume-job-match",
  "cover-letter-generator",
  "resume-reviewer",
  "resume-grammar-checker",
  "cv-checker",
  "cover-letter-checker",
] as const;

type ToolSlug = (typeof VALID_TOOL_SLUGS)[number];

interface ToolDetailPageProps {
  params: {
    locale: Locale;
    tool: string;
  };
}

/**
 * Formats a URL slug into a human-readable title.
 * Converts "resume-checker" to "Resume Checker".
 */
function formatToolName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Validates that a tool slug is one of the known valid slugs.
 */
function isValidToolSlug(slug: string): slug is ToolSlug {
  return VALID_TOOL_SLUGS.includes(slug as ToolSlug);
}

/**
 * Generates static params for all tool pages across all locales.
 * This enables static generation at build time.
 */
export function generateStaticParams(): Array<{ locale: Locale; tool: ToolSlug }> {
  const params: Array<{ locale: Locale; tool: ToolSlug }> = [];

  for (const locale of locales) {
    for (const tool of VALID_TOOL_SLUGS) {
      params.push({ locale, tool });
    }
  }

  return params;
}

/**
 * Type definition for tools translations.
 */
interface ToolsTranslations {
  detail: {
    backToTools: string;
    comingSoon: string;
    workingOnIt: string;
    underDevelopment: string;
    exploreOther: string;
    invalidTool: string;
    viewAllTools: string;
    metaTitleSuffix: string;
    metaDescriptionPrefix: string;
  };
}

/**
 * Generates dynamic metadata based on the tool slug.
 * Provides SEO-friendly title and description for each tool page.
 */
export async function generateMetadata({
  params,
}: ToolDetailPageProps): Promise<Metadata> {
  const toolName = formatToolName(params.tool);
  const t = getTranslations(params.locale, "tools") as ToolsTranslations;

  const title = `${toolName} | ${t.detail.metaTitleSuffix}`;
  const description = t.detail.metaDescriptionPrefix.replace("{toolName}", toolName);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

/**
 * Tool detail page - placeholder for individual tool pages.
 * Displays a "Coming Soon" message with consistent styling.
 * This is a Server Component.
 */
export default async function ToolDetailPage({ params }: ToolDetailPageProps) {
  const { locale, tool } = params;
  const toolName = formatToolName(tool);
  const isValid = isValidToolSlug(tool);
  const t = getTranslations(locale, "tools") as ToolsTranslations;

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-20">
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
            {toolName}
          </h1>

          {isValid ? (
            <p className="mx-auto mt-6 max-w-2xl text-xl text-slate-500">
              {t.detail.workingOnIt}
            </p>
          ) : (
            <p className="mx-auto mt-6 max-w-2xl text-xl text-red-500">
              {t.detail.invalidTool}
            </p>
          )}
        </div>
      </section>

      {/* Coming Soon Section */}
      {isValid && (
        <section className="px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-teal-100">
              <Clock className="h-10 w-10 text-teal-600" />
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              {t.detail.comingSoon}
            </h2>

            <p className="mt-6 text-lg text-slate-500">
              The <span className="font-semibold text-slate-700">{toolName}</span> {t.detail.underDevelopment}
            </p>

            <div className="mt-10">
              <Link
                href={`/${locale}/tools`}
                className="inline-block rounded-lg bg-teal-500 px-8 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-teal-600"
              >
                {t.detail.exploreOther}
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Invalid Tool Section */}
      {!isValid && (
        <section className="px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mt-10">
              <Link
                href={`/${locale}/tools`}
                className="inline-block rounded-lg bg-teal-500 px-8 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-teal-600"
              >
                {t.detail.viewAllTools}
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
