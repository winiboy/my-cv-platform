import { getTranslations, type Locale } from "@/lib/i18n";
import { TestimonialCarousel } from "@/components/marketing/testimonial-carousel";
import { PricingTable } from "@/components/marketing/pricing-table";
import { FAQAccordion } from "@/components/marketing/faq-accordion";
import { HowItWorks } from "@/components/marketing/how-it-works";

export default async function HomePage({
  params,
}: {
  params: { locale: Locale };
}) {
  const marketing = getTranslations(params.locale, "marketing") as any;

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-50 via-slate-50 to-purple-50 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl lg:text-7xl">
              {marketing.hero.headline}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              {marketing.hero.subheadline}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href={`/${params.locale}/signup`}
                className="rounded-lg bg-teal-500 px-8 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-teal-600 hover:shadow-md"
              >
                {marketing.hero.ctaPrimary}
              </a>
              <a
                href="#features"
                className="rounded-lg border border-slate-300 bg-white px-8 py-3 text-base font-semibold text-slate-900 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md"
              >
                {marketing.hero.ctaSecondary}
              </a>
            </div>
            <p className="mt-8 text-sm text-slate-500">
              {marketing.hero.trustedBy}
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="bg-white px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
              {marketing.features.title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              {marketing.features.subtitle}
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {marketing.features.items.map((feature: any, index: number) => (
              <div
                key={index}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
              >
                <h3 className="text-xl font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-3 text-base text-slate-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
              {marketing.howItWorks.title}
            </h2>
          </div>
          <HowItWorks steps={marketing.howItWorks.steps} />
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-white px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
              {marketing.testimonials.title}
            </h2>
          </div>
          <TestimonialCarousel testimonials={marketing.testimonials.items} />
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="bg-slate-50 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
              {marketing.pricing.title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              {marketing.pricing.subtitle}
            </p>
          </div>
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

      {/* FAQ */}
      <section className="bg-white px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
              {marketing.faq.title}
            </h2>
          </div>
          <FAQAccordion faqs={marketing.faq.items} />
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bg-teal-500 px-4 py-20 sm:px-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
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
