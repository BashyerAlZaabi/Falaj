import { apiHandler, requirePermissionApi } from "@/lib/auth/session";
import { gateway } from "@/ai/gateway";
import { availableProviders } from "@/ai/providers";
import { getAiSettings } from "@/ai/config";

export const dynamic = "force-dynamic";

/** GET /api/ai/status — admin: which provider/model is live and reachable. */
export const GET = apiHandler(async () => {
  await requirePermissionApi("ai.config");
  const [status, settings] = await Promise.all([gateway.status(), getAiSettings()]);
  return Response.json({ status, settings, providers: availableProviders() });
});
