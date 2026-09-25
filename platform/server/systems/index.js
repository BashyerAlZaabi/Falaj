// Wires the enterprise systems into the platform: schema, demo seed, data
// domains (AI policy), Ask AI agents + tools, authorised routers, the systems
// catalogue, Home workspace cards, per-user preferences and admin controls
// (capability grants, domain AI policy). Every write here is audited.
import express from 'express';
import { one, all, run, tx, now } from '../db.js';
import { registerTools } from '../mcp/tools.js';
import { SYSTEMS, canAccess, accessibleSystems, allCaps } from './registry.js';
import { DEMO, requireConfirm, audit, aiAllowed } from './kit.js';

// Order matters for demo seeds that reference each other (goals → strategy,
// procurement → providers, ideas → strategy).
import './strategy.js';
import './goals.js';
import './performance.js';
import './meetings.js';
import './integrity.js';
import './audit.js';
import './providers.js';
import './procurement.js';
import './ideas.js';
import './awards.js';
import './surveys.js';
import './integrations.js';

const ALL_ROLES = ['employee', 'manager', 'president'];

function prefsFor(userId) {
  return Object.fromEntries(all('SELECT system,pinned,ai_enabled FROM user_system_prefs WHERE user_id=?', userId).map((r) => [r.system, r]));
}
function domainsOf(key) { return all('SELECT * FROM data_domains WHERE system=? ORDER BY key', key); }

export function systemSummary(user, s, prefs = prefsFor(user.id)) {
  const p = prefs[s.key];
  let pinned = p?.pinned;
  if (pinned == null) { try { pinned = s.defaultPinned ? !!s.defaultPinned(user) : true; } catch { pinned = false; } }
  const domains = domainsOf(s.key).map((d) => ({ key: d.key, name_ar: d.name_ar, name_en: d.name_en, classification: d.classification, ai_policy: d.ai_policy, ai_locked: !!d.ai_locked, note_ar: d.note_ar, note_en: d.note_en, ai_active: aiAllowed(user, d.key) }));
  const rank = { internal: 0, confidential: 1, restricted: 2 };
  const classification = domains.reduce((m, d) => (rank[d.classification] > rank[m] ? d.classification : m), 'internal');
  return {
    key: s.key, name_ar: s.name_ar, name_en: s.name_en, description_ar: s.description_ar, description_en: s.description_en,
    icon: s.icon, category: s.category || 'operations', route: `#/sys/${s.key}`, external: !!s.external,
    pinned: !!pinned, ai_enabled: !!p?.ai_enabled, classification, domains,
  };
}
export const systemsFor = (user) => { const prefs = prefsFor(user.id); return accessibleSystems(user).map((s) => systemSummary(user, s, prefs)); };

export function initSystems(app, { requireAdmin }) {
  // 1) schema, data domains, agents, demo seed
  for (const s of SYSTEMS.values()) {
    tx(() => {
      s.schema?.();
      for (const d of s.domains || []) {
        const locked = d.locked ? 1 : 0;
        run(`INSERT INTO data_domains (key,system,name_ar,name_en,classification,ai_policy,ai_locked,note_ar,note_en) VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET name_ar=excluded.name_ar,name_en=excluded.name_en,classification=excluded.classification,ai_locked=excluded.ai_locked,note_ar=excluded.note_ar,note_en=excluded.note_en,
          ai_policy=CASE WHEN excluded.ai_locked=1 THEN excluded.ai_policy ELSE data_domains.ai_policy END`,
        d.key, s.key, d.name_ar, d.name_en, d.classification, locked ? 'off' : d.ai, locked, d.note_ar || null, d.note_en || null);
      }
      const tools = (s.tools || []).filter((t) => !t.internal).map((t) => t.name);
      if (tools.length) {
        const a = s.agent || {};
        run(`INSERT INTO agents (key,name_ar,name_en,description_ar,description_en,tools,allowed_roles,instructions,enabled,system) VALUES (?,?,?,?,?,?,?,?,1,?)
          ON CONFLICT(key) DO UPDATE SET name_ar=excluded.name_ar,name_en=excluded.name_en,description_ar=excluded.description_ar,description_en=excluded.description_en,tools=excluded.tools,instructions=excluded.instructions,system=excluded.system`,
        `sys_${s.key}`, a.name_ar || `مساعد ${s.name_ar}`, a.name_en || `${s.name_en} assistant`, a.description_ar || s.description_ar || '', a.description_en || s.description_en || '',
        JSON.stringify(tools), JSON.stringify(ALL_ROLES), a.instructions || 'ينفّذ ضمن صلاحيات المستخدم في النظام فقط.', s.key);
      }
    });
    if (DEMO && s.seed) { try { tx(() => s.seed()); } catch (e) { console.error(`[systems] seed ${s.key} failed:`, e.message); } }
  }
  registerTools([...SYSTEMS.values()].flatMap((s) => s.tools || []));

  // 2a) public, token-authenticated routes (e.g. calendar feeds): /pub/sys/<key>/… — no session;
  //     the system authenticates each request itself with a secret, revocable token.
  for (const s of SYSTEMS.values()) {
    if (!s.publicRoutes) continue;
    const r = express.Router(); s.publicRoutes(r);
    app.use(`/pub/sys/${s.key}`, (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); r(req, res, next); });
  }
  // 2b) authorised routers: /api/sys/<key>/… (the user must be allowed to open the system)
  const routers = new Map();
  for (const s of SYSTEMS.values()) { const r = express.Router(); s.routes?.(r); routers.set(s.key, r); }
  app.use('/api/sys/:key', (req, res, next) => {
    const r = routers.get(req.params.key);
    if (!r) return res.status(404).json({ error: 'not_found', message: 'النظام غير موجود' });
    if (!canAccess(req.user, req.params.key)) return res.status(403).json({ error: 'forbidden', message: 'هذا النظام غير متاح لحسابك' });
    r(req, res, next);
  });

  // 3) catalogue, workspace, preferences
  app.get('/api/systems', (req, res) => res.json(systemsFor(req.user)));
  app.get('/api/workspace', async (req, res) => {
    const out = [];
    for (const s of accessibleSystems(req.user)) {
      if (!s.workspace) continue;
      try { const cards = await s.workspace(req.user); if (cards?.length) out.push({ system: s.key, name_ar: s.name_ar, name_en: s.name_en, icon: s.icon, cards }); }
      catch (e) { console.error(`[systems] workspace ${s.key}:`, e.message); }
    }
    res.json(out);
  });
  app.put('/api/systems/:key/prefs', (req, res) => {
    const key = req.params.key;
    if (!canAccess(req.user, key)) return res.status(403).json({ error: 'forbidden', message: 'هذا النظام غير متاح لحسابك' });
    const b = req.body || {};
    const cur = one('SELECT * FROM user_system_prefs WHERE user_id=? AND system=?', req.user.id, key);
    let aiEnabled = cur?.ai_enabled ?? 0;
    if (b.ai_enabled !== undefined) {
      const optIn = domainsOf(key).filter((d) => d.ai_policy === 'opt_in');
      if (b.ai_enabled && !optIn.length) return res.status(409).json({ error: 'ai_not_optional', message: 'سياسة بيانات هذا النظام لا تسمح بتفعيل وصول المساعد الذكي' });
      aiEnabled = b.ai_enabled ? 1 : 0;
    }
    const pinned = b.pinned === undefined ? (cur?.pinned ?? null) : (b.pinned ? 1 : 0);
    run(`INSERT INTO user_system_prefs (user_id,system,pinned,ai_enabled,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id,system) DO UPDATE SET pinned=excluded.pinned, ai_enabled=excluded.ai_enabled, updated_at=excluded.updated_at`, req.user.id, key, pinned, aiEnabled, now());
    if (b.ai_enabled !== undefined) audit(req.user, 'system.ai_access', key, { enabled: !!aiEnabled });
    res.json(systemSummary(req.user, SYSTEMS.get(key)));
  });

  // 4) admin controls: capability grants and domain AI policy (confirmation + audit)
  app.get('/api/admin/caps', requireAdmin, (req, res) => res.json({
    catalog: allCaps(),
    grants: all(`SELECT c.user_id, c.cap, c.granted_at, u.name_ar, u.name_en, u.user_type, d.name_ar dept_ar, d.name_en dept_en FROM user_caps c JOIN users u ON u.id=c.user_id JOIN departments d ON d.id=u.department_id ORDER BY d.name_ar, u.name_ar`),
  }));
  app.put('/api/admin/caps', requireAdmin, (req, res) => {
    const b = req.body || {};
    try { requireConfirm(b, 'تغيير صلاحيات الأنظمة يتطلب تأكيداً صريحاً'); } catch (e) { return res.status(428).json({ error: e.code, message: e.message }); }
    const def = allCaps().find((c) => c.cap === b.cap);
    const u = one('SELECT id,user_type FROM users WHERE id=? AND active=1', b.user_id);
    if (!def || !u) return res.status(400).json({ error: 'bad_input', message: 'صلاحية أو مستخدم غير صالح' });
    if (!!def.external !== (u.user_type === 'external')) return res.status(400).json({ error: 'bad_input', message: def.external ? 'هذه الصلاحية مخصصة للجهات الخارجية فقط' : 'لا تُمنح هذه الصلاحية لحساب خارجي' });
    if (b.grant) run('INSERT OR IGNORE INTO user_caps (user_id,cap,granted_by) VALUES (?,?,?)', u.id, def.cap, req.user.id);
    else run('DELETE FROM user_caps WHERE user_id=? AND cap=?', u.id, def.cap);
    audit(req.user, b.grant ? 'caps.grant' : 'caps.revoke', u.id, { cap: def.cap });
    res.json({ ok: true });
  });
  app.get('/api/admin/domains', requireAdmin, (req, res) => res.json(all('SELECT * FROM data_domains ORDER BY system, key')));
  app.put('/api/admin/domains/:key', requireAdmin, (req, res) => {
    const b = req.body || {};
    try { requireConfirm(b, 'تغيير سياسة البيانات يتطلب تأكيداً صريحاً'); } catch (e) { return res.status(428).json({ error: e.code, message: e.message }); }
    const d = one('SELECT * FROM data_domains WHERE key=?', req.params.key);
    if (!d) return res.status(404).json({ error: 'not_found' });
    if (d.ai_locked) return res.status(409).json({ error: 'locked', message: 'سياسة هذا النطاق مقفلة: بياناته لا تُتاح للمساعد الذكي أو MCP مطلقاً' });
    if (!['allowed', 'opt_in', 'off'].includes(b.ai_policy)) return res.status(400).json({ error: 'bad_input' });
    run('UPDATE data_domains SET ai_policy=?, updated_by=?, updated_at=? WHERE key=?', b.ai_policy, req.user.id, now(), d.key);
    audit(req.user, 'domain.ai_policy', d.key, { from: d.ai_policy, to: b.ai_policy });
    res.json(one('SELECT * FROM data_domains WHERE key=?', d.key));
  });
}

export { SYSTEMS, canAccess };
