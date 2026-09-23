/* ===== FALAJ assistant — Claude + MCP tools agent loop ===== */
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.FALAJ_MODEL || 'claude-opus-5';
const EFFORT = process.env.FALAJ_EFFORT || 'medium';
const MAX_STEPS = Number(process.env.FALAJ_MAX_STEPS || 12);
// Server-side refusal fallback (Claude API only). Set FALAJ_FALLBACKS=off on Bedrock/Vertex/Foundry.
const FALLBACKS = process.env.FALAJ_FALLBACKS !== 'off';

const LANG_NAMES = { en: 'English', ar: 'Arabic (Gulf/Emirati-friendly Modern Standard Arabic)', ur: 'Urdu', hi: 'Hindi' };

const SYSTEM_PROMPT = `You are the FALAJ smart-farming assistant (مساعد فلج الذكي). FALAJ is a UAE IoT smart-irrigation system that helps farmers save water.

You help farmers with irrigation, soil moisture, crop health, pests, fertilizer, weather, market prices and harvest timing.
You are connected to tools over MCP. Tool names look like "<server>__<tool>"; tools from the "falaj" server read the farm's live sensors and control irrigation. Other servers may add more capabilities — use whatever fits the question.

How to work:
- For anything about this farm (zones, moisture, devices, fields, prices, weather), look it up with the tools instead of guessing. Quote the real numbers.
- Tools that change the farm (for example start_irrigation) run only when the farmer clearly asks for that action. If they just ask whether to water, recommend and offer to start it.
- Reply in the farmer's language. Keep answers short and practical: a direct answer first, then at most a few bullet points. Use AED and metric units.
- If a tool fails or data is missing, say so plainly and give the best general advice.`;

export class FalajAgent {
  constructor(hub, { client } = {}) {
    this.hub = hub;
    this.client = client || new Anthropic();
  }

  /**
   * @param {Array<{role:'user'|'assistant', content:any}>} history  prior turns (plain text is fine)
   * @param {string} userText  the new message
   * @param {{lang?:string, app?:object}} ctx  optional context from the app
   * @param {(ev:object)=>void} [onEvent]  progress callback: {type:'tool', name, input} / {type:'tool_result', name, is_error}
   * @returns {Promise<{text:string, tools:Array, stop_reason:string, messages:Array}>}
   */
  async chat(history, userText, ctx = {}, onEvent = () => {}) {
    const messages = [...history, { role: 'user', content: userText }];
    const tools = this.hub.claudeTools();
    const system = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }];
    const ctxText = contextText(ctx);
    if (ctxText) system.push({ type: 'text', text: ctxText });

    const used = [];
    let message;
    for (let step = 0; step < MAX_STEPS; step++) {
      message = await this.client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort: EFFORT },
        system,
        tools,
        messages,
        cache_control: { type: 'ephemeral' },
        ...(FALLBACKS ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      });

      if (message.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: message.content }); continue; }
      if (message.stop_reason !== 'tool_use') break;

      const calls = message.content.filter((b) => b.type === 'tool_use');
      messages.push({ role: 'assistant', content: message.content });
      // Run every tool call of this turn in parallel; return all results in one user message.
      const results = await Promise.all(calls.map(async (c) => {
        onEvent({ type: 'tool', name: c.name, input: c.input });
        const r = await this.hub.call(c.name, c.input);
        used.push({ name: c.name, input: c.input, is_error: r.is_error });
        onEvent({ type: 'tool_result', name: c.name, is_error: r.is_error });
        return { type: 'tool_result', tool_use_id: c.id, content: r.content, ...(r.is_error ? { is_error: true } : {}) };
      }));
      messages.push({ role: 'user', content: results });
    }

    let text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (message.stop_reason === 'refusal') text = text || "Sorry, I can't help with that request.";
    else if (message.stop_reason === 'tool_use') text = text || 'I ran out of steps before finishing — please ask again more specifically.';
    messages.push({ role: 'assistant', content: message.content });
    return { text, tools: used, stop_reason: message.stop_reason, model: message.model, messages };
  }
}

function contextText({ lang, app } = {}) {
  const parts = [];
  if (lang && LANG_NAMES[lang]) parts.push(`The farmer's app language is ${LANG_NAMES[lang]} — answer in it unless they write in another language.`);
  if (app && typeof app === 'object') parts.push(`What the farmer currently sees in the FALAJ app (may be newer than tool data):\n${JSON.stringify(app).slice(0, 6000)}`);
  return parts.join('\n\n');
}

export { MODEL };
