import { type Locale } from "@/lib/i18n";
import { Header } from "@/components/marketing/header";
import { Footer } from "@/components/marketing/footer";

export default function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: Locale };
}) {
  return (
    <div className="min-h-screen">
      <Header />
      <main>{children}</main>
      <Footer locale={params.locale} />
    </div>
  );
}
