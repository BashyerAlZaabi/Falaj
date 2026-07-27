import type { Config } from "tailwindcss";

/**
 * هوية «برنامج سفراء الزراعة الشبابية» — منقولة حرفياً من مواصفات PROMPT §3.
 * كل رمز هنا يشير إلى متغيّر CSS مُعرّف في app/globals.css :root،
 * فالقيم الفعلية تعيش في مكان واحد وتبقى متاحة كـ CSS variables أيضاً.
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
        // الانحناء: 20 / 14 / 11 فقط
        lg: "20px",
        md: "14px",
        sm: "11px",
      },
      transitionTimingFunction: {
        e: "cubic-bezier(.16,1,.3,1)",
        e2: "cubic-bezier(.4,0,.2,1)",
      },
      fontFamily: {
        // Aref Ruqaa — العنوان الكبير في شاشتين فقط (الدخول واسم المرحلة)
        title: ["var(--font-aref)", "serif"],
        // Reem Kufi — كل عناوين الواجهة
        head: ["var(--font-reem)", "sans-serif"],
        // IBM Plex Sans Arabic — المتن
        body: ["var(--font-plex)", "sans-serif"],
      },
      backgroundImage: {
        grain: "var(--grain)",
      },
    },
  },
  plugins: [],
};

export default config;
