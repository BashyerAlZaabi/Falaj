import type { Config } from "tailwindcss";

/**
 * الهوية البصرية — أسلوب آبل (قرار المالكة، يتجاوز هوية PROMPT §3 الزيتونية).
 * كل رمز يشير إلى متغيّر CSS في app/globals.css :root — القيم هناك حصراً،
 * وأسماء الرموز التاريخية أُبقيت حتى لا تتغيّر ملفات المكوّنات.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // الأسطح
        nacre: "var(--nacre)",
        "nacre-2": "var(--nacre-2)",
        paper: "var(--white)",
        // الداكن
        abyss: "var(--abyss)",
        "abyss-2": "var(--abyss-2)",
        // الحبر ودرجاته
        ink: {
          DEFAULT: "var(--ink)",
          70: "var(--ink-70)",
          45: "var(--ink-45)",
          24: "var(--ink-24)",
        },
        // الأساسي
        falaj: {
          DEFAULT: "var(--falaj)",
          d: "var(--falaj-d)",
          l: "var(--falaj-l)",
        },
        // التمييز
        brass: {
          DEFAULT: "var(--brass)",
          l: "var(--brass-l)",
        },
        // الرملي
        sand: {
          DEFAULT: "var(--sand)",
          l: "var(--sand-l)",
        },
        // الخطأ
        rust: "var(--rust)",
      },
      borderRadius: {
        // الانحناء: 18 / 12 / 8 — منظومة آبل
        lg: "18px",
        md: "12px",
        sm: "8px",
      },
      transitionTimingFunction: {
        e: "cubic-bezier(.28,0,.63,1)",
        e2: "cubic-bezier(.4,0,.2,1)",
      },
      fontFamily: {
        // هوية آبل: خط النظام للجميع (SF على أجهزة آبل) — الأسماء الثلاثة
        // أُبقيت حتى لا تتغيّر ملفات المكوّنات
        title: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Segoe UI", "Roboto", "system-ui", "sans-serif"],
        head: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Segoe UI", "Roboto", "system-ui", "sans-serif"],
        body: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Segoe UI", "Roboto", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
