import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "My CV Platform",
  description: "CV builder with Next.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts for CV Font Carousel - loaded via link for reliability */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Lato:wght@300;400;700&family=Noto+Sans:wght@300;400;500;600;700&family=Nunito+Sans:wght@300;400;500;600;700&family=Open+Sans:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700&family=PT+Sans:wght@400;700&family=Roboto:wght@300;400;500;700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
