import Link from 'next/link'
import { getTranslations, type Locale } from '@/lib/i18n'

export async function Footer({ locale }: { locale: Locale }) {
  const t = getTranslations(locale, 'common') as any

  const footerSections = [
    {
      title: t.footer.product,
      links: [
        { name: t.footer.links.resumeBuilder, href: `/${locale}/tools/resume-builder` },
        { name: t.footer.links.jobTracker, href: `/${locale}/tools/job-tracker` },
        { name: t.footer.links.resumeAnalyzer, href: `/${locale}/tools/resume-analyzer` },
        { name: t.footer.links.careerPath, href: `/${locale}/tools/career-path` },
      ],
    },
    {
      title: t.footer.company,
      links: [
        { name: t.footer.links.about, href: `/${locale}/about` },
        { name: t.footer.links.blog, href: `/${locale}/blog` },
      ],
    },
    {
      title: t.footer.resources,
      links: [
        { name: t.footer.links.help, href: `/${locale}/help` },
      ],
    },
    {
      title: t.footer.legal,
      links: [
        { name: t.footer.links.privacy, href: `/${locale}/privacy` },
        { name: t.footer.links.terms, href: `/${locale}/terms` },
      ],
    },
  ]

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
              <ul className="mt-4 space-y-3">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-600 transition-colors hover:text-teal-600"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-slate-200 pt-8">
          <p className="text-center text-sm text-slate-500">{t.footer.copyright}</p>
        </div>
      </div>
    </footer>
  )
}
