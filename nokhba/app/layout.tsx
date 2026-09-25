import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans_Arabic, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getLocale } from "@/lib/i18n/server";
import { getMessages } from "@/lib/i18n/messages";
import { dirOf } from "@/lib/i18n/config";
import { siteConfig } from "@/config/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-arabic", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${siteConfig.name} — ${siteConfig.tagline}`, template: `%s · ${siteConfig.name}` },
  description: "Personalized learning paths, expert content, real-world projects, and an AI tutor that learns how you learn.",
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f5f7" }, { media: "(prefers-color-scheme: dark)", color: "#0f1115" }],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return (
    <html lang={locale} dir={dirOf(locale)} suppressHydrationWarning className={`${inter.variable} ${plexArabic.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers locale={locale} messages={messages}>{children}</Providers>
      </body>
    </html>
  );
}
