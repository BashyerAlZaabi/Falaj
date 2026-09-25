// Integration & Control Center — data operations. Every function authorises
// server-side and scopes its SQL to the caller: personal rows by user_id,
// admin views by is_admin (configuration only: never system data).
import crypto from 'node:crypto';
import net from 'node:net';
import { config } from '../../config.js';
import { getUser } from '../../identity.js';
import * as W from '../../services/work.js';
import { SYSTEMS, canAccess, allCaps } from '../registry.js';
import {
  one, all, run, uid, now, json, tx, Forbidden, NotFound, BadRequest, Conflict,
  isStaff, hasCap, requireConfirm, audit, changed, alert, clean, transition, day,
} from '../kit.js';
import { CONNECTORS, CORE_DOMAINS, connectorDef, GRANT_HINTS, quarterOf, quarterLabel } from './catalog.js';
import { feedItems, buildIcs } from './ics.js';

const KEY = 'integrations';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const iso = (s) => (!s ? null : /[zZ]|[+-]\d\d:\d\d$/.test(s) ? new Date(s).toISOString() : new Date(`${String(s).replace(' ', 'T')}Z`).toISOString());
const daysSince = (s) => (s ? Math.floor((Date.now() - Date.parse(iso(s))) / 864e5) : null);

// systems/index.js imports this module, so its helpers are loaded lazily at request time.
let platformMod = null;
const platform = async () => (platformMod ||= await import('../index.js'));

// ---------------------------------------------------------------- identity helpers
export function requireAdmin(user) {
  if (!user?.is_admin || !isStaff(user)) throw new Forbidden('هذه الصفحة لمدير المنصة فقط، وهي إعدادات لا تمنح أي وصول إلى بيانات الأنظمة');
}
export const platformAdmins = () => all("SELECT id,name_ar,name_en FROM users WHERE is_admin=1 AND active=1 AND user_type='staff' ORDER BY name_ar");
const staffIds = () => all("SELECT id FROM users WHERE active=1 AND user_type='staff'").map((r) => r.id);
const brief = (id) => (id ? one('SELECT u.id,u.name_ar,u.name_en,u.department_id,d.name_ar dept_ar,d.name_en dept_en FROM users u JOIN departments d ON d.id=u.department_id WHERE u.id=?', id) : null);

// ---------------------------------------------------------------- domains & tools
export function domainInfo(key) {
  if (CORE_DOMAINS[key]) return { key, ...CORE_DOMAINS[key], core: true, system: null };
  const d = one('SELECT key,system,name_ar,name_en,classification,ai_policy,ai_locked,note_ar,note_en FROM data_domains WHERE key=?', key);
  return d ? { ...d, ai_locked: !!d.ai_locked, core: false } : null;
}
function toolCounts(systemKey) {
  const out = {};
  for (const t of SYSTEMS.get(systemKey)?.tools || []) {
    if (t.internal || !t.domain) continue;
    const c = (out[t.domain] ||= { read: 0, write: 0 });
    t.mutates ? c.write++ : c.read++;
  }
  return out;
}

// ---------------------------------------------------------------- tab: my systems
export async function systemsView(user) {
  const { systemsFor } = await platform();
  const accessible = systemsFor(user).map((s) => {
    const counts = toolCounts(s.key);
    return { ...s, domains: s.domains.map((d) => ({ ...d, tools: counts[d.key] || { read: 0, write: 0 } })) };
  });
  const unavailable = [...SYSTEMS.values()].filter((s) => !canAccess(user, s.key)).map((s) => {
    const hint = GRANT_HINTS[s.key];
    const caps = (s.caps || []).filter((c) => !c.external);
    return {
      key: s.key, name_ar: s.name_ar, name_en: s.name_en, description_ar: s.description_ar, description_en: s.description_en, icon: s.icon, category: s.category || 'operations',
      who_ar: hint ? hint[0] : caps.length ? `من يحمل إحدى الصلاحيات: ${caps.map((c) => c.ar).join('، ')}` : 'أدوار محددة في الجهة',
      who_en: hint ? hint[1] : caps.length ? `Holders of: ${caps.map((c) => c.en).join(', ')}` : 'Specific roles in the entity',
    };
  });
  return { accessible, unavailable, admins: platformAdmins() };
}

// ---------------------------------------------------------------- tab: AI & data
export function reviewState(userId, kind = 'privacy') {
  const period = quarterOf();
  const cur = kind === 'access'
    ? one("SELECT r.created_at, r.user_id, r.is_demo FROM integrations_reviews r WHERE r.kind='access' AND r.period=? ORDER BY r.created_at LIMIT 1", period)
    : one("SELECT created_at, user_id, is_demo FROM integrations_reviews WHERE user_id=? AND kind='privacy' AND period=?", userId, period);
  const last = kind === 'access'
    ? one("SELECT created_at, period, user_id, snapshot FROM integrations_reviews WHERE kind='access' ORDER BY created_at DESC LIMIT 1")
    : one("SELECT created_at, period FROM integrations_reviews WHERE user_id=? AND kind='privacy' ORDER BY created_at DESC LIMIT 1", userId);
  return {
    period, done_at: cur?.created_at || null, demo: !!cur?.is_demo, last_at: last?.created_at || null, last_period: last?.period || null,
    ...(kind === 'access' ? { by: brief(cur?.user_id || last?.user_id), snapshot: last ? json(last.snapshot, {}) : null } : {}),
  };
}

export async function aiView(user) {
  const { systemsFor } = await platform();
  const mine = new Map(systemsFor(user).map((s) => [s.key, s]));
  const systems = [...mine.values()].map((s) => {
    const counts = toolCounts(s.key);
    return {
      key: s.key, name_ar: s.name_ar, name_en: s.name_en, icon: s.icon, category: s.category, classification: s.classification, external: s.external,
      ai_enabled: s.ai_enabled, optional: s.domains.some((d) => d.ai_policy === 'opt_in'),
      domains: s.domains.map((d) => ({ ...d, tools: counts[d.key] || { read: 0, write: 0 } })),
    };
  });
  const sysMeta = new Map([...SYSTEMS.values()].map((s) => [s.key, s]));
  const map = all('SELECT key,system,name_ar,name_en,classification,ai_policy,ai_locked FROM data_domains ORDER BY system,key').filter((d) => sysMeta.has(d.system)).map((d) => {
    const s = sysMeta.get(d.system); const my = mine.get(d.system);
    return { key: d.key, system: d.system, system_ar: s.name_ar, system_en: s.name_en, icon: s.icon, external: !!s.external, name_ar: d.name_ar, name_en: d.name_en,
      classification: d.classification, ai_policy: d.ai_policy, ai_locked: !!d.ai_locked, accessible: !!my, ai_active: !!my?.domains.find((x) => x.key === d.key)?.ai_active };
  });
  const flat = systems.flatMap((s) => s.domains);
  const counts = {
    systems_readable: systems.filter((s) => s.domains.some((d) => d.ai_active)).length,
    systems: systems.length,
    readable: flat.filter((d) => d.ai_active).length,
    opt_in_on: flat.filter((d) => d.ai_policy === 'opt_in' && d.ai_active).length,
    opt_in_off: flat.filter((d) => d.ai_policy === 'opt_in' && !d.ai_active).length,
    locked: flat.filter((d) => d.ai_policy === 'off').length,
    domains: flat.length,
  };
  return { systems, map, counts, review: reviewState(user.id, 'privacy') };
}

export async function recordPrivacyReview(user) {
  const period = quarterOf();
  if (one("SELECT 1 FROM integrations_reviews WHERE user_id=? AND kind='privacy' AND period=?", user.id, period)) throw new Conflict('راجعت ضوابطك لهذا الربع بالفعل — شكراً لك');
  const ai = await aiView(user);
  const snapshot = { readable_domains: ai.counts.readable, opt_in_enabled: ai.systems.filter((s) => s.optional && s.ai_enabled).map((s) => s.key), calendar_feed: !!activeFeed(user.id) };
  const id = uid('ir_');
  run('INSERT INTO integrations_reviews (id,user_id,kind,period,snapshot,created_at) VALUES (?,?,?,?,?,?)', id, user.id, 'privacy', period, JSON.stringify(snapshot), now());
  audit(user, 'integrations.privacy_review', period, snapshot);
  changed(KEY, [user.id], id);
  return reviewState(user.id, 'privacy');
}

// ---------------------------------------------------------------- connectors (catalogue view)
function orgRow(key) { return one('SELECT * FROM integrations_connectors WHERE key=?', key); }
function envState(def) {
  const missing = def.env.filter((n) => !String(process.env[n] ?? '').trim());
  return { names: def.env, missing };
}
export function activeFeed(userId) {
  return one("SELECT * FROM integrations_connections WHERE user_id=? AND connector='ics' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1", userId);
}
const eligible = (user, def) => !def.who.length || hasCap(user, ...def.who);
function statusOf(def, org, user) {
  if (!org?.enabled) return 'disabled';
  if (def.real) return activeFeed(user.id) ? 'connected' : 'available';
  return envState(def).missing.length ? 'needs_setup' : 'configured';
}
function candidateView(def, scopes) {
  return def.candidates.map(domainInfo).filter(Boolean).map((d) => ({
    key: d.key, name_ar: d.name_ar, name_en: d.name_en, classification: d.classification, core: d.core, system: d.system,
    selected: scopes.includes(d.key), masked: (def.masked || []).includes(d.key), protected: d.classification === 'restricted' && !(def.masked || []).includes(d.key),
  }));
}
function feedView(user) {
  const f = activeFeed(user.id);
  if (!f) return null;
  return { id: f.id, hint: f.token_hint, created_at: f.created_at, last_used_at: f.last_used_at, use_count: f.use_count, options: { include_meetings: true, include_events: true, include_tasks: true, ...json(f.options, {}) } };
}
function connectorPublic(def, user) {
  const org = orgRow(def.key) || { enabled: 1, scopes: JSON.stringify(def.defaultScopes) };
  const env = envState(def);
  const scopes = json(org.scopes, def.defaultScopes);
  return {
    key: def.key, name_ar: def.name_ar, name_en: def.name_en, vendor: def.vendor, icon: def.icon, direction: def.direction,
    desc_ar: def.desc_ar, desc_en: def.desc_en, flows_ar: def.flows_ar, flows_en: def.flows_en, real: !!def.real, personal: !!def.personal,
    who_ar: def.who_ar, who_en: def.who_en, eligible: eligible(user, def), team: def.who.length > 0 && hasCap(user, ...def.who), status: statusOf(def, org, user),
    env: env.names.map((n) => ({ name: n, present: !env.missing.includes(n) })),
    domains: candidateView(def, scopes), fixed_scopes: !!def.fixedScopes,
    last_test: org.last_test_at ? { at: org.last_test_at, ok: !!org.last_test_ok, message: org.last_test_message } : null,
  };
}
export function connectorsView(user) {
  const reqs = all('SELECT id,connector,note,status,created_at,closed_at,resolution_note,is_demo FROM integrations_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 20', user.id);
  return {
    connectors: CONNECTORS.map((def) => ({
      ...connectorPublic(def, user),
      my_request: reqs.find((r) => r.connector === def.key && r.status === 'open') || null,
      feed: def.real ? feedView(user) : undefined,
    })),
    requests: reqs.map((r) => ({ ...r, is_demo: !!r.is_demo })),
    is_admin: !!user.is_admin,
  };
}

// ---------------------------------------------------------------- personal calendar feed
export const feedUrl = (token) => `${config.publicUrl.replace(/\/$/, '')}/pub/sys/${KEY}/calendar/${token}.ics`;
const FEED_OPTS = ['include_meetings', 'include_events', 'include_tasks'];
const pickOpts = (b = {}) => Object.fromEntries(FEED_OPTS.map((k) => [k, b[k] !== false]));

function issueFeed(user, options, reason) {
  const token = `swpcal_${crypto.randomBytes(24).toString('base64url')}`;
  const id = uid('ic_');
  run('INSERT INTO integrations_connections (id,user_id,connector,token_hash,token_hint,options,created_at) VALUES (?,?,?,?,?,?,?)',
    id, user.id, 'ics', sha(token), token.slice(-4), JSON.stringify(options), now());
  audit(user, `integrations.feed.${reason}`, id, { options });
  changed(KEY, [user.id], id);
  const url = feedUrl(token);
  return { feed: feedView(user), url, webcal: url.replace(/^https?:\/\//, 'webcal://'), note_ar: 'يظهر الرابط مرة واحدة فقط. عامله ككلمة مرور.', note_en: 'The link is shown once. Treat it like a password.' };
}
export function createFeed(user, body) {
  if (!orgRow('ics')?.enabled) throw new Conflict('أوقف مدير المنصة روابط التقويم مؤقتاً على مستوى الجهة');
  if (activeFeed(user.id)) throw new Conflict('لديك رابط تقويم فعّال بالفعل. استخدم «تدوير الرابط» لإصدار رابط جديد وإيقاف القديم.');
  return tx(() => issueFeed(user, pickOpts(body), 'create'));
}
export function rotateFeed(user, body) {
  requireConfirm(body, 'تدوير رابط التقويم يوقف الرابط الحالي فوراً ويتطلب تأكيداً');
  if (!orgRow('ics')?.enabled) throw new Conflict('أوقف مدير المنصة روابط التقويم مؤقتاً على مستوى الجهة');
  const cur = activeFeed(user.id);
  if (!cur) throw new Conflict('لا يوجد رابط فعّال لتدويره');
  return tx(() => {
    run("UPDATE integrations_connections SET revoked_at=?, revoked_reason='rotated' WHERE id=?", now(), cur.id);
    return issueFeed(user, { ...pickOpts(), ...json(cur.options, {}) }, 'rotate');
  });
}
function ownFeed(user, id) {
  const f = one("SELECT * FROM integrations_connections WHERE id=? AND user_id=? AND connector='ics' AND revoked_at IS NULL", id, user.id);
  if (!f) throw new NotFound('الرابط غير موجود أو غير متاح لك');
  return f;
}
export function updateFeed(user, id, body) {
  const f = ownFeed(user, id);
  const options = { ...pickOpts(), ...json(f.options, {}), ...Object.fromEntries(FEED_OPTS.filter((k) => typeof body[k] === 'boolean').map((k) => [k, body[k]])) };
  if (!FEED_OPTS.some((k) => options[k])) throw new BadRequest('اختر مصدراً واحداً على الأقل لعرضه في تقويمك');
  run('UPDATE integrations_connections SET options=? WHERE id=?', JSON.stringify(options), f.id);
  audit(user, 'integrations.feed.update', f.id, { options });
  changed(KEY, [user.id], f.id);
  return feedView(user);
}
export function revokeFeed(user, id, body) {
  const f = ownFeed(user, id);
  requireConfirm(body, 'إيقاف رابط التقويم يتطلب تأكيداً');
  run("UPDATE integrations_connections SET revoked_at=?, revoked_reason='user' WHERE id=?", now(), f.id);
  audit(user, 'integrations.feed.revoke', f.id, { hint: f.token_hint });
  changed(KEY, [user.id], f.id);
  return { ok: true };
}

// Meetings come from the meetings system when it exposes upcomingForUser();
// the calendar keeps working (events + tasks) when it does not.
let meetingsMod = null;
async function meetingsFor(userId) {
  try {
    meetingsMod ||= await import('../meetings.js');
    if (typeof meetingsMod.upcomingForUser !== 'function') return { available: false, items: [] };
    const rows = await meetingsMod.upcomingForUser(userId, 90);
    return { available: true, items: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    console.error('[integrations] meetings feed unavailable:', e.message);
    return { available: false, items: [] };
  }
}
async function feedContent(userId, options) {
  const user = getUser(userId);
  if (!user || !isStaff(user)) return null;
  const opts = { ...pickOpts(), ...options };
  const meetings = opts.include_meetings ? await meetingsFor(userId) : { available: true, items: [] };
  const events = opts.include_events ? W.listEvents(user, { from: new Date(Date.now() - 7 * 864e5).toISOString(), to: new Date(Date.now() + 90 * 864e5).toISOString() }) : [];
  const tasks = opts.include_tasks ? W.listTasks(user, { mine: true, limit: 500 }) : [];
  const lang = user.lang === 'en' ? 'en' : 'ar';
  const items = feedItems({ meetings: meetings.items, events, tasks, lang, baseUrl: config.publicUrl.replace(/\/$/, ''), options: opts });
  return { user, lang, items, meetings_available: meetings.available };
}
export async function feedPreview(user, query = {}) {
  const opts = Object.fromEntries(FEED_OPTS.map((k) => [k, query[k.replace('include_', '')] !== '0']));
  const c = await feedContent(user.id, opts);
  const items = (c?.items || []).slice(0, 40).map((i) => ({ kind: i.kind, start: i.start || null, end: i.end || null, date: i.date || null, all_day: !!i.allDay, summary: i.summary, location: i.location, masked: !!i.masked }));
  return { items, total: c?.items.length || 0, meetings_available: !!c?.meetings_available, options: opts };
}

// ---- public feed endpoint (no session): the secret token is the credential
const hits = new Map();
const WINDOW = 10 * 60e3;
function limited(key, max) {
  const t = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (t - v.t > WINDOW) hits.delete(k);
  const e = hits.get(key);
  if (!e || t - e.t > WINDOW) { hits.set(key, { n: 1, t }); return false; }
  e.n++;
  return e.n > max;
}
function clientName(ua = '') {
  const s = String(ua);
  if (/outlook|microsoft office|exchange/i.test(s)) return 'Microsoft Outlook';
  if (/google/i.test(s)) return 'Google Calendar';
  if (/calendaragent|dataaccessd|ical|mac os x|iphone|ipad/i.test(s)) return 'Apple Calendar';
  if (/thunderbird/i.test(s)) return 'Thunderbird';
  return clean(s, 80) || null;
}
function logHit(f, outcome, ua) {
  const t = now();
  run('INSERT INTO integrations_feed_hits (id,connection_id,user_id,at,client,outcome) VALUES (?,?,?,?,?,?)', uid('ih_'), f.id, f.user_id, t, clientName(ua), outcome);
  run('DELETE FROM integrations_feed_hits WHERE user_id=? AND at < ?', f.user_id, new Date(Date.now() - 90 * 864e5).toISOString());
}
const notFound = (res) => res.status(404).type('text/plain').send('Not found');
export async function serveFeed(req, res) {
  const raw = String(req.params.file || '').replace(/\.ics$/i, '');
  const ip = req.ip || 'unknown';
  const tooMany = () => res.status(429).set('Retry-After', '600').type('text/plain').send('Too many requests');
  if (!/^swpcal_[A-Za-z0-9_-]{32}$/.test(raw)) return limited(`ip:${ip}`, 30) ? tooMany() : notFound(res);
  const hash = sha(raw);
  const f = one("SELECT * FROM integrations_connections WHERE token_hash=? AND connector='ics'", hash);
  if (!f) return limited(`ip:${ip}`, 30) ? tooMany() : notFound(res);
  if (limited(`t:${hash}`, 60)) return tooMany();
  const ua = req.headers['user-agent'];
  if (f.revoked_at) { logHit(f, 'revoked', ua); return notFound(res); }
  if (!orgRow('ics')?.enabled) { logHit(f, 'disabled', ua); return notFound(res); }
  const c = await feedContent(f.user_id, json(f.options, {}));
  if (!c) return notFound(res);
  const name = c.lang === 'en' ? `Smart Work Platform — ${c.user.name_en || c.user.name_ar}` : `منصة العمل الذكية — ${c.user.name_ar}`;
  const description = c.lang === 'en' ? 'Your meetings, appointments and task due dates (read-only). Confidential meetings show as busy.' : 'اجتماعاتك ومواعيدك ومواعيد استحقاق مهامك (للقراءة فقط). الاجتماعات السرية تظهر «مشغول» فقط.';
  const body = buildIcs({ name, description, items: c.items });
  run('UPDATE integrations_connections SET last_used_at=?, use_count=use_count+1 WHERE id=?', now(), f.id);
  logHit(f, 'served', ua);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="swp-calendar.ics"');
  res.send(body);
}

// ---------------------------------------------------------------- activation requests
export function requestConnector(user, key, body) {
  const def = connectorDef(key);
  if (!def) throw new NotFound('الموصل غير موجود');
  if (def.real) throw new Conflict('هذا الموصل متاح لك مباشرة ولا يحتاج طلباً');
  if (user.is_admin) throw new Conflict('بصفتك مدير المنصة تستطيع إعداد الموصل مباشرة من تبويب «الموصلات»');
  if (!eligible(user, def)) throw new Forbidden(`هذا الموصل مخصص لـ${def.who_ar}`);
  if (one("SELECT 1 FROM integrations_requests WHERE user_id=? AND connector=? AND status='open'", user.id, key)) throw new Conflict('لديك طلب مفتوح لهذا الموصل بالفعل');
  const id = uid('iq_');
  const note = clean(body.note, 500) || null;
  run('INSERT INTO integrations_requests (id,user_id,connector,note,status,created_at) VALUES (?,?,?,?,?,?)', id, user.id, key, note, 'open', now());
  audit(user, 'integrations.request', key, { id });
  const admins = platformAdmins().map((a) => a.id).filter((a) => a !== user.id);
  for (const a of admins) alert(a, { level: 'info', title: `طلب تفعيل موصل: ${def.name_ar}`, body: `من ${user.name_ar}`, system: KEY, id });
  changed(KEY, [user.id, ...admins], id);
  return { id, status: 'open' };
}
export function withdrawRequest(user, id) {
  const r = one('SELECT * FROM integrations_requests WHERE id=? AND user_id=?', id, user.id);
  if (!r) throw new NotFound('الطلب غير موجود أو غير متاح لك');
  transition(r.status, 'withdrawn', { open: ['withdrawn'] }, { open: 'مفتوح', done: 'منجز', declined: 'معتذر عنه', withdrawn: 'مسحوب' });
  run("UPDATE integrations_requests SET status='withdrawn', closed_at=? WHERE id=?", now(), r.id);
  audit(user, 'integrations.request.withdraw', r.connector, { id: r.id });
  changed(KEY, [user.id, ...platformAdmins().map((a) => a.id)], r.id);
  return { ok: true };
}

// ---------------------------------------------------------------- activity (own rows only)
export function activity(user) {
  const adminActions = user.is_admin ? " OR a.action IN ('caps.grant','caps.revoke','domain.ai_policy')" : '';
  const rows = all(`SELECT a.id,a.action,a.target,a.detail,a.created_at FROM audit a WHERE a.user_id=? AND (a.action='system.ai_access' OR a.action LIKE 'integrations.%'${adminActions}) ORDER BY a.created_at DESC, a.rowid DESC LIMIT 150`, user.id);
  const entries = rows.map((r) => {
    const detail = json(r.detail, {});
    let target = null;
    if (r.action === 'system.ai_access') { const s = SYSTEMS.get(r.target); target = s ? { ar: s.name_ar, en: s.name_en } : null; }
    else if (r.action.startsWith('caps.')) { const u = brief(r.target); const c = allCaps().find((x) => x.cap === detail.cap); target = { ar: `${c?.ar || detail.cap} — ${u?.name_ar || ''}`, en: `${c?.en || detail.cap} — ${u?.name_en || ''}` }; }
    else if (r.action === 'domain.ai_policy') { const d = domainInfo(r.target); target = d ? { ar: d.name_ar, en: d.name_en } : null; }
    else if (/^integrations\.(request|connector)/.test(r.action)) { const c = connectorDef(r.target); target = c ? { ar: c.name_ar, en: c.name_en } : null; }
    return { id: r.id, action: r.action, at: iso(r.created_at), detail, target };
  });
  const feedHits = all(`SELECT h.at,h.client,h.outcome,c.token_hint FROM integrations_feed_hits h JOIN integrations_connections c ON c.id=h.connection_id
    WHERE h.user_id=? AND c.user_id=? ORDER BY h.at DESC LIMIT 100`, user.id, user.id);
  return { entries, feed_hits: feedHits };
}

// ---------------------------------------------------------------- admin: capabilities matrix
export function adminMatrix(user) {
  requireAdmin(user);
  const users = all(`SELECT u.id,u.username,u.name_ar,u.name_en,u.role,u.user_type,u.is_admin,u.department_id,u.title_ar,u.title_en,d.name_ar dept_ar,d.name_en dept_en,d.is_external
    FROM users u JOIN departments d ON d.id=u.department_id WHERE u.active=1 ORDER BY d.is_external, d.name_ar, u.name_ar`).map((u) => ({ ...u, is_admin: !!u.is_admin, is_external: !!u.is_external }));
  const departments = all('SELECT id,name_ar,name_en,is_external FROM departments ORDER BY is_external, name_ar').map((d) => ({ ...d, is_external: !!d.is_external }));
  const systems = [...SYSTEMS.values()].filter((s) => (s.caps || []).length).map((s) => ({ key: s.key, name_ar: s.name_ar, name_en: s.name_en, icon: s.icon, caps: s.caps.map((c) => ({ cap: c.cap, ar: c.ar, en: c.en, external: !!c.external })) }));
  const grants = all('SELECT c.user_id,c.cap,c.granted_at,c.granted_by FROM user_caps c JOIN users u ON u.id=c.user_id WHERE u.active=1');
  return { me: user.id, users, departments, systems, grants, review: reviewState(user.id, 'access') };
}
export function setCapability(admin, body) {
  requireAdmin(admin);
  requireConfirm(body, 'تغيير صلاحيات الأنظمة يتطلب تأكيداً صريحاً');
  if (body.user_id === admin.id) throw new Forbidden('فصل المهام: لا يمكنك تعديل صلاحياتك بنفسك. يطلبها لك مدير منصة آخر.');
  const def = allCaps().find((c) => c.cap === body.cap);
  const u = one('SELECT id,user_type,name_ar FROM users WHERE id=? AND active=1', body.user_id);
  if (!def || !u) throw new BadRequest('صلاحية أو مستخدم غير صالح');
  if (!!def.external !== (u.user_type === 'external')) throw new BadRequest(def.external ? 'هذه الصلاحية مخصصة لحسابات الجهات الخارجية فقط' : 'لا تُمنح هذه الصلاحية لحساب جهة خارجية');
  const r = body.grant
    ? run('INSERT OR IGNORE INTO user_caps (user_id,cap,granted_by) VALUES (?,?,?)', u.id, def.cap, admin.id)
    : run('DELETE FROM user_caps WHERE user_id=? AND cap=?', u.id, def.cap);
  if (r.changes) {
    audit(admin, body.grant ? 'caps.grant' : 'caps.revoke', u.id, { cap: def.cap, via: KEY });
    alert(u.id, { level: 'info', title: body.grant ? `مُنحت لك صلاحية: ${def.ar}` : `سُحبت منك صلاحية: ${def.ar}`, body: 'أعد تحميل الصفحة لتظهر الأنظمة المتاحة لك وفق صلاحياتك الجديدة.', system: KEY });
    changed(KEY, [admin.id, u.id, ...platformAdmins().map((a) => a.id)], u.id);
  }
  return { ok: true, changed: !!r.changes, granted: !!body.grant };
}
export function recordAccessReview(admin, body) {
  requireAdmin(admin);
  requireConfirm(body, 'اعتماد مراجعة الصلاحيات يتطلب تأكيداً');
  const period = quarterOf();
  if (one("SELECT 1 FROM integrations_reviews WHERE kind='access' AND period=?", period)) throw new Conflict('اعتُمدت مراجعة الصلاحيات لهذا الربع بالفعل');
  const grants = all("SELECT c.cap, u.user_type FROM user_caps c JOIN users u ON u.id=c.user_id WHERE u.active=1");
  const snapshot = { grants: grants.length, external_grants: grants.filter((g) => g.user_type === 'external').length,
    holders: one('SELECT COUNT(DISTINCT c.user_id) n FROM user_caps c JOIN users u ON u.id=c.user_id WHERE u.active=1').n,
    by_system: Object.fromEntries([...SYSTEMS.values()].filter((s) => s.caps?.length).map((s) => [s.key, grants.filter((g) => s.caps.some((c) => c.cap === g.cap)).length])) };
  const id = uid('ir_');
  run('INSERT INTO integrations_reviews (id,user_id,kind,period,snapshot,note,created_at) VALUES (?,?,?,?,?,?,?)', id, admin.id, 'access', period, JSON.stringify(snapshot), clean(body.note, 500) || null, now());
  audit(admin, 'integrations.access_review', period, snapshot);
  changed(KEY, platformAdmins().map((a) => a.id), id);
  return reviewState(admin.id, 'access');
}

// ---------------------------------------------------------------- admin: data policies
const bucket = (n) => (!n ? 0 : n < 3 ? '<3' : n); // small groups are never shown exactly
export function adminDomains(user) {
  requireAdmin(user);
  const opted = Object.fromEntries(all('SELECT system, COUNT(*) n FROM user_system_prefs p JOIN users u ON u.id=p.user_id WHERE p.ai_enabled=1 AND u.active=1 GROUP BY system').map((r) => [r.system, r.n]));
  const sysMeta = new Map([...SYSTEMS.values()].map((s) => [s.key, s]));
  return all('SELECT * FROM data_domains ORDER BY system, key').filter((d) => sysMeta.has(d.system)).map((d) => {
    const s = sysMeta.get(d.system);
    return { key: d.key, system: d.system, system_ar: s.name_ar, system_en: s.name_en, icon: s.icon, name_ar: d.name_ar, name_en: d.name_en, classification: d.classification,
      ai_policy: d.ai_policy, ai_locked: !!d.ai_locked, note_ar: d.note_ar, note_en: d.note_en, updated_at: d.updated_at, updated_by: brief(d.updated_by),
      opted_in: d.ai_policy === 'opt_in' ? bucket(opted[d.system]) : null, tools: toolCounts(d.system)[d.key] || { read: 0, write: 0 } };
  });
}

// ---------------------------------------------------------------- admin: connectors
export function adminConnectors(user) {
  requireAdmin(user);
  const open = all(`SELECT r.id,r.connector,r.note,r.created_at,r.is_demo,r.user_id FROM integrations_requests r JOIN users u ON u.id=r.user_id WHERE r.status='open' ORDER BY r.created_at`);
  return CONNECTORS.map((def) => {
    const org = orgRow(def.key);
    return {
      ...connectorPublic(def, user), enabled: !!org?.enabled, updated_at: org?.updated_at || null, updated_by: brief(org?.updated_by),
      active_feeds: def.real ? one("SELECT COUNT(*) n FROM integrations_connections WHERE connector=? AND revoked_at IS NULL", def.key).n : null,
      requests: open.filter((r) => r.connector === def.key).map((r) => ({ id: r.id, note: r.note, created_at: r.created_at, is_demo: !!r.is_demo, user: brief(r.user_id) })),
      testable: !def.real && !!def.test,
    };
  });
}
export function updateConnector(admin, key, body) {
  requireAdmin(admin);
  const def = connectorDef(key);
  if (!def) throw new NotFound('الموصل غير موجود');
  requireConfirm(body, 'تغيير إعدادات الموصل يتطلب تأكيداً صريحاً');
  const org = orgRow(key);
  const from = { enabled: !!org.enabled, scopes: json(org.scopes, def.defaultScopes) };
  const to = { enabled: typeof body.enabled === 'boolean' ? body.enabled : from.enabled, scopes: from.scopes };
  if (body.scopes) {
    if (def.fixedScopes) throw new BadRequest('نطاقات هذا الموصل ثابتة بالتصميم ولا تُعدّل');
    const uniq = [...new Set(body.scopes)];
    for (const k of uniq) {
      const d = domainInfo(k);
      if (!d || !def.candidates.includes(k)) throw new BadRequest(`نطاق بيانات غير متاح لهذا الموصل: ${k}`);
      if (d.classification === 'restricted') throw new BadRequest(`لا يمكن ربط «${d.name_ar}» بأي موصل: بياناته مصنفة سرية للغاية`);
    }
    to.scopes = uniq;
  }
  run('UPDATE integrations_connectors SET enabled=?, scopes=?, updated_by=?, updated_at=? WHERE key=?', to.enabled ? 1 : 0, JSON.stringify(to.scopes), admin.id, now(), key);
  audit(admin, 'integrations.connector.update', key, { from, to });
  changed(KEY, staffIds(), key);
  return adminConnectors(admin).find((c) => c.key === key);
}
function tcpProbe(host, port, ms) {
  return new Promise((resolve, reject) => {
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return reject(new Error('host/port غير صالح'));
    const s = net.connect({ host, port });
    const done = (err) => { s.destroy(); err ? reject(err) : resolve(); };
    s.setTimeout(ms, () => done(new Error('timeout')));
    s.once('connect', () => done());
    s.once('error', (e) => done(e));
  });
}
export async function testConnector(admin, key) {
  requireAdmin(admin);
  const def = connectorDef(key);
  if (!def || def.real || !def.test) throw new NotFound('لا يوجد فحص لهذا الموصل');
  const env = envState(def);
  if (env.missing.length) throw new Conflict(`أكمل الإعداد أولاً — المتغيرات الناقصة: ${env.missing.join('، ')}`);
  const vals = Object.fromEntries(def.env.map((n) => [n, process.env[n]]));
  let ok = false; let message;
  try {
    if (def.test.type === 'tcp') {
      await tcpProbe(def.test.host(vals), def.test.port(vals), 4000);
      ok = true; message = 'TCP reachable';
    } else {
      const url = def.test.url(vals);
      if (!/^https:\/\//i.test(url || '')) throw new Error('يجب أن يبدأ العنوان بـ https://');
      const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) });
      ok = r.status < 500; message = `HTTP ${r.status}`;
    }
  } catch (e) { ok = false; message = e.name === 'TimeoutError' ? 'timeout' : clean(e.message, 160); }
  const at = now();
  run('UPDATE integrations_connectors SET last_test_at=?, last_test_ok=?, last_test_message=? WHERE key=?', at, ok ? 1 : 0, message, key);
  audit(admin, 'integrations.connector.test', key, { ok, message });
  changed(KEY, platformAdmins().map((a) => a.id), key);
  return { ok, message, at };
}
export function closeRequest(admin, id, body) {
  requireAdmin(admin);
  const r = one('SELECT * FROM integrations_requests WHERE id=?', id);
  if (!r) throw new NotFound('الطلب غير موجود');
  if (r.user_id === admin.id) throw new Forbidden('فصل المهام: لا يُغلق الطلب من قدّمه');
  transition(r.status, body.resolution, { open: ['done', 'declined'] }, { open: 'مفتوح', done: 'منجز', declined: 'معتذر عنه', withdrawn: 'مسحوب' });
  const note = clean(body.note, 500) || null;
  run('UPDATE integrations_requests SET status=?, closed_at=?, closed_by=?, resolution_note=? WHERE id=?', body.resolution, now(), admin.id, note, r.id);
  audit(admin, 'integrations.request.close', r.connector, { id: r.id, resolution: body.resolution });
  const def = connectorDef(r.connector);
  alert(r.user_id, { level: 'info', title: body.resolution === 'done' ? `نُفّذ طلبك: ${def?.name_ar || r.connector}` : `تعذّر تفعيل: ${def?.name_ar || r.connector}`, body: note || '', system: KEY, id: r.id });
  changed(KEY, [r.user_id, ...platformAdmins().map((a) => a.id)], r.id);
  return { ok: true };
}

// ---------------------------------------------------------------- overview, workspace, game
export function overview(user) {
  const feed = activeFeed(user.id);
  return {
    is_admin: !!user.is_admin,
    review: reviewState(user.id, 'privacy'),
    feed: feed ? { id: feed.id, last_used_at: feed.last_used_at } : null,
    admin: user.is_admin ? {
      open_requests: one("SELECT COUNT(*) n FROM integrations_requests r JOIN users u ON u.id=r.user_id WHERE r.status='open' AND r.user_id<>?", user.id).n,
      access_review: reviewState(user.id, 'access'),
    } : null,
  };
}

export async function workspaceCards(user) {
  if (!isStaff(user)) return [];
  const cards = [];
  const ai = await aiView(user);
  const due = !ai.review.done_at;
  cards.push({
    title_ar: 'وصول المساعد إلى بياناتك', title_en: 'Ask AI access to your data',
    value: ai.counts.systems_readable, unit_ar: ai.counts.systems_readable === 1 ? 'نظام' : 'أنظمة', unit_en: ai.counts.systems_readable === 1 ? 'system' : 'systems',
    tone: due ? 'emph' : null,
    hint_ar: due ? `مراجعة ضوابط ${quarterLabel(ai.review.period)} لم تتم بعد · ${ai.counts.locked} نطاقات مقفلة دائماً` : `${ai.counts.opt_in_on} نطاقات بموافقتك · ${ai.counts.locked} مقفلة دائماً`,
    hint_en: due ? `This quarter’s check-up is due · ${ai.counts.locked} domains always locked` : `${ai.counts.opt_in_on} opt-in domains on · ${ai.counts.locked} always locked`,
    href: '#/sys/integrations/ai', items: [],
    cta: due ? { label_ar: 'راجع ضوابطك', label_en: 'Review your controls', href: '#/sys/integrations/ai' } : { label_ar: 'إدارة الوصول', label_en: 'Manage access', href: '#/sys/integrations/ai' },
  });
  const f = activeFeed(user.id);
  const idle = f ? daysSince(f.last_used_at || f.created_at) : null;
  if (f && idle >= 30) {
    cards.push({
      title_ar: 'رابط تقويم غير مستخدم', title_en: 'Unused calendar link', value: idle, unit_ar: 'يوماً', unit_en: 'days', tone: 'warn',
      hint_ar: 'أوقف الرابط إن لم تعد تحتاجه؛ الروابط غير المستخدمة مخاطرة', hint_en: 'Revoke it if you no longer need it; idle links are a risk',
      href: '#/sys/integrations/apps/ics', items: [], cta: { label_ar: 'مراجعة الرابط', label_en: 'Review link', href: '#/sys/integrations/apps/ics' },
    });
  }
  if (user.is_admin) {
    const reqs = all(`SELECT r.id,r.connector,r.created_at,u.name_ar,u.name_en FROM integrations_requests r JOIN users u ON u.id=r.user_id WHERE r.status='open' AND r.user_id<>? ORDER BY r.created_at LIMIT 3`, user.id);
    const n = one("SELECT COUNT(*) n FROM integrations_requests WHERE status='open' AND user_id<>?", user.id).n;
    const review = reviewState(user.id, 'access');
    if (n || !review.done_at) {
      cards.push({
        title_ar: 'حوكمة التكامل والصلاحيات', title_en: 'Integration & access governance', value: n, unit_ar: 'طلبات تفعيل', unit_en: 'activation requests', tone: n ? 'warn' : 'emph',
        hint_ar: review.done_at ? 'مراجعة صلاحيات هذا الربع معتمدة' : 'مراجعة الصلاحيات لهذا الربع مستحقة', hint_en: review.done_at ? 'This quarter’s access review is signed off' : 'This quarter’s access review is due',
        href: n ? '#/sys/integrations/connectors' : '#/sys/integrations/access',
        items: reqs.map((r) => { const d = connectorDef(r.connector); return { title: `${d?.name_ar || r.connector} — ${r.name_ar}`, meta_ar: `منذ ${Math.max(0, daysSince(r.created_at))} يوم`, meta_en: `${Math.max(0, daysSince(r.created_at))} d ago`, href: '#/sys/integrations/connectors' }; }),
        cta: review.done_at ? { label_ar: 'مراجعة الطلبات', label_en: 'Review requests', href: '#/sys/integrations/connectors' } : { label_ar: 'مراجعة الصلاحيات', label_en: 'Review access', href: '#/sys/integrations/access' },
      });
    }
  }
  return cards.slice(0, 3);
}

export function gameEvents(userId) {
  return all('SELECT id,kind,period,created_at FROM integrations_reviews WHERE user_id=?', userId).map((r) => ({
    kind: r.kind === 'access' ? 'integrations_access_review' : 'integrations_privacy_review',
    points: r.kind === 'access' ? 25 : 10, at: iso(r.created_at), ref: r.period, id: `integrations:${r.id}`,
  }));
}

// ---------------------------------------------------------------- schema & seed
export function schema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS integrations_connectors (
  key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, scopes TEXT NOT NULL DEFAULT '[]',
  last_test_at TEXT, last_test_ok INTEGER, last_test_message TEXT, updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS integrations_connections (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, connector TEXT NOT NULL,
  token_hash TEXT UNIQUE, token_hint TEXT, options TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, last_used_at TEXT, use_count INTEGER NOT NULL DEFAULT 0, revoked_at TEXT, revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS ix_integrations_conn_user ON integrations_connections(user_id, connector, revoked_at);
CREATE TABLE IF NOT EXISTS integrations_feed_hits (
  id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, user_id TEXT NOT NULL, at TEXT NOT NULL, client TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('served','revoked','disabled'))
);
CREATE INDEX IF NOT EXISTS ix_integrations_hits_user ON integrations_feed_hits(user_id, at);
CREATE TABLE IF NOT EXISTS integrations_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, connector TEXT NOT NULL, note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','declined','withdrawn')),
  created_at TEXT NOT NULL, closed_at TEXT, closed_by TEXT, resolution_note TEXT, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS integrations_reviews (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('privacy','access')), period TEXT NOT NULL, snapshot TEXT NOT NULL DEFAULT '{}', note TEXT,
  created_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0, UNIQUE (user_id, kind, period)
);`);
  // Organisation-level connector configuration (not demo data): one row per catalogue entry.
  for (const c of CONNECTORS) run('INSERT OR IGNORE INTO integrations_connectors (key,enabled,scopes) VALUES (?,1,?)', c.key, JSON.stringify(c.defaultScopes));
}

export function seed({ isEmpty, userIdByUsername }) {
  if (!isEmpty('integrations_requests')) return;
  const u = (name) => userIdByUsername(name);
  const at = (n, h = 8) => { const d = new Date(`${day(n)}T00:00:00Z`); d.setUTCHours(h, 20, 0, 0); return d.toISOString(); };
  const req = (who, connector, note, daysAgo, status = 'open', closer = null, resolution = null) => {
    if (!u(who)) return;
    run('INSERT INTO integrations_requests (id,user_id,connector,note,status,created_at,closed_at,closed_by,resolution_note,is_demo) VALUES (?,?,?,?,?,?,?,?,?,1)',
      uid('iq_'), u(who), connector, note, status, at(-daysAgo), status === 'open' ? null : at(-daysAgo + 4, 10), closer ? u(closer) : null, resolution);
  };
  req('hessa', 'hrms', 'نحتاج مزامنة الهيكل التنظيمي والمسميات الوظيفية من نظام الموارد البشرية بدل تحديثها يدوياً قبل دورة التقييم.', 3);
  req('majed', 'erp', 'ربط طلبات الشراء المعتمدة بأوامر الشراء في النظام المالي لتفادي الإدخال المزدوج ومتابعة الالتزامات.', 6);
  req('omar', 'm365', 'إرسال اجتماعات إدارة العمليات إلى تقويم Outlook للفريق.', 24, 'declined', 'mariam', 'مؤجل: يتطلب اعتماد أمن المعلومات لتسجيل التطبيق في Microsoft Entra ID، وسيُعاد فتحه بعد الاعتماد.');
  const review = (who, kind, daysAgo, snapshot) => {
    if (!u(who)) return;
    const created = at(-daysAgo, 9);
    run('INSERT OR IGNORE INTO integrations_reviews (id,user_id,kind,period,snapshot,created_at,is_demo) VALUES (?,?,?,?,?,?,1)', uid('ir_'), u(who), kind, quarterOf(created), JSON.stringify(snapshot), created);
  };
  // The access-review snapshot is computed from the real grants at seed time.
  const grants = all("SELECT c.cap, u.user_type FROM user_caps c JOIN users u ON u.id=c.user_id WHERE u.active=1");
  review('mariam', 'access', 96, { grants: grants.length, external_grants: grants.filter((g) => g.user_type === 'external').length,
    holders: one('SELECT COUNT(DISTINCT user_id) n FROM user_caps').n });
  review('latifa', 'privacy', 90, { opt_in_enabled: [] });
  review('hessa', 'privacy', 9, { opt_in_enabled: [] });
}
