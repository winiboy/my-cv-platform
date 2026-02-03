import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import { getTranslations } from "@/lib/i18n";
import { ToolCard } from "@/components/marketing/tool-card";
import {
  FileCheck,
  Target,
  PenLine,
  MessageSquareText,
  SpellCheck,
  FileCheck2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ResumeCheckerPreview from "@/components/tools/previews/resume-checker-preview";
import GrammarCheckerPreview from "@/components/tools/previews/grammar-checker-preview";
import ResumeReviewerPreview from "@/components/tools/previews/resume-reviewer-preview";
import JobMatchPreview from "@/components/tools/previews/job-match-preview";
import CoverLetterGeneratorPreview from "@/components/tools/previews/cover-letter-generator-preview";
import CoverLetterCheckerPreview from "@/components/tools/previews/cover-letter-checker-preview";

/**
 * Static metadata for the Tools page.
 * Provides SEO-friendly title and description for search engines.
 */
export const metadata: Metadata = {
  title: "Career Tools | CV Builder, Resume Checker & More",
  description:
    "Discover our suite of free career tools including CV builder, resume checker, cover letter generator, and job application tracker. Boost your job search today.",
  openGraph: {
    title: "Career Tools | CV Builder, Resume Checker & More",
    description:
      "Discover our suite of free career tools including CV builder, resume checker, cover letter generator, and job application tracker.",
    type: "website",
  },
};

interface ToolsPageProps {
  params: { locale: Locale };
}

/**
 * Tool definition with icon and translation keys.
 * Translation key maps to tools.json translations.
 */
interface ToolDefinition {
  /** Unique identifier for the tool */
  id: string;
  /** Translation key for i18n (maps to tools.json) */
  titleKey: string;
  /** Translation key for description (same as titleKey, nested) */
  descriptionKey: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Navigation path to the tool */
  href: string;
  /** Preview component to render in the card right panel */
  previewComponent: React.ComponentType;
}

/**
 * Tools data - defines all 6 career tools in display order.
 * Order: Resume Checker, Grammar Checker, Resume Reviewer,
 *        Job Match, Cover Letter Generator, Cover Letter Checker
 */
const tools: ToolDefinition[] = [
  {
    id: "resume-checker",
    titleKey: "resumeChecker",
    descriptionKey: "resumeChecker",
    icon: FileCheck,
    href: "/tools/resume-checker",
    previewComponent: ResumeCheckerPreview,
  },
  {
    id: "resume-grammar-checker",
    titleKey: "resumeGrammarChecker",
    descriptionKey: "resumeGrammarChecker",
    icon: SpellCheck,
    href: "/tools/resume-grammar-checker",
    previewComponent: GrammarCheckerPreview,
  },
  {
    id: "resume-reviewer",
    titleKey: "resumeReviewer",
    descriptionKey: "resumeReviewer",
    icon: MessageSquareText,
    href: "/tools/resume-reviewer",
    previewComponent: ResumeReviewerPreview,
  },
  {
    id: "resume-job-match",
    titleKey: "resumeJobMatch",
    descriptionKey: "resumeJobMatch",
    icon: Target,
    href: "/tools/resume-job-match",
    previewComponent: JobMatchPreview,
  },
  {
    id: "cover-letter-generator",
    titleKey: "coverLetterGenerator",
    descriptionKey: "coverLetterGenerator",
    icon: PenLine,
    href: "/tools/cover-letter-generator",
    previewComponent: CoverLetterGeneratorPreview,
  },
  {
    id: "cover-letter-checker",
    titleKey: "coverLetterChecker",
    descriptionKey: "coverLetterChecker",
    icon: FileCheck2,
    href: "/tools/cover-letter-checker",
    previewComponent: CoverLetterCheckerPreview,
  },
];

/**
 * Tools landing page - showcases all available career tools.
 * This is a Server Component that renders a static marketing page.
 */
export default async function ToolsPage({ params }: ToolsPageProps) {
  const { locale } = params;
  const t = getTranslations(locale, "tools") as {
    tryNow: string;
    page: { title: string; subtitle: string };
    tools: Record<string, { title: string; description: string }>;
    cta: { title: string; subtitle: string; button: string };
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-600 via-teal-500 to-slate-600 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {t.page.title}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-teal-100">
            {t.page.subtitle}
          </p>
        </div>
      </section>

      {/* Tools List - Single Column */}
      <section className="px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col space-y-6">
            {tools.map((tool) => {
              const PreviewComponent = tool.previewComponent;
              return (
                <ToolCard
                  key={tool.id}
                  icon={tool.icon}
                  title={t.tools[tool.titleKey].title}
                  description={t.tools[tool.descriptionKey].description}
                  href={`/${locale}${tool.href}`}
                  ctaText={t.tryNow}
                  preview={<PreviewComponent />}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-teal-500 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t.cta.title}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-teal-50">
            {t.cta.subtitle}
          </p>
          <div className="mt-10">
            <a
              href={`/${locale}/signup`}
              className="inline-block rounded-lg bg-white px-8 py-3 text-base font-semibold text-teal-600 shadow-sm transition-all hover:bg-teal-50"
            >
              {t.cta.button}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
