import type { ZodType } from "zod";
import { AiError } from "./types";

/** Tolerant JSON extraction: whole text → fenced block → first {…}/[…] span. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const attempts = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) attempts.push(fence[1].trim());
  const first = trimmed.search(/[[{]/);
  const lastBrace = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (first >= 0 && lastBrace > first) attempts.push(trimmed.slice(first, lastBrace + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try next */
    }
  }
  throw new AiError("invalid_output", "Model did not return valid JSON");
}

export function parseStructured<T>(text: string, schema: ZodType<T>): T {
  const raw = extractJson(text);
  const result = schema.safeParse(raw);
  if (!result.success) throw new AiError("invalid_output", `Structured output failed validation: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return result.data;
}
