import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up", time: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, db: "down", error: (e as Error).message }, { status: 503 });
  }
}
