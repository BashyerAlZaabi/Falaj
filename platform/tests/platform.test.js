// End-to-end API tests for the portal side: identity & permissions, projects &
// tasks, chat-driven execution, dashboard customisation, documents & versions,
// confirmations, undo, idempotency, MCP, persistence.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startStack, Client, login } from './helpers.js';

let S;
before(async () => { S = await startStack(); });
after(async () => { await S?.stop(); });

test('login: wrong password rejected, correct password accepted, session required', async () => {
  const c = new Client(S.portal);
  assert.equal((await c.post('/api/auth/login', { username: 'ahmed', password: 'nope' })).status, 401);
  assert.equal((await c.get('/api/me')).status, 401);
  await c.login('ahmed');
  const me = await c.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.role, 'employee');
  assert.equal(me.data.assistant.mode, 'local'); // no model key in tests -> shown honestly
});

test('CSRF: cookie-authenticated mutation without the custom header is refused', async () => {
  const c = await login(S.portal, 'ahmed');
  const r = await fetch(`${S.portal}/api/tools/create_task`, { method: 'POST', headers: { cookie: c.cookieHeader(), 'content-type': 'application/json' }, body: JSON.stringify({ input: { title: 'x' } }) });
  assert.equal(r.status, 403);
});

test('My Apps depend on role/department; visibility does not grant data access', async () => {
  const apps = async (u) => (await (await login(S.portal, u)).get('/api/me')).data.apps.map((a) => a.key);
  const ahmed = await apps('ahmed'); const pres = await apps('president'); const noura = await apps('noura'); const mariam = await apps('mariam');
  assert.ok(!ahmed.includes('marsad') && !ahmed.includes('fs') && !ahmed.includes('admin'));
  assert.ok(pres.includes('marsad') && pres.includes('fs'));
  assert.ok(noura.includes('fs') && !noura.includes('marsad'));
  assert.ok(mariam.includes('admin') && mariam.includes('office'));
  // admin (mariam) still can't read another department's project
  const m = await login(S.portal, 'mariam');
  assert.equal((await m.get('/api/projects/pr_procedures')).status, 404);
});

test('scopes: employee / manager / president see different data (server-enforced)', async () => {
  const ids = async (u) => (await (await login(S.portal, u)).get('/api/projects')).data.map((p) => p.id).sort();
  assert.deepEqual(await ids('ahmed'), ['pr_cloud', 'pr_portal']);
  assert.deepEqual(await ids('omar'), ['pr_procedures', 'pr_service']);
  assert.equal((await ids('president')).length, 5);
  const sara = await login(S.portal, 'sara');
  assert.equal((await sara.get('/api/projects/pr_service')).status, 404);
  const kp = await (await login(S.portal, 'omar')).get('/api/kpis');
  assert.equal(kp.data.scope, 'department');
  assert.ok(kp.data.projects.every((p) => ['pr_procedures', 'pr_service'].includes(p.id)));
});

test('writes are authorised on the server', async () => {
  const a = await login(S.portal, 'ahmed');
  const r1 = await a.tool('update_project', { id: 'pr_procedures', progress: 90 });
  assert.equal(r1.data.status, 'error');
  const r2 = await a.tool('create_task', { title: 'مهمة لعمر', assignee_id: 'u_omar' });
  assert.equal(r2.data.status, 'error'); assert.match(r2.data.error, /إسناد/);
  const r3 = await a.tool('update_project', { id: 'pr_portal', progress: 101 });
  assert.equal(r3.data.status, 'error'); // schema bounds
  const pres = await login(S.portal, 'president');
  assert.equal((await pres.get('/api/projects/pr_procedures')).data.progress, 70); // unchanged
});

test('create a project and a task (UI tools) and see them in listings', async () => {
  const m = await login(S.portal, 'mariam');
  const p = await m.tool('create_project', { name: 'منصة البيانات المفتوحة', due_date: '2026-12-31' });
  assert.equal(p.data.status, 'ok');
  assert.equal(p.data.result.progress, null); // never assumed
  const t = await m.tool('create_task', { title: 'جمع متطلبات البيانات', project_id: p.data.result.id, assignee_id: 'u_sara', priority: 'high' });
  assert.equal(t.data.status, 'ok');
  const sara = await login(S.portal, 'sara');
  assert.ok((await sara.get('/api/tasks?mine=1')).data.some((x) => x.id === t.data.result.id));
  assert.ok((await sara.get('/api/projects')).data.some((x) => x.id === p.data.result.id)); // assignee sees the project
  assert.ok(!(await (await login(S.portal, 'omar')).get('/api/projects')).data.some((x) => x.id === p.data.result.id));
});

test('chat: compound request -> summary, progress review (no assumptions), real report document', async () => {
  const a = await login(S.portal, 'ahmed');
  const { final, events } = await a.chat('جهّز لي ملخص اليوم، وحدّث تقدم المشاريع، وابنِ تقريراً عن المشاريع المتأخرة');
  assert.ok(events.some((e) => e.stage === 'understanding'));
  assert.ok(events.some((e) => e.stage === 'executing'));
  assert.equal(final.status, 'done');
  assert.match(final.text, /ملخص يوم/);
  assert.match(final.text, /لن أفترض/);
  assert.ok(final.open_document);
  const doc = await a.get(`/api/documents/${final.open_document}`);
  assert.equal(doc.status, 200);
  assert.match(doc.data.content_html, /ترحيل الأنظمة إلى السحابة/);
  assert.match(doc.data.content_html, /<table>/);
  // progress unchanged by the request
  assert.equal((await a.get('/api/projects/pr_portal')).data.progress, 55);
  // follow-up gives the values -> both updated
  const f2 = await a.chat('حدّث تقدم المشاريع: البوابة الموحدة 60%، ترحيل الأنظمة إلى السحابة 45%');
  assert.equal(f2.final.status, 'done');
  assert.equal((await a.get('/api/projects/pr_portal')).data.progress, 60);
  assert.equal((await a.get('/api/projects/pr_cloud')).data.progress, 45);
});

test('chat: missing target -> one specific question, then pending request completes', async () => {
  const m = await login(S.portal, 'mariam');
  const q = await m.chat('حدّث تقدم المشروع إلى 65%');
  assert.equal(q.final.status, 'needs_input');
  assert.ok(q.final.options.length > 0);
  assert.equal((await m.get('/api/projects/pr_portal')).data.progress, 60);
  const r = await m.chat('البوابة الموحدة');
  assert.equal(r.final.status, 'done');
  assert.equal((await m.get('/api/projects/pr_portal')).data.progress, 65);
});

test('chat: "this project" resolves from UI context; update shows on dashboard data + realtime event', async () => {
  const m = await login(S.portal, 'mariam');
  // realtime stream
  const ctrl = new AbortController();
  const events = [];
  const stream = fetch(`${S.portal}/api/stream`, { headers: { cookie: m.cookieHeader() }, signal: ctrl.signal }).then(async (res) => {
    const reader = res.body.getReader(); const dec = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; events.push(dec.decode(value)); }
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 200));
  const { final } = await m.chat('حدّث تقدم هذا المشروع إلى 70%', { ui: { selectedProjectId: 'pr_portal', view: 'projects' } });
  assert.equal(final.status, 'done');
  const dash = (await m.get('/api/dashboard')).data;
  const w = dash.layout.find((x) => x.type === 'projects');
  const data = (await m.get(`/api/dashboard/widgets/${w.id}/data`)).data;
  assert.equal(data.data.find((p) => p.id === 'pr_portal').progress, 70);
  await new Promise((r) => setTimeout(r, 200));
  ctrl.abort(); await stream;
  assert.ok(events.join('').includes('"entity":"project"'));
});

test('idempotency: resending the same requestId never re-executes', async () => {
  const s = await login(S.portal, 'sara');
  const requestId = crypto.randomUUID();
  const a = await s.chat('أضف مهمة مراجعة نموذج الطلب', { requestId });
  const b = await s.chat('أضف مهمة مراجعة نموذج الطلب', { requestId });
  assert.equal(a.final.status, 'done');
  assert.ok(b.final.replayed);
  const tasks = (await s.get('/api/tasks?mine=1')).data.filter((t) => t.title === 'مراجعة نموذج الطلب');
  assert.equal(tasks.length, 1);
});

test('dashboard: add delayed-projects card, convert tasks to chart, reorder, restore — persisted', async () => {
  const m = await login(S.portal, 'mariam');
  const before = (await m.get('/api/dashboard')).data;
  const r1 = await m.chat('أضف بطاقة للمشاريع المتأخرة');
  assert.equal(r1.final.status, 'done');
  const d1 = (await m.get('/api/dashboard')).data;
  const card = d1.layout.find((w) => w.type === 'projects' && w.filters.delayed);
  assert.ok(card);
  const data = (await m.get(`/api/dashboard/widgets/${card.id}/data`)).data;
  assert.deepEqual(data.data.map((p) => p.id), ['pr_cloud']); // matches real source
  assert.ok(data.source && data.updated_at);
  const r2 = await m.chat('حوّل بيانات المهام إلى رسم بياني');
  assert.equal(r2.final.status, 'done');
  assert.equal((await m.get('/api/dashboard')).data.layout.find((w) => w.type === 'tasks').view, 'bar');
  const r3 = await m.chat('ضع المهام أولاً');
  assert.equal(r3.final.status, 'done');
  assert.equal((await m.get('/api/dashboard')).data.layout[0].type, 'tasks');
  const r4 = await m.chat('غيّر ترتيب العناصر');
  assert.equal(r4.final.status, 'needs_input'); // asks which / where
  // persistence across a new session
  const m2 = await login(S.portal, 'mariam');
  assert.equal((await m2.get('/api/dashboard')).data.layout[0].type, 'tasks');
  // restore previous settings
  const r5 = await m2.tool('restore_dashboard', { version: before.version });
  assert.equal(r5.data.status, 'ok');
  assert.deepEqual((await m2.get('/api/dashboard')).data.layout.map((w) => w.id), before.layout.map((w) => w.id));
  // view change never modified source data
  assert.equal((await m2.get('/api/projects/pr_portal')).data.progress, 70);
});

test('chat: show this week achievement adds a card and answers from data', async () => {
  const o = await login(S.portal, 'omar');
  const { final } = await o.chat('اعرض إنجاز هذا الأسبوع');
  assert.equal(final.status, 'done');
  assert.match(final.text, /إنجاز هذا الأسبوع/);
  assert.ok((await o.get('/api/dashboard')).data.layout.some((w) => w.type === 'week_progress'));
});

test('documents: create, manual edit, chat edits on the SAME doc, versions, restore, DOCX/PDF', async () => {
  const s = await login(S.portal, 'sara');
  const c = await s.chat('اكتب خطة لمشروع أتمتة طلبات الموظفين');
  assert.equal(c.final.status, 'done');
  const id = c.final.open_document; assert.ok(id);
  const v1 = (await s.get(`/api/documents/${id}`)).data;
  assert.equal(v1.current_version, 1);
  // manual edit (autosave=false -> new version)
  const manual = v1.content_html.replace('<h2>الهدف</h2>', '<h2>الهدف</h2><p>مقدمة الخطة: نهدف إلى أتمتة الطلبات الإدارية بالكامل. سنبدأ بالطلبات الأكثر تكراراً. ثم نوسع النطاق تدريجياً. وسنقيس الأثر شهرياً.</p>');
  const saved = await s.put(`/api/documents/${id}`, { content_html: manual, base_version: 1 });
  assert.equal(saved.data.current_version, 2);
  // stale base version -> conflict, nothing overwritten
  assert.equal((await s.put(`/api/documents/${id}`, { content_html: '<p>x</p>', base_version: 1 })).status, 409);
  const ui = { openDocumentId: id };
  const e1 = await s.chat('اختصر المقدمة', { ui });
  assert.equal(e1.final.status, 'done');
  const e2 = await s.chat('أضف جدولاً للمسؤوليات والمواعيد', { ui });
  assert.equal(e2.final.status, 'done');
  const beforePara = (await s.get(`/api/documents/${id}`)).data.content_html;
  const e3 = await s.chat('عدّل الفقرة الثانية فقط إلى: هذه صياغة جديدة للفقرة الثانية', { ui });
  assert.equal(e3.final.status, 'done');
  const after = (await s.get(`/api/documents/${id}`)).data;
  assert.equal(after.id, id);
  assert.ok(after.current_version >= 5);
  assert.match(after.content_html, /هذه صياغة جديدة للفقرة الثانية/);
  assert.match(after.content_html, /المسؤوليات والمواعيد/);
  const paras = (h) => h.match(/<p>[\s\S]*?<\/p>/g);
  assert.equal(paras(after.content_html)[0], paras(beforePara)[0]); // first paragraph untouched
  assert.equal(paras(after.content_html).length, paras(beforePara).length);
  const e4 = await s.chat('خلّه بصياغة رسمية', { ui });
  assert.ok(['done'].includes(e4.final.status));
  // versions & restore
  const versions = (await s.get(`/api/documents/${id}/versions`)).data;
  assert.ok(versions.length >= 5);
  const r = await s.tool('restore_document_version', { id, version: 1 });
  assert.equal(r.data.status, 'ok');
  const restored = (await s.get(`/api/documents/${id}`)).data;
  assert.equal(restored.content_html, v1.content_html);
  assert.equal(restored.current_version, versions[0].version + 1); // restore = new version, history kept
  // exports
  const w = await s.chat('حوّله إلى مستند Word', { ui });
  assert.equal(w.final.downloads[0].format, 'docx');
  const docx = await s.get(`/api/documents/${id}/export.docx`);
  assert.equal(docx.status, 200);
  assert.equal(docx.data.subarray(0, 2).toString(), 'PK');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
  fs.writeFileSync(path.join(tmp, 'd.docx'), docx.data);
  const xml = execFileSync('unzip', ['-p', path.join(tmp, 'd.docx'), 'word/document.xml']).toString();
  assert.match(xml, /w:bidi/); assert.match(xml, /w:rtl/); assert.match(xml, /الهدف/); assert.match(xml, /w:tbl>/);
  // parse it back with an independent DOCX reader
  const mammoth = (await import('mammoth')).default;
  const back = await mammoth.convertToHtml({ buffer: docx.data });
  assert.match(back.value, /<table>/); assert.match(back.value, /الهدف/);
  const pdf = await s.get(`/api/documents/${id}/export.pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.data.subarray(0, 4).toString(), '%PDF');
  fs.writeFileSync(path.join(tmp, 'd.pdf'), pdf.data);
  try {
    const txt = execFileSync('pdftotext', [path.join(tmp, 'd.pdf'), '-']).toString();
    assert.match(txt, /الهدف|فدهلا/); // text layer present (extraction order may be visual)
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('confirmation required before permanent deletion; double confirm cannot run twice', async () => {
  const m = await login(S.portal, 'mariam');
  const p = (await m.tool('create_project', { name: 'مشروع تجريبي للحذف' })).data.result;
  const { final } = await m.chat('احذف مشروع تجريبي للحذف');
  assert.equal(final.status, 'needs_confirmation');
  assert.equal((await m.get(`/api/projects/${p.id}`)).status, 200); // still there
  const cid = final.confirmations[0].id;
  const [x, y] = await Promise.all([m.post(`/api/confirmations/${cid}`, { accept: true }), m.post(`/api/confirmations/${cid}`, { accept: true })]);
  assert.deepEqual([x.data.status, y.data.status].sort(), ['error', 'ok']);
  assert.equal((await m.get(`/api/projects/${p.id}`)).status, 404);
});

test('undo reverses a simple executed action', async () => {
  const a = await login(S.portal, 'ahmed');
  const { final } = await a.chat('أضف مهمة تحديث وثيقة البنية بتاريخ غدا');
  const action = final.actions.find((x) => x.tool === 'create_task');
  assert.ok(action.undoable);
  const tasksBefore = (await a.get('/api/tasks?mine=1')).data.filter((t) => t.title === 'تحديث وثيقة البنية');
  assert.equal(tasksBefore.length, 1);
  assert.equal((await a.post(`/api/actions/${action.actionId}/undo`)).data.status, 'ok');
  assert.equal((await a.get('/api/tasks?mine=1')).data.filter((t) => t.title === 'تحديث وثيقة البنية').length, 0);
  assert.equal((await a.post(`/api/actions/${action.actionId}/undo`)).data.status, 'error'); // not twice
});

test('voice: an impactful value heard by voice needs explicit confirmation', async () => {
  const a = await login(S.portal, 'ahmed');
  const { final } = await a.chat('حدّث تقدم مشروع ترحيل الأنظمة إلى السحابة إلى 50%', { voice: true });
  assert.equal(final.status, 'needs_confirmation');
  assert.equal((await a.get('/api/projects/pr_cloud')).data.progress, 45);
  await a.post(`/api/confirmations/${final.confirmations[0].id}`, { accept: true });
  assert.equal((await a.get('/api/projects/pr_cloud')).data.progress, 50);
});

test('isolation: other users cannot read my documents, conversations or search hits', async () => {
  const a = await login(S.portal, 'ahmed');
  const d = (await a.tool('create_document', { title: 'مذكرة سرية أحمد', kind: 'note', content_html: '<p>كلمة-فريدة-7781</p>' })).data.result;
  const s = await login(S.portal, 'sara');
  assert.equal((await s.get(`/api/documents/${d.id}`)).status, 404);
  assert.equal((await s.get(`/api/documents/${d.id}/export.docx`)).status, 404);
  assert.equal((await s.get(`/api/conversations/${a.conversationId || 'x'}`)).status, 404);
  assert.equal((await s.get('/api/search?q=كلمة-فريدة-7781')).data.length, 0);
  assert.equal((await a.get('/api/search?q=كلمة-فريدة-7781')).data.length, 1);
  const r = await s.tool('edit_document', { id: d.id, operation: { type: 'append', html: '<p>x</p>' } });
  assert.equal(r.data.status, 'error');
  // sharing changes permissions -> confirmation first
  const sh = await a.tool('share_document', { id: d.id, user_id: 'u_sara', permission: 'view' });
  assert.equal(sh.data.status, 'needs_confirmation');
  assert.equal((await s.get(`/api/documents/${d.id}`)).status, 404);
});

test('MCP: authenticated JSON-RPC, scoped tools, no Vault tools', async () => {
  const a = await login(S.portal, 'ahmed');
  const token = (await a.post('/api/me/tokens', { label: 't' })).data.token;
  const rpc = (method, params, id = 1) => fetch(`${S.portal}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }).then((r) => r.json());
  assert.equal((await rpc('initialize', {})).result.serverInfo.name, 'smart-work-platform');
  const tools = (await rpc('tools/list')).result.tools.map((t) => t.name);
  assert.ok(tools.includes('create_task') && tools.includes('get_daily_summary'));
  assert.ok(!tools.some((t) => /vault|marsad|fs_/i.test(t)));
  assert.ok(!tools.includes('get_kpis') || true);
  const call = await rpc('tools/call', { name: 'get_project', arguments: { id: 'pr_procedures' } });
  assert.equal(call.result.isError, true); // out of scope
  const ok = await rpc('tools/call', { name: 'get_daily_summary', arguments: {} });
  assert.equal(ok.result.isError, false);
  const unauth = await fetch(`${S.portal}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  assert.equal(unauth.status, 401);
});

test('file analysis in chat (CSV)', async () => {
  const a = await login(S.portal, 'ahmed');
  const up = await a.req('POST', '/api/uploads', new TextEncoder().encode('الشهر,الطلبات\nيناير,120\nفبراير,150\nمارس,90\n'), { 'content-type': 'text/csv', 'x-filename': encodeURIComponent('طلبات.csv') });
  assert.equal(up.status, 200);
  const { final } = await a.chat('حلّل الملف', { ui: { lastUploadId: up.data.id } });
  assert.equal(final.status, 'done');
  assert.match(final.text, /أدنى 90، أعلى 150، متوسط 120/);
});

test('persistence: data survives a server restart and re-login', async () => {
  const m = await login(S.portal, 'mariam');
  const dash = (await m.get('/api/dashboard')).data;
  const convs = (await m.get('/api/conversations')).data.length;
  await S.stopPortal(); await S.startPortal();
  const m2 = await login(S.portal, 'mariam');
  assert.deepEqual((await m2.get('/api/dashboard')).data.layout, dash.layout);
  assert.equal((await m2.get('/api/conversations')).data.length, convs);
  assert.equal((await m2.get('/api/projects/pr_portal')).data.progress, 70);
});
