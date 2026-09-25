import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { RetrievedChunk, VectorStore } from "../types";
import { cosine } from "./embeddings";
import { getAiSettings } from "../config";

/**
 * Default store: embeddings live in ContentChunk.embedding (float[]); similarity is
 * computed in-process over the scoped candidate set (a course has hundreds of chunks,
 * not millions). Good for single-tenant deployments and demos.
 */
export class ArrayVectorStore implements VectorStore {
  readonly id = "postgres-array";

  async upsert(chunks: Array<{ id: string; embedding: number[] }>) {
    await db.$transaction(chunks.map((c) => db.contentChunk.update({ where: { id: c.id }, data: { embedding: c.embedding } })));
  }

  async search(embedding: number[], opts: { limit: number; courseId?: string | null; lessonId?: string | null; locale?: string }): Promise<RetrievedChunk[]> {
    const rows = await db.contentChunk.findMany({
      where: {
        ...(opts.courseId ? { courseId: opts.courseId } : {}),
        ...(opts.locale ? { locale: opts.locale } : {}),
      },
      select: { id: true, title: true, content: true, courseId: true, lessonId: true, source: true, embedding: true },
      take: 2000,
    });
    return rows
      .map((r) => ({ id: r.id, title: r.title, content: r.content, courseId: r.courseId, lessonId: r.lessonId, source: r.source, score: cosine(embedding, r.embedding) + (opts.lessonId && r.lessonId === opts.lessonId ? 0.15 : 0) }))
      .filter((r) => r.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit);
  }
}

/**
 * pgvector store. Requires: CREATE EXTENSION vector; ALTER TABLE "ContentChunk" ADD COLUMN embedding_vec vector(<dims>);
 * CREATE INDEX ON "ContentChunk" USING hnsw (embedding_vec vector_cosine_ops);
 * (see prisma/sql/pgvector.sql). Enabled with RAG_VECTOR_BACKEND=pgvector.
 */
export class PgVectorStore implements VectorStore {
  readonly id = "pgvector";

  async upsert(chunks: Array<{ id: string; embedding: number[] }>) {
    for (const c of chunks) {
      await db.$executeRaw`UPDATE "ContentChunk" SET embedding_vec = ${`[${c.embedding.join(",")}]`}::vector, embedding = ${c.embedding} WHERE id = ${c.id}`;
    }
  }

  async search(embedding: number[], opts: { limit: number; courseId?: string | null; lessonId?: string | null; locale?: string }): Promise<RetrievedChunk[]> {
    const vec = `[${embedding.join(",")}]`;
    const rows = await db.$queryRaw<Array<RetrievedChunk & { distance: number }>>(Prisma.sql`
      SELECT id, title, content, "courseId", "lessonId", source, (embedding_vec <=> ${vec}::vector) AS distance
      FROM "ContentChunk"
      WHERE embedding_vec IS NOT NULL
        ${opts.courseId ? Prisma.sql`AND "courseId" = ${opts.courseId}` : Prisma.empty}
        ${opts.locale ? Prisma.sql`AND locale = ${opts.locale}` : Prisma.empty}
      ORDER BY distance ASC
      LIMIT ${opts.limit}`);
    return rows.map((r) => ({ ...r, score: 1 - r.distance + (opts.lessonId && r.lessonId === opts.lessonId ? 0.15 : 0) }));
  }
}

export async function getVectorStore(): Promise<VectorStore> {
  const s = await getAiSettings();
  return s.vectorBackend === "pgvector" ? new PgVectorStore() : new ArrayVectorStore();
}
