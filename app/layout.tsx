import type { Metadata, Viewport } from "next";
import { Aref_Ruqaa, Reem_Kufi, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

/* الخطوط — تُحمَّل ذاتياً عبر next/font (بلا طلب خارجي وقت التشغيل، أفضل لـ Lighthouse) */
const aref = Aref_Ruqaa({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-aref",
  display: "swap",
});

const reem = Reem_Kufi({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-reem",
  display: "swap",
});

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "الأمن الغذائي — سفراء الزراعة الشبابية",
  description:
    "المنظومة الوطنية للأمن الغذائي في دولة الإمارات — برنامج سفراء الزراعة الشبابية.",
};

export const viewport: Viewport = {
  themeColor: "#242b10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${aref.variable} ${reem.variable} ${plex.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
