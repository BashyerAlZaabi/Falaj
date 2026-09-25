// Integration & Control Center: systems & sidebar, AI data policy per user,
// the real personal calendar feed (ICS) with masking and revocation, honest
// connector catalogue, activation requests, admin-only configuration
// (capability matrix with SoD, data policies, connectors), activity log
// isolation, workspace cards, Ask AI intents and abuse cases.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { as, done, stack } from './_stack.js';
import { feedItems, buildIcs, foldLine, escapeText } from '../../server/systems/integrations/ics.js';

after(done);
const B = '/api/sys/integrations';
const unfold = (ics) => ics.replace(/\r\n[ \t]/g, '');
const fetchText = async (url) => { const r = await fetch(url); return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() }; };
async function freshFeed(c, body = {}) {
  const cur = (await c.get(`${B}/connectors`)).data.connectors.find((x) => x.key === 'ics').feed;
  if (cur) await c.post(`${B}/feeds/${cur.id}/revoke`, { confirm: true });
  const r = await c.post(`${B}/feeds`, body);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}

// ------------------------------------------------------------------ pure ICS builder
test('ICS builder: escaping, UTF-8-safe folding, all-day tasks and confidential masking', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = `SUMMARY:${'اجتماع مراجعة الميزانية التشغيلية '.repeat(4)}`;
  const folded = foldLine(long);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line too long: ${Buffer.byteLength(line)}`);
  assert.equal(folded.replace(/\r\n /g, ''), long, 'unfolding restores the exact text (no split code points)');

  const now = new Date('2026-09-25T08:00:00Z');
  const items = feedItems({
    now, lang: 'ar', baseUrl: 'https://swp.example',
    meetings: [
      { id: 'm1', title: 'اجتماع لجنة سرية جداً', starts_at: '2026-09-28T06:00:00Z', ends_at: '2026-09-28T07:00:00Z', location: 'قاعة المجلس', confidential: true },
      { id: 'm2', title: 'متابعة المشاريع', starts_at: '2026-09-29T06:00:00Z', ends_at: '2026-09-29T07:00:00Z', location: 'قاعة 2', confidential: false },
    ],
    events: [{ id: 'e1', title: 'موعد, مع; الفريق', starts_at: '2026-09-26T09:00:00Z', ends_at: null, location: null }],
    tasks: [{ id: 't1', title: 'إعداد التقرير', due_date: '2026-09-30', status: 'todo', priority: 'high' }, { id: 't2', title: 'منجزة', due_date: '2026-09-30', status: 'done' }],
  });
  assert.equal(items.length, 4, 'done tasks are left out');
  const masked = items.find((i) => i.masked);
  assert.equal(masked.summary, 'مشغول — اجتماع سري');
  assert.equal(masked.location, null); assert.equal(masked.description, null); assert.equal(masked.url, null);
  const ics = buildIcs({ name: 'تقويمي', items, now });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
  const flat = unfold(ics);
  assert.ok(!flat.includes('لجنة سرية') && !flat.includes('قاعة المجلس'), 'no confidential title or location');
  assert.match(flat, /CLASS:CONFIDENTIAL/);
  assert.match(flat, /DTSTAMP:20260925T080000Z/);
  assert.match(flat, /DTSTART;VALUE=DATE:20260930\r\nDTEND;VALUE=DATE:20261001/);
  assert.match(flat, /SUMMARY:موعد\\, مع\\; الفريق/);
  assert.equal((flat.match(/BEGIN:VEVENT/g) || []).length, 4);
});

// ------------------------------------------------------------------ access
test('staff open the control center; external identities never reach it', async () => {
  const ahmed = await as('ahmed');
  const ov = await ahmed.get(`${B}/overview`);
  assert.equal(ov.status, 200);
  assert.equal(ov.data.is_admin, false);
  assert.equal(ov.data.admin, null);
  for (const u of ['horizon', 'oasis', 'rashid']) {
    const c = await as(u);
    for (const p of ['/overview', '/systems', '/ai', '/connectors', '/activity', '/admin/matrix']) assert.equal((await c.get(`${B}${p}`)).status, 403, `${u} ${p}`);
    assert.equal((await c.post(`${B}/feeds`, {})).status, 403, `${u} feed`);
    const me = (await c.get('/api/me')).data;
    assert.ok(!me.systems.some((s) => s.key === 'integrations'), `${u} does not list the center`);
    assert.ok(!(await c.get('/api/workspace')).data.some((w) => w.system === 'integrations'), `${u} workspace`);
  }
});

test('my systems: pin toggles and classification; unavailable systems name who grants access, never their data', async () => {
  const fatima = await as('fatima');
  const s = (await fatima.get(`${B}/systems`)).data;
  assert.ok(s.accessible.some((x) => x.key === 'integrations' && x.classification === 'internal'));
  const prov = s.unavailable.find((x) => x.key === 'providers');
  assert.ok(prov, 'providers is not available to an operations employee');
  assert.deepEqual(Object.keys(prov).sort(), ['category', 'description_ar', 'description_en', 'icon', 'key', 'name_ar', 'name_en', 'who_ar', 'who_en'].sort());
  assert.ok(s.admins.some((a) => a.id === 'u_mariam'));
  const r = await fatima.put('/api/systems/meetings/prefs', { pinned: false });
  assert.equal(r.status, 200);
  assert.equal((await fatima.get(`${B}/systems`)).data.accessible.find((x) => x.key === 'meetings').pinned, false);
  await fatima.put('/api/systems/meetings/prefs', { pinned: true });
});

test('AI & data: locked domains are never readable, opt-in is per user and logged as my own activity', async () => {
  const ahmed = await as('ahmed');
  const ai = (await ahmed.get(`${B}/ai`)).data;
  const integ = ai.systems.find((x) => x.key === 'integrity');
  assert.ok(integ.domains.every((d) => d.ai_policy === 'off' && d.ai_locked && !d.ai_active));
  assert.ok(ai.map.some((d) => d.key === 'integrations.config' && d.ai_locked), 'the center’s own settings domain is locked');
  assert.ok(ai.counts.locked >= 5);
  const g0 = ai.systems.find((x) => x.key === 'goals');
  assert.equal(g0.optional, true);
  assert.equal((await ahmed.put('/api/systems/goals/prefs', { ai_enabled: true })).status, 200);
  const g1 = (await ahmed.get(`${B}/ai`)).data.systems.find((x) => x.key === 'goals');
  assert.ok(g1.domains.find((d) => d.key === 'goals.personal').ai_active);
  const sara = (await (await as('sara')).get(`${B}/ai`)).data.systems.find((x) => x.key === 'goals');
  assert.equal(sara.domains.find((d) => d.key === 'goals.personal').ai_active, false, 'opt-in never spreads to colleagues');
  await ahmed.put('/api/systems/goals/prefs', { ai_enabled: false });
  const act = (await ahmed.get(`${B}/activity`)).data.entries;
  assert.ok(act.filter((e) => e.action === 'system.ai_access').length >= 2);
});

test('privacy check-up: once per quarter, audited, and derived excellence points', async () => {
  const sara = await as('sara');
  const r = await sara.post(`${B}/ai/review`, {});
  assert.equal(r.status, 200);
  assert.ok(r.data.done_at);
  assert.equal((await sara.post(`${B}/ai/review`, {})).status, 409);
  assert.equal((await sara.post(`${B}/ai/review`, { extra: 1 })).status, 400);
  assert.ok((await sara.get(`${B}/activity`)).data.entries.some((e) => e.action === 'integrations.privacy_review'));
  const game = (await sara.get('/api/game/me')).data;
  assert.ok(game.rules.some((x) => x.key === 'integrations_privacy_review' && x.points === 10));
  const ws = (await sara.get('/api/workspace')).data.find((w) => w.system === 'integrations');
  assert.equal(ws.cards[0].tone, null, 'check-up done: the card is calm');
});

// ------------------------------------------------------------------ calendar feed
test('calendar feed: secret link shown once, valid RFC 5545 with only my own items, usage tracked', async () => {
  const ahmed = await as('ahmed');
  const f = await freshFeed(ahmed);
  assert.match(f.url, /\/pub\/sys\/integrations\/calendar\/swpcal_[A-Za-z0-9_-]{32}\.ics$/);
  assert.ok(f.webcal.startsWith('webcal://'));
  assert.equal((await ahmed.post(`${B}/feeds`, {})).status, 409, 'one active link at a time');
  const view = (await ahmed.get(`${B}/connectors`)).data.connectors.find((c) => c.key === 'ics');
  assert.equal(view.status, 'connected');
  assert.ok(!JSON.stringify(view).includes(f.url.split('/').pop().replace('.ics', '')), 'the token is never returned again');
  assert.equal(view.feed.hint, f.url.slice(-8, -4));

  const a = await fetchText(f.url);
  assert.equal(a.status, 200);
  assert.match(a.type, /^text\/calendar/);
  const flat = unfold(a.text);
  assert.ok(flat.includes('ربط الهوية الموحدة'), 'my own task is in the feed');
  assert.ok(flat.includes('اجتماع متابعة البوابة الموحدة'), 'an appointment I attend is in the feed');
  assert.ok(!flat.includes('اختيار نظام إدارة التذاكر'), 'a colleague’s task in another department never appears');
  assert.ok(!flat.includes('تجهيز عرض مجلس الإدارة'), 'the president’s own task never appears');
  for (const line of a.text.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.match(flat, /DTSTAMP:\d{8}T\d{6}Z/);
  const uids = (t) => [...unfold(t).matchAll(/UID:(\S+)/g)].map((m) => m[1]).sort();
  const b = await fetchText(f.url);
  assert.deepEqual(uids(b.text), uids(a.text), 'UIDs are stable across fetches');
  const after2 = (await ahmed.get(`${B}/connectors`)).data.connectors.find((c) => c.key === 'ics').feed;
  assert.ok(after2.last_used_at);
  assert.ok(after2.use_count >= 2);
  const hits = (await ahmed.get(`${B}/activity`)).data.feed_hits;
  assert.ok(hits.filter((h) => h.outcome === 'served').length >= 2);
});

test('feed options: sources can be switched off, and at least one must stay on', async () => {
  const ahmed = await as('ahmed');
  const f = await freshFeed(ahmed, { include_tasks: false });
  const flat = unfold((await fetchText(f.url)).text);
  assert.ok(!flat.includes('مهمة: '), 'tasks are left out when switched off');
  const id = f.feed.id;
  assert.equal((await ahmed.put(`${B}/feeds/${id}`, { include_tasks: true })).status, 200);
  assert.ok(unfold((await fetchText(f.url)).text).includes('مهمة: '));
  await ahmed.put(`${B}/feeds/${id}`, { include_events: false, include_meetings: false });
  assert.equal((await ahmed.put(`${B}/feeds/${id}`, { include_tasks: false })).status, 400, 'cannot switch everything off');
  const p = (await ahmed.get(`${B}/feed/preview?meetings=0&events=0&tasks=1`)).data;
  assert.ok(p.items.every((i) => i.kind === 'task'));
});

test('feed without a token, with an unknown token, or after rotation/revocation is 404', async () => {
  const s = await stack();
  const ahmed = await as('ahmed');
  assert.equal((await fetch(`${s.portal}/pub/sys/integrations/calendar/`)).status, 404);
  assert.equal((await fetch(`${s.portal}/pub/sys/integrations/calendar/nothing.ics`)).status, 404);
  assert.equal((await fetch(`${s.portal}/pub/sys/integrations/calendar/swpcal_${'A'.repeat(32)}.ics`)).status, 404);
  const f = await freshFeed(ahmed);
  assert.equal((await fetchText(f.url)).status, 200);
  assert.equal((await ahmed.post(`${B}/feeds/rotate`, {})).status, 428, 'rotation needs confirmation');
  const r = await ahmed.post(`${B}/feeds/rotate`, { confirm: true });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.url, f.url);
  assert.equal((await fetchText(f.url)).status, 404, 'the old link stops immediately');
  assert.equal((await fetchText(r.data.url)).status, 200);
  assert.equal((await ahmed.post(`${B}/feeds/${r.data.feed.id}/revoke`, {})).status, 428);
  assert.equal((await ahmed.post(`${B}/feeds/${r.data.feed.id}/revoke`, { confirm: true })).status, 200);
  assert.equal((await fetchText(r.data.url)).status, 404);
  assert.equal((await ahmed.post(`${B}/feeds/${r.data.feed.id}/revoke`, { confirm: true })).status, 404, 'already revoked');
  const hits = (await ahmed.get(`${B}/activity`)).data.feed_hits;
  assert.ok(hits.some((h) => h.outcome === 'revoked'), 'attempts with a revoked link are visible to the owner');
  const acts = (await ahmed.get(`${B}/activity`)).data.entries.map((e) => e.action);
  for (const a of ['integrations.feed.create', 'integrations.feed.rotate', 'integrations.feed.revoke']) assert.ok(acts.includes(a), a);
});

test('confidential meetings appear only as “busy” in the feed and its preview', async () => {
  // majed organises the confidential procurement-committee bid evaluation (demo);
  // aisha organises the confidential audit-committee meeting.
  for (const [u, secret] of [['majed', 'تقييم عروض مناقصة الخدمات السحابية'], ['aisha', 'نتائج تدقيق دورة المشتريات']]) {
    const c = await as(u);
    const f = await freshFeed(c);
    const flat = unfold((await fetchText(f.url)).text);
    assert.ok(!flat.includes(secret), `${u}: no confidential meeting title leaks`);
    const preview = (await c.get(`${B}/feed/preview`)).data;
    assert.ok(!JSON.stringify(preview).includes(secret), `${u}: preview masks it too`);
    for (const i of preview.items.filter((x) => x.masked)) { assert.equal(i.summary, 'مشغول — اجتماع سري'); assert.equal(i.location, null); }
    if (u === 'majed' && preview.meetings_available) {
      assert.ok(preview.items.some((x) => x.masked), 'the upcoming confidential meeting is shown as busy');
      assert.match(flat, /SUMMARY:مشغول — اجتماع سري/);
      assert.match(flat, /CLASS:CONFIDENTIAL/);
    }
    await c.post(`${B}/feeds/${f.feed.id}/revoke`, { confirm: true });
  }
});

test('feeds are owner-scoped: another user’s feed id is 404 (IDOR)', async () => {
  const ahmed = await as('ahmed');
  const f = await freshFeed(ahmed);
  for (const u of ['sara', 'omar', 'mariam']) {
    const c = await as(u);
    assert.equal((await c.put(`${B}/feeds/${f.feed.id}`, { include_tasks: false })).status, 404, u);
    assert.equal((await c.post(`${B}/feeds/${f.feed.id}/revoke`, { confirm: true })).status, 404, u);
    const view = (await c.get(`${B}/connectors`)).data.connectors.find((x) => x.key === 'ics');
    assert.ok(!view.feed || view.feed.id !== f.feed.id, u);
  }
  assert.equal((await fetchText(f.url)).status, 200, 'still working for its owner');
});

test('an org-wide disable by the admin stops every feed (404) until re-enabled', async () => {
  const ahmed = await as('ahmed'); const mariam = await as('mariam');
  const f = await freshFeed(ahmed);
  assert.equal((await mariam.put(`${B}/admin/connectors/ics`, { enabled: false })).status, 428);
  assert.equal((await mariam.put(`${B}/admin/connectors/ics`, { enabled: false, confirm: true })).status, 200);
  assert.equal((await fetchText(f.url)).status, 404);
  assert.equal((await ahmed.get(`${B}/connectors`)).data.connectors.find((c) => c.key === 'ics').status, 'disabled');
  assert.equal((await ahmed.post(`${B}/feeds/rotate`, { confirm: true })).status, 409);
  assert.equal((await mariam.put(`${B}/admin/connectors/ics`, { enabled: true, confirm: true })).status, 200);
  assert.equal((await fetchText(f.url)).status, 200);
  assert.ok((await mariam.get(`${B}/activity`)).data.entries.some((e) => e.action === 'integrations.connector.update'));
});

// ------------------------------------------------------------------ connectors & requests
test('connector catalogue is honest: only the ICS feed can be connected; others list missing env names only', async () => {
  const c = (await (await as('majed')).get(`${B}/connectors`)).data.connectors;
  for (const x of c.filter((k) => k.key !== 'ics')) {
    assert.ok(['needs_setup', 'configured', 'disabled'].includes(x.status), `${x.key}: ${x.status}`);
    assert.ok(x.env.length && x.env.every((e) => /^[A-Z0-9_]+$/.test(e.name) && Object.keys(e).sort().join() === 'name,present'));
  }
  const erp = c.find((k) => k.key === 'erp');
  assert.equal(erp.direction, 'both');
  assert.ok(erp.domains.find((d) => d.key === 'procurement.bids').protected, 'restricted bids are shown as protected');
  assert.equal(erp.eligible, true);
});

test('activation requests: eligibility, one open request, admin closes with a reply, requester alerted', async () => {
  const ahmed = await as('ahmed'); const salem = await as('salem'); const mariam = await as('mariam');
  assert.equal((await ahmed.post(`${B}/connectors/hrms/request`, {})).status, 403, 'HRMS is for the HR team');
  assert.equal((await salem.post(`${B}/connectors/ics/request`, {})).status, 409);
  assert.equal((await salem.post(`${B}/connectors/nope/request`, {})).status, 404);
  assert.equal((await salem.post(`${B}/connectors/hrms/request`, { note: 'x'.repeat(501) })).status, 400);
  const r = await salem.post(`${B}/connectors/hrms/request`, { note: 'مزامنة الدرجات الوظيفية' });
  assert.equal(r.status, 200);
  assert.equal((await salem.post(`${B}/connectors/hrms/request`, {})).status, 409);
  assert.equal((await mariam.post(`${B}/connectors/m365/request`, {})).status, 409, 'admins configure directly');
  const admin = (await mariam.get(`${B}/admin/connectors`)).data.find((x) => x.key === 'hrms');
  assert.ok(admin.requests.some((q) => q.id === r.data.id && q.user.id === 'u_salem'));
  assert.ok((await mariam.get('/api/alerts')).data.some((a) => a.entity === 'sys:integrations' && a.entity_id === r.data.id));
  assert.equal((await mariam.post(`${B}/admin/requests/${r.data.id}/close`, { resolution: 'maybe' })).status, 400);
  assert.equal((await ahmed.post(`${B}/admin/requests/${r.data.id}/close`, { resolution: 'done' })).status, 403);
  assert.equal((await mariam.post(`${B}/admin/requests/${r.data.id}/close`, { resolution: 'declined', note: 'بانتظار اعتماد أمن المعلومات' })).status, 200);
  assert.equal((await mariam.post(`${B}/admin/requests/${r.data.id}/close`, { resolution: 'done' })).status, 409, 'closed requests cannot transition again');
  assert.equal((await salem.post(`${B}/requests/${r.data.id}/withdraw`, {})).status, 409);
  assert.equal((await ahmed.post(`${B}/requests/${r.data.id}/withdraw`, {})).status, 404, 'someone else’s request is invisible');
  assert.ok((await salem.get('/api/alerts')).data.some((a) => a.entity_id === r.data.id));
  const mine = (await salem.get(`${B}/connectors`)).data.requests;
  assert.ok(mine.every((q) => q.id) && mine.some((q) => q.id === r.data.id && q.status === 'declined'));
  assert.ok(!(await ahmed.get(`${B}/connectors`)).data.requests.some((q) => q.id === r.data.id));
});

test('connector scopes: restricted domains can never be selected; only candidate domains are accepted', async () => {
  const mariam = await as('mariam');
  assert.equal((await mariam.put(`${B}/admin/connectors/erp`, { scopes: ['procurement.bids'], confirm: true })).status, 400);
  assert.equal((await mariam.put(`${B}/admin/connectors/m365`, { scopes: ['meetings.confidential'], confirm: true })).status, 400);
  assert.equal((await mariam.put(`${B}/admin/connectors/erp`, { scopes: ['meetings.general'], confirm: true })).status, 400, 'not a candidate of ERP');
  assert.equal((await mariam.put(`${B}/admin/connectors/ics`, { scopes: ['core.calendar'], confirm: true })).status, 400, 'ICS scopes are fixed');
  assert.equal((await mariam.put(`${B}/admin/connectors/erp`, { scopes: 'procurement.requests', confirm: true })).status, 400);
  assert.equal((await mariam.put(`${B}/admin/connectors/erp`, { scopes: ['procurement.requests', 'providers.registry'] })).status, 428);
  const r = await mariam.put(`${B}/admin/connectors/erp`, { scopes: ['procurement.requests', 'providers.registry'], confirm: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.domains.filter((d) => d.selected).map((d) => d.key).sort(), ['procurement.requests', 'providers.registry']);
  assert.equal((await mariam.post(`${B}/admin/connectors/erp/test`, {})).status, 409, 'cannot test before setup');
});

// ------------------------------------------------------------------ admin configuration
test('admin tabs are 403 for everyone but the platform admin — managers and specialists included', async () => {
  for (const u of ['ahmed', 'omar', 'hessa', 'aisha', 'yousef', 'president']) {
    const c = await as(u);
    for (const p of ['/admin/matrix', '/admin/domains', '/admin/connectors']) assert.equal((await c.get(`${B}${p}`)).status, 403, `${u} ${p}`);
    assert.equal((await c.put(`${B}/admin/caps`, { user_id: 'u_sara', cap: 'surveys.author', grant: true, confirm: true })).status, 403, u);
    assert.equal((await c.post(`${B}/admin/access-review`, { confirm: true })).status, 403, u);
    assert.equal((await c.put(`${B}/admin/connectors/smtp`, { enabled: false, confirm: true })).status, 403, u);
  }
});

test('capability matrix: confirmation, identity type, segregation of duties, audit and notification', async () => {
  const mariam = await as('mariam');
  const m = (await mariam.get(`${B}/admin/matrix`)).data;
  assert.deepEqual(Object.keys(m).sort(), ['departments', 'grants', 'me', 'review', 'systems', 'users']);
  assert.ok(m.users.some((u) => u.id === 'u_ext_horizon' && u.user_type === 'external'));
  assert.equal((await mariam.put(`${B}/admin/caps`, { user_id: 'u_sara', cap: 'surveys.author', grant: true })).status, 428);
  assert.equal((await mariam.put(`${B}/admin/caps`, { user_id: 'u_mariam', cap: 'strategy.admin', grant: true, confirm: true })).status, 403, 'no self-grants');
  assert.equal((await mariam.put(`${B}/admin/caps`, { user_id: 'u_sara', cap: 'providers.portal', grant: true, confirm: true })).status, 400);
  assert.equal((await mariam.put(`${B}/admin/caps`, { user_id: 'u_ext_oasis', cap: 'strategy.admin', grant: true, confirm: true })).status, 400);
  assert.equal((await mariam.put(`${B}/admin/caps`, { user_id: 'u_sara', cap: 'no.such', grant: true, confirm: true })).status, 400);
  assert.equal((await mariam.put(`${B}/admin/caps`, { user_id: 'u_sara', grant: true, confirm: true })).status, 400);
  const g = await mariam.put(`${B}/admin/caps`, { user_id: 'u_sara', cap: 'surveys.author', grant: true, confirm: true });
  assert.equal(g.status, 200); assert.equal(g.data.changed, true);
  const sara = await as('sara');
  assert.ok((await sara.get('/api/me')).data.user.caps.includes('surveys.author'));
  assert.ok((await sara.get('/api/alerts')).data.some((a) => a.title.includes('مُنحت لك صلاحية')));
  assert.equal((await mariam.put(`${B}/admin/caps`, { user_id: 'u_sara', cap: 'surveys.author', grant: false, confirm: true })).status, 200);
  assert.ok(!(await sara.get('/api/me')).data.user.caps.includes('surveys.author'));
  const acts = (await mariam.get(`${B}/activity`)).data.entries.map((e) => e.action);
  assert.ok(acts.includes('caps.grant') && acts.includes('caps.revoke'));
});

test('quarterly access review: admin sign-off once per quarter with a real snapshot', async () => {
  const mariam = await as('mariam');
  assert.equal((await mariam.post(`${B}/admin/access-review`, {})).status, 428);
  const r = await mariam.post(`${B}/admin/access-review`, { confirm: true, note: 'لا ملاحظات' });
  assert.equal(r.status, 200);
  assert.ok(r.data.done_at);
  assert.ok(r.data.snapshot.grants > 0 && r.data.snapshot.external_grants >= 3);
  assert.equal((await mariam.post(`${B}/admin/access-review`, { confirm: true })).status, 409);
  assert.ok((await mariam.get('/api/game/me')).data.rules.some((x) => x.key === 'integrations_access_review'));
});

test('data policies: admin view shows no individual opt-ins; locked domains cannot be opened', async () => {
  const mariam = await as('mariam');
  const rows = (await mariam.get(`${B}/admin/domains`)).data;
  const perf = rows.find((d) => d.key === 'performance.reviews');
  assert.ok(perf && perf.ai_policy === 'opt_in');
  assert.ok(perf.opted_in === 0 || perf.opted_in === '<3' || perf.opted_in >= 3, 'small groups are bucketed');
  assert.ok(!JSON.stringify(rows).includes('u_ahmed'));
  assert.equal((await mariam.put('/api/admin/domains/integrations.config', { ai_policy: 'allowed', confirm: true })).status, 409);
});

test('the admin flag unlocks no one else’s data: activity and feeds stay personal', async () => {
  const mariam = await as('mariam'); const ahmed = await as('ahmed');
  const theirs = (await ahmed.get(`${B}/activity`)).data;
  const mine = (await mariam.get(`${B}/activity`)).data;
  const ids = new Set(theirs.entries.map((e) => e.id));
  assert.ok(!mine.entries.some((e) => ids.has(e.id)), 'no shared audit rows');
  assert.ok(!mine.feed_hits.length || mine.feed_hits.every((h) => !theirs.feed_hits.some((x) => x.at === h.at && x.token_hint === h.token_hint)));
  const conn = (await mariam.get(`${B}/admin/connectors`)).data.find((c) => c.key === 'ics');
  assert.equal(typeof conn.active_feeds, 'number', 'admins see a count only');
  assert.ok(!JSON.stringify(conn).includes('swpcal_'));
  const sara = (await (await as('sara')).get(`${B}/activity`)).data;
  assert.ok(!sara.entries.some((e) => ids.has(e.id)));
});

// ------------------------------------------------------------------ workspace & Ask AI
test('workspace cards follow the same scope as the center', async () => {
  const ahmed = (await (await as('ahmed')).get('/api/workspace')).data.find((w) => w.system === 'integrations');
  assert.ok(ahmed.cards.length >= 1 && ahmed.cards.length <= 3);
  assert.equal(ahmed.cards[0].href, '#/sys/integrations/ai');
  assert.ok(!ahmed.cards.some((c) => c.title_en.includes('governance')), 'no admin card for staff');
  const mariam = (await (await as('mariam')).get('/api/workspace')).data.find((w) => w.system === 'integrations');
  const gov = mariam.cards.find((c) => c.title_en.includes('governance'));
  assert.ok(gov, 'the admin sees the governance card');
  assert.ok(gov.value >= 1, 'open activation requests (demo) are counted');
});

test('Ask AI: intents answer with a link, never mint a calendar secret; no integration tools over MCP', async () => {
  const sara = await as('sara');
  const before = (await sara.get(`${B}/connectors`)).data.connectors.find((c) => c.key === 'ics').feed;
  const a = await sara.chat('اربط التقويم');
  assert.match(a.final.text, /#\/sys\/integrations\/apps\/ics/);
  assert.ok(!a.final.text.includes('swpcal_'));
  const after3 = (await sara.get(`${B}/connectors`)).data.connectors.find((c) => c.key === 'ics').feed;
  assert.deepEqual(after3, before, 'no feed created from chat');
  const b = await sara.chat('من يستطيع رؤية بياناتي؟');
  assert.match(b.final.text, /#\/sys\/integrations\/ai/);
  const c = await sara.chat('افتح مركز التكامل');
  assert.match(c.final.text, /#\/sys\/integrations/);
  const tok = (await sara.post('/api/me/tokens', { label: 'test' })).data.token;
  const mcp = (body) => fetch(`${sara.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) }).then((r) => r.json());
  const list = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.ok(!list.result.tools.some((t) => t.name.startsWith('integrations_')));
  const call = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'integrations_create_feed', arguments: {} } });
  assert.ok(call.error || call.result?.isError, 'unknown tool is refused');
});

test('what the center says Ask AI can read matches MCP reality: locked never, opt-in only after the switch', async () => {
  const noura = await as('noura');
  const tok = (await noura.post('/api/me/tokens', { label: 'policy check' })).data.token;
  const toolsList = async () => (await fetch(`${noura.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }).then((r) => r.json())).result.tools.map((t) => t.name);
  const ai = (await noura.get(`${B}/ai`)).data;
  const listed = await toolsList();
  for (const sys of ai.systems) {
    const readable = sys.domains.some((d) => d.ai_active);
    if (!readable && sys.domains.every((d) => d.tools.read + d.tools.write === 0 || !d.ai_active)) {
      const allOff = sys.domains.every((d) => !d.ai_active);
      if (allOff) assert.ok(!listed.some((n) => n.startsWith(`${sys.key}_`)), `${sys.key}: no tools while nothing is readable`);
    }
  }
  const goals = ai.systems.find((x) => x.key === 'goals');
  const n = goals.domains.reduce((a, d) => a + d.tools.read + d.tools.write, 0);
  assert.equal(goals.domains.some((d) => d.ai_active), false);
  assert.ok(!listed.some((x) => x.startsWith('goals_')), 'opt-in domain closed → no tools');
  if (n > 0) {
    await noura.put('/api/systems/goals/prefs', { ai_enabled: true });
    assert.ok((await toolsList()).some((x) => x.startsWith('goals_')), 'after opting in the tools appear');
    await noura.put('/api/systems/goals/prefs', { ai_enabled: false });
    assert.ok(!(await toolsList()).some((x) => x.startsWith('goals_')));
  }
});

test('validation errors are 400', async () => {
  const ahmed = await as('ahmed');
  assert.equal((await ahmed.post(`${B}/feeds`, { include_tasks: 'yes' })).status, 400);
  assert.equal((await ahmed.post(`${B}/feeds`, { token: 'mine' })).status, 400);
  assert.equal((await ahmed.post(`${B}/feeds/rotate`, { confirm: 'true' })).status, 400);
  const mariam = await as('mariam');
  assert.equal((await mariam.put(`${B}/admin/connectors/smtp`, { enabled: 'no', confirm: true })).status, 400);
  assert.equal((await mariam.put(`${B}/admin/connectors/nope`, { enabled: true, confirm: true })).status, 404);
});

test('unknown-token guessing is rate limited', async () => {
  const s = await stack();
  let limited = false;
  for (let i = 0; i < 40 && !limited; i++) {
    const r = await fetch(`${s.portal}/pub/sys/integrations/calendar/swpcal_${String(i).padStart(32, 'x')}.ics`);
    if (r.status === 429) limited = true; else assert.equal(r.status, 404);
  }
  assert.ok(limited);
});
