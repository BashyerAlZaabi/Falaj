// Unified Portal + ADAA I + Ask AI + MCP server (everything OUTSIDE Vault).
import express from 'express';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { one, all, run, uid, json, now } from './db.js';
import * as I from './identity.js';
import * as P from './policy.js';
import * as W from './services/work.js';
import * as D from './services/documents.js';
import * as B from './services/dashboard.js';
import * as X from './services/export.js';
import * as AI from './ai/services.js';
import { handleMessage, getConversation, listConversations } from './ai/assistant.js';
import { executeTool, undoAction, resolveConfirmation, agentsFor } from './ai/executor.js';
import { handleMcp } from './mcp/server.js';
import { publicTools } from './mcp/tools.js';
import { subscribe } from './bus.js';
import { seedAll, seedConfig, seedPeople } from './seed.js';
import { initSystems, systemsFor } from './systems/index.js';
import * as O from './services/office.js';
import * as G from './services/game.js';

if (!one('SELECT 1 FROM users LIMIT 1')) seedAll(); else { seedConfig(); seedPeople(); } // idempotent upserts

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  next();
});

// CSRF defence for cookie-authenticated mutations: require same-origin + JSON/custom header.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if ((req.headers.authorization || '').startsWith('Bearer swp_')) return next();
  const origin = req.headers.origin;
  if (origin && origin !== `${req.protocol}://${req.headers.host}`) return res.status(403).json({ error: 'bad_origin' });
  if (req.headers['x-requested-with'] !== 'swp') return res.status(403).json({ error: 'missing_csrf_header' });
  next();
});

app.use(express.json({ limit: '2mb' }));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  const status = e.status || 500;
  if (status === 500) console.error(e);
  res.status(status).json({ error: e.code || 'error', message: status === 500 ? 'خطأ غير متوقع في الخادم' : e.message, ...(e.latest ? { latest: e.latest } : {}) });
});

// ---------------- health ----------------
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'portal', time: now() }));

// ---------------- identity ----------------
const attempts = new Map();
app.post('/api/auth/login', wrap((req, res) => {
  const key = `${req.ip}:${String(req.body?.username || '').toLowerCase()}`;
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 8) return res.status(429).json({ error: 'too_many_attempts', message: 'محاولات كثيرة. حاول بعد قليل.' });
  const userId = I.login(req.body?.username, req.body?.password);
  if (!userId) { a.n++; attempts.set(key, a); return res.status(401).json({ error: 'invalid_credentials', message: 'اسم المستخدم أو كلمة المرور غير صحيحة' }); }
  attempts.delete(key);
  const s = I.createSession(userId);
  res.setHeader('Set-Cookie', I.cookieHeader(s.id, config.sessionHours * 3600));
  res.json({ ok: true, user: I.getUser(userId) });
}));
app.post('/api/auth/logout', (req, res) => {
  const raw = (req.headers.cookie || '').match(new RegExp(`${I.SESSION_COOKIE}=([^;]+)`))?.[1];
  if (raw) I.revokeSession(decodeURIComponent(raw));
  res.setHeader('Set-Cookie', I.cookieHeader('', 0));
  res.json({ ok: true });
});
app.get('/api/identity/public-key', (req, res) => res.type('text/plain').send(I.publicKeyPem));

// SSO for Vault: identity claims flow INTO Vault; no business data flows back.
app.get('/api/identity/sso/authorize', (req, res) => {
  const redirect = String(req.query.redirect_uri || '');
  if (!redirect.startsWith(config.vaultPublicUrl + '/sso/callback')) return res.status(400).send('invalid redirect_uri');
  const user = I.userFromRequest(req);
  if (!user) return res.redirect(`/?next=${encodeURIComponent(req.originalUrl)}#/login`);
  if (I.isExternal(user)) return res.status(403).send('External accounts cannot access Vault.');
  const assertion = I.signAssertion({ aud: 'vault', sub: user.id, name_ar: user.name_ar, name_en: user.name_en, role: user.role, department_id: user.department_id, state: String(req.query.state || '') });
  res.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}assertion=${encodeURIComponent(assertion)}`);
});

app.use('/api', (req, res, next) => (req.path.startsWith('/auth/') || req.path === '/health' || req.path.startsWith('/identity/')) ? next() : I.requireAuth(req, res, next));

// External identities (external auditors, service providers) are confined to the
// systems that expose an external portal: no workspace data, Ask AI, MCP, Vault.
const EXTERNAL_OK = [/^\/me$/, /^\/systems$/, /^\/systems\/[a-z_]+\/prefs$/, /^\/workspace$/, /^\/sys\/[a-z_]+(\/|$)/, /^\/alerts(\/|$)/, /^\/stream$/, /^\/auth\//, /^\/health$/, /^\/identity\/public-key$/];
app.use('/api', (req, res, next) => {
  if (!req.user || !I.isExternal(req.user) || EXTERNAL_OK.some((re) => re.test(req.path))) return next();
  res.status(403).json({ error: 'external_scope', message: 'هذا حساب جهة خارجية ويقتصر على البوابة المخصصة له' });
});

app.get('/api/me', wrap((req, res) => {
  const u = req.user;
  const chat = AI.resolve('chat');
  const external = I.isExternal(u);
  const systems = systemsFor(u);
  res.json({
    user: u,
    external,
    systems,
    apps: [
      ...P.visibleApps(u).map((a) => ({ ...a, roles: undefined, url: a.zone === 'vault' ? `${config.vaultPublicUrl}${a.route}` : a.route })),
      ...systems.map((s) => ({ key: `sys_${s.key}`, system: s.key, name_ar: s.name_ar, name_en: s.name_en, description_ar: s.description_ar, description_en: s.description_en, icon: s.icon, category: 'enterprise', zone: 'portal', route: s.route, url: s.route, integration_status: 'built_in', classification: s.classification })),
    ],
    managed_departments: P.managedDepartments(u),
    assistant: { mode: chat.provider.kind === 'local' ? 'local' : 'model', provider: chat.provider.name, degraded: chat.degraded, status: chat.degraded ? chat.wantedStatus : chat.status },
    voice: { stt: AI.resolve('stt').provider, tts: AI.resolve('tts').provider },
    agents: agentsFor(u).map((a) => ({ key: a.key, name_ar: a.name_ar, name_en: a.name_en })),
    vault_url: config.vaultPublicUrl,
    demo: !!u.is_demo,
  });
}));
app.get('/api/users/assignable', wrap((req, res) => res.json(P.assignableUsers(req.user))));
app.get('/api/users/directory', wrap((req, res) => res.json(all("SELECT u.id,u.name_ar,u.name_en,u.department_id,u.role,u.title_ar,u.title_en,d.name_ar AS dept_ar,d.name_en AS dept_en FROM users u JOIN departments d ON d.id=u.department_id WHERE u.active=1 AND u.user_type='staff' ORDER BY d.name_ar, u.name_ar"))));
app.get('/api/departments', wrap((req, res) => res.json(all('SELECT id,name_ar,name_en,parent_id FROM departments WHERE is_external=0 ORDER BY name_ar'))));

app.post('/api/me/tokens', wrap((req, res) => res.json({ token: I.createApiToken(req.user.id, req.body?.label || 'MCP client'), note: 'يظهر الرمز مرة واحدة فقط' })));

// ---------------- realtime ----------------
app.get('/api/stream', (req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
  const off = subscribe(req.user.id, res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); off(); });
});

// ---------------- work ----------------
app.get('/api/summary', wrap((req, res) => res.json(W.dailySummary(req.user))));
app.get('/api/projects', wrap((req, res) => res.json(W.listProjects(req.user, { status: req.query.status, delayed: req.query.delayed === '1', q: req.query.q }))));
app.get('/api/projects/:id', wrap((req, res) => res.json(W.getProject(req.user, req.params.id))));
app.get('/api/tasks', wrap((req, res) => res.json(W.listTasks(req.user, { status: req.query.status, project_id: req.query.project_id, mine: req.query.mine === '1', overdue: req.query.overdue === '1' }))));
app.get('/api/events', wrap((req, res) => res.json(W.listEvents(req.user, { from: req.query.from, to: req.query.to }))));
app.get('/api/alerts', wrap((req, res) => res.json(W.listAlerts(req.user))));
app.post('/api/alerts/:id/read', wrap((req, res) => { W.markAlertRead(req.user, req.params.id); res.json({ ok: true }); }));
app.get('/api/search', wrap((req, res) => res.json(W.search(req.user, req.query.q))));
app.get('/api/kpis', wrap((req, res) => res.json(W.kpis(req.user))));

// ---------------- strategic portfolio execution (reads; writes go through /api/tools) ----------------
app.get('/api/portfolio', wrap((req, res) => res.json(W.portfolio(req.user, { department_id: req.query.department_id || undefined, status: req.query.status || undefined }))));
app.get('/api/portfolio/meta', wrap((req, res) => res.json(W.portfolioMeta(req.user))));
app.get('/api/assignments', wrap((req, res) => res.json(W.myAssignments(req.user))));
app.get('/api/allocations', wrap((req, res) => res.json(W.listAllocations(req.user, { project_id: req.query.project_id, user_id: req.query.user_id, scope: req.query.scope, status: req.query.status }))));
app.get('/api/allocations/:id', wrap((req, res) => res.json(W.getAllocation(req.user, req.params.id))));
app.get('/api/capacity', wrap((req, res) => res.json(W.personCapacity(req.user, { user_id: req.query.user_id, from: req.query.from, to: req.query.to, percent: req.query.percent, project_id: req.query.project_id, exclude_id: req.query.exclude_id }))));
app.get('/api/capacity/team', wrap((req, res) => res.json(W.teamCapacity(req.user, { department_id: req.query.department_id || undefined }))));

// Direct UI actions use the same executor as the assistant (validation, policy,
// confirmation for destructive actions, idempotency, undo log).
app.post('/api/tools/:name', wrap(async (req, res) => {
  const r = await executeTool(req.user, req.params.name, req.body?.input || {}, { source: 'ui', requestId: req.body?.requestId, confirmed: false });
  res.status(r.status === 'error' ? (r.code === 'forbidden' ? 403 : r.code === 'not_found' ? 404 : 400) : 200).json(r);
}));
app.post('/api/confirmations/:id', wrap(async (req, res) => {
  const r = await resolveConfirmation(req.user, req.params.id, !!req.body?.accept);
  if (r.confirmation?.conversation_id && r.status !== 'error') {
    const text = r.status === 'ok' ? `تم التنفيذ بعد التأكيد: ${r.confirmation.summary}.` : r.status === 'cancelled' ? `أُلغي الإجراء: ${r.confirmation.summary}. لم يُنفَّذ شيء.` : `تعذّر التنفيذ: ${r.error}`;
    run('INSERT INTO messages (id,conversation_id,role,content,meta,created_at) VALUES (?,?,?,?,?,?)', uid('m_'), r.confirmation.conversation_id, 'assistant', text, JSON.stringify({ status: r.status === 'ok' ? 'done' : r.status }), now());
    r.message = text;
  }
  res.json(r);
}));
app.post('/api/actions/:id/undo', wrap(async (req, res) => res.json(await undoAction(req.user, req.params.id))));

// ---------------- Agents Office ----------------
// Agents only PREPARE proposals. Approval is a human action: it is accepted only
// from an interactive session (cookie + CSRF header), never from API/MCP tokens.
const humanOnly = (req, res, next) => ((req.headers.authorization || '').startsWith('Bearer ') ? res.status(403).json({ error: 'human_approval_required', message: 'الموافقة على أعمال الوكلاء تتم من الواجهة فقط' }) : next());
app.get('/api/office/templates', wrap((req, res) => res.json(O.TEMPLATES)));
app.get('/api/office/agents', wrap((req, res) => res.json(O.listAgents(req.user))));
app.post('/api/office/agents', wrap(async (req, res) => {
  const r = await executeTool(req.user, 'create_office_agent', req.body || {}, { source: 'ui', requestId: req.headers['x-request-id'] });
  res.status(r.status === 'ok' ? 200 : 400).json(r);
}));
app.put('/api/office/agents/:id', wrap((req, res) => res.json(O.updateAgent(req.user, req.params.id, req.body || {}))));
app.delete('/api/office/agents/:id', wrap((req, res) => {
  if (req.query.confirm !== '1') return res.status(428).json({ error: 'confirmation_required', message: 'حذف الوكيل يتطلب تأكيداً' });
  res.json(O.deleteAgent(req.user, req.params.id));
}));
app.post('/api/office/agents/:id/run', wrap(async (req, res) => res.json(await O.prepareRun(req.user, req.params.id, 'manual'))));
app.get('/api/office/runs', wrap((req, res) => res.json(O.listRuns(req.user, { status: req.query.status, agent_id: req.query.agent_id }))));
app.get('/api/office/runs/:id', wrap((req, res) => res.json(O.getRun(req.user, req.params.id))));
app.post('/api/office/runs/:id/approve', humanOnly, wrap(async (req, res) => res.json(await O.approveRun(req.user, req.params.id, req.body?.decisions || []))));
app.post('/api/office/runs/:id/reject', humanOnly, wrap((req, res) => res.json(O.rejectRun(req.user, req.params.id))));

// ---------------- gamification (derived from real work data) ----------------
app.get('/api/game/me', wrap((req, res) => res.json(G.profile(req.user))));
app.get('/api/game/team', wrap((req, res) => res.json(G.team(req.user))));
app.put('/api/game/prefs', wrap((req, res) => res.json(G.setPrefs(req.user.id, req.body || {}))));

// ---------------- dashboard ----------------
app.get('/api/dashboard', wrap((req, res) => res.json({ ...B.getDashboard(req.user), types: B.WIDGET_TYPES })));
app.get('/api/dashboard/versions', wrap((req, res) => res.json(B.listDashboardVersions(req.user))));
app.get('/api/dashboard/widgets/:id/data', wrap((req, res) => {
  const w = B.getDashboard(req.user).layout.find((x) => x.id === req.params.id);
  if (!w) return res.status(404).json({ error: 'not_found' });
  res.json(B.widgetData(req.user, w));
}));

// ---------------- documents ----------------
app.get('/api/documents', wrap((req, res) => res.json(D.listDocuments(req.user))));
app.get('/api/documents/:id', wrap((req, res) => res.json(D.getDocument(req.user, req.params.id))));
app.put('/api/documents/:id', wrap((req, res) => {
  const b = req.body || {};
  const r = D.saveDocument(req.user, req.params.id, { title: b.title, content_html: b.content_html, base_version: b.base_version, autosave: !!b.autosave, reason: b.autosave ? 'autosave' : 'manual' });
  res.json(r.result);
}));
app.get('/api/documents/:id/versions', wrap((req, res) => res.json(D.listVersions(req.user, req.params.id))));
app.get('/api/documents/:id/versions/:v', wrap((req, res) => res.json(D.getVersion(req.user, req.params.id, Number(req.params.v)))));
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
app.get('/api/documents/:id/export.docx', wrap(async (req, res) => {
  const d = D.getDocument(req.user, req.params.id);
  const buf = await X.toDocx(d);
  res.setHeader('Content-Disposition', `attachment; filename="document.docx"; filename*=UTF-8''${encodeURIComponent(safeName(d.title))}.docx`);
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(buf);
}));
app.get('/api/documents/:id/export.pdf', wrap(async (req, res) => {
  const d = D.getDocument(req.user, req.params.id);
  const buf = await X.toPdf(d);
  res.setHeader('Content-Disposition', `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(safeName(d.title))}.pdf`);
  res.type('application/pdf').send(Buffer.from(buf));
}));

// ---------------- conversations & Ask AI ----------------
app.get('/api/conversations', wrap((req, res) => res.json(listConversations(req.user))));
app.get('/api/conversations/:id', wrap((req, res) => {
  const c = getConversation(req.user, req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  res.json(c);
}));
app.post('/api/chat', async (req, res) => {
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
  const emit = (e) => { try { res.write(JSON.stringify(e) + '\n'); } catch {} };
  try { await handleMessage(req.user, req.body || {}, emit); } catch (e) { emit({ stage: 'final', status: 'failed', text: `تعذّر التنفيذ: ${e.message}` }); }
  res.end();
});
app.get('/api/chat/result/:requestId', wrap((req, res) => {
  const r = one('SELECT status,response FROM idempotency WHERE user_id=? AND key=?', req.user.id, req.params.requestId);
  res.json(r ? { status: r.status, response: json(r.response) } : { status: 'unknown' });
}));

// ---------------- uploads for chat analysis (outside Vault) ----------------
app.post('/api/uploads', express.raw({ type: '*/*', limit: '8mb' }), wrap(async (req, res) => {
  const filename = decodeURIComponent(String(req.headers['x-filename'] || 'file')).slice(0, 200);
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'empty', message: 'الملف فارغ' });
  let text = null; let note = null;
  if (/\.(txt|md|csv|json|tsv|log)$/i.test(filename)) text = buf.toString('utf8');
  else if (/\.docx$/i.test(filename)) { const mammoth = (await import('mammoth')).default; text = (await mammoth.extractRawText({ buffer: buf })).value; }
  else note = 'نوع الملف غير مدعوم للتحليل النصي (المدعوم: txt, md, csv, json, docx).';
  const id = uid('up_');
  run('INSERT INTO uploads (id,user_id,filename,mime,size,text_content) VALUES (?,?,?,?,?,?)', id, req.user.id, filename, req.headers['content-type'] || null, buf.length, text ? text.slice(0, 500000) : null);
  res.json({ id, filename, size: buf.length, analyzable: !!text, note });
}));

// ---------------- Smart Uploader (outside Vault → Marsad inside Vault, inbound only) ----------------
// The file is streamed to Vault's ingest endpoint and never stored, indexed or
// sent to AI Services here. Only an opaque receipt is kept.
app.post('/api/su/upload', express.raw({ type: '*/*', limit: '20mb' }), wrap(async (req, res) => {
  if (!config.suServiceToken) return res.status(503).json({ error: 'not_configured', message: 'تكامل Smart Uploader مع مرصاد غير مضبوط (SU_SERVICE_TOKEN).' });
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'empty', message: 'الملف فارغ' });
  const id = uid('su_');
  try {
    const r = await fetch(config.vaultIngestUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.suServiceToken}`, 'content-type': 'application/octet-stream', 'x-filename': req.headers['x-filename'] || 'upload.bin', 'x-uploader': req.user.id, 'x-department': req.user.department_id },
      body: buf,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.message || `Vault ${r.status}`);
    run('INSERT INTO su_receipts (id,user_id,vault_receipt,status,size) VALUES (?,?,?,?,?)', id, req.user.id, String(body.receipt || ''), 'delivered', buf.length);
    res.json({ ok: true, receipt: body.receipt, status: 'delivered', note: 'سُلِّم الملف إلى مرصاد داخل Vault. لا يُحتفظ بنسخة منه خارج Vault.' });
  } catch (e) {
    run('INSERT INTO su_receipts (id,user_id,vault_receipt,status,size) VALUES (?,?,?,?,?)', id, req.user.id, null, 'failed', buf.length);
    res.status(502).json({ error: 'vault_unreachable', message: `تعذّر التسليم إلى مرصاد: ${e.message}. لم يُحفظ الملف.` });
  }
}));
app.get('/api/su/receipts', wrap((req, res) => res.json(all('SELECT id,vault_receipt,status,size,created_at FROM su_receipts WHERE user_id=? ORDER BY created_at DESC LIMIT 20', req.user.id))));

// ---------------- voice (server-side STT if an STT provider is routed) ----------------
app.get('/api/voice/status', wrap((req, res) => {
  const stt = AI.resolve('stt'); const tts = AI.resolve('tts');
  res.json({ stt: { provider: stt.provider.name, kind: stt.provider.id === 'ap_browser_speech' ? 'browser' : stt.provider.kind, status: AI.providerStatus(stt.provider) }, tts: { provider: tts.provider.name, kind: tts.provider.id === 'ap_browser_speech' ? 'browser' : tts.provider.kind } });
}));
app.post('/api/voice/transcribe', express.raw({ type: 'audio/*', limit: '15mb' }), wrap(async (req, res) => {
  const stt = AI.resolve('stt');
  if (stt.provider.kind !== 'openai_compatible') return res.status(503).json({ error: 'stt_not_configured', message: 'لا توجد خدمة تحويل كلام إلى نص على الخادم؛ يُستخدم التعرّف في المتصفح.' });
  const fd = new FormData();
  fd.append('file', new Blob([req.body], { type: req.headers['content-type'] }), 'audio.webm');
  fd.append('model', stt.provider.model);
  if (req.query.lang) fd.append('language', String(req.query.lang).slice(0, 2));
  const r = await fetch(`${stt.provider.base_url.replace(/\/$/, '')}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${process.env[stt.provider.api_key_env]}` }, body: fd });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(502).json({ error: 'stt_failed', message: body?.error?.message || 'تعذّر تحويل الصوت' });
  res.json({ text: body.text });
}));

// ---------------- skills / agents / tools catalog ----------------
app.get('/api/skills', wrap((req, res) => res.json(all('SELECT * FROM skills WHERE enabled=1').map((s) => ({ ...s, inputs: json(s.inputs) })))));
app.post('/api/skills/:key/run', wrap(async (req, res) => {
  const r = await executeTool(req.user, 'run_skill', { key: req.params.key, input: req.body?.input || {} }, { source: 'api', requestId: req.body?.requestId });
  res.status(r.status === 'error' ? 400 : 200).json(r);
}));
app.get('/api/catalog', wrap((req, res) => res.json({
  agents: agentsFor(req.user).map((a) => ({ key: a.key, name_ar: a.name_ar, name_en: a.name_en, description_ar: a.description_ar, tools: a.tools, allowed_roles: a.allowed_roles })),
  tools: publicTools().map((t) => ({ name: t.name, description: t.description, mutates: !!t.mutates, destructive: t.destructive || null, input_schema: t.input_schema })),
})));

// ---------------- admin (platform configuration only; grants no data access) ----------------
app.get('/api/admin/ai', I.requireAdmin, wrap(async (req, res) => {
  res.json({
    providers: AI.listProviders().map((p) => ({ ...p, status: AI.providerStatus(p) })),
    routing: AI.routing(), capabilities: AI.CAPABILITIES, usage: AI.usageSummary(),
    pdf: await X.pdfEngineStatus(),
    vault: await vaultHealth(),
    su: { configured: !!config.suServiceToken, ingest_url: config.vaultIngestUrl },
  });
}));
app.put('/api/admin/ai/providers', I.requireAdmin, wrap((req, res) => res.json(AI.upsertProvider(req.body || {}))));
app.post('/api/admin/ai/providers/:id/test', I.requireAdmin, wrap(async (req, res) => res.json(await AI.testProvider(req.params.id))));
app.put('/api/admin/ai/routing', I.requireAdmin, wrap((req, res) => { AI.setRoute(req.body.capability, req.body.provider_id); res.json(AI.routing()); }));
app.get('/api/admin/agents', I.requireAdmin, wrap((req, res) => res.json(all('SELECT * FROM agents').map((a) => ({ ...a, tools: json(a.tools), allowed_roles: json(a.allowed_roles) })))));
app.put('/api/admin/agents/:key', I.requireAdmin, wrap((req, res) => {
  const a = one('SELECT * FROM agents WHERE key=?', req.params.key);
  if (!a) return res.status(404).json({ error: 'not_found' });
  const roles = req.body.allowed_roles ?? json(a.allowed_roles);
  if (!roles.every((r) => ['employee', 'manager', 'president'].includes(r))) return res.status(400).json({ error: 'bad_roles' });
  run('UPDATE agents SET enabled=?, allowed_roles=? WHERE key=?', req.body.enabled === false ? 0 : 1, JSON.stringify(roles), a.key);
  res.json({ ok: true });
}));
app.get('/api/admin/users', I.requireAdmin, wrap((req, res) => res.json(all('SELECT u.id,u.username,u.name_ar,u.name_en,u.role,u.is_admin,u.department_id,d.name_ar dept_ar,u.is_demo,u.active FROM users u JOIN departments d ON d.id=u.department_id ORDER BY d.name_ar'))));
app.get('/api/admin/departments', I.requireAdmin, wrap((req, res) => res.json(all('SELECT * FROM departments'))));
app.post('/api/admin/departments', I.requireAdmin, wrap((req, res) => {
  const b = req.body || {};
  if (!String(b.name_ar || '').trim()) return res.status(400).json({ error: 'bad_name', message: 'اسم الإدارة مطلوب' });
  if (b.parent_id && !one('SELECT 1 FROM departments WHERE id=?', b.parent_id)) return res.status(400).json({ error: 'bad_parent' });
  const id = uid('dept_');
  run('INSERT INTO departments (id,name_ar,name_en,parent_id) VALUES (?,?,?,?)', id, String(b.name_ar).trim(), String(b.name_en || b.name_ar).trim(), b.parent_id || null);
  res.json({ id });
}));
// Changing permissions/roles requires explicit confirmation from the client (confirm: true after dialog).
app.put('/api/admin/users/:id', I.requireAdmin, wrap((req, res) => {
  if (req.body?.confirm !== true) return res.status(428).json({ error: 'confirmation_required', message: 'تغيير الصلاحيات يتطلب تأكيداً صريحاً' });
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const role = req.body.role ?? u.role; const dept = req.body.department_id ?? u.department_id;
  if (!['employee', 'manager', 'president'].includes(role)) return res.status(400).json({ error: 'bad_role' });
  if (!one('SELECT 1 FROM departments WHERE id=?', dept)) return res.status(400).json({ error: 'bad_department' });
  run('UPDATE users SET role=?, department_id=?, active=? WHERE id=?', role, dept, req.body.active === false ? 0 : 1, u.id);
  run('INSERT INTO audit (id,user_id,action,target,detail) VALUES (?,?,?,?,?)', uid('au_'), req.user.id, 'user.permissions', u.id, JSON.stringify({ role, dept }));
  res.json({ ok: true });
}));
app.post('/api/admin/users', I.requireAdmin, wrap((req, res) => {
  const b = req.body || {};
  if (b.confirm !== true) return res.status(428).json({ error: 'confirmation_required', message: 'منح الصلاحيات يتطلب تأكيداً صريحاً' });
  if (!/^[a-z0-9._-]{3,40}$/.test(b.username || '')) return res.status(400).json({ error: 'bad_username', message: 'اسم مستخدم غير صالح' });
  if (String(b.password || '').length < 8) return res.status(400).json({ error: 'weak_password', message: 'كلمة المرور 8 أحرف على الأقل' });
  if (!['employee', 'manager', 'president'].includes(b.role)) return res.status(400).json({ error: 'bad_role' });
  if (!one('SELECT 1 FROM departments WHERE id=?', b.department_id)) return res.status(400).json({ error: 'bad_department' });
  const id = uid('u_');
  run('INSERT INTO users (id,username,password_hash,name_ar,name_en,role,department_id,title_ar) VALUES (?,?,?,?,?,?,?,?)', id, b.username, I.hashPassword(b.password), b.name_ar || b.username, b.name_en || b.username, b.role, b.department_id, b.title_ar || null);
  res.json({ id });
}));

async function vaultHealth() {
  try {
    const r = await fetch(`${config.vaultPublicUrl}/health`, { signal: AbortSignal.timeout(1500) });
    const b = await r.json();
    return { reachable: r.ok, status: b.status, local_ai: b.local_ai };
  } catch { return { reachable: false }; }
}

// ---------------- MCP ----------------
app.post('/mcp', express.json({ limit: '1mb' }), (req, res, next) => {
  const user = I.userFromRequest(req);
  if (!user) return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } });
  if (I.isExternal(user)) return res.status(403).json({ jsonrpc: '2.0', id: null, error: { code: -32003, message: 'External accounts cannot use MCP' } });
  if (!(req.headers.authorization || '').startsWith('Bearer ') && req.headers['x-requested-with'] !== 'swp') return res.status(403).json({ error: 'missing_csrf_header' });
  req.user = user;
  handleMcp(req, res).catch(next);
});
app.get('/mcp', (req, res) => res.status(405).set('Allow', 'POST').end());

// ---------------- enterprise systems (/api/sys/<key>, /api/systems, /api/workspace) ----------------
initSystems(app, { requireAdmin: I.requireAdmin });

// ---------------- static web app ----------------
app.use('/fonts', express.static(path.join(ROOT, 'node_modules/@fontsource/ibm-plex-sans-arabic/files'), { maxAge: '30d' }));
app.use('/fonts', express.static(path.join(ROOT, 'node_modules/@fontsource-variable/inter/files'), { maxAge: '30d' }));
app.use(express.static(path.join(ROOT, 'web'), { index: 'index.html', maxAge: 0 }));
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

if (process.argv[1] && process.argv[1].endsWith(path.join('server', 'index.js'))) {
  const server = app.listen(config.port, () => console.log(`[portal] Unified Portal on ${config.publicUrl}`));
  O.startScheduler(I.getUser, Number(process.env.OFFICE_TICK_MS || 30000));
  const stop = async () => { await X.closeBrowser(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
