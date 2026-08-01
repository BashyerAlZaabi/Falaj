import type { Metadata, Viewport } from "next";
import "./globals.css";

/* هوية آبل: خط النظام (SF على أجهزة آبل) — لا خطوط خارجية تُحمَّل */

export const metadata: Metadata = {
  title: "الأمن الغذائي — سفراء الزراعة الشبابية",
  description:
    "المنظومة الوطنية للأمن الغذائي في دولة الإمارات — برنامج سفراء الزراعة الشبابية.",
};

export const viewport: Viewport = {
  themeColor: "#f5f5f7",
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
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
