import { toLocale } from "@/lib/i18n";
import { Header } from "@/components/marketing/header";
import { Footer } from "@/components/marketing/footer";

export default async function MarketingLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  return (
    <div className="min-h-screen">
      <Header />
      <main>{children}</main>
      <Footer locale={toLocale(params.locale)} />
    </div>
  );
}
