import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import { ToolCard } from "@/components/marketing/tool-card";
import {
  FileCheck,
  Target,
  PenLine,
  MessageSquareText,
  SpellCheck,
  FileSearch,
  FileCheck2,
} from "lucide-react";

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
 * Tools data - defines all 7 career tools.
 * Each tool has an icon, title, description, and href.
 */
const tools = [
  {
    icon: FileCheck,
    title: "Resume Checker",
    description:
      "Analyze your resume for completeness and formatting issues. Get actionable insights to ensure your document meets professional standards.",
    href: "/tools/resume-checker",
  },
  {
    icon: Target,
    title: "Resume Job Description Match",
    description:
      "Compare your resume against specific job postings. Identify missing keywords and skills to improve your application success rate.",
    href: "/tools/resume-job-match",
  },
  {
    icon: PenLine,
    title: "Cover Letter Generator",
    description:
      "Create compelling cover letters tailored to your target role. Our AI crafts personalized content that highlights your relevant qualifications.",
    href: "/tools/cover-letter-generator",
  },
  {
    icon: MessageSquareText,
    title: "Resume Reviewer",
    description:
      "Receive detailed feedback on your resume content and structure. Understand what recruiters look for and how to strengthen your narrative.",
    href: "/tools/resume-reviewer",
  },
  {
    icon: SpellCheck,
    title: "Resume Grammar Checker",
    description:
      "Scan your resume for spelling mistakes, grammatical errors, and inconsistent punctuation. Present a polished document to potential employers.",
    href: "/tools/resume-grammar-checker",
  },
  {
    icon: FileSearch,
    title: "CV Checker",
    description:
      "Evaluate your CV for academic and professional positions. Ensure your curriculum vitae follows industry conventions and showcases your achievements.",
    href: "/tools/cv-checker",
  },
  {
    icon: FileCheck2,
    title: "Cover Letter Checker",
    description:
      "Review your cover letter for tone, clarity, and persuasiveness. Make sure your introduction makes a strong first impression on hiring managers.",
    href: "/tools/cover-letter-checker",
  },
];

/**
 * Tools landing page - showcases all available career tools.
 * This is a Server Component that renders a static marketing page.
 */
export default async function ToolsPage({ params }: ToolsPageProps) {
  const { locale } = params;

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Career Tools
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-slate-500">
            Everything you need to land your dream job. Our suite of free tools
            helps you create professional CVs, optimize your resume, and track
            your applications.
          </p>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard
                key={tool.href}
                icon={tool.icon}
                title={tool.title}
                description={tool.description}
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
            Ready to boost your career?
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-teal-50">
            Start using our free tools today and land your dream job faster.
          </p>
          <div className="mt-10">
            <a
              href={`/${locale}/signup`}
              className="inline-block rounded-lg bg-white px-8 py-3 text-base font-semibold text-teal-600 shadow-sm transition-all hover:bg-teal-50"
            >
              Get Started Free
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
