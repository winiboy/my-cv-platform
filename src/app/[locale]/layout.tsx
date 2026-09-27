import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { BranchIndicator } from "@/components/ui/branch-indicator";
import { getTranslations, toLocale } from "@/lib/i18n";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(
  props: {
    params: Promise<{ locale: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const t = getTranslations(toLocale(params.locale), "common") as any;

  return {
    title: t.meta.title,
    description: t.meta.description,
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      locale: params.locale,
    },
  };
}

export async function generateStaticParams() {
  return [{ locale: "fr" }, { locale: "de" }, { locale: "en" }, { locale: "it" }];
}

export default async function LocaleLayout(
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
    <html lang={params.locale}>
      <body className={inter.className}>
        <BranchIndicator />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
