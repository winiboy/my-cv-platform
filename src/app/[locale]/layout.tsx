import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import NextAuthSessionProvider from "@/components/providers/session-provider";
import { ToastProvider } from "@/components/ui/toast";
import { getTranslations, type Locale } from "@/lib/i18n";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata({
  params,
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const t = getTranslations(params.locale, "common") as any;

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

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: Locale };
}) {
  return (
    <html lang={params.locale}>
      <body className={inter.className}>
        <NextAuthSessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
