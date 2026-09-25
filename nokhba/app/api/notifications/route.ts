import { z } from "zod";
import { apiHandler, requireUserApi } from "@/lib/auth/session";
import { parseBody } from "@/lib/security/validate";
import { listNotifications, markRead } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

export const GET = apiHandler(async () => {
  const user = await requireUserApi();
  return Response.json({ items: await listNotifications(user.id, 30) });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireUserApi();
  const body = await parseBody(req, z.object({ all: z.boolean().optional(), ids: z.array(z.string()).optional() }));
  const result = await markRead(user.id, body.all ? undefined : body.ids ?? []);
  return Response.json({ updated: result.count });
});
