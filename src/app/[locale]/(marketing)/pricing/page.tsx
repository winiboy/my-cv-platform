import React from "react";
import { getTranslations, type Locale } from "@/lib/i18n";
import { PricingTable } from "@/components/marketing/pricing-table";
import { FAQAccordion } from "@/components/marketing/faq-accordion";
import { Check, X } from "lucide-react";

export default async function PricingPage({
  params,
}: {
  params: { locale: Locale };
}) {
  const marketing = getTranslations(params.locale, "marketing") as any;

  // Feature comparison data
  const comparisonFeatures = [
    {
      category: "CV Builder",
      features: [
        { name: "Number of CVs", free: "1", premium: "Unlimited" },
        { name: "Templates", free: "Basic", premium: "100+ Premium" },
        { name: "PDF Export", free: true, premium: true },
        { name: "Custom Branding", free: false, premium: true },
      ],
    },
    {
      category: "AI Features",
      features: [
        { name: "Basic Analysis", free: true, premium: true },
        { name: "Advanced Analysis", free: false, premium: true },
        { name: "Match Score", free: false, premium: true },
        { name: "Cover Letters", free: "3/month", premium: "Unlimited" },
      ],
    },
    {
      category: "Job Tracking",
      features: [
        { name: "Application Tracking", free: true, premium: true },
        { name: "Chrome Extension", free: false, premium: true },
        { name: "Calendar Integration", free: false, premium: true },
        { name: "Email Reminders", free: false, premium: true },
      ],
    },
    {
      category: "Support",
      features: [
        { name: "Email Support", free: true, premium: true },
        { name: "Priority Support", free: false, premium: true },
        { name: "1-on-1 Coaching", free: false, premium: "Add-on" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            {marketing.pricing.title}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            {marketing.pricing.subtitle}
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <PricingTable
            plans={[
              {
                name: marketing.pricing.free.name,
                price: marketing.pricing.free.price,
                period: marketing.pricing.free.period,
                features: marketing.pricing.free.features,
                cta: marketing.pricing.free.cta,
              },
              {
                name: marketing.pricing.premium.name,
                price: marketing.pricing.premium.price,
                period: marketing.pricing.premium.period,
                features: marketing.pricing.premium.features,
                cta: marketing.pricing.premium.cta,
                badge: marketing.pricing.premium.badge,
                highlighted: true,
              },
            ]}
            locale={params.locale}
          />
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Feature Comparison
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              See exactly what's included in each plan
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">
                      Feature
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-slate-900">
                      Free
                    </th>
                    <th className="bg-teal-50 px-6 py-4 text-center text-sm font-semibold text-slate-900">
                      Premium
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((category, categoryIndex) => (
                    <React.Fragment key={categoryIndex}>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td
                          colSpan={3}
                          className="px-6 py-3 text-sm font-semibold text-slate-900"
                        >
                          {category.category}
                        </td>
                      </tr>
                      {category.features.map((feature, featureIndex) => (
                        <tr
                          key={featureIndex}
                          className="border-b border-slate-100"
                        >
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {feature.name}
                          </td>
                          <td className="px-6 py-4 text-center text-sm">
                            {typeof feature.free === "boolean" ? (
                              feature.free ? (
                                <Check className="mx-auto h-5 w-5 text-teal-600" />
                              ) : (
                                <X className="mx-auto h-5 w-5 text-slate-300" />
                              )
                            ) : (
                              <span className="text-slate-700">{feature.free}</span>
                            )}
                          </td>
                          <td className="bg-teal-50/30 px-6 py-4 text-center text-sm">
                            {typeof feature.premium === "boolean" ? (
                              feature.premium ? (
                                <Check className="mx-auto h-5 w-5 text-teal-600" />
                              ) : (
                                <X className="mx-auto h-5 w-5 text-slate-300" />
                              )
                            ) : (
                              <span className="font-medium text-slate-900">
                                {feature.premium}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {marketing.faq.title}
            </h2>
          </div>
          <FAQAccordion faqs={marketing.faq.items} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-teal-500 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {marketing.cta.title}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-teal-50">
            {marketing.cta.subtitle}
          </p>
          <div className="mt-10">
            <a
              href={`/${params.locale}/signup`}
              className="inline-block rounded-lg bg-white px-8 py-3 text-base font-semibold text-teal-600 shadow-sm transition-all hover:bg-teal-50"
            >
              {marketing.cta.button}
            </a>
            <p className="mt-4 text-sm text-teal-100">{marketing.cta.note}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
