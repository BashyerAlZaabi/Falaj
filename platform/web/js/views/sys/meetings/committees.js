// Meetings — «اللجان»: committees I can see (restricted ones only for members),
// their members, quorum and meeting history. The chair manages membership
// (explicit confirmation, audited); chair or secretary schedules meetings.
import { h, icon, toast, skeleton, errorState, emptyState, statRow, statTile, formDialog, confirmDialog, accessLogList, fmtNum, L, go, whoChip, statusChip, state } from '../../../sys-kit.js';
import * as C from './common.js';
import { meetingRow } from './upcoming.js';

export async function render(root, ctx, tab) {
  const page = h('div.mt-page');
  root.append(page);
  const id = ctx.params[1];
  const load = () => (id ? C.call(`/committees/${encodeURIComponent(id)}`).then((c) => paintOne(page, ctx, tab, c)) : C.call('/committees').then((list) => paintList(page, ctx, tab, list)))
    .catch((e) => C.fill(page, ...C.shell(ctx, tab), h('section.card', e?.status === 404
      ? emptyState({ icon: 'lock', title: L('اللجنة غير متاحة', 'Committee not available'), body: L('اللجان السرية تظهر لأعضائها فقط.', 'Restricted committees are visible to their members only.'), actions: [{ label: L('كل اللجان', 'All committees'), onClick: () => go(ctx, 'committees') }] })
      : errorState(e, () => load()))));
  if (ctx.soft) { await load(); return; }
  C.fill(page, ...C.shell(ctx, tab), h('div.mt-cm-grid', [1, 2, 3].map(() => h('section.card', skeleton('card')))));
  load();
}

const canCreate = () => ['manager', 'president'].includes(state.me.user.role);
function paintList(page, ctx, tab, list) {
  const mine = list.filter((c) => c.my_role);
  const others = list.filter((c) => !c.my_role);
  C.fill(page, 
    ...C.shell(ctx, tab, { actions: canCreate() ? [{ label: L('لجنة جديدة', 'New committee'), icon: 'plus', primary: true, onClick: () => createCommittee(ctx) }] : [] }),
    list.length ? null : h('section.card', emptyState({ icon: 'landmark', title: L('لا لجان متاحة', 'No committees'), body: L('تظهر هنا اللجان العامة، واللجان السرية لأعضائها فقط.', 'Open committees show here; restricted ones only for their members.') })),
    mine.length ? h('h2.mt-group-title', L('لجاني', 'My committees')) : null,
    mine.length ? h('div.mt-cm-grid', mine.map(card)) : null,
    others.length ? h('h2.mt-group-title', L('لجان الجهة', 'Committees of the entity')) : null,
    others.length ? h('div.mt-cm-grid', others.map(card)) : null,
    h('p.tiny.faint.mt-hint', icon('shield'), L(' اللجان السرية لا تظهر إلا لأعضائها، واجتماعاتها لا تظهر إلا للمدعوين.', ' Restricted committees are listed only for members; their meetings only for invitees.')));
}
function card(c) {
  return h(`a.card.mt-cm-card${c.confidential ? '.restricted' : ''}`, { href: `#/sys/meetings/committees/${c.id}` },
    h('div.mt-cm-top', h('span.mt-cm-ic', icon(c.confidential ? 'lockKeyhole' : 'landmark')), h('div.grow', h('h3.mt-cm-name', L(c.name_ar, c.name_en)), h('div.sys-badges', c.confidential ? C.lockChip() : h('span.chip.tiny.outline', L('لجنة دائمة', 'Standing committee')), c.my_role ? C.chip(C.ROLE, c.my_role) : null, C.demoChip(c)))),
    c.description ? h('p.mt-cm-desc', c.description) : null,
    h('div.mt-cm-foot',
      h('div.mt-cm-people', C.avatarStack(c.members, { max: 5 }), h('span.tiny.faint', L(`${fmtNum(c.members.length)} أعضاء · النصاب ${fmtNum(c.quorum)}`, `${c.members.length} members · quorum ${c.quorum}`))),
      c.next_meeting ? h('span.mt-cm-next', icon('calendarClock'), `${C.relDay(C.localDay(c.next_meeting.starts_at))} · ${C.time(c.next_meeting.starts_at)}`) : h('span.tiny.faint', L('لا اجتماع قادم ظاهر لك', 'No upcoming meeting for you'))));
}

function paintOne(page, ctx, tab, c) {
  const upcoming = c.meetings.filter((m) => m.phase === 'upcoming' || m.phase === 'live').reverse();
  const past = c.meetings.filter((m) => m.phase === 'ended' || m.phase === 'cancelled');
  const s = c.stats;
  C.fill(page, 
    ...C.shell(ctx, tab, { actions: c.can.schedule ? [{ label: L('اجتماع جديد للجنة', 'New committee meeting'), icon: 'calendarPlus', primary: true, onClick: () => schedule(ctx, c) }] : [] }),
    h('a.mt-back', { href: '#/sys/meetings/committees' }, icon('chevron', 'flip-rtl mt-back-ic'), L('اللجان', 'Committees')),
    c.confidential ? h('div.callout.sys-banner.restricted', { role: 'note' }, icon('lockKeyhole'), h('span', L('لجنة سرية: تظهر لأعضائها فقط، ويُسجَّل كل اطلاع عليها.', 'Restricted committee: visible to members only; every view is logged.'))) : null,
    h('section.card.mt-cm-head', h('div.mt-cm-top', h('span.mt-cm-ic.lg', icon(c.confidential ? 'lockKeyhole' : 'landmark')),
      h('div.grow', h('span.eyebrow', L('لجنة', 'Committee')), h('h1.mt-title', L(c.name_ar, c.name_en)), c.description ? h('p.muted', c.description) : null,
        h('div.sys-badges', c.my_role ? C.chip(C.ROLE, c.my_role) : null, h('span.chip.tiny.outline', icon('usersRound'), L(`${fmtNum(c.members.length)} أعضاء`, `${c.members.length} members`)), h('span.chip.tiny.outline', icon('scale'), L(`النصاب ${fmtNum(c.quorum)}`, `Quorum ${c.quorum}`)), C.demoChip(c))),
      c.can.manage ? h('button.btn', { type: 'button', onclick: () => editQuorum(c) }, icon('sliders'), L('النصاب والوصف', 'Quorum & description')) : null)),
    statRow([
      statTile({ label: L('اجتماعات منعقدة', 'Meetings held'), value: s.held, icon: 'calendarCheck' }),
      statTile({ label: L('قرارات منفّذة', 'Decisions implemented'), value: s.decisions ? `${fmtNum(s.decisions_done)}/${fmtNum(s.decisions)}` : '—', icon: 'gavel', tone: s.decisions && s.decisions_done === s.decisions ? 'good' : null }),
      statTile({ label: L('تكليفات مفتوحة', 'Open action items'), value: s.actions_open, icon: 'listChecks', tone: s.actions_overdue ? 'crit' : null, hint: s.actions_overdue ? L(`${fmtNum(s.actions_overdue)} متأخر`, `${s.actions_overdue} overdue`) : null }),
      statTile({ label: L('محاضر معتمدة', 'Minutes approved'), value: s.held ? `${fmtNum(s.minutes_approved)}/${fmtNum(s.held)}` : '—', icon: 'badgeCheck', tone: 'good' }),
    ]),
    h('div.mt-layout',
      h('div.mt-main',
        h('section.card', h('div.card-head', h('h2.card-title', L('الاجتماعات القادمة', 'Upcoming meetings'))),
          upcoming.length ? h('div.mt-day-list', upcoming.map((m) => meetingRow(m, { showDay: true }))) : emptyState({ compact: true, icon: 'calendarClock', title: L('لا اجتماعات قادمة ظاهرة لك', 'No upcoming meetings for you'), actions: c.can.schedule ? [{ label: L('جدولة اجتماع', 'Schedule one'), onClick: () => schedule(ctx, c) }] : [] })),
        h('section.card', h('div.card-head', h('h2.card-title', L('سجل الاجتماعات', 'Meeting history')), h('span.card-sub', L('الاجتماعات التي دُعيت إليها فقط', 'Only meetings you were invited to'))),
          past.length ? h('div.mt-day-list', past.map((m) => meetingRow(m, { showDay: true }))) : h('p.faint.tiny', L('لا اجتماعات سابقة ظاهرة لك.', 'No past meetings visible to you.')))),
      h('aside.mt-side',
        h('section.card.mt-members', h('div.card-head', h('h2.card-title', L('الأعضاء', 'Members')), c.can.manage ? h('button.btn.sm.tertiary', { type: 'button', onclick: () => addMember(c) }, icon('userPlus'), L('إضافة', 'Add')) : null),
          h('ul.mt-member-list', c.members.map((mb) => h('li', whoChip(mb), h('span.grow.tiny.faint', L(mb.title_ar || mb.dept_ar, mb.title_en || mb.dept_en)), C.chip(C.ROLE, mb.role),
            c.can.manage && mb.role !== 'chair' ? h('button.icon-btn', { type: 'button', 'aria-label': L(`إزالة ${mb.name_ar}`, `Remove ${mb.name_en}`), onclick: () => removeMember(c, mb) }, icon('userX')) : null)))),
        c.access_log ? h('section.card', h('div.card-head', h('h2.card-title', L('سجل الاطلاع', 'Access log'))), h('p.tiny.faint', L('يظهر لرئيس اللجنة فقط.', 'Visible to the chair only.')), C.accessLog(c.access_log)) : null)));
}

async function schedule(ctx, c) {
  const v = await C.composer({ committees: [{ id: c.id, name_ar: c.name_ar, name_en: c.name_en, confidential: c.confidential, my_role: c.my_role }], preset: { type: 'committee', committee_id: c.id, confidential: c.confidential } });
  if (!v) return;
  try { const m = await C.call('/meetings', { method: 'POST', body: v }); toast(L('جُدول اجتماع اللجنة وأُرسلت الدعوات للأعضاء', 'Committee meeting scheduled; members invited')); go(ctx, 'm', m.id); } catch (e) { C.toastErr(e); }
}
async function createCommittee(ctx) {
  const v = await formDialog({ title: L('لجنة جديدة', 'New committee'), wide: true, intro: L('تصبح رئيس اللجنة. يمكنك إضافة الأعضاء وتعديل النصاب لاحقاً.', 'You become the chair. You can add members and adjust quorum later.'), fields: [
    { name: 'name_ar', label: L('اسم اللجنة', 'Name (Arabic)'), required: true, maxLength: 120 },
    { name: 'name_en', label: L('الاسم بالإنجليزية', 'Name (English)'), maxLength: 120 },
    { name: 'description', label: L('المهام والصلاحيات', 'Mandate'), type: 'textarea', rows: 3, maxLength: 1000 },
    { name: 'secretary_id', label: L('أمين السر', 'Secretary'), type: 'user' },
    { name: 'quorum', label: L('النصاب (عدد الأعضاء)', 'Quorum (members)'), type: 'number', min: 1, max: 60, help: L('اتركه فارغاً لاحتساب الأغلبية تلقائياً.', 'Leave empty for a simple majority.') },
    { name: 'member_ids', label: L('الأعضاء', 'Members'), type: 'users' },
    { name: 'confidential', label: L('لجنة سرية (اجتماعاتها سرية للغاية ولا تظهر إلا لأعضائها)', 'Restricted committee (members only; restricted meetings)'), type: 'checkbox' },
  ], submitLabel: L('إنشاء اللجنة', 'Create committee') });
  if (!v) return;
  try {
    const c = await C.call('/committees', { method: 'POST', body: { name_ar: v.name_ar, name_en: v.name_en || undefined, description: v.description || undefined, secretary_id: v.secretary_id || undefined, quorum: v.quorum ?? undefined, member_ids: v.member_ids, confidential: !!v.confidential } });
    toast(L('أُنشئت اللجنة', 'Committee created')); go(ctx, 'committees', c.id);
  } catch (e) { C.toastErr(e); }
}
async function editQuorum(c) {
  const v = await formDialog({ title: L('النصاب والوصف', 'Quorum & description'), fields: [
    { name: 'quorum', label: L('النصاب (عدد الأعضاء الحاضرين)', 'Quorum (members present)'), type: 'number', min: 1, max: c.members.length, required: true },
    { name: 'description', label: L('المهام والصلاحيات', 'Mandate'), type: 'textarea', rows: 3, maxLength: 1000 },
  ], values: { quorum: c.quorum, description: c.description }, submitLabel: L('حفظ', 'Save') });
  if (!v) return;
  try { await C.call(`/committees/${c.id}`, { method: 'PUT', body: { quorum: v.quorum, description: v.description || '' } }); toast(L('حُفظ', 'Saved')); } catch (e) { C.toastErr(e); }
}
async function addMember(c) {
  const taken = new Set(c.members.map((m) => m.id));
  const v = await formDialog({ title: L('إضافة عضو', 'Add member'), fields: [
    { name: 'user_id', label: L('الموظف', 'Staff member'), type: 'user', required: true, filter: (u) => !taken.has(u.id), full: true },
    { name: 'role', label: L('الدور', 'Role'), type: 'select', required: true, options: [{ value: 'member', label: L('عضو', 'Member') }, { value: 'secretary', label: L('أمين السر', 'Secretary') }] },
    { type: 'info', label: L(c.confidential ? 'العضو الجديد سيرى هذه اللجنة السرية وأعضاءها. يُسجَّل التغيير.' : 'يُسجَّل تغيير العضوية.', c.confidential ? 'The new member will see this restricted committee and its roster. This is audited.' : 'Membership changes are audited.') },
  ], values: { role: 'member' }, submitLabel: L('إضافة', 'Add') });
  if (!v) return;
  try { await C.call(`/committees/${c.id}/members`, { method: 'POST', body: { user_id: v.user_id, role: v.role, confirm: true } }); toast(L('أُضيف العضو', 'Member added')); } catch (e) { C.toastErr(e); }
}
async function removeMember(c, mb) {
  const ok = await confirmDialog(L(`إزالة ${mb.name_ar} من اللجنة؟`, `Remove ${mb.name_en}?`), L('سيتوقف ظهور اللجنة له إن كانت سرية، ولن يُدعى تلقائياً إلى اجتماعاتها القادمة. يُسجَّل التغيير.', 'They lose sight of a restricted committee and are no longer auto-invited. This is audited.'), { danger: true, confirmLabel: L('إزالة', 'Remove') });
  if (!ok) return;
  try { await C.call(`/committees/${c.id}/members`, { method: 'POST', body: { user_id: mb.id, remove: true, confirm: true } }); toast(L('أُزيل العضو', 'Member removed')); } catch (e) { C.toastErr(e); }
}
void statusChip;
