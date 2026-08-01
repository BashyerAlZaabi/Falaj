import type { Config } from "tailwindcss";

/**
 * الهوية البصرية — أسلوب «تم» TAMM (قرار المالكة).
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
        // الخطأ والنجاح
        rust: "var(--rust)",
        ok: "var(--ok)",
      },
      borderRadius: {
        lg: "16px",
        md: "10px",
        sm: "6px",
      },
      transitionTimingFunction: {
        e: "cubic-bezier(.28,0,.63,1)",
        e2: "cubic-bezier(.4,0,.2,1)",
      },
      fontFamily: {
        // هوية تم: Noto Kufi Arabic للعناوين وNoto Sans Arabic للمتن
        // (بديل مجاني مطابق لطابع خط تم المرخّص)
        title: ["var(--font-head)", "Noto Kufi Arabic", "system-ui", "sans-serif"],
        head: ["var(--font-head)", "Noto Kufi Arabic", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "Noto Sans Arabic", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
