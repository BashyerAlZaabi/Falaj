import type { Metadata, Viewport } from "next";
import { Noto_Kufi_Arabic, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";

/* هوية «تم»: Noto Kufi Arabic للعناوين وNoto Sans Arabic للمتن —
   أقرب بديل مجاني لخط تم المرخّص، محمّل ذاتياً عبر next/font */
const kufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-head",
  display: "swap",
});

const sans = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "الأمن الغذائي — سفراء الزراعة الشبابية",
  description:
    "المنظومة الوطنية للأمن الغذائي في دولة الإمارات — برنامج سفراء الزراعة الشبابية.",
};

export const viewport: Viewport = {
  themeColor: "#161038",
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
    <html lang="ar" dir="rtl" className={`${kufi.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
