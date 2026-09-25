-- Optional: native vector search with pgvector (https://github.com/pgvector/pgvector).
-- The default RAG backend keeps embeddings in ContentChunk.embedding (float[]) and ranks
-- in application code, which is fine for a few thousand chunks. For larger catalogues run
-- this script once against the database (psql "$DATABASE_URL" -f prisma/sql/pgvector.sql),
-- then set RAG_VECTOR_BACKEND=pgvector (or switch "Vector backend" in Admin › AI) and
-- re-index content from Admin › AI › Re-index. Dimensions must match the embedding
-- provider: 256 for the built-in local embedder, 1536 for OpenAI text-embedding-3-small,
-- 1024 for Voyage voyage-3.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "ContentChunk" ADD COLUMN IF NOT EXISTS embedding_vec vector(256);

-- Back-fill from the float[] column already populated by the indexer.
UPDATE "ContentChunk"
SET embedding_vec = ('[' || array_to_string(embedding, ',') || ']')::vector
WHERE embedding_vec IS NULL AND array_length(embedding, 1) = 256;

-- Approximate nearest-neighbour index (cosine). HNSW needs pgvector >= 0.5.
CREATE INDEX IF NOT EXISTS "ContentChunk_embedding_vec_idx"
  ON "ContentChunk" USING hnsw (embedding_vec vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "ContentChunk_course_locale_idx" ON "ContentChunk" ("courseId", locale);
