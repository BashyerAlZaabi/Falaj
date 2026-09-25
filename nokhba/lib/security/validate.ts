import { z, type ZodType } from "zod";
import { HttpError } from "@/lib/auth/session";

/** Parse a JSON body with a zod schema; 400 on failure. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new HttpError(400, `Invalid input: ${result.error.issues.map((i) => `${i.path.join(".") || "body"} ${i.message}`).join("; ")}`);
  return result.data;
}

export function parseQuery<T>(url: string, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) throw new HttpError(400, `Invalid query: ${result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return result.data;
}

export const idSchema = z.string().min(1).max(64);
export const localeSchema = z.enum(["en", "ar"]).default("en");

/** Allowed upload types for project submissions and course files. */
export const ALLOWED_UPLOAD_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/markdown", "application/zip", "application/x-zip-compressed", "text/csv", "application/json", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function validateUpload(file: { type: string; size: number; name: string }) {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) throw new HttpError(400, `File type not allowed: ${file.type || "unknown"}`);
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(400, "File is larger than 25 MB");
  if (/\.(exe|sh|bat|cmd|js|php|dll)$/i.test(file.name)) throw new HttpError(400, "Executable files are not allowed");
}
