import "server-only";
import { db } from "@/lib/db";
import { chunkText } from "./chunking";
import { getEmbedder } from "./embeddings";
import { getVectorStore } from "./vector-store";
import { lessonPlainText } from "@/lib/content/lesson";

/**
 * Indexer: Course content → chunks → embeddings → vector store.
 * Called on publish (course builder), on seed, and from the admin "Reindex" action.
 */
export async function indexLesson(lessonId: string) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { module: { select: { courseId: true } } } });
  if (!lesson) return 0;
  const embedder = await getEmbedder();
  const store = await getVectorStore();
  await db.contentChunk.deleteMany({ where: { lessonId } });
  let count = 0;
  for (const locale of ["en", "ar"] as const) {
    const text = lessonPlainText(lesson.content, locale);
    if (!text.trim()) continue;
    const title = locale === "ar" ? lesson.titleAr : lesson.titleEn;
    const chunks = chunkText(`${title}\n\n${text}`);
    const created = await db.$transaction(
      chunks.map((c) => db.contentChunk.create({ data: { courseId: lesson.module.courseId, lessonId, source: "lesson", title, locale, content: c.content, tokenCount: c.tokenCount, order: c.order, embedModel: embedder.id } })),
    );
    const embeddings = await embedder.embed(created.map((c) => c.content));
    await store.upsert(created.map((c, i) => ({ id: c.id, embedding: embeddings[i] })));
    count += created.length;
  }
  return count;
}

export async function indexCourse(courseId: string) {
  const lessons = await db.lesson.findMany({ where: { module: { courseId } }, select: { id: true } });
  let total = 0;
  for (const l of lessons) total += await indexLesson(l.id);
  return total;
}

export async function indexAllPublished() {
  const courses = await db.course.findMany({ where: { status: "PUBLISHED" }, select: { id: true } });
  let total = 0;
  for (const c of courses) total += await indexCourse(c.id);
  return total;
}
