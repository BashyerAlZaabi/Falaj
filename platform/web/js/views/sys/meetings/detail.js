// Meetings — meeting detail (#/sys/meetings/m/<id>/<section>).
// Header with time, place, people and my RSVP; sections: agenda, minutes,
// decisions, action items, attendance; a side column that always shows the
// single next step, the minutes lifecycle, quorum and (restricted meetings)
// the access log. Unsaved minutes survive live refreshes (kept per item).
import { h, icon, toast, menu, skeleton, errorState, emptyState, stepper, timeline, accessLogList, confirmDialog, formDialog, act, statusChip, plural, fmtNum, L, go, whoChip, dateTime, confidentialBanner } from '../../../sys-kit.js';
import * as C from './common.js';

const SECTIONS = [
  { key: 'agenda', ar: 'جدول الأعمال', en: 'Agenda', icon: 'listOrdered' },
  { key: 'minutes', ar: 'المحضر', en: 'Minutes', icon: 'notebook' },
  { key: 'decisions', ar: 'القرارات', en: 'Decisions', icon: 'gavel' },
  { key: 'actions', ar: 'التكليفات', en: 'Action items', icon: 'listChecks' },
  { key: 'attendance', ar: 'الحضور', en: 'Attendance', icon: 'usersRound' },
];
const drafts = new Map();     // `${meetingId}:${agendaId}` -> unsaved minutes text
const comments = new Map();   // meetingId -> unsaved comment
const summaries = new Map();  // meetingId -> { text, label_ar, label_en, source }
let focusKey = null;          // restore focus to the minutes field being edited after a live refresh
const live = { page: null, ctx: null };

export async function render(root, ctx) {
  const page = h('div.mt-page.mt-detail');
  root.append(page);
  live.page = page; live.ctx = ctx;
  const id = ctx.params[1];
  const load = () => C.call(`/meetings/${encodeURIComponent(id)}`).then((m) => paint(page, ctx, m)).catch((e) => paintError(page, e, () => { paintSkeleton(page); load(); }));
  if (ctx.soft) { await load(); return; }
  paintSkeleton(page);
  load();
}
async function reload() {
  if (!live.page?.isConnected) return;
  try { paint(live.page, live.ctx, await C.call(`/meetings/${encodeURIComponent(live.ctx.params[1])}`)); } catch (e) { C.toastErr(e); }
}
function back() { return h('a.mt-back', { href: '#/sys/meetings/upcoming' }, icon('chevron', 'flip-rtl mt-back-ic'), L('الاجتماعات', 'Meetings')); }
function paintSkeleton(page) {
  C.fill(page, back(), h('section.card.mt-dhead.is-skel', skeleton('card')), h('div.mt-layout', h('div.mt-main', h('section.card', skeleton('list', 5))), h('aside.mt-side', h('section.card', skeleton('list', 3)))));
}
function paintError(page, e, retry) {
  const notFound = e?.status === 404;
  C.fill(page, back(), h('section.card', notFound
    ? emptyState({ icon: 'lock', title: L('الاجتماع غير متاح', 'Meeting not available'), body: L('إما أنه غير موجود أو أنك لست من المدعوين إليه. يرى الاجتماع منظّمه وأمين سره والمدعوون فقط.', 'It does not exist or you are not invited. Only the organizer, secretary and invitees can see a meeting.'), actions: [{ label: L('العودة إلى اجتماعاتي', 'Back to my meetings'), primary: true, onClick: () => { location.hash = '#/sys/meetings/upcoming'; } }] })
    : errorState(e, retry)));
}

function defaultSection(m) {
  if (m.can.review || m.can.circulate && m.phase === 'ended') return 'minutes';
  if (m.actions.some((a) => a.status === 'pending_acceptance' && a.assignee?.id === meId())) return 'actions';
  if (m.phase !== 'upcoming' && m.can.attendance && !m.attendance_taken_at) return 'attendance';
  return 'agenda';
}
const meId = () => live.ctx?.user?.id;

function paint(page, ctx, m) {
  const sec = SECTIONS.find((s) => s.key === ctx.params[2]) ? ctx.params[2] : defaultSection(m);
  const counts = { agenda: m.agenda.length, decisions: m.decisions.length, actions: m.actions.filter((a) => !['cancelled'].includes(a.status)).length, attendance: m.attendees.length };
  C.fill(page, 
    back(),
    header(ctx, m),
    m.confidential ? confidentialBanner('اجتماع سري للغاية: يُسجَّل كل اطلاع وكل تعديل، ولا يظهر عنوانه في القوائم، ولا يصل إليه المساعد الذكي.', 'Restricted meeting: every view and change is logged, its title is hidden in lists, and Ask AI never reads it.', { level: 'restricted' }) : null,
    m.status === 'cancelled' ? h('div.callout.sys-banner.mt-cancelled', { role: 'note' }, icon('ban'), h('span', L('أُلغي هذا الاجتماع', 'This meeting was cancelled'), m.cancel_reason ? ` — ${m.cancel_reason}` : '')) : null,
    h('nav.mt-sections', { 'aria-label': L('أقسام الاجتماع', 'Meeting sections') }, SECTIONS.map((s) => h(`a${s.key === sec ? '.on' : ''}`, { href: `#/sys/meetings/m/${m.id}/${s.key}`, 'aria-current': s.key === sec ? 'page' : null },
      icon(s.icon), L(s.ar, s.en), counts[s.key] ? h('span.count', fmtNum(counts[s.key])) : s.key === 'minutes' && m.minutes.status !== 'none' ? h('span.mt-sec-dot', { class: `ms-${m.minutes.status}`, 'aria-hidden': 'true' }) : null))),
    h('div.mt-layout',
      h('div.mt-main', { id: `mt-sec-${sec}` }, { agenda: agendaSection, minutes: minutesSection, decisions: decisionsSection, actions: actionsSection, attendance: attendanceSection }[sec](ctx, m)),
      side(ctx, m)));
  if (focusKey) { const k = focusKey; setTimeout(() => { const el = document.querySelector(`[data-mkey="${k}"]`); if (el && document.activeElement !== el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); } }, 0); }
}

// ---------------- header ----------------
function header(ctx, m) {
  const start = new Date(m.starts_at);
  const loc = navigator.language && document.documentElement.lang === 'en' ? 'en-GB' : 'ar-AE';
  const accepted = m.attendees.filter((a) => a.rsvp === 'accepted').length;
  const me = m.attendees.find((a) => a.id === meId());
  const orgTools = [];
  if (m.can.edit) orgTools.push(h('button.btn', { type: 'button', onclick: () => editMeeting(m) }, icon('pencil'), L('تعديل', 'Edit')));
  if (m.can.invite || m.can.cancel) {
    const btn = h('button.icon-btn', { type: 'button', 'aria-label': L('إجراءات أخرى', 'More actions'), 'aria-haspopup': 'menu' }, icon('more'));
    btn.onclick = () => menu(btn, [
      m.can.invite ? { label: L('دعوة أشخاص', 'Invite people'), icon: 'userPlus', onClick: () => invite(m) } : null,
      m.can.cancel ? { label: L('إلغاء الاجتماع', 'Cancel meeting'), icon: 'ban', danger: true, onClick: () => cancelMeeting(m) } : null,
    ].filter(Boolean));
    orgTools.push(btn);
  }
  return h(`section.card.mt-dhead.t-${m.type}`, { 'aria-labelledby': 'mt-title' },
    h('div.mt-dhead-top',
      h('div.mt-datetile', { 'aria-hidden': 'true' }, h('span.mt-dt-dow', start.toLocaleDateString(loc, { weekday: 'short' })), h('span.mt-dt-day', fmtNum(start.getDate())), h('span.mt-dt-mon', start.toLocaleDateString(loc, { month: 'short' }))),
      h('div.grow.mt-dhead-text',
        h('span.eyebrow', [L(...C.TYPE[m.type].slice(0, 2)), m.committee ? L(m.committee.name_ar, m.committee.name_en) : null].filter(Boolean).join(' · '),
          m.project ? [' · ', h('a', { href: `#/projects/${m.project.id}` }, m.project.name)] : null),
        h('h1.mt-title#mt-title', m.title),
        h('div.sys-badges', C.chip(C.PHASE, m.phase), m.phase !== 'upcoming' && m.status !== 'cancelled' ? C.chip(C.MINUTES, m.minutes.status) : null, m.confidential ? C.lockChip() : null, C.demoChip(m))),
      orgTools.length ? h('div.mt-dhead-tools', orgTools) : null),
    h('div.mt-facts',
      fact('clock', L('الموعد', 'When'), [C.longDate(m.starts_at), h('br'), h('span', C.span(m)), h('span.faint', ` · ${C.duration(C.minutesBetween(m.starts_at, m.ends_at))}`)], m.phase === 'upcoming' ? C.until(m.starts_at) : null),
      m.location || m.virtual_link ? fact(m.location ? 'mapPin' : 'link', L('المكان', 'Where'), [m.location || L('عن بُعد', 'Online'),
        m.virtual_link ? h('a.mt-join', { href: m.virtual_link, target: '_blank', rel: 'noopener noreferrer' }, icon('ext'), L('رابط الاجتماع', 'Meeting link')) : null]) : null,
      fact('user', L('المنظّم', 'Organizer'), [C.person(m.organizer), m.secretary ? h('span.faint.mt-fact-sub', L(`أمين السر: ${m.secretary.name_ar}`, `Secretary: ${m.secretary.name_en}`)) : null]),
      fact('usersRound', L('المدعوون', 'Invitees'), [h('span', L(`${fmtNum(accepted)} مؤكد من ${fmtNum(m.attendees.length)}`, `${accepted} of ${m.attendees.length} confirmed`)), C.avatarStack(m.attendees, { max: 6 })])),
    m.description ? h('p.mt-desc', m.description) : null,
    m.can.rsvp ? rsvpBar(m, me) : null);
}
function fact(ic, label, value, hint) {
  return h('div.mt-fact', h('span.mt-fact-ic', icon(ic)), h('div.grow', h('span.mt-fact-label', label), h('div.mt-fact-value', value), hint ? h('span.mt-fact-hint', hint) : null));
}
function rsvpBar(m, me) {
  const opts = [['accepted', L('سأحضر', 'Attending'), 'check'], ['tentative', L('ربما', 'Maybe'), 'help'], ['declined', L('أعتذر', 'Can’t attend'), 'x']];
  return h('div.mt-rsvp', { role: 'group', 'aria-label': L('ردّك على الدعوة', 'Your reply') },
    h('span.mt-rsvp-q', me?.rsvp === 'pending' ? L('هل ستحضر؟', 'Will you attend?') : L('ردّك', 'Your reply')),
    h('div.mt-rsvp-opts', opts.map(([v, label, ic]) => h(`button.mt-rsvp-btn.${v}${me?.rsvp === v ? '.on' : ''}`, { type: 'button', 'aria-pressed': String(me?.rsvp === v), onclick: (e) => rsvp(e.currentTarget, m, v, me) }, icon(ic), label))),
    me?.required ? h('span.chip.tiny.outline', L('حضورك مطلوب', 'Required')) : h('span.chip.tiny.outline', L('حضور اختياري', 'Optional')),
    me?.rsvp_note ? h('span.tiny.faint.mt-rsvp-note', `«${me.rsvp_note}»`) : null);
}
async function rsvp(btn, m, response, me) {
  let note;
  if (response === 'declined') {
    const r = await C.confirmWithReason(L('الاعتذار عن الحضور', 'Decline'), L('سيُبلَّغ المنظّم باعتذارك.', 'The organizer will be notified.'), { danger: false, confirmLabel: L('إرسال الاعتذار', 'Send'), reasonLabel: me?.required ? L('سبب الاعتذار (مطلوب)', 'Reason (required)') : L('ملاحظة (اختياري)', 'Note (optional)'), required: !!me?.required });
    if (!r) return; note = r.reason || undefined;
  }
  const ok = await act(btn, () => C.call(`/meetings/${m.id}/rsvp`, { method: 'POST', body: { response, note } }), { success: L('سُجّل ردّك', 'Reply saved') });
  if (ok) reload();
}

// ---------------- side column ----------------
function nextStep(m) {
  const me = m.attendees.find((a) => a.id === meId());
  const pendingAction = m.actions.find((a) => a.status === 'pending_acceptance' && a.assignee?.id === meId());
  if (m.status === 'cancelled') return null;
  if (m.can.rsvp && me?.rsvp === 'pending') return { icon: 'mailCheck', text: L('ردّ على الدعوة ليعرف المنظّم من سيحضر.', 'Reply so the organizer knows who is coming.'), label: L('سأحضر', 'I’ll attend'), run: (b) => rsvp(b, m, 'accepted', me) };
  if (pendingAction) return { icon: 'hourglass', text: L('لديك تكليف بانتظار قبولك.', 'An action item is waiting for you.'), label: L('اذهب إلى التكليفات', 'Go to action items'), href: `#/sys/meetings/m/${m.id}/actions` };
  if (m.can.review) return { icon: 'fileCheck', text: L('المحضر معمّم وبانتظار اعتمادك.', 'The minutes await your approval.'), label: L('راجع واعتمد', 'Review & approve'), href: `#/sys/meetings/m/${m.id}/minutes` };
  if (m.can.manage && m.phase === 'upcoming' && !m.agenda.length) return { icon: 'listOrdered', text: L('أضف بنود جدول الأعمال ليستعد الحضور.', 'Add agenda items so people can prepare.'), label: L('إضافة بند', 'Add an item'), run: () => agendaDialog(m) };
  if (m.can.attendance && !m.attendance_taken_at) return { icon: 'userCheck', text: L('سجّل الحضور — يُحتسب منه النصاب ومن يعتمد المحضر.', 'Take attendance — it drives quorum and who approves the minutes.'), label: L('تسجيل الحضور', 'Take attendance'), href: `#/sys/meetings/m/${m.id}/attendance` };
  if (m.can.circulate) {
    const hasContent = m.agenda.some((g) => g.minutes.trim()) || m.decisions.length;
    return hasContent ? { icon: 'send', text: L(`عمّم المحضر للاعتماد قبل نهاية ${C.weekday(m.minutes.due_day)} ${C.dayMonth(m.minutes.due_day)}.`, `Circulate the minutes by ${C.weekday(m.minutes.due_day)} ${C.dayMonth(m.minutes.due_day)}.`), label: L('تعميم المحضر', 'Circulate'), run: (b) => circulate(b, m) }
      : { icon: 'notebook', text: L('اكتب محضر البنود وسجّل القرارات.', 'Write the minutes and record decisions.'), label: L('اكتب المحضر', 'Write minutes'), href: `#/sys/meetings/m/${m.id}/minutes` };
  }
  if (m.can.finalize) return { icon: 'badgeCheck', text: L(`اعتمد ${fmtNum(m.minutes.approvals)} من ${fmtNum(m.minutes.reviewers.length)} — يمكنك الاعتماد النهائي عند الأغلبية.`, `${m.minutes.approvals} of ${m.minutes.reviewers.length} approved — finalize once a majority approves.`), label: L('الاعتماد النهائي', 'Finalize'), run: (b) => finalize(b, m) };
  if (m.phase === 'upcoming') return { icon: 'calendarCheck', text: L(`الاجتماع ${C.until(m.starts_at)}. اطّلع على جدول الأعمال.`, `The meeting starts ${C.until(m.starts_at)}. Review the agenda.`), label: null };
  return { icon: 'circleCheck', text: m.minutes.status === 'approved' ? L('المحضر معتمد — تابع تنفيذ القرارات والتكليفات.', 'Minutes approved — follow up on decisions and actions.') : L('لا إجراء مطلوب منك الآن.', 'Nothing needed from you right now.'), label: null, calm: true };
}
function side(ctx, m) {
  const step = nextStep(m);
  const idx = { none: -1, draft: 0, circulated: 1, approved: 3 }[m.minutes.status];
  const rsvpCounts = ['accepted', 'tentative', 'pending', 'declined'].map((k) => [k, m.attendees.filter((a) => a.rsvp === k).length]);
  return h('aside.mt-side', { 'aria-label': L('ملخص الاجتماع', 'Meeting summary') },
    step ? h(`section.card.mt-nextcard${step.calm ? '.calm' : ''}`, h('span.mt-next-ic', icon(step.icon)), h('div.grow', h('span.mt-next-eyebrow', L('الخطوة التالية', 'Next step')), h('p.mt-next-text', step.text),
      step.label ? (step.href ? h('a.btn.primary.sm', { href: step.href }, step.label) : h('button.btn.primary.sm', { type: 'button', onclick: (e) => step.run(e.currentTarget) }, step.label)) : null)) : null,
    m.phase !== 'upcoming' && m.status !== 'cancelled' ? h('section.card.mt-lifecycle', h('div.card-head', h('h2.card-title', L('دورة المحضر', 'Minutes lifecycle'))),
      stepper([{ ar: 'مسودة', en: 'Draft' }, { ar: 'معمّم', en: 'Circulated' }, { ar: 'معتمد', en: 'Approved' }], Math.max(0, idx), { label: L('مراحل المحضر', 'Minutes stages') }),
      m.minutes.circulated_at ? h('p.tiny.faint', L(`عمّمه ${m.minutes.circulated_by?.name_ar || '—'} ${dateTime(m.minutes.circulated_at)}`, `Circulated by ${m.minutes.circulated_by?.name_en || '—'} ${dateTime(m.minutes.circulated_at)}`),
        m.minutes.on_time != null ? h(`span.chip.tiny.${m.minutes.on_time ? 'good' : 'warn'}.mt-ontime`, icon(m.minutes.on_time ? 'timer' : 'clockAlert'), m.minutes.on_time ? L('في الموعد', 'On time') : L('بعد المهلة', 'Late')) : null) : m.minutes.status !== 'approved' ? h('p.tiny.faint', L(`مهلة التعميم: نهاية ${C.weekday(m.minutes.due_day)} ${C.dayMonth(m.minutes.due_day)} (يوما عمل)`, `Circulate by ${C.weekday(m.minutes.due_day)} ${C.dayMonth(m.minutes.due_day)} (2 working days)`)) : null,
      m.minutes.reviewers.length ? h('ul.mt-reviewers', m.minutes.reviewers.map((r) => { const a = m.attendees.find((x) => x.id === r.id); return h('li', whoChip(a), h('span.grow'), statusChip(r.review, { pending: ['بانتظار', 'Pending', 'outline', 'hourglass'], approved: ['اعتمد', 'Approved', 'good', 'check'], commented: ['ملاحظة', 'Commented', 'warn', 'messageSquare'] })); })) : null) : null,
    m.quorum ? quorumCard(m.quorum) : null,
    h('section.card.mt-rsvpcard', h('div.card-head', h('h2.card-title', L('الردود', 'Replies')), h('span.card-sub', fmtNum(m.attendees.length))),
      h('div.mt-rsvp-bar', { role: 'img', 'aria-label': rsvpCounts.map(([k, n]) => `${L(...C.RSVP[k].slice(0, 2))}: ${n}`).join('، ') }, rsvpCounts.filter(([, n]) => n).map(([k, n]) => h(`i.r-${k}`, { style: { flexGrow: n } }))),
      h('ul.mt-rsvp-legend', rsvpCounts.map(([k, n]) => h('li', h(`span.mt-sw.r-${k}`), L(...C.RSVP[k].slice(0, 2)), h('b.num', fmtNum(n)))))),
    m.access_log ? h('section.card.mt-access', h('div.card-head', h('h2.card-title', L('سجل الاطلاع', 'Access log')), h('span.chip.tiny.purple', icon('eye'), L('سري للغاية', 'Restricted'))),
      h('p.tiny.faint', L('يظهر للمنظّم وأمين السر فقط.', 'Visible to the organizer and secretary only.')), C.accessLog(m.access_log.slice(0, 12))) : null,
    h('section.card.mt-history', h('div.card-head', h('h2.card-title', L('السجل', 'History'))), timeline(m.history.slice(0, 8).map(historyEntry))));
}
function quorumCard(q) {
  const pct = q.required ? Math.min(100, Math.round((q.present / q.required) * 100)) : 0;
  return h(`section.card.mt-quorum${q.met ? '.met' : ''}`, h('div.card-head', h('h2.card-title', L('النصاب', 'Quorum')), q.recorded ? C.chip({ y: ['مكتمل', 'Met', 'good', 'circleCheck'], n: ['غير مكتمل', 'Not met', 'crit', 'circleAlert'] }, q.met ? 'y' : 'n') : h('span.chip.tiny.outline', L('لم يُسجّل الحضور', 'Not recorded'))),
    h('div.mt-q-num', h('span.num', fmtNum(q.present)), h('span.faint', q.recorded ? L(`حاضرون من ${fmtNum(q.members)} أعضاء · النصاب ${fmtNum(q.required)}`, `present of ${q.members} members · quorum ${q.required}`) : L(`النصاب ${fmtNum(q.required)} من ${fmtNum(q.members)} أعضاء`, `quorum ${q.required} of ${q.members} members`))),
    h('div.progress', { role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L('اكتمال النصاب', 'Quorum') }, h('i', { class: q.met ? 'good' : '', style: { width: `${pct}%` } })),
    h('p.tiny.faint', L('لا تُسجَّل قرارات اللجنة قبل اكتمال النصاب.', 'Committee decisions need quorum.')));
}
const HIST = {
  created: ['أنشأ الاجتماع', 'created the meeting', 'calendarPlus'], updated: ['عدّل بيانات الاجتماع', 'updated the meeting', 'pencil'], cancelled: ['ألغى الاجتماع', 'cancelled the meeting', 'ban', 'crit'],
  invited: ['دعا أشخاصاً', 'invited people', 'userPlus'], uninvited: ['أزال مدعواً', 'removed an invitee', 'userX'], rsvp_accepted: ['أكّد الحضور', 'accepted', 'check', 'good'], rsvp_declined: ['اعتذر عن الحضور', 'declined', 'x'], rsvp_tentative: ['ردّ بـ«ربما»', 'replied maybe', 'help'],
  attendance: ['سجّل الحضور', 'took attendance', 'userCheck'], agenda_added: ['أضاف بنداً', 'added an agenda item', 'listOrdered'], agenda_updated: ['عدّل جدول الأعمال', 'edited the agenda', 'listOrdered'], agenda_removed: ['حذف بنداً', 'removed an agenda item', 'trash'],
  document_shared: ['شارك مستنداً مع المدعوين', 'shared a document', 'share'], minutes_saved: ['حدّث المحضر', 'updated the minutes', 'notebook'], decision_added: ['سجّل قراراً', 'recorded a decision', 'gavel', 'emph'], decision_updated: ['عدّل قراراً', 'edited a decision', 'gavel'],
  decision_done: ['نفّذ قراراً', 'implemented a decision', 'circleCheck', 'good'], decision_in_progress: ['بدأ تنفيذ قرار', 'started a decision', 'loader'], decision_open: ['أعاد فتح قرار', 'reopened a decision', 'circleDot'], decision_cancelled: ['ألغى قراراً', 'cancelled a decision', 'ban'],
  action_added: ['أضاف تكليفاً', 'added an action item', 'listChecks'], action_accepted: ['قبل تكليفاً', 'accepted an action item', 'check', 'good'], action_declined: ['اعتذر عن تكليف', 'declined an action item', 'x'], action_cancelled: ['ألغى تكليفاً', 'cancelled an action item', 'ban'],
  minutes_circulated: ['عمّم المحضر للاعتماد', 'circulated the minutes', 'send', 'emph'], minutes_revised: ['أعاد المحضر إلى المسودة', 'returned the minutes to draft', 'undo'], minutes_review_approved: ['اعتمد المحضر', 'approved the minutes', 'check', 'good'],
  minutes_commented: ['أضاف ملاحظة على المحضر', 'commented on the minutes', 'messageSquare'], minutes_approved: ['اعتُمد المحضر', 'minutes approved', 'badgeCheck', 'good'], minutes_exported: ['حفظ المحضر في المستندات', 'saved the minutes to Documents', 'fileText'],
};
function historyEntry(x) {
  const [ar, en, ic, tone] = HIST[x.action] || [x.action, x.action, 'circleDot'];
  if (!x.who) return { at: x.at, ar: x.action === 'minutes_approved' ? 'اعتُمد المحضر من جميع الحاضرين' : ar, en: x.action === 'minutes_approved' ? 'Minutes approved by all attendees' : en, icon: ic, tone };
  return { at: x.at, ar: `${x.who.name_ar} ${ar}`, en: `${x.who.name_en} ${en}`, icon: ic, tone };
}

// ---------------- organizer tools ----------------
async function editMeeting(m) {
  const v = await C.composer({ meeting: m });
  if (!v) return;
  const body = { title: v.title, starts_at: v.starts_at, duration_min: v.duration_min, location: v.location || '', virtual_link: v.virtual_link || '', secretary_id: v.secretary_id || '' };
  if (v.confidential !== m.confidential) {
    body.confidential = v.confidential;
    if (!v.confidential) {
      const ok = await confirmDialog(L('إلغاء سرية الاجتماع؟', 'Lower the classification?'), L('سيظهر عنوان الاجتماع في القوائم ويصبح متاحاً للمساعد الذكي للمدعوين. يُسجَّل هذا التغيير.', 'The title will appear in lists and become available to Ask AI for invitees. This change is audited.'), { danger: true, confirmLabel: L('إلغاء السرية', 'Lower it') });
      if (!ok) return; body.confirm = true;
    }
  }
  try { await C.call(`/meetings/${m.id}`, { method: 'PUT', body }); toast(L('حُفظت التغييرات', 'Changes saved')); reload(); } catch (e) { C.toastErr(e); }
}
async function cancelMeeting(m) {
  const r = await C.confirmWithReason(L('إلغاء الاجتماع؟', 'Cancel this meeting?'), L('سيُبلَّغ جميع المدعوين بالإلغاء. لا يمكن التراجع.', 'All invitees will be notified. This cannot be undone.'), { confirmLabel: L('إلغاء الاجتماع', 'Cancel meeting'), reasonLabel: L('سبب الإلغاء (يظهر للمدعوين)', 'Reason (shown to invitees)') });
  if (!r) return;
  try { await C.call(`/meetings/${m.id}/cancel`, { method: 'POST', body: { confirm: true, reason: r.reason || undefined } }); toast(L('أُلغي الاجتماع وأُبلغ المدعوون', 'Meeting cancelled; invitees notified')); reload(); } catch (e) { C.toastErr(e); }
}
async function invite(m) {
  const taken = new Set(m.attendees.map((a) => a.id));
  const v = await formDialog({ title: L('دعوة أشخاص', 'Invite people'), wide: true, fields: [
    { name: 'user_ids', label: L('الموظفون', 'Staff'), type: 'users', required: true, filter: (u) => !taken.has(u.id) },
    { name: 'required', label: L('حضورهم مطلوب', 'Attendance required'), type: 'checkbox' },
  ], values: { required: true }, submitLabel: L('إرسال الدعوات', 'Send invitations') });
  if (!v) return;
  try { await C.call(`/meetings/${m.id}/attendees`, { method: 'POST', body: { user_ids: v.user_ids, required: !!v.required } }); toast(L('أُرسلت الدعوات', 'Invitations sent')); reload(); } catch (e) { C.toastErr(e); }
}

// ---------------- agenda ----------------
function agendaSection(ctx, m) {
  const total = m.agenda.reduce((s, g) => s + (g.duration_min || 0), 0);
  const length = C.minutesBetween(m.starts_at, m.ends_at);
  const card = h('section.card.mt-sec', { 'aria-labelledby': 'mt-s-agenda' },
    h('div.card-head', h('h2.card-title#mt-s-agenda', L('جدول الأعمال', 'Agenda')),
      m.agenda.length ? h(`span.card-sub${total > length ? '.mt-late' : ''}`, L(`${C.duration(total)} من ${C.duration(length)}`, `${C.duration(total)} of ${C.duration(length)}`)) : null,
      m.can.agenda ? h('button.btn.sm.tertiary', { type: 'button', onclick: () => agendaDialog(m) }, icon('plus'), L('إضافة بند', 'Add item')) : null));
  if (!m.agenda.length) {
    card.append(emptyState({ icon: 'listOrdered', title: L('لا بنود بعد', 'No agenda items yet'), body: m.can.agenda ? L('جدول أعمال واضح يختصر زمن الاجتماع. أضف البنود ومقدّميها ومدتها.', 'A clear agenda keeps meetings short. Add items, presenters and timing.') : L('لم يضف المنظّم بنود جدول الأعمال بعد.', 'The organizer has not added agenda items yet.'),
      actions: m.can.agenda ? [{ label: L('إضافة أول بند', 'Add the first item'), primary: true, icon: 'plus', onClick: () => agendaDialog(m) }] : [] }));
    return card;
  }
  C.fill(card, [...card.childNodes],
    h('div.mt-budget', { role: 'img', 'aria-label': L(`توزيع الوقت: ${C.duration(total)} من ${C.duration(length)}`, `Time budget: ${C.duration(total)} of ${C.duration(length)}`) },
      m.agenda.map((g, i) => h(`i.b${i % 4}`, { style: { width: `${Math.min(100, (g.duration_min / Math.max(total, length)) * 100)}%` }, 'data-tip': `${g.seq}. ${g.title} · ${C.duration(g.duration_min)}` }))),
    total > length ? h('p.tiny.mt-late', icon('clockAlert'), L(' مجموع البنود يتجاوز مدة الاجتماع.', ' Items exceed the meeting length.')) : null,
    h('ol.mt-ag-list', m.agenda.map((g, i) => h('li.mt-ag-item',
      h('span.mt-ag-num', fmtNum(i + 1)),
      h('div.grow',
        h('div.mt-ag-title', g.title),
        h('div.mt-ag-meta', g.presenter ? whoChip(g.presenter) : h('span.faint.tiny', L('بلا مقدّم', 'No presenter')), h('span.chip.tiny.outline', icon('timer'), C.duration(g.duration_min)),
          g.document ? docChip(g.document) : null,
          g.minutes.trim() ? h('span.chip.tiny.sand', icon('notebook'), L('له محضر', 'Has minutes')) : null)),
      m.can.agenda ? agendaMenu(m, g, i) : null))));
  return card;
}
function docChip(d) {
  if (d.removed) return h('span.chip.tiny.outline', icon('fileWarning'), L('المستند محذوف', 'Document removed'));
  if (!d.accessible) return h('span.chip.tiny.outline', { 'data-tip': L('المستند لم يُشارك معك بعد — اطلب من المنظّم مشاركته', 'Not shared with you yet — ask the organizer') }, icon('fileLock'), L('مستند مرفق (غير مشارك معك)', 'Attached document (not shared)'));
  return h('button.chip.tiny.info.mt-doc', { type: 'button', onclick: async () => { const E = await import('../../../editor.js'); E.open(d.id); } }, icon('fileText'), d.title);
}
function agendaMenu(m, g, i) {
  const btn = h('button.icon-btn', { type: 'button', 'aria-label': L(`إجراءات البند ${g.title}`, `Actions for ${g.title}`), 'aria-haspopup': 'menu' }, icon('more'));
  btn.onclick = () => menu(btn, [
    { label: L('تعديل', 'Edit'), icon: 'pencil', onClick: () => agendaDialog(m, g) },
    i > 0 ? { label: L('نقل للأعلى', 'Move up'), icon: 'chevronUp', onClick: () => moveItem(m, g, 'up') } : null,
    i < m.agenda.length - 1 ? { label: L('نقل للأسفل', 'Move down'), icon: 'chevronDown', onClick: () => moveItem(m, g, 'down') } : null,
    g.document && m.can.link_docs ? { label: L('مشاركة المستند مع المدعوين', 'Share document with invitees'), icon: 'share', onClick: () => shareDoc(m, g) } : null,
    { sep: true },
    { label: L('حذف البند', 'Remove item'), icon: 'trash', danger: true, onClick: () => removeItem(m, g) },
  ].filter(Boolean));
  return btn;
}
async function agendaDialog(m, g = null) {
  const docs = m.can.link_docs ? await C.call('/my-documents').catch(() => []) : [];
  const v = await formDialog({ title: g ? L('تعديل البند', 'Edit item') : L('إضافة بند', 'Add agenda item'), fields: [
    { name: 'title', label: L('عنوان البند', 'Item'), required: true, full: true, maxLength: 300 },
    { name: 'presenter_id', label: L('المقدّم', 'Presenter'), type: 'select', options: m.attendees.map((a) => ({ value: a.id, label: L(a.name_ar, a.name_en) })), placeholder: L('— بلا مقدّم —', '— None —') },
    { name: 'duration_min', label: L('المدة (دقيقة)', 'Duration (min)'), type: 'number', min: 5, max: 240, step: 5, required: true },
    m.can.link_docs ? { name: 'document_id', label: L('مستند مرفق من مستنداتك', 'Attach one of your documents'), type: 'select', full: true, options: docs.map((d) => ({ value: d.id, label: d.title })), placeholder: docs.length ? L('— بلا مستند —', '— None —') : L('لا مستندات لديك بعد', 'You have no documents yet'), help: L('يظهر للمدعوين بعد مشاركته معهم من قائمة البند.', 'Invitees see it once you share it from the item menu.') } : null,
  ].filter(Boolean), values: { title: g?.title || '', presenter_id: g?.presenter?.id || '', duration_min: g?.duration_min || 15, document_id: g?.document?.id || '' }, submitLabel: g ? L('حفظ', 'Save') : L('إضافة', 'Add') });
  if (!v) return;
  const body = { title: v.title, presenter_id: v.presenter_id || null, duration_min: v.duration_min };
  if (m.can.link_docs) body.document_id = v.document_id || null;
  try {
    await C.call(g ? `/meetings/${m.id}/agenda/${g.id}` : `/meetings/${m.id}/agenda`, { method: g ? 'PUT' : 'POST', body: g ? body : { ...body, document_id: body.document_id || undefined, presenter_id: body.presenter_id || undefined } });
    toast(g ? L('حُفظ البند', 'Item saved') : L('أُضيف البند', 'Item added')); reload();
  } catch (e) { C.toastErr(e); }
}
async function moveItem(m, g, move) { try { await C.call(`/meetings/${m.id}/agenda/${g.id}`, { method: 'PUT', body: { move } }); reload(); } catch (e) { C.toastErr(e); } }
async function removeItem(m, g) {
  const ok = await confirmDialog(L('حذف البند؟', 'Remove this item?'), L(`سيُحذف «${g.title}» ومحضره. القرارات والتكليفات المرتبطة تبقى دون ربط بالبند.`, `“${g.title}” and its minutes will be removed. Linked decisions and actions stay, unlinked.`), { danger: true, confirmLabel: L('حذف', 'Remove') });
  if (!ok) return;
  try { await C.call(`/meetings/${m.id}/agenda/${g.id}/remove`, { method: 'POST', body: { confirm: true } }); toast(L('حُذف البند', 'Item removed')); reload(); } catch (e) { C.toastErr(e); }
}
async function shareDoc(m, g) {
  const ok = await confirmDialog(L('مشاركة المستند مع المدعوين؟', 'Share with invitees?'), L(`سيحصل جميع المدعوين على صلاحية الاطلاع على «${g.document.title}». يُسجَّل هذا التغيير.`, `All invitees will get view access to “${g.document.title}”. This is audited.`), { confirmLabel: L('مشاركة', 'Share') });
  if (!ok) return;
  try { const r = await C.call(`/meetings/${m.id}/agenda/${g.id}/share`, { method: 'POST', body: { confirm: true } }); toast(L(`شُورك المستند مع ${fmtNum(r.shared_with)}`, `Shared with ${r.shared_with}`)); reload(); } catch (e) { C.toastErr(e); }
}

// ---------------- minutes ----------------
function minutesSection(ctx, m) {
  const wrap = h('div.mt-minutes');
  if (m.status === 'cancelled') { wrap.append(h('section.card', emptyState({ icon: 'ban', title: L('اجتماع ملغى', 'Cancelled meeting'), body: L('لا محضر لاجتماع ملغى.', 'Cancelled meetings have no minutes.') }))); return wrap; }
  if (m.phase === 'upcoming') { wrap.append(h('section.card', emptyState({ icon: 'notebook', title: L('يُكتب المحضر بعد بدء الاجتماع', 'Minutes open once the meeting starts'), body: m.can.manage ? L(`ستتمكن أنت ${m.secretary ? 'وأمين السر ' : ''}من كتابة محضر كل بند وتسجيل القرارات والتكليفات عند بدء الاجتماع.`, 'You can write per-item minutes and record decisions once the meeting starts.') : L('سيُعمَّم عليك المحضر للاعتماد بعد الاجتماع.', 'The minutes will be circulated to you after the meeting.') }))); return wrap; }
  const hasContent = m.agenda.some((g) => g.minutes.trim()) || m.decisions.length;
  // status + actions
  const acts = [];
  if (m.can.circulate) acts.push(h('button.btn.primary', { type: 'button', disabled: !hasContent || null, onclick: (e) => circulate(e.currentTarget, m) }, icon('send'), L('تعميم المحضر للاعتماد', 'Circulate for approval')));
  if (m.can.review) acts.push(h('button.btn.primary', { type: 'button', onclick: (e) => approve(e.currentTarget, m) }, icon('check'), L('اعتماد المحضر', 'Approve minutes')));
  if (m.can.finalize) acts.push(h('button.btn', { type: 'button', onclick: (e) => finalize(e.currentTarget, m) }, icon('badgeCheck'), L('اعتماد نهائي', 'Finalize')));
  if (m.can.revise) acts.push(h('button.btn.ghost', { type: 'button', onclick: (e) => revise(e.currentTarget, m) }, icon('undo'), L('إعادة إلى المسودة', 'Back to draft')));
  if (hasContent) acts.push(h('button.btn.ghost.mt-ai-btn', { type: 'button', onclick: (e) => summarize(e.currentTarget, m) }, icon('spark'), L('ملخص ذكي', 'Smart summary')));
  if (m.can.export_doc) acts.push(h('button.btn.ghost', { type: 'button', onclick: (e) => exportDoc(e.currentTarget, m) }, icon('fileDown'), L('حفظ في المستندات', 'Save to Documents')));
  const statusText = {
    none: m.can.minutes ? L('ابدأ بكتابة محضر كل بند؛ يُحفظ كمسودة ولا يراه أحد قبل التعميم إلا المنظّم وأمين السر.', 'Start writing per-item minutes; it stays a draft until circulated.') : L('لم يُكتب المحضر بعد.', 'No minutes yet.'),
    draft: m.can.circulate ? L('المسودة جاهزة؟ عمّمها ليعتمدها الحاضرون. من يعمّم المحضر لا يعتمده (فصل المهام).', 'Ready? Circulate it for the attendees to approve. Whoever circulates cannot approve (segregation of duties).') : L('المحضر قيد الإعداد لدى أمين السر.', 'The minutes are being drafted.'),
    circulated: m.can.review ? L('راجع المحضر ثم اعتمده، أو أضف ملاحظة ليعالجها أمين السر.', 'Review, then approve — or add a comment for the secretary.') : L(`اعتمد ${fmtNum(m.minutes.approvals)} من ${fmtNum(m.minutes.reviewers.length)} من الحاضرين.`, `${m.minutes.approvals} of ${m.minutes.reviewers.length} attendees approved.`),
    approved: L(`اعتُمد المحضر ${m.minutes.approved_by === 'all' ? 'من جميع الحاضرين' : L(`اعتماداً نهائياً من ${m.minutes.approved_by?.name_ar || ''}`, '')} ${m.minutes.approved_at ? dateTime(m.minutes.approved_at) : ''}. أصبح مغلقاً أمام التعديل.`, `Approved ${m.minutes.approved_by === 'all' ? 'by all attendees' : 'by the organizer'} ${m.minutes.approved_at ? dateTime(m.minutes.approved_at) : ''}; now locked.`),
  }[m.minutes.status];
  wrap.append(h(`section.card.mt-min-status.ms-${m.minutes.status}`,
    h('div.mt-min-head', h('div.grow', h('span.eyebrow', L('حالة المحضر', 'Minutes status')), h('h2.mt-min-title', L(...C.MINUTES[m.minutes.status].slice(0, 2))), h('p.muted', statusText)),
      stepper([{ ar: 'مسودة', en: 'Draft' }, { ar: 'معمّم', en: 'Circulated' }, { ar: 'معتمد', en: 'Approved' }], Math.max(0, { none: 0, draft: 0, circulated: 1, approved: 3 }[m.minutes.status]))),
    acts.length ? h('div.mt-min-actions', acts) : null));
  const sum = summaries.get(m.id);
  if (sum) wrap.append(h(`section.card.mt-summary.${sum.source}`, h('div.card-head', h('h2.card-title', icon('spark'), L(' الملخص', ' Summary')), h(`span.chip.tiny.${sum.source === 'ai' ? 'purple' : 'outline'}`, L(sum.label_ar, sum.label_en)),
    h('button.icon-btn', { type: 'button', 'aria-label': L('إغلاق الملخص', 'Close summary'), onclick: () => { summaries.delete(m.id); reload(); } }, icon('x'))), h('div.mt-summary-text', sum.text)));
  // per agenda item
  if (!m.agenda.length) wrap.append(h('section.card', emptyState({ compact: true, icon: 'listOrdered', title: L('لا بنود في جدول الأعمال', 'No agenda items'), body: m.can.agenda ? L('أضف بنداً لتكتب محضره، أو سجّل القرارات مباشرة.', 'Add an item to write its minutes, or record decisions directly.') : '', actions: m.can.agenda ? [{ label: L('إضافة بند', 'Add item'), onClick: () => agendaDialog(m) }] : [] })));
  wrap.append(...m.agenda.map((g, i) => minutesItem(m, g, i)));
  // comments
  if (m.comments.length || m.can.comment) wrap.append(commentsCard(m));
  return wrap;
}
function minutesItem(m, g, i) {
  const key = `${m.id}:${g.id}`;
  const decisions = m.decisions.filter((d) => d.agenda_id === g.id);
  const itemComments = m.comments.filter((c) => c.agenda_id === g.id);
  if (!m.can.minutes) {
    return h('section.card.mt-min-item', h('div.mt-min-item-head', h('span.mt-ag-num', fmtNum(i + 1)), h('h3.grow', g.title), g.presenter ? whoChip(g.presenter) : null),
      g.minutes.trim() ? h('p.mt-min-text', g.minutes) : h('p.faint.tiny', L('لا محضر لهذا البند.', 'No minutes for this item.')),
      decisions.length ? h('ul.mt-min-decisions', decisions.map((d) => h('li', h('span.mt-dec-num', fmtNum(d.number)), d.text))) : null,
      itemComments.length ? h('p.tiny.faint', icon('messageSquare'), L(` ${fmtNum(itemComments.length)} ملاحظة`, ` ${itemComments.length} comments`)) : null);
  }
  const draft = drafts.get(key);
  const dirty = draft != null && draft !== g.minutes;
  const status = h('span.mt-save-state', { 'aria-live': 'polite' }, dirty ? L('تغييرات غير محفوظة', 'Unsaved changes') : g.minutes_updated_at ? L(`حُفظ ${dateTime(g.minutes_updated_at)}`, `Saved ${dateTime(g.minutes_updated_at)}`) : '');
  const ta = h('textarea.field.mt-min-input', { rows: Math.max(4, Math.min(12, Math.ceil(((draft ?? g.minutes).length || 1) / 90) + 2)), maxlength: 8000, 'data-mkey': key, id: `mt-min-${g.id}`,
    placeholder: L('ما الذي نوقش؟ ما الذي اتُّفق عليه؟', 'What was discussed? What was agreed?'),
    oninput: (e) => { drafts.set(key, e.target.value); status.textContent = e.target.value !== g.minutes ? L('تغييرات غير محفوظة', 'Unsaved changes') : ''; save.disabled = e.target.value === g.minutes; },
    onfocus: () => { focusKey = key; }, onblur: () => { if (focusKey === key) focusKey = null; },
    onkeydown: (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save.click(); } } }, draft ?? g.minutes);
  const save = h('button.btn.sm.primary', { type: 'button', disabled: !dirty || null, onclick: async (e) => {
    const value = ta.value;
    const ok = await act(e.currentTarget, () => C.call(`/meetings/${m.id}/agenda/${g.id}`, { method: 'PUT', body: { minutes: value } }), { success: L('حُفظ محضر البند', 'Item minutes saved') });
    if (ok) { drafts.delete(key); reload(); }
  } }, icon('check'), L('حفظ', 'Save'));
  return h(`section.card.mt-min-item${dirty ? '.dirty' : ''}`,
    h('div.mt-min-item-head', h('span.mt-ag-num', fmtNum(i + 1)), h('label.grow', { for: `mt-min-${g.id}` }, h('h3', g.title)), g.presenter ? whoChip(g.presenter) : null),
    ta,
    h('div.mt-min-item-foot', status, h('span.grow'), h('span.tiny.faint', h('span.kbd', '⌘S'), L(' للحفظ', ' to save')), save),
    decisions.length ? h('ul.mt-min-decisions', decisions.map((d) => h('li', h('span.mt-dec-num', fmtNum(d.number)), d.text))) : null);
}
function commentsCard(m) {
  const box = h('textarea.field', { rows: 3, maxlength: 2000, id: 'mt-comment', placeholder: L('ملاحظتك على المحضر…', 'Your comment on the minutes…'), oninput: (e) => comments.set(m.id, e.target.value) }, comments.get(m.id) || '');
  return h('section.card.mt-comments', { 'aria-labelledby': 'mt-c-title' },
    h('div.card-head', h('h2.card-title#mt-c-title', L('ملاحظات على المحضر', 'Comments on the minutes')), h('span.card-sub', fmtNum(m.comments.length))),
    m.comments.length ? h('ul.mt-comment-list', m.comments.map((c) => h('li', whoChip(c.user), h('span.tiny.faint', dateTime(c.created_at)), h('p', c.body)))) : h('p.faint.tiny', L('لا ملاحظات بعد.', 'No comments yet.')),
    m.can.comment ? h('div.mt-comment-form', h('label.sr', { for: 'mt-comment' }, L('ملاحظة', 'Comment')), box,
      h('button.btn.sm', { type: 'button', onclick: async (e) => {
        const body = box.value.trim(); if (body.length < 2) { box.focus(); return; }
        const ok = await act(e.currentTarget, () => C.call(`/meetings/${m.id}/minutes/comment`, { method: 'POST', body: { body } }), { success: L('أُرسلت ملاحظتك إلى أمين السر', 'Comment sent to the secretary') });
        if (ok) { comments.delete(m.id); reload(); }
      } }, icon('messageSquare'), L('إضافة ملاحظة', 'Add comment'))) : null);
}
async function circulate(btn, m) {
  const unsaved = [...drafts.keys()].some((k) => k.startsWith(`${m.id}:`) && drafts.get(k) !== m.agenda.find((g) => `${m.id}:${g.id}` === k)?.minutes);
  if (unsaved) { toast(L('احفظ تغييرات المحضر أولاً', 'Save your minutes changes first'), { kind: 'error' }); return; }
  const n = m.attendees.filter((a) => a.attendance === 'present' && a.id !== meId()).length;
  const ok = await confirmDialog(L('تعميم المحضر للاعتماد؟', 'Circulate for approval?'), L(`سيُرسل المحضر إلى ${fmtNum(n)} من الحاضرين لاعتماده. لن تتمكن من تعديله إلا بإعادته إلى المسودة، ولن تعتمده بنفسك.`, `It goes to ${n} attendees for approval. You can only edit it by returning it to draft, and you will not approve it yourself.`), { confirmLabel: L('تعميم', 'Circulate') });
  if (!ok) return;
  if (await act(btn, () => C.call(`/meetings/${m.id}/minutes/circulate`, { method: 'POST', body: {} }), { success: L('عُمّم المحضر للاعتماد', 'Minutes circulated') })) reload();
}
async function approve(btn, m) { if (await act(btn, () => C.call(`/meetings/${m.id}/minutes/approve`, { method: 'POST', body: {} }), { success: L('اعتمدت المحضر', 'You approved the minutes') })) reload(); }
async function revise(btn, m) {
  const ok = await confirmDialog(L('إعادة المحضر إلى المسودة؟', 'Return to draft?'), L('تُلغى الاعتمادات الحالية ويُعاد التعميم بعد التعديل.', 'Current approvals are cleared; circulate again after editing.'), { confirmLabel: L('إعادة إلى المسودة', 'Back to draft') });
  if (ok && await act(btn, () => C.call(`/meetings/${m.id}/minutes/revise`, { method: 'POST', body: {} }), { success: L('أُعيد المحضر إلى المسودة', 'Back to draft') })) reload();
}
async function finalize(btn, m) {
  const ok = await confirmDialog(L('اعتماد نهائي للمحضر؟', 'Finalize the minutes?'), L(`اعتمد ${fmtNum(m.minutes.approvals)} من ${fmtNum(m.minutes.reviewers.length)} من الحاضرين. بعد الاعتماد النهائي يُغلق المحضر أمام التعديل.`, `${m.minutes.approvals} of ${m.minutes.reviewers.length} attendees approved. Finalizing locks the minutes.`), { confirmLabel: L('اعتماد نهائي', 'Finalize') });
  if (ok && await act(btn, () => C.call(`/meetings/${m.id}/minutes/finalize`, { method: 'POST', body: { confirm: true } }), { success: L('اعتُمد المحضر', 'Minutes approved') })) reload();
}
async function summarize(btn, m) {
  const r = await act(btn, () => C.call(`/meetings/${m.id}/minutes/summary`, { method: 'POST', body: {} }));
  if (r) { summaries.set(m.id, r); reload(); }
}
async function exportDoc(btn, m) {
  const r = await act(btn, () => C.call(`/meetings/${m.id}/minutes/document`, { method: 'POST', body: {} }), { success: L('حُفظ المحضر في مستنداتك', 'Saved to your Documents') });
  if (r) { const E = await import('../../../editor.js'); E.open(r.document_id); }
}

// ---------------- decisions ----------------
function decisionsSection(ctx, m) {
  const card = h('section.card.mt-sec', { 'aria-labelledby': 'mt-s-dec' },
    h('div.card-head', h('h2.card-title#mt-s-dec', L('القرارات', 'Decisions')), h('span.card-sub', fmtNum(m.decisions.length)),
      m.can.decisions ? h('button.btn.sm.tertiary', { type: 'button', disabled: m.quorum && !m.quorum.met ? true : null, onclick: () => decisionDialog(m) }, icon('plus'), L('تسجيل قرار', 'Record decision')) : null));
  if (m.quorum && m.can.decisions && !m.quorum.met) card.append(h('div.callout.mt-quorum-warn', { role: 'note' }, icon('circleAlert'), h('span', m.quorum.recorded ? L(`النصاب غير مكتمل (${fmtNum(m.quorum.present)} من ${fmtNum(m.quorum.required)}) — لا تُسجَّل قرارات اللجنة.`, `Quorum not met (${m.quorum.present}/${m.quorum.required}) — decisions are blocked.`) : L('سجّل حضور أعضاء اللجنة أولاً للتحقق من النصاب.', 'Record committee attendance first to check quorum.')), h('a.btn.sm', { href: `#/sys/meetings/m/${m.id}/attendance` }, L('الحضور', 'Attendance'))));
  if (!m.decisions.length) {
    card.append(emptyState({ icon: 'gavel', title: L('لا قرارات مسجّلة', 'No decisions recorded'), body: m.phase === 'upcoming' ? L('تُسجَّل القرارات أثناء الاجتماع أو بعده.', 'Decisions are recorded during or after the meeting.') : m.can.decisions ? L('سجّل كل قرار برقم ومسؤول وتاريخ متوقع للتنفيذ.', 'Record each decision with an owner and a target date.') : L('لم تُسجَّل قرارات لهذا الاجتماع.', 'No decisions for this meeting.'),
      actions: m.can.decisions && (!m.quorum || m.quorum.met) ? [{ label: L('تسجيل قرار', 'Record a decision'), primary: true, icon: 'plus', onClick: () => decisionDialog(m) }] : [] }));
    return card;
  }
  card.append(h('ol.mt-dec-list', m.decisions.map((d) => {
    const linked = m.actions.filter((a) => a.decision_id === d.id && a.status !== 'cancelled');
    const canStatus = (m.can.manage || d.owner?.id === meId()) && m.status !== 'cancelled';
    const next = { open: ['in_progress', 'done', 'cancelled'], in_progress: ['done', 'open', 'cancelled'], done: ['in_progress'], cancelled: ['open'] }[d.status];
    return h(`li.mt-dec.s-${d.status}`,
      h('span.mt-dec-badge', h('small', L('قرار', 'No.')), h('b', fmtNum(d.number))),
      h('div.grow', h('p.mt-dec-text', d.text),
        h('div.mt-dec-meta', d.owner ? whoChip(d.owner) : h('span.faint.tiny', L('بلا مسؤول', 'No owner')),
          d.due_date ? h(`span.chip.tiny.${d.overdue ? 'crit' : 'outline'}`, icon(d.overdue ? 'clockAlert' : 'calendar'), L(`حتى ${C.dayMonth(d.due_date)}`, `By ${C.dayMonth(d.due_date)}`)) : null,
          linked.length ? h('span.chip.tiny.info', icon('listChecks'), L(`${fmtNum(linked.length)} تكليف`, `${linked.length} actions`)) : null)),
      h('div.mt-dec-side', C.chip(C.DECISION, d.status),
        canStatus ? h('select.field.sm.mt-dec-select', { 'aria-label': L('تغيير حالة القرار', 'Change decision status'), onchange: async (e) => {
          const status = e.target.value; if (!status) return;
          try { await C.call(`/decisions/${d.id}`, { method: 'PUT', body: { status } }); toast(L('حُدّثت حالة القرار', 'Decision updated')); reload(); } catch (err) { C.toastErr(err); e.target.value = ''; }
        } }, h('option', { value: '' }, L('تغيير الحالة…', 'Change…')), next.map((s) => h('option', { value: s }, L(...C.DECISION[s].slice(0, 2))))) : null,
        m.can.decisions ? h('button.icon-btn', { type: 'button', 'aria-label': L('تعديل القرار', 'Edit decision'), onclick: () => decisionDialog(m, d) }, icon('pencil')) : null));
  })));
  return card;
}
async function decisionDialog(m, d = null) {
  const v = await formDialog({ title: d ? L('تعديل القرار', 'Edit decision') : L(`تسجيل القرار رقم ${fmtNum(m.decisions.length + 1)}`, `Record decision #${m.decisions.length + 1}`), wide: true, fields: [
    { name: 'text', label: L('نص القرار', 'Decision'), type: 'textarea', required: true, rows: 3, maxLength: 1500 },
    { name: 'owner_id', label: L('المسؤول عن التنفيذ', 'Owner'), type: 'select', options: m.attendees.map((a) => ({ value: a.id, label: L(a.name_ar, a.name_en) })), placeholder: L('— بلا مسؤول —', '— None —') },
    { name: 'due_date', label: L('التاريخ المستهدف', 'Target date'), type: 'date' },
    !d && m.agenda.length ? { name: 'agenda_id', label: L('البند المرتبط', 'Agenda item'), type: 'select', full: true, options: m.agenda.map((g) => ({ value: g.id, label: `${g.seq}. ${g.title}` })), placeholder: L('— غير مرتبط —', '— Not linked —') } : null,
  ].filter(Boolean), values: { text: d?.text || '', owner_id: d?.owner?.id || '', due_date: d?.due_date || '' }, submitLabel: d ? L('حفظ', 'Save') : L('تسجيل', 'Record') });
  if (!v) return;
  try {
    if (d) await C.call(`/decisions/${d.id}`, { method: 'PUT', body: { text: v.text, owner_id: v.owner_id || null, due_date: v.due_date || null } });
    else await C.call(`/meetings/${m.id}/decisions`, { method: 'POST', body: { text: v.text, owner_id: v.owner_id || undefined, due_date: v.due_date || undefined, agenda_id: v.agenda_id || undefined } });
    toast(d ? L('حُفظ القرار', 'Decision saved') : L('سُجّل القرار', 'Decision recorded')); reload();
  } catch (e) { C.toastErr(e); }
}

// ---------------- action items ----------------
function actionsSection(ctx, m) {
  const list = m.actions;
  const card = h('section.card.mt-sec', { 'aria-labelledby': 'mt-s-act' },
    h('div.card-head', h('h2.card-title#mt-s-act', L('التكليفات', 'Action items')), h('span.card-sub', fmtNum(list.filter((a) => a.status !== 'cancelled').length)),
      m.can.actions ? h('button.btn.sm.tertiary', { type: 'button', onclick: () => actionDialog(m) }, icon('plus'), L('إضافة تكليف', 'Add action')) : null));
  if (m.can.actions) card.append(h('p.tiny.faint.mt-hint', icon('info'), L(' يصبح التكليف مهمة حقيقية في «المهام» عندما يملك المنظّم صلاحية الإسناد للمكلّف؛ وإلا يُرسل إليه لقبوله أولاً.', ' An action becomes a real task when the organizer may assign work to that person; otherwise the assignee accepts it first.')));
  if (!list.length) {
    card.append(emptyState({ icon: 'listChecks', title: L('لا تكليفات', 'No action items'), body: m.can.actions ? L('حوّل مخرجات الاجتماع إلى تكليفات بمكلّف وتاريخ استحقاق.', 'Turn outcomes into action items with an owner and due date.') : L('لا تكليفات لهذا الاجتماع.', 'No action items for this meeting.'), actions: m.can.actions ? [{ label: L('إضافة تكليف', 'Add action'), primary: true, icon: 'plus', onClick: () => actionDialog(m) }] : [] }));
    return card;
  }
  card.append(h('ul.mt-act-list', list.map((a) => {
    const mine = a.assignee?.id === meId();
    const dec = a.decision_id ? m.decisions.find((d) => d.id === a.decision_id) : null;
    return h(`li.mt-act.s-${a.status}${mine ? '.mine' : ''}`,
      h('span.mt-act-check', { 'aria-hidden': 'true' }, icon(a.status === 'done' ? 'circleCheck' : a.status === 'pending_acceptance' ? 'hourglass' : ['declined', 'cancelled', 'task_removed'].includes(a.status) ? 'ban' : 'circle')),
      h('div.grow', h('div.mt-act-title', a.title),
        h('div.mt-act-meta', whoChip(a.assignee), a.due_date ? h(`span.chip.tiny.${a.overdue ? 'crit' : 'outline'}`, icon(a.overdue ? 'clockAlert' : 'calendar'), C.dayMonth(a.due_date)) : null,
          dec ? h('span.chip.tiny.outline', icon('gavel'), L(`قرار ${fmtNum(dec.number)}`, `Decision ${dec.number}`)) : null,
          a.task ? h('span.mt-task-link', { 'data-tip': L('المهمة المرتبطة في «المهام»', 'Linked task in Tasks') }, icon('link'), L('مهمة: ', 'Task: '), C.chip(C.TASK, a.task.status)) : null,
          a.decline_reason ? h('span.tiny.faint', `«${a.decline_reason}»`) : null)),
      h('div.mt-act-side', C.chip(C.ACTION, a.status),
        mine && a.status === 'pending_acceptance' ? h('div.btn-group', h('button.btn.sm.primary', { type: 'button', onclick: (e) => acceptAction(e.currentTarget, a) }, L('قبول', 'Accept')), h('button.btn.sm', { type: 'button', onclick: () => declineAction(a) }, L('اعتذار', 'Decline'))) : null,
        mine && a.task && a.status !== 'done' ? h('a.btn.sm.ghost', { href: '#/tasks' }, L('مهامي', 'My tasks')) : null,
        m.can.manage && ['open', 'in_progress', 'pending_acceptance'].includes(a.status) ? h('button.icon-btn', { type: 'button', 'aria-label': L('إلغاء التكليف', 'Cancel action item'), onclick: () => cancelAction(a) }, icon('trash')) : null));
  })));
  return card;
}
async function actionDialog(m) {
  const v = await formDialog({ title: L('إضافة تكليف', 'Add action item'), wide: true, intro: L('المكلّف من المدعوين للاجتماع.', 'The assignee must be a meeting invitee.'), fields: [
    { name: 'title', label: L('التكليف', 'Action'), required: true, full: true, maxLength: 300, placeholder: L('فعل واضح وقابل للقياس…', 'A clear, measurable action…') },
    { name: 'assignee_id', label: L('المكلّف', 'Assignee'), type: 'select', required: true, options: m.attendees.map((a) => ({ value: a.id, label: `${L(a.name_ar, a.name_en)} — ${L(a.dept_ar, a.dept_en)}` })) },
    { name: 'due_date', label: L('تاريخ الاستحقاق', 'Due date'), type: 'date', min: C.todayLocal() },
    { name: 'priority', label: L('الأولوية', 'Priority'), type: 'select', required: true, options: [['low', 'منخفضة', 'Low'], ['medium', 'متوسطة', 'Medium'], ['high', 'عالية', 'High'], ['urgent', 'عاجلة', 'Urgent']].map(([value, ar, en]) => ({ value, label: L(ar, en) })) },
    m.decisions.length ? { name: 'decision_id', label: L('القرار المرتبط', 'Linked decision'), type: 'select', full: true, options: m.decisions.map((d) => ({ value: d.id, label: `${d.number}. ${d.text.slice(0, 80)}` })), placeholder: L('— غير مرتبط —', '— Not linked —') } : null,
  ].filter(Boolean), values: { priority: 'medium' }, submitLabel: L('إضافة', 'Add') });
  if (!v) return;
  try {
    const a = await C.call(`/meetings/${m.id}/actions`, { method: 'POST', body: { title: v.title, assignee_id: v.assignee_id, due_date: v.due_date || undefined, priority: v.priority, decision_id: v.decision_id || undefined } });
    toast(a.status === 'pending_acceptance' ? L(`أُرسل التكليف إلى ${a.assignee.name_ar} لقبوله`, `Sent to ${a.assignee.name_en} to accept`) : L('أُضيف التكليف وأُنشئت مهمة مرتبطة', 'Action added and a linked task created'));
    reload();
  } catch (e) { C.toastErr(e); }
}
async function acceptAction(btn, a) { if (await act(btn, () => C.call(`/actions/${a.id}/accept`, { method: 'POST', body: {} }), { success: L('قبلت التكليف وأُضيف إلى مهامك', 'Accepted — added to your tasks') })) reload(); }
async function declineAction(a) {
  const r = await C.confirmWithReason(L('الاعتذار عن التكليف', 'Decline the action item'), L('سيُبلَّغ المنظّم وأمين السر بسبب اعتذارك.', 'The organizer and secretary will see your reason.'), { danger: false, confirmLabel: L('إرسال', 'Send'), reasonLabel: L('السبب', 'Reason'), required: true });
  if (!r) return;
  try { await C.call(`/actions/${a.id}/decline`, { method: 'POST', body: { reason: r.reason } }); toast(L('أُرسل اعتذارك', 'Sent')); reload(); } catch (e) { C.toastErr(e); }
}
async function cancelAction(a) {
  const ok = await confirmDialog(L('إلغاء التكليف؟', 'Cancel this action item?'), L('يُلغى التكليف وتُحذف مهمته المرتبطة إن لم تُنجز ويُبلَّغ المكلّف.', 'The action is cancelled, its unfinished linked task removed, and the assignee notified.'), { danger: true, confirmLabel: L('إلغاء التكليف', 'Cancel it') });
  if (!ok) return;
  try { await C.call(`/actions/${a.id}/cancel`, { method: 'POST', body: { confirm: true } }); toast(L('أُلغي التكليف', 'Action cancelled')); reload(); } catch (e) { C.toastErr(e); }
}

// ---------------- attendance ----------------
function attendanceSection(ctx, m) {
  const present = m.attendees.filter((a) => a.attendance === 'present').length;
  const card = h('section.card.mt-sec', { 'aria-labelledby': 'mt-s-att' },
    h('div.card-head', h('h2.card-title#mt-s-att', L('الحضور', 'Attendance')),
      m.attendance_taken_at ? h('span.card-sub', L(`${fmtNum(present)} حاضر من ${fmtNum(m.attendees.length)}`, `${present} of ${m.attendees.length} present`)) : h('span.card-sub', L(`${fmtNum(m.attendees.length)} مدعو`, `${m.attendees.length} invited`)),
      m.can.attendance && !m.attendance_taken_at ? h('button.btn.sm.tertiary', { type: 'button', onclick: (e) => markConfirmed(e.currentTarget, m) }, icon('userCheck'), L('تسجيل المؤكدين حاضرين', 'Mark confirmed as present')) : null,
      m.can.invite ? h('button.btn.sm', { type: 'button', onclick: () => invite(m) }, icon('userPlus'), L('دعوة', 'Invite')) : null));
  if (m.phase === 'upcoming' && m.can.manage) card.append(h('p.tiny.faint.mt-hint', icon('info'), L(' يُسجَّل الحضور عند بدء الاجتماع.', ' Attendance opens when the meeting starts.')));
  card.append(h('ul.mt-att-list', m.attendees.map((a) => h(`li.mt-att${a.id === meId() ? '.me' : ''}`,
    C.avatarStack([{ ...a, rsvp: a.rsvp }], { max: 1, total: 1 }),
    h('div.grow', h('div.mt-att-name', L(a.name_ar, a.name_en), a.role !== 'attendee' ? C.chip(C.ROLE, a.role) : null, a.required ? null : h('span.chip.tiny.outline', L('اختياري', 'Optional'))),
      h('div.mt-att-meta', [L(a.title_ar || '', a.title_en || ''), L(a.dept_ar, a.dept_en)].filter(Boolean).join(' · '), a.rsvp_note ? h('span.mt-att-note', ` — «${a.rsvp_note}»`) : null)),
    h('div.mt-att-side',
      C.chip(C.RSVP, a.rsvp),
      m.can.attendance ? attendSeg(m, a) : a.attendance ? C.chip(C.ATTEND, a.attendance) : null,
      m.can.invite && a.role === 'attendee' ? h('button.icon-btn', { type: 'button', 'aria-label': L(`إزالة ${a.name_ar}`, `Remove ${a.name_en}`), onclick: () => removeAttendee(m, a) }, icon('userX')) : null)))));
  return h('div', m.quorum ? quorumCard(m.quorum) : null, card);
}
function attendSeg(m, a) {
  return h('div.mt-att-seg', { role: 'radiogroup', 'aria-label': L(`حضور ${a.name_ar}`, `${a.name_en} attendance`) }, Object.entries(C.ATTEND).map(([k, v]) => h(`button.${k}${a.attendance === k ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(a.attendance === k), onclick: async (e) => {
    const status = a.attendance === k ? null : k;
    if (await act(e.currentTarget, () => C.call(`/meetings/${m.id}/attendance`, { method: 'POST', body: { entries: [{ user_id: a.id, status }] } }))) reload();
  } }, icon(v[3]), h('span', L(v[0], v[1])))));
}
async function markConfirmed(btn, m) {
  const entries = m.attendees.map((a) => ({ user_id: a.id, status: a.rsvp === 'accepted' ? 'present' : a.rsvp === 'declined' ? 'excused' : 'absent' }));
  if (await act(btn, () => C.call(`/meetings/${m.id}/attendance`, { method: 'POST', body: { entries } }), { success: L('سُجّل الحضور — عدّل أي شخص بنقرة', 'Attendance recorded — adjust anyone with a click') })) reload();
}
async function removeAttendee(m, a) {
  const ok = await confirmDialog(L(`إزالة ${a.name_ar}؟`, `Remove ${a.name_en}?`), L('سيفقد الاطلاع على هذا الاجتماع ومحضره. يُسجَّل هذا التغيير.', 'They will lose access to this meeting and its minutes. This is audited.'), { danger: true, confirmLabel: L('إزالة', 'Remove') });
  if (!ok) return;
  try { await C.call(`/meetings/${m.id}/attendees/${a.id}/remove`, { method: 'POST', body: { confirm: true } }); toast(L('أُزيل المدعو', 'Invitee removed')); reload(); } catch (e) { C.toastErr(e); }
}
void go; void plural;
