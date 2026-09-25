// Meetings (نظام الاجتماعات): invitation-scoped visibility (existence included),
// restricted meetings (masking, access log, never Ask AI), the minutes
// lifecycle with segregation of duties, action items → real tasks, committee
// quorum, confirmations, validation, workspace/tracker leakage, intents, MCP
// data policy, derived points and the calendar-feed export.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { as, done, stack } from './_stack.js';
import { ROOT } from '../helpers.js';

after(done);
const M = (p = '') => `/api/sys/meetings${p}`;
const iso = (hours) => new Date(Date.now() + hours * 36e5).toISOString();
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function mcp(client, name, args = {}) {
  const S = await stack();
  const token = (await client.post('/api/me/tokens', { label: 'meetings-test' })).data.token;
  const r = await fetch(`${S.portal}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  return (await r.json()).result;
}
// A meeting that already took place (started 3h ago), organised by Mariam with Sara as secretary.
async function heldMeeting(extra = {}) {
  const mariam = await as('mariam');
  const r = await mariam.post(M('/meetings'), { title: 'مراجعة تقدم أتمتة الطلبات', type: 'management', starts_at: iso(-3), duration_min: 60, secretary_id: 'u_sara',
    attendees: [{ user_id: 'u_ahmed' }, { user_id: 'u_omar' }], agenda: [{ title: 'حالة النماذج الموحدة' }], ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}

test('a meeting is visible only to its organizer, secretary and invitees — never by role or admin flag', async () => {
  const mariam = await as('mariam'); // platform admin + IT director
  const o = (await mariam.get(M('/overview'))).data;
  const ids = [...o.today_meetings, ...o.upcoming, ...o.recent].map((m) => m.id);
  assert.ok(ids.includes('mt_demo_launch') && ids.includes('mt_demo_budget'));
  for (const id of ['mt_demo_audit', 'mt_demo_hr', 'mt_demo_service', 'mt_demo_cx']) assert.ok(!ids.includes(id), id);
  // direct-ID access (IDOR) → 404, whatever the role
  assert.equal((await mariam.get(M('/meetings/mt_demo_audit'))).status, 404);
  assert.equal((await mariam.get(M('/meetings/mt_demo_hr'))).status, 404);
  assert.equal((await (await as('president')).get(M('/meetings/mt_demo_hr'))).status, 404);
  assert.equal((await (await as('omar')).get(M('/meetings/mt_demo_itweekly'))).status, 404); // manager of another department
  assert.equal((await (await as('hessa')).get(M('/meetings/mt_demo_itweekly'))).status, 404);
  assert.equal((await (await as('ahmed')).get(M('/meetings/mt_demo_itweekly'))).status, 200);
  // writes on an invisible meeting are 404 too (no existence leak)
  assert.equal((await mariam.post(M('/meetings/mt_demo_hr/agenda'), { title: 'بند' })).status, 404);
  assert.equal((await mariam.post(M('/meetings/mt_demo_audit/rsvp'), { response: 'accepted' })).status, 404);
});

test('external identities cannot reach the meetings system at all', async () => {
  for (const u of ['horizon', 'oasis', 'rashid']) {
    const c = await as(u);
    assert.equal((await c.get(M('/overview'))).status, 403, u);
    assert.equal((await c.get(M('/meetings/mt_demo_launch'))).status, 403, u);
    assert.equal((await c.post(M('/meetings'), { title: 'اجتماع', starts_at: iso(24) })).status, 403, u);
    const me = (await c.get('/api/me')).data;
    assert.ok(!me.systems.some((s) => s.key === 'meetings'), u);
  }
});

test('restricted meeting: invitees see it masked in lists and cards; the detail view is logged and shown to the organizer', async () => {
  const yousef = await as('yousef');
  const o = (await yousef.get(M('/overview'))).data;
  const rev = o.inbox.review.find((m) => m.id === 'mt_demo_audit');
  assert.ok(rev && rev.masked && rev.title === null, 'masked in the approval inbox');
  const acc = o.inbox.accept.find((a) => a.meeting.id === 'mt_demo_audit');
  assert.ok(acc && acc.title === null && acc.meeting.title === null, 'masked action item');
  const proc = o.upcoming.find((m) => m.id === 'mt_demo_proc');
  assert.ok(proc && proc.title === null && proc.confidential);
  const ws = (await yousef.get('/api/workspace')).data.find((s) => s.system === 'meetings');
  assert.ok(ws && !JSON.stringify(ws).includes('دورة المشتريات'), 'no restricted title on the Home card');
  const tr = (await yousef.get(M('/tracker?mine=1'))).data;
  assert.ok(!JSON.stringify(tr).includes('فصل المهام'), 'no restricted content in the tracker');
  // text search never matches restricted meetings
  assert.equal((await (await as('aisha')).get(M('/tracker?q=' + encodeURIComponent('التدقيق')))).data.decisions.filter((d) => d.meeting.id === 'mt_demo_audit').length, 0);
  // opening it reveals the title and records the access
  const d = (await yousef.get(M('/meetings/mt_demo_audit'))).data;
  assert.equal(d.title, 'اجتماع لجنة التدقيق — نتائج تدقيق دورة المشتريات');
  assert.equal(d.access_log, null, 'only the organizer/secretary see the access log');
  const aisha = (await (await as('aisha')).get(M('/meetings/mt_demo_audit'))).data;
  assert.ok(aisha.access_log.some((r) => r.user_id === 'u_yousef' && r.action === 'view'));
  // alerts sent about it never carry its title
  const alerts = (await yousef.get('/api/alerts')).data.filter((a) => a.entity === 'sys:meetings');
  assert.ok(alerts.every((a) => !String(a.title + a.body).includes('المشتريات')));
});

test('Ask AI and MCP never reach restricted meetings; the general domain follows the admin data policy', async () => {
  const yousef = await as('yousef');
  const up = await yousef.tool('meetings_upcoming', { days: 30 });
  assert.equal(up.status, 200);
  assert.ok(!up.data.result.some((m) => m.id === 'mt_demo_proc'), 'restricted meeting not returned');
  assert.ok(up.data.result.some((m) => m.id === 'mt_demo_legal'));
  const dec = await mcp(yousef, 'meetings_decisions', { meeting_id: 'mt_demo_audit' });
  assert.equal(dec.isError, true);
  const aisha = await as('aisha');
  const add = await mcp(aisha, 'meetings_add_action', { meeting_id: 'mt_demo_audit', title: 'تكليف عبر المساعد', assignee_id: 'u_aisha' });
  assert.equal(add.isError, true);
  assert.equal((await (await as('aisha')).get(M('/meetings/mt_demo_audit'))).data.actions.length, 2, 'nothing written');
  // the restricted domain is locked; switching the general domain off refuses the tools (then restore)
  const admin = await as('mariam');
  const domains = (await admin.get('/api/admin/domains')).data;
  assert.equal(domains.find((x) => x.key === 'meetings.confidential').ai_locked, 1);
  assert.equal((await admin.put('/api/admin/domains/meetings.confidential', { ai_policy: 'allowed', confirm: true })).status, 409);
  assert.equal((await admin.put('/api/admin/domains/meetings.general', { ai_policy: 'off', confirm: true })).status, 200);
  const refused = await mcp(await as('ahmed'), 'meetings_upcoming', {});
  assert.equal(refused.isError, true);
  assert.match(JSON.stringify(refused), /سياسة البيانات/);
  assert.equal((await admin.put('/api/admin/domains/meetings.general', { ai_policy: 'allowed', confirm: true })).status, 200);
  const ok = await mcp(await as('ahmed'), 'meetings_upcoming', {});
  assert.equal(ok.isError, false);
});

test('full workflow: agenda → attendance → minutes → decision → action items (real task or acceptance) → circulate → approvals', async () => {
  const m = await heldMeeting();
  const sara = await as('sara'); const ahmed = await as('ahmed'); const omar = await as('omar'); const mariam = await as('mariam');
  const ag = m.agenda[0].id;
  // the secretary writes minutes; a plain invitee cannot
  assert.equal((await ahmed.put(M(`/meetings/${m.id}/agenda/${ag}`), { minutes: 'x' })).status, 403);
  assert.equal((await sara.put(M(`/meetings/${m.id}/agenda/${ag}`), { minutes: 'اتُّفق على توحيد 15 نموذجاً في المرحلة الأولى.' })).status, 200);
  // circulating before attendance is refused
  assert.equal((await sara.post(M(`/meetings/${m.id}/minutes/circulate`), {})).status, 409);
  assert.equal((await sara.post(M(`/meetings/${m.id}/attendance`), { entries: [{ user_id: 'u_mariam', status: 'present' }, { user_id: 'u_sara', status: 'present' }, { user_id: 'u_ahmed', status: 'present' }, { user_id: 'u_omar', status: 'present' }] })).status, 200);
  const dec = await sara.post(M(`/meetings/${m.id}/decisions`), { text: 'اعتماد النموذج الموحد للطلبات كمرحلة أولى', owner_id: 'u_ahmed', agenda_id: ag });
  assert.equal(dec.status, 200); assert.equal(dec.data.number, 1);
  // Mariam may assign Ahmed (her department) → a real task created by the organizer
  const a1 = (await sara.post(M(`/meetings/${m.id}/actions`), { title: 'تجهيز النموذج الموحد للاختبار', assignee_id: 'u_ahmed', due_date: day(5), decision_id: dec.data.id })).data;
  assert.equal(a1.status, 'open'); assert.ok(a1.task?.id);
  const t1 = (await ahmed.get('/api/tasks?mine=1')).data.find((t) => t.id === a1.task.id);
  assert.ok(t1 && t1.created_by === 'u_mariam' && t1.title === 'تجهيز النموذج الموحد للاختبار');
  // Omar is outside Mariam's scope → recorded, waiting for his acceptance
  const a2 = (await sara.post(M(`/meetings/${m.id}/actions`), { title: 'تزويد الفريق بنماذج العمليات الحالية', assignee_id: 'u_omar', due_date: day(7) })).data;
  assert.equal(a2.status, 'pending_acceptance'); assert.equal(a2.task, null);
  assert.equal((await ahmed.post(M(`/actions/${a2.id}/accept`), {})).status, 403, 'only the assignee accepts');
  const acc = (await omar.post(M(`/actions/${a2.id}/accept`), {})).data;
  assert.equal(acc.status, 'open'); assert.ok((await omar.get('/api/tasks?mine=1')).data.some((t) => t.id === acc.task.id && t.created_by === 'u_omar'));
  assert.equal((await omar.post(M(`/actions/${a2.id}/accept`), {})).status, 409, 'cannot accept twice');
  // assignee must be an invitee
  assert.equal((await sara.post(M(`/meetings/${m.id}/actions`), { title: 'تكليف خارجي', assignee_id: 'u_fatima' })).status, 400);
  // circulate: the circulator (Sara) can never approve; the organizer who did not circulate can finalize only without open comments
  assert.equal((await sara.post(M(`/meetings/${m.id}/minutes/circulate`), {})).status, 200);
  assert.equal((await sara.post(M(`/meetings/${m.id}/minutes/approve`), {})).status, 403);
  assert.equal((await sara.put(M(`/meetings/${m.id}/agenda/${ag}`), { minutes: 'تعديل بعد التعميم' })).status, 409);
  assert.equal((await ahmed.post(M(`/meetings/${m.id}/minutes/approve`), {})).status, 200);
  assert.equal((await ahmed.post(M(`/meetings/${m.id}/minutes/approve`), {})).status, 403, 'no double approval');
  assert.equal((await omar.post(M(`/meetings/${m.id}/minutes/comment`), { body: 'يُرجى ذكر عدد النماذج المتبقية' })).status, 200);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/minutes/finalize`), { confirm: true })).status, 409, 'open comments block the final approval');
  assert.equal((await sara.post(M(`/meetings/${m.id}/minutes/revise`), {})).status, 200);
  assert.equal((await sara.put(M(`/meetings/${m.id}/agenda/${ag}`), { minutes: 'اتُّفق على توحيد 15 نموذجاً، ويبقى 8 نماذج للمرحلة الثانية.' })).status, 200);
  assert.equal((await sara.post(M(`/meetings/${m.id}/minutes/circulate`), {})).status, 200);
  for (const c of [mariam, ahmed, omar]) assert.equal((await c.post(M(`/meetings/${m.id}/minutes/approve`), {})).status, 200);
  const final = (await mariam.get(M(`/meetings/${m.id}`))).data;
  assert.equal(final.minutes.status, 'approved'); assert.equal(final.minutes.approved_by, 'all');
  assert.equal((await sara.post(M(`/meetings/${m.id}/decisions`), { text: 'قرار بعد الاعتماد' })).status, 409, 'approved minutes are locked');
  // the decision owner may update its status; an unrelated invitee may not
  assert.equal((await omar.put(M(`/decisions/${dec.data.id}`), { status: 'in_progress' })).status, 403);
  assert.equal((await ahmed.put(M(`/decisions/${dec.data.id}`), { status: 'in_progress' })).status, 200);
  assert.equal((await ahmed.put(M(`/decisions/${dec.data.id}`), { status: 'cancelled' })).status, 200);
  assert.equal((await ahmed.put(M(`/decisions/${dec.data.id}`), { status: 'done' })).status, 409, 'forbidden transition');
  // a meeting created after it started earns no «minutes on time» points (anti-gaming)
  const g = (await sara.get('/api/game/me')).data;
  assert.ok(!JSON.stringify(g.recent).includes(`meetings:minutes:${m.id}`));
});

test('segregation of duties: an organizer who circulated the minutes cannot finalize them', async () => {
  const mariam = await as('mariam');
  const r = await mariam.post(M('/meetings'), { title: 'تنسيق سريع لفريق البوابة', starts_at: iso(-2), duration_min: 30, attendee_ids: ['u_ahmed', 'u_sara'], agenda: [{ title: 'المستجدات' }] });
  const m = r.data;
  await mariam.post(M(`/meetings/${m.id}/attendance`), { entries: ['u_mariam', 'u_ahmed', 'u_sara'].map((user_id) => ({ user_id, status: 'present' })) });
  await mariam.put(M(`/meetings/${m.id}/agenda/${m.agenda[0].id}`), { minutes: 'لا عوائق.' });
  assert.equal((await mariam.post(M(`/meetings/${m.id}/minutes/circulate`), {})).status, 200);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/minutes/finalize`), { confirm: true })).status, 403);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/minutes/approve`), {})).status, 403);
  const d = (await mariam.get(M(`/meetings/${m.id}`))).data;
  assert.deepEqual(d.minutes.reviewers.map((x) => x.id).sort(), ['u_ahmed', 'u_sara']);
});

test('organizer final approval needs a majority, no open comments and explicit confirmation', async () => {
  const mariam = await as('mariam'); const sara = await as('sara'); const ahmed = await as('ahmed');
  const m = await heldMeeting({ attendees: [{ user_id: 'u_ahmed' }, { user_id: 'u_omar' }, { user_id: 'u_hessa' }] });
  await sara.post(M(`/meetings/${m.id}/attendance`), { entries: ['u_mariam', 'u_sara', 'u_ahmed', 'u_omar', 'u_hessa'].map((user_id) => ({ user_id, status: 'present' })) });
  await sara.post(M(`/meetings/${m.id}/decisions`), { text: 'متابعة الاختبارات أسبوعياً حتى الإطلاق' });
  await sara.post(M(`/meetings/${m.id}/minutes/circulate`), {});
  await ahmed.post(M(`/meetings/${m.id}/minutes/approve`), {});
  assert.equal((await mariam.post(M(`/meetings/${m.id}/minutes/finalize`), { confirm: true })).status, 409, '1 of 4 is not a majority');
  await mariam.post(M(`/meetings/${m.id}/minutes/approve`), {});
  assert.equal((await mariam.post(M(`/meetings/${m.id}/minutes/finalize`), {})).status, 428, 'confirmation required');
  assert.equal((await mariam.post(M(`/meetings/${m.id}/minutes/finalize`), { confirm: true })).status, 200);
  assert.equal((await mariam.get(M(`/meetings/${m.id}`))).data.minutes.status, 'approved');
});

test('committee quorum gates decisions; committee meetings are scheduled by the chair or secretary only', async () => {
  const latifa = await as('latifa'); // chair of the Innovation Committee (quorum 3)
  assert.equal((await (await as('hessa')).post(M('/meetings'), { title: 'اجتماع لجنة الابتكار', committee_id: 'cm_innov', starts_at: iso(-2) })).status, 403, 'member, not chair/secretary');
  assert.equal((await (await as('fatima')).post(M('/meetings'), { title: 'اجتماع لجنة التدقيق', committee_id: 'cm_audit', starts_at: iso(24) })).status, 404, 'restricted committee is invisible');
  const m = (await latifa.post(M('/meetings'), { title: 'اجتماع لجنة الابتكار الاستثنائي', committee_id: 'cm_innov', starts_at: iso(-2), duration_min: 60 })).data;
  assert.equal(m.type, 'committee');
  assert.deepEqual(m.attendees.map((a) => a.id).sort(), ['u_hamad', 'u_hessa', 'u_latifa', 'u_mariam', 'u_president']);
  assert.equal((await latifa.post(M(`/meetings/${m.id}/decisions`), { text: 'ترشيح فكرتين للتنفيذ التجريبي' })).status, 409, 'attendance not recorded');
  await latifa.post(M(`/meetings/${m.id}/attendance`), { entries: [{ user_id: 'u_latifa', status: 'present' }, { user_id: 'u_hamad', status: 'present' }, { user_id: 'u_mariam', status: 'absent' }] });
  const q = await latifa.post(M(`/meetings/${m.id}/decisions`), { text: 'ترشيح فكرتين للتنفيذ التجريبي' });
  assert.equal(q.status, 409); assert.match(q.data.message, /النصاب/);
  await latifa.post(M(`/meetings/${m.id}/attendance`), { entries: [{ user_id: 'u_hessa', status: 'present' }] });
  assert.equal((await latifa.post(M(`/meetings/${m.id}/decisions`), { text: 'ترشيح فكرتين للتنفيذ التجريبي' })).status, 200);
  assert.equal((await latifa.get(M(`/meetings/${m.id}`))).data.quorum.met, true);
});

test('RSVP rules: invitees reply before the meeting ends; required attendance needs a reason to decline', async () => {
  const mariam = await as('mariam'); const omar = await as('omar');
  const up = (await mariam.post(M('/meetings'), { title: 'تحضير عرض البوابة للإدارات', starts_at: iso(48), duration_min: 45, attendees: [{ user_id: 'u_omar' }, { user_id: 'u_ahmed', required: false }], location: 'قاعة 2' })).data;
  assert.equal((await omar.post(M(`/meetings/${up.id}/rsvp`), { response: 'declined' })).status, 400);
  assert.equal((await omar.post(M(`/meetings/${up.id}/rsvp`), { response: 'maybe' })).status, 400);
  assert.equal((await omar.post(M(`/meetings/${up.id}/rsvp`), { response: 'declined', note: 'ورشة إجراءات التشغيل في الوقت نفسه' })).status, 200);
  assert.equal((await mariam.post(M(`/meetings/${up.id}/rsvp`), { response: 'accepted' })).status, 409, 'organizer does not reply');
  assert.equal((await (await as('ahmed')).post(M(`/meetings/${up.id}/rsvp`), { response: 'declined' })).status, 200, 'optional attendance');
  assert.equal((await (await as('sara')).post(M(`/meetings/${up.id}/rsvp`), { response: 'accepted' })).status, 404, 'not invited');
  const alerts = (await mariam.get('/api/alerts')).data;
  assert.ok(alerts.some((a) => a.entity === 'sys:meetings' && a.title.includes('عمر')), 'organizer alerted about a required decline');
  assert.equal((await omar.post(M('/meetings/mt_demo_itweekly/rsvp'), { response: 'accepted' })).status, 404);
});

test('destructive and permission-changing actions need explicit confirmation and are refused to non-organizers', async () => {
  const mariam = await as('mariam'); const ahmed = await as('ahmed');
  const m = (await mariam.post(M('/meetings'), { title: 'مراجعة مخاطر الإطلاق', starts_at: iso(30), attendee_ids: ['u_ahmed', 'u_sara'], agenda: [{ title: 'سجل المخاطر' }] })).data;
  assert.equal((await ahmed.post(M(`/meetings/${m.id}/cancel`), { confirm: true })).status, 403);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/cancel`), {})).status, 428);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/attendees/u_sara/remove`), {})).status, 428);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/attendees/u_sara/remove`), { confirm: true })).status, 200);
  assert.equal((await (await as('sara')).get(M(`/meetings/${m.id}`))).status, 404, 'removed invitee loses access');
  assert.equal((await mariam.post(M(`/meetings/${m.id}/agenda/${m.agenda[0].id}/remove`), {})).status, 428);
  // lowering the classification requires confirmation
  const r = (await mariam.post(M('/meetings'), { title: 'اجتماع سري لمراجعة العقود', starts_at: iso(50), confidential: true, attendee_ids: ['u_ahmed'] })).data;
  assert.equal((await mariam.put(M(`/meetings/${r.id}`), { confidential: false })).status, 428);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/cancel`), { confirm: true, reason: 'دُمج في اجتماع الجاهزية' })).status, 200);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/cancel`), { confirm: true })).status, 409, 'already cancelled');
  assert.equal((await mariam.post(M(`/meetings/${m.id}/agenda`), { title: 'بند جديد' })).status, 409);
  // audited
  const alerts = (await ahmed.get('/api/alerts')).data;
  assert.ok(alerts.some((a) => a.title.includes('أُلغي') && a.title.includes('مراجعة مخاطر الإطلاق')));
});

test('validation errors return 400', async () => {
  const c = await as('mariam');
  const bad = [
    {}, { title: 'اجتماع' }, { title: 'اج', starts_at: iso(5) }, { title: 'اجتماع صالح', starts_at: 'غداً' },
    { title: 'اجتماع صالح', starts_at: iso(5), ends_at: iso(4) }, { title: 'اجتماع صالح', starts_at: iso(5), duration_min: 5000 },
    { title: 'اجتماع صالح', starts_at: iso(5), virtual_link: 'http://insecure.example' }, { title: 'اجتماع صالح', starts_at: iso(5), attendee_ids: ['u_ext_horizon'] },
    { title: 'اجتماع صالح', starts_at: iso(5), type: 'party' }, { title: 'اجتماع صالح', starts_at: iso(5), hack: true }, { title: 'اجتماع صالح', starts_at: iso(-24 * 9) },
  ];
  for (const b of bad) assert.equal((await c.post(M('/meetings'), b)).status, 400, JSON.stringify(b));
  const m = await heldMeeting();
  assert.equal((await c.post(M(`/meetings/${m.id}/decisions`), { text: 'x' })).status, 400);
  assert.equal((await c.post(M(`/meetings/${m.id}/decisions`), { text: 'قرار صالح النص', due_date: '25/12' })).status, 400);
  assert.equal((await c.post(M(`/meetings/${m.id}/agenda`), { title: 'بند', duration_min: 1 })).status, 400);
  assert.equal((await c.post(M(`/meetings/${m.id}/attendance`), { entries: [{ user_id: 'u_ahmed', status: 'late' }] })).status, 400);
  assert.equal((await c.post(M(`/meetings/${m.id}/actions`), { title: 'تكليف' })).status, 400);
  assert.equal((await (await as('omar')).post(M(`/actions/nope/decline`), {})).status, 400);
});

test('agenda documents: only the organizer attaches one of their own documents; sharing with invitees is confirmed', async () => {
  const mariam = await as('mariam'); const sara = await as('sara'); const ahmed = await as('ahmed');
  const doc = (await mariam.tool('create_document', { title: 'قائمة جاهزية الإطلاق', kind: 'plan', content_html: '<p>الأداء، الهوية، الدعم.</p>' })).data.result;
  const other = (await ahmed.tool('create_document', { title: 'مذكرة أحمد', content_html: '<p>ملاحظات</p>' })).data.result;
  const m = (await mariam.post(M('/meetings'), { title: 'مراجعة قائمة الجاهزية', starts_at: iso(26), secretary_id: 'u_sara', attendee_ids: ['u_ahmed'] })).data;
  assert.equal((await mariam.post(M(`/meetings/${m.id}/agenda`), { title: 'مراجعة المستند', document_id: other.id })).status, 404);
  assert.equal((await sara.post(M(`/meetings/${m.id}/agenda`), { title: 'مراجعة المستند', document_id: doc.id })).status, 403);
  const withDoc = (await mariam.post(M(`/meetings/${m.id}/agenda`), { title: 'مراجعة المستند', presenter_id: 'u_ahmed', document_id: doc.id })).data;
  const item = withDoc.agenda.find((g) => g.document);
  assert.equal(item.document.title, 'قائمة جاهزية الإطلاق');
  const asAhmed = (await ahmed.get(M(`/meetings/${m.id}`))).data.agenda.find((g) => g.document);
  assert.equal(asAhmed.document.accessible, false); assert.equal(asAhmed.document.title, null, 'no title before it is shared');
  assert.equal((await mariam.post(M(`/meetings/${m.id}/agenda/${item.id}/share`), {})).status, 428);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/agenda/${item.id}/share`), { confirm: true })).data.shared_with, 2);
  assert.equal((await ahmed.get(`/api/documents/${doc.id}`)).status, 200);
  assert.equal((await mariam.post(M(`/meetings/${m.id}/agenda`), { title: 'مقدّم غير مدعو', presenter_id: 'u_fatima' })).status, 400);
});

test('minutes summary is local and labelled when no model is connected; restricted minutes never leave the system', async () => {
  const s = await (await as('ahmed')).post(M('/meetings/mt_demo_itweekly/minutes/summary'), {});
  assert.equal(s.status, 200); assert.equal(s.data.source, 'local');
  assert.match(s.data.label_ar, /تحليل محلي/); assert.match(s.data.text, /القرارات/);
  const r = await (await as('yousef')).post(M('/meetings/mt_demo_audit/minutes/summary'), {});
  assert.equal(r.data.source, 'local'); assert.match(r.data.label_ar, /لا تُرسل بيانات الاجتماعات السرية/);
  assert.equal((await (await as('aisha')).post(M('/meetings/mt_demo_audit/minutes/document'), {})).status, 409);
  const ex = await (await as('mariam')).post(M('/meetings/mt_demo_itweekly/minutes/document'), {});
  assert.equal(ex.status, 200);
  assert.ok((await (await as('mariam')).get('/api/documents')).data.some((d) => d.id === ex.data.document_id));
  assert.equal((await (await as('sara')).post(M('/meetings/mt_demo_itweekly/minutes/document'), {})).status, 403, 'invitees do not export');
});

test('tracker, calendar, committees and workspace obey the same scope', async () => {
  const fatima = await as('fatima');
  const tr = (await fatima.get(M('/tracker'))).data;
  assert.ok([...tr.decisions, ...tr.actions].every((x) => ['mt_demo_cx', 'mt_demo_service', 'mt_demo_stores'].includes(x.meeting.id)));
  const cal = (await fatima.get(M(`/calendar?month=${day(0).slice(0, 7)}`))).data;
  const total = Object.values(cal.days).reduce((a, b) => a + b, 0);
  assert.ok(total <= 3, 'only her meetings are counted');
  const cms = (await fatima.get(M('/committees'))).data.map((c) => c.id).sort();
  assert.deepEqual(cms, ['cm_exec', 'cm_innov']);
  assert.equal((await fatima.get(M('/committees/cm_audit'))).status, 404);
  const exec = (await fatima.get(M('/committees/cm_exec'))).data;
  assert.equal(exec.meetings.length, 0, 'committee history shows only meetings she was invited to');
  assert.equal(exec.stats.held, 0);
  assert.equal((await fatima.post(M('/committees'), { name_ar: 'لجنة جديدة' })).status, 403, 'employees do not form committees');
  const pres = (await (await as('president')).get(M('/committees/cm_audit'))).data;
  assert.ok(pres.access_log.length >= 1, 'restricted committee views are logged for the chair');
  assert.equal((await (await as('president')).post(M('/committees/cm_audit/members'), { user_id: 'u_saeed' })).status, 428);
  // governance aggregates: no names/titles; employees get none
  assert.equal((await fatima.get(M('/overview'))).data.governance, null);
  const g = (await (await as('president')).get(M('/overview'))).data.governance;
  assert.equal(g.scope, 'organisation');
  assert.ok(!JSON.stringify(g).includes('u_') && !JSON.stringify(g).includes('اجتماع'));
  // Home cards for Fatima never mention other people's meetings
  const ws = JSON.stringify((await fatima.get('/api/workspace')).data.filter((s) => s.system === 'meetings'));
  assert.ok(!ws.includes('البوابة الموحدة') && !ws.includes('لجنة التدقيق'));
});

test('Ask AI intents: upcoming meetings, scheduling with parsed day/time and invitees, last meeting decisions — without capturing appointments or documents', async () => {
  const sara = await as('sara');
  const up = await sara.chat('ما هي اجتماعاتي القادمة؟');
  assert.equal(up.final.status, 'done');
  assert.match(up.final.text, /اجتماعاتك القادمة|لا توجد اجتماعات قادمة/);
  const mk = await sara.chat('أنشئ اجتماع متابعة نماذج الطلبات يوم الأحد الساعة 11 مع أحمد');
  const act = mk.final.actions.find((a) => a.tool === 'meetings_create');
  assert.ok(act && act.status === 'ok', JSON.stringify(mk.final));
  const created = (await sara.get(M('/overview'))).data.upcoming.find((m) => m.title === 'اجتماع متابعة نماذج الطلبات');
  assert.ok(created, 'meeting created');
  const d = (await sara.get(M(`/meetings/${created.id}`))).data;
  assert.ok(d.attendees.some((a) => a.id === 'u_ahmed'));
  assert.equal(new Date(d.starts_at).getUTCDay(), 0); assert.equal(d.starts_at.slice(11, 16), '07:00'); // Sunday 11:00 Gulf time
  const ask = await sara.chat('أنشئ اجتماع تنسيقي');
  assert.equal(ask.final.status, 'needs_input');
  const dec = await (await as('ahmed')).chat('قرارات الاجتماع الأخير');
  assert.match(dec.final.text, /قرارات «/);
  // platform commands stay with the platform
  const appt = await (await as('fatima')).chat('أضف موعد مراجعة الإجراءات غداً الساعة 10');
  assert.ok(appt.final.actions.some((a) => a.tool === 'create_event'));
  const doc = await (await as('fatima')).chat('اكتب محضر اجتماع عن تحديث إجراءات المخازن');
  assert.ok(!doc.final.actions.some((a) => String(a.tool).startsWith('meetings_')));
});

test('Ask AI tools act within the user scope and can be undone', async () => {
  const mariam = await as('mariam');
  const r = await mariam.tool('meetings_create', { title: 'اجتماع تجريبي للتراجع', starts_at: iso(72), attendee_ids: ['u_ahmed'] });
  assert.equal(r.status, 200); assert.ok(r.data.undoable);
  const u = await mariam.post(`/api/actions/${r.data.actionId}/undo`);
  assert.equal(u.data.status, 'ok');
  assert.equal((await mariam.get(M(`/meetings/${r.data.result.id}`))).data.status, 'cancelled');
  // adding an action item to a meeting the user does not organize is refused
  const x = await (await as('ahmed')).tool('meetings_add_action', { meeting_id: 'mt_demo_launch', title: 'تكليف', assignee_id: 'u_ahmed' });
  assert.notEqual(x.status, 200);
  const y = await (await as('fatima')).tool('meetings_decisions', { meeting_id: 'mt_demo_itweekly' });
  assert.notEqual(y.status, 200, 'not invited → not found');
});

// Runs a snippet against the test stack's database in a separate process (module exports).
async function inServer(body) {
  const S = await stack();
  const script = `const m = await import('${ROOT}/server/systems/meetings.js'); const { SYSTEMS } = await import('${ROOT}/server/systems/registry.js'); const out = await (async () => { ${body} })(); process.stdout.write(JSON.stringify(out)); process.exit(0);`;
  return JSON.parse(execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], { env: { ...S.env }, cwd: ROOT }).toString());
}

test('derived points: on-time minutes for the secretary, prompt reviews; restricted titles never appear in game events', async () => {
  const ev = await inServer(`const g = SYSTEMS.get('meetings').gameEvents; return { ahmed: g('u_ahmed'), latifa: g('u_latifa'), pres: g('u_president'), aisha: g('u_aisha') };`);
  const on = ev.ahmed.find((e) => e.id === 'meetings:minutes:mt_demo_itweekly');
  assert.ok(on && on.points === 8 && on.kind === 'minutes_on_time');
  assert.ok(!ev.ahmed.some((e) => e.id === 'meetings:minutes:mt_demo_cloud'), 'late circulation earns nothing');
  assert.ok(ev.latifa.some((e) => e.id === 'meetings:minutes:mt_demo_exec'));
  const rev = ev.pres.find((e) => e.id === 'meetings:review:mt_demo_audit');
  assert.ok(rev && rev.points === 3 && rev.ref === 'محضر اجتماع سري', 'masked reference for the restricted meeting');
  assert.ok([...ev.pres, ...ev.aisha].every((e) => !String(e.ref).includes('المشتريات')));
  assert.ok(ev.ahmed.every((e) => e.points >= 3 && e.points <= 25 && e.at && e.id));
  const rules = (await (await as('ahmed')).get('/api/game/me')).data.rules;
  assert.ok(rules.some((r) => r.key === 'minutes_on_time' && r.points === 8));
});

test('calendar-feed export: organizer/invitee meetings with restricted ones flagged; declined and cancelled excluded', async () => {
  const out = await inServer(`return { y: m.upcomingForUser('u_yousef', 30), o: m.upcomingForUser('u_omar', 30), x: m.upcomingForUser('u_ext_horizon', 30) };`);
  const proc = out.y.find((m) => m.id === 'mt_demo_proc');
  assert.ok(proc && proc.confidential === true);
  assert.deepEqual(Object.keys(proc).sort(), ['confidential', 'ends_at', 'id', 'location', 'starts_at', 'title']);
  assert.ok(out.y.some((m) => m.id === 'mt_demo_legal' && m.confidential === false));
  assert.ok(!out.o.some((m) => m.id === 'mt_demo_stores'), 'cancelled excluded');
  assert.deepEqual(out.x, [], 'external identities get nothing');
});
