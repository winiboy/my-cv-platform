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
 * Tool definition with icon and translation key.
 * Translation key maps to tools.json translations.
 */
interface ToolDefinition {
  icon: LucideIcon;
  translationKey: string;
  href: string;
}

/**
 * Tools data - defines all 6 career tools.
 * Each tool has an icon, translation key, and href.
 */
const tools: ToolDefinition[] = [
  {
    icon: FileCheck,
    translationKey: "resumeChecker",
    href: "/tools/resume-checker",
  },
  {
    icon: Target,
    translationKey: "resumeJobMatch",
    href: "/tools/resume-job-match",
  },
  {
    icon: PenLine,
    translationKey: "coverLetterGenerator",
    href: "/tools/cover-letter-generator",
  },
  {
    icon: MessageSquareText,
    translationKey: "resumeReviewer",
    href: "/tools/resume-reviewer",
  },
  {
    icon: SpellCheck,
    translationKey: "resumeGrammarChecker",
    href: "/tools/resume-grammar-checker",
  },
  {
    icon: FileCheck2,
    translationKey: "coverLetterChecker",
    href: "/tools/cover-letter-checker",
  },
];

/**
 * Tools landing page - showcases all available career tools.
 * This is a Server Component that renders a static marketing page.
 */
export default async function ToolsPage({ params }: ToolsPageProps) {
  const { locale } = params;
  const t = getTranslations(locale, "tools") as {
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

      {/* Tools Grid */}
      <section className="px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard
                key={tool.href}
                icon={tool.icon}
                title={t.tools[tool.translationKey].title}
                description={t.tools[tool.translationKey].description}
                href={`/${locale}${tool.href}`}
              />
            ))}
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
