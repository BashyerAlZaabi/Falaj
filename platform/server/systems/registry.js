// Registry of the enterprise systems plugged into the platform (strategy,
// performance, meetings, integrity, audit, procurement, providers, ideas,
// awards, surveys, integrations, personal goals).
//
// Each system is a self-contained module in server/systems/<key>.js that calls
// defineSystem({...}) at import time. The platform wires everything else:
// schema + demo seed, an authorised router at /api/sys/<key>, Ask AI tools and
// an agent, local-planner intents, Home workspace cards, derived excellence
// points, data domains with an AI policy, and capability catalogue.
//
// Contract (all optional except key/names/icon/access):
//   key, name_ar, name_en, description_ar, description_en, icon (lucide key),
//   category: 'strategy' | 'governance' | 'people' | 'operations' | 'platform'
//   external: true when the system has a portal for external users
//   access(user) -> boolean              who may open the system at all
//   defaultPinned(user) -> boolean       shown in the sidebar unless the user unpins it
//   caps: [{ cap, ar, en, external? }]   capabilities this system checks (granted by admins)
//   domains: [{ key, name_ar, name_en, classification: internal|confidential|restricted,
//               ai: allowed|opt_in|off, locked?: true, note_ar, note_en }]
//   schema()                             CREATE TABLE IF NOT EXISTS … (idempotent)
//   seed()                               demo data (idempotent; only when SEED_DEMO != 0)
//   routes(router)                       express.Router mounted at /api/sys/<key> (access already checked)
//   publicRoutes(router)                 mounted at /pub/sys/<key> WITHOUT a session (calendar feeds…);
//                                        every handler must authenticate a secret, revocable token itself
//   tools: [ { name: '<key>_…', domain, description, input_schema, handler, mutates?, destructive?, format? } ]
//   agent: { name_ar, name_en, description_ar, description_en, instructions }
//   intents: [ { test(n, clause) -> bool, plan(user, clause, ctx, helpers) -> steps|null } ]
//   workspace(user) -> cards[]           Home "my systems" cards
//   gameRules: [{ key, points, ar, en }]  gameEvents(userId) -> [{ kind, points, at, ref, id }]
export const SYSTEMS = new Map();

const KEY = /^[a-z][a-z0-9_]{1,30}$/;
export function defineSystem(def) {
  if (!KEY.test(def.key || '')) throw new Error(`invalid system key ${def.key}`);
  if (SYSTEMS.has(def.key)) throw new Error(`system ${def.key} defined twice`);
  for (const t of def.tools || []) {
    if (!t.name.startsWith(`${def.key}_`)) throw new Error(`tool ${t.name} must be prefixed with ${def.key}_`);
    t.system = def.key;
  }
  SYSTEMS.set(def.key, { access: () => true, external: false, caps: [], domains: [], tools: [], intents: [], gameRules: [], ...def });
  return SYSTEMS.get(def.key);
}

export const systemOf = (key) => SYSTEMS.get(key) || null;

// Internal-only systems are never reachable by external identities, whatever
// the system's own access() says.
export function canAccess(user, key) {
  const s = SYSTEMS.get(key);
  if (!s || !user) return false;
  if (user.user_type === 'external' && !s.external) return false;
  try { return !!s.access(user); } catch { return false; }
}
export const accessibleSystems = (user) => [...SYSTEMS.values()].filter((s) => canAccess(user, s.key));
export const allCaps = () => [...SYSTEMS.values()].flatMap((s) => (s.caps || []).map((c) => ({ ...c, system: s.key })));

// Derived excellence points contributed by systems (consumed by services/game.js).
export function systemGameEvents(userId) {
  const out = [];
  for (const s of SYSTEMS.values()) {
    if (!s.gameEvents) continue;
    try { for (const e of s.gameEvents(userId) || []) if (e && e.at && e.points > 0) out.push({ ...e, entity: `sys:${s.key}` }); }
    catch (e) { console.error(`[systems] gameEvents ${s.key}:`, e.message); }
  }
  return out;
}
export const systemGameRules = () => [...SYSTEMS.values()].flatMap((s) => (s.gameRules || []).map((r) => ({ ...r, system: s.key })));
