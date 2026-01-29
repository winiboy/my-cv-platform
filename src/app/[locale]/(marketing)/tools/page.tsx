import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";

/**
 * Static metadata for the Tools page.
 * Provides SEO-friendly title and description for search engines.
 */
export const metadata: Metadata = {
  title: "Free Career Tools | CV Builder, Resume Checker & More",
  description:
    "Discover our suite of free career tools including CV builder, resume checker, cover letter generator, and job application tracker. Boost your job search today.",
  openGraph: {
    title: "Free Career Tools | CV Builder, Resume Checker & More",
    description:
      "Discover our suite of free career tools including CV builder, resume checker, cover letter generator, and job application tracker.",
    type: "website",
  },
};

interface ToolsPageProps {
  params: { locale: Locale };
}

/**
 * Tools landing page - showcases all available career tools.
 * This is a Server Component that renders a static marketing page.
 */
export default async function ToolsPage({ params }: ToolsPageProps) {
  const { locale } = params;

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            Free Career Tools
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            Everything you need to land your dream job. Our suite of free tools
            helps you create professional CVs, optimize your resume, and track
            your applications.
          </p>
        </div>
      </section>

      {/* Tools Grid Placeholder */}
      <section className="px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Our Tools
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              Professional-grade tools to accelerate your career
            </p>
          </div>

          {/* Placeholder grid - will be populated in future stories */}
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">
                CV Builder
              </h3>
              <p className="mt-3 text-base text-slate-600">
                Create professional CVs with our easy-to-use builder.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">
                Resume Checker
              </h3>
              <p className="mt-3 text-base text-slate-600">
                Get instant feedback on your resume with AI-powered analysis.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-slate-900">
                Cover Letter Generator
              </h3>
              <p className="mt-3 text-base text-slate-600">
                Generate tailored cover letters for any job application.
              </p>
            </div>
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
