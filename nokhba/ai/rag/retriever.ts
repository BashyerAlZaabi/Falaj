import "server-only";
import type { RetrievedChunk } from "../types";
import { getEmbedder } from "./embeddings";
import { getVectorStore } from "./vector-store";

/** Embed the query and return the most relevant approved content chunks. */
export async function retrieve(query: string, opts: { courseId?: string | null; lessonId?: string | null; locale?: "en" | "ar"; limit?: number }): Promise<RetrievedChunk[]> {
  const [embedder, store] = await Promise.all([getEmbedder(), getVectorStore()]);
  const [embedding] = await embedder.embed([query.slice(0, 2000)]);
  const results = await store.search(embedding, { limit: opts.limit ?? 6, courseId: opts.courseId, lessonId: opts.lessonId, locale: opts.locale });
  // If the scope is a single course but nothing matched, widen to the whole catalogue.
  if (!results.length && opts.courseId) return store.search(embedding, { limit: opts.limit ?? 6, locale: opts.locale });
  return results;
}
