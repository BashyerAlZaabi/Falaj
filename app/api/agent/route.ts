import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { AGENT_TOOLS, ONBOARDING_TOOL } from "@/lib/agent/tools";

export const runtime = "nodejs";

/**
 * وسيط Anthropic الوحيد (PROMPT §7):
 * 1) يتحقق من JWT عبر GET {SUPABASE_URL}/auth/v1/user
 * 2) حد استهلاك ٤٠ نداء/ساعة لكل مستخدم — في جدول usage لا في الذاكرة
 * 3) يفرض model وmax_tokens من الخادم ولا يثق بالعميل
 * 4) يمرر إلى api.anthropic.com/v1/messages (عبر SDK الرسمي)
 */

const MODEL = "claude-opus-5";
const MAX_TOKENS = 2048;
const HOURLY_LIMIT = 40;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function verifyJwt(token: string): Promise<{ id: string } | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user.id ? { id: user.id } : null;
}

/** عدّ نداءات الساعة الأخيرة ثم سجّل النداء الحالي — عبر REST بجلسة المستخدم (RLS يحصره بصفوفه). */
async function checkAndLogUsage(token: string, userId: string): Promise<boolean> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/usage?select=id&created_at=gte.${encodeURIComponent(hourAgo)}`,
    { headers: { ...headers, Prefer: "count=exact", Range: "0-0" }, cache: "no-store" },
  );
  const contentRange = countRes.headers.get("content-range") ?? "0/0";
  const total = Number(contentRange.split("/")[1] ?? 0);
  if (Number.isFinite(total) && total >= HOURLY_LIMIT) return false;

  await fetch(`${SUPABASE_URL}/rest/v1/usage`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: userId }),
  });
  return true;
}

type AgentRequestBody = {
  messages?: unknown;
  system?: unknown;
  mode?: unknown;
};

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "الخدمة غير مهيأة — مفتاح Anthropic غير موجود على الخادم" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const user = await verifyJwt(token);
  if (!user) {
    return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
  }

  const allowed = await checkAndLogUsage(token, user.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "وصلت حد الاستخدام (٤٠ نداء بالساعة) — جرّب بعد شوي" },
      { status: 429 },
    );
  }

  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const messages = body.messages;
  const system = typeof body.system === "string" ? body.system : "";
  const mode = body.mode === "onboarding" ? "onboarding" : "assistant";

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60) {
    return NextResponse.json({ error: "رسائل غير صالحة" }, { status: 400 });
  }
  if (JSON.stringify(messages).length > 200_000 || system.length > 30_000) {
    return NextResponse.json({ error: "الطلب كبير جداً" }, { status: 413 });
  }

  const localTools =
    mode === "onboarding" ? [ONBOARDING_TOOL] : AGENT_TOOLS;

  const anthropic = new Anthropic();

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: messages as Anthropic.Beta.BetaMessageParam[],
      tools: [
        ...(localTools as unknown as Anthropic.Beta.BetaToolUnion[]),
        // web_search تُضاف بجانب الأدوات المحلية في نفس النداء (PROMPT §7)
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 3,
        } as unknown as Anthropic.Beta.BetaToolUnion,
      ],
    } as Parameters<typeof anthropic.beta.messages.create>[0]);

    const r = response as Anthropic.Beta.BetaMessage;
    return NextResponse.json({
      content: r.content,
      stop_reason: r.stop_reason,
      model: r.model,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "الخدمة مزدحمة حالياً — أعد المحاولة بعد قليل" },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "تعذّر الاتصال بالمساعد" },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
