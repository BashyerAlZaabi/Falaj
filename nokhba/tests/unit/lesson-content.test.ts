import { describe, expect, it } from "vitest";
import { lessonPlainText, parseLessonContent } from "@/lib/content/lesson";

const blocks = [
  { type: "text", markdownEn: "# Intro\n\nHello **world**", markdownAr: "# مقدمة\n\nمرحبا" },
  { type: "knowledge_check", questionEn: "2+2?", questionAr: "٢+٢؟", options: [{ textEn: "3", textAr: "٣", correct: false }, { textEn: "4", textAr: "٤", correct: true }] },
  { type: "code", language: "python", instructionsEn: "Return the sum", instructionsAr: "أعد المجموع", starterCode: "def solve(a, b):\n    return a + b" },
  { type: "not-a-block" },
];

describe("lesson content", () => {
  it("parses valid block arrays and rejects garbage", () => {
    expect(parseLessonContent(blocks.slice(0, 3))).toHaveLength(3);
    // one invalid block invalidates the array (the builder validates before saving)
    expect(parseLessonContent(blocks)).toEqual([]);
    expect(parseLessonContent("nope")).toEqual([]);
    expect(parseLessonContent(null)).toEqual([]);
  });

  it("applies defaults to code blocks", () => {
    const [code] = parseLessonContent([blocks[2]]);
    expect(code.type).toBe("code");
    if (code.type === "code") {
      expect(code.entry).toBe("solve");
      expect(code.tests).toEqual([]);
    }
  });

  it("extracts localized plain text for RAG and the AI context", () => {
    const en = lessonPlainText(blocks.slice(0, 3), "en");
    const ar = lessonPlainText(blocks.slice(0, 3), "ar");
    expect(en).toContain("Hello");
    expect(en).toContain("4 (correct)");
    expect(en).toContain("def solve");
    expect(ar).toContain("مرحبا");
    expect(ar).toContain("٤ (correct)");
    expect(ar).not.toContain("Hello");
  });
});
