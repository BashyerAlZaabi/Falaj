import { describe, expect, it } from "vitest";
import { dirOf, isLocale, pick, pickList } from "@/lib/i18n/config";
import { formatDuration, formatNumber, formatPercent } from "@/lib/i18n/format";

describe("locale helpers", () => {
  it("validates locales and directions", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
  });

  it("picks localized fields with English fallback", () => {
    const course = { titleEn: "Deep Learning", titleAr: "التعلم العميق", summaryEn: "S", summaryAr: "" };
    expect(pick(course, "title", "ar")).toBe("التعلم العميق");
    expect(pick(course, "title", "en")).toBe("Deep Learning");
    expect(pick(course, "summary", "ar")).toBe("S");
    expect(pickList({ outcomesEn: ["a", "b"], outcomesAr: [] }, "outcomes", "ar")).toEqual(["a", "b"]);
  });
});

describe("formatting", () => {
  it("formats numbers per locale", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    // ar-AE uses Latin digits with Arabic grouping conventions; the call must not throw and must keep the value.
    expect(formatNumber(1234.5, "ar")).toMatch(/234/);
    expect(formatNumber(0.5, "ar", { style: "percent" })).toMatch(/50/);
  });
  it("formats percentages and durations", () => {
    expect(formatPercent(42, "en")).toMatch(/42\s?%/);
    expect(formatDuration(45, "en")).toMatch(/45/);
    expect(formatDuration(150, "en")).toMatch(/2/);
  });
});
