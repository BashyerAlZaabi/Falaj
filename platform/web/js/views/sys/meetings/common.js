// Meetings UI — shared helpers: API, labels/status maps, time formatting,
// masked titles for restricted meetings, avatar stacks, and the meeting composer.
import { h, icon, toast, modal, avatar, L, fmtNum, fmtDate, fmtTime, getLang, sysApi, directory, state, sysHeader, sysTabs } from '../../../sys-kit.js';

export const call = sysApi('meetings');
// replaceChildren that ignores null/false (DOM would stringify them).
export const fill = (el, ...nodes) => el.replaceChildren(...nodes.flat().filter((x) => x != null && x !== false));
export const tz = () => new Date().getTimezoneOffset();

export const TABS = [
  { key: 'upcoming', ar: 'القادمة', en: 'Upcoming', icon: 'calendarClock' },
  { key: 'decisions', ar: 'القرارات والتكليفات', en: 'Decisions & actions', icon: 'listChecks' },
  { key: 'committees', ar: 'اللجان', en: 'Committees', icon: 'landmark' },
];
// Page chrome shared by the three tabs: header with the one primary action + tabs.
export function shell(ctx, tab, { counts = {}, actions = [], sub } = {}) {
  return [
    sysHeader(ctx, { title: L('الاجتماعات', 'Meetings'), sub: sub || L('جداول الأعمال والمحاضر والقرارات والتكليفات — كل اجتماع يراه منظّمه وأمين سره والمدعوون إليه فقط.', 'Agendas, minutes, decisions and action items — each meeting is seen only by its organizer, secretary and invitees.'), actions }),
    sysTabs(ctx, TABS.map((t) => ({ ...t, count: counts[t.key] || 0 })), tab),
  ];
}

// ---------------- labels ----------------
export const TYPE = {
  management: ['اجتماع إدارة', 'Management', 'navy', 'building'],
  committee: ['لجنة', 'Committee', 'purple', 'landmark'],
  project: ['اجتماع مشروع', 'Project', 'info', 'folder'],
  coordination: ['تنسيقي', 'Coordination', 'sand', 'handshake'],
};
export const PHASE = { upcoming: ['قادم', 'Upcoming', 'info', 'calendarClock'], live: ['جارٍ الآن', 'In progress', 'purple', 'circleDot'], ended: ['انتهى', 'Ended', 'outline', 'check'], cancelled: ['ملغى', 'Cancelled', 'crit', 'ban'] };
export const MINUTES = { none: ['بلا محضر', 'No minutes', 'outline', 'fileText'], draft: ['مسودة المحضر', 'Draft minutes', 'sand', 'pencil'], circulated: ['معمّم للاعتماد', 'Circulated for approval', 'warn', 'send'], approved: ['محضر معتمد', 'Minutes approved', 'good', 'badgeCheck'] };
export const RSVP = { pending: ['لم يرد', 'No reply', 'outline', 'hourglass'], accepted: ['مؤكد', 'Accepted', 'good', 'check'], tentative: ['ربما', 'Tentative', 'warn', 'help'], declined: ['معتذر', 'Declined', 'crit', 'x'] };
export const ATTEND = { present: ['حاضر', 'Present', 'good', 'userCheck'], absent: ['غائب', 'Absent', 'crit', 'userX'], excused: ['معتذر', 'Excused', 'sand', 'clock'] };
export const DECISION = { open: ['مفتوح', 'Open', 'info', 'circleDot'], in_progress: ['قيد التنفيذ', 'In progress', 'warn', 'loader'], done: ['منفّذ', 'Implemented', 'good', 'circleCheck'], cancelled: ['ملغى', 'Cancelled', 'outline', 'ban'] };
export const ACTION = { pending_acceptance: ['بانتظار القبول', 'Awaiting acceptance', 'warn', 'hourglass'], open: ['مفتوح', 'Open', 'info', 'circleDot'], in_progress: ['قيد التنفيذ', 'In progress', 'navy', 'loader'], done: ['منجز', 'Done', 'good', 'circleCheck'], declined: ['معتذر عنه', 'Declined', 'crit', 'x'], cancelled: ['ملغى', 'Cancelled', 'outline', 'ban'], task_removed: ['حُذفت المهمة', 'Task removed', 'outline', 'trash'] };
export const TASK = { todo: ['لم تبدأ', 'To do', 'outline', 'circleDashed'], in_progress: ['قيد التنفيذ', 'In progress', 'navy', 'loader'], done: ['منجزة', 'Done', 'good', 'circleCheck'], removed: ['محذوفة', 'Removed', 'outline', 'trash'] };
export const ROLE = { organizer: ['المنظّم', 'Organizer', 'navy'], secretary: ['أمين السر', 'Secretary', 'sand'], attendee: ['مدعو', 'Invitee', 'outline'], chair: ['الرئيس', 'Chair', 'purple'], member: ['عضو', 'Member', 'outline'] };

export function chip(map, key, { tiny = true } = {}) {
  const [ar, en, tone = 'outline', ic] = map[key] || [key, key, 'outline'];
  return h(`span.chip${tiny ? '.tiny' : ''}.${tone}`, ic ? icon(ic) : null, L(ar, en));
}
export const demoChip = (x) => (x?.is_demo ? h('span.chip.tiny.demo', { 'data-tip': L('بيانات تجريبية للعرض', 'Demo data') }, L('تجريبي', 'Demo')) : null);
export const lockChip = () => h('span.chip.tiny.purple.mt-lock', { 'data-tip': L('سري للغاية — يُسجَّل كل اطلاع، ولا يصل إليه المساعد الذكي', 'Restricted — every view is logged; never available to Ask AI') }, icon('lockKeyhole'), L('سري للغاية', 'Restricted'));

// Restricted meetings are masked in every list; the title shows only in the logged detail view.
export function titleOf(m) {
  if (!m) return '—';
  if (m.title) return m.title;
  return m.committee ? L(`اجتماع سري — ${m.committee.name_ar}`, `Restricted meeting — ${m.committee.name_en}`) : L('اجتماع سري للغاية', 'Restricted meeting');
}
export const maskedTip = L('العنوان والمحتوى يظهران عند فتح الاجتماع ويُسجَّل الاطلاع', 'Title and content show when you open it — the view is logged');

// ---------------- time ----------------
const pad = (n) => String(n).padStart(2, '0');
export const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const todayLocal = () => localDay(new Date().toISOString());
export const addDays = (day, n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return localDay(d.toISOString()); };
const locale = () => (getLang() === 'ar' ? 'ar-AE' : 'en-GB');
export const weekday = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long' });
export const dayMonth = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });
export const longDate = (iso) => new Date(iso).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
export const monthTitle = (ym) => new Date(`${ym}-15T12:00:00`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
export const time = (iso) => fmtTime(iso);
export const span = (m) => `${fmtTime(m.starts_at)} – ${fmtTime(m.ends_at)}`;
export const minutesBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 6e4);
export function duration(min) {
  if (min < 60) return L(`${fmtNum(min)} دقيقة`, `${min} min`);
  const hrs = Math.floor(min / 60); const rest = min % 60;
  const hr = getLang() === 'ar' ? (hrs === 1 ? 'ساعة' : hrs === 2 ? 'ساعتان' : `${fmtNum(hrs)} ساعات`) : `${hrs} h`;
  return rest ? L(`${hr} و${fmtNum(rest)} دقيقة`, `${hr} ${rest} min`) : hr;
}
export function relDay(day) {
  const diff = Math.round((Date.parse(`${day}T12:00:00`) - Date.parse(`${todayLocal()}T12:00:00`)) / 864e5);
  if (diff === 0) return L('اليوم', 'Today');
  if (diff === 1) return L('غداً', 'Tomorrow');
  if (diff === -1) return L('أمس', 'Yesterday');
  const rtf = new Intl.RelativeTimeFormat(getLang() === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  return rtf.format(diff, 'day');
}
export function until(iso) {
  const min = Math.round((Date.parse(iso) - Date.now()) / 6e4);
  const rtf = new Intl.RelativeTimeFormat(getLang() === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  if (Math.abs(min) < 60 * 24) return rtf.format(Math.round(min / 60), 'hour');
  return rtf.format(Math.round(min / 1440), 'day');
}
// Numbers inside Arabic running text keep their order (LRI … PDI).
export const iso8 = (s) => `⁦${s}⁩`;

// ---------------- people ----------------
export function avatarStack(people = [], { max = 4, total } = {}) {
  const shown = people.slice(0, max);
  const more = (total ?? people.length) - shown.length;
  return h('span.mt-stack', { 'aria-label': L(`${fmtNum(total ?? people.length)} مدعوين`, `${total ?? people.length} invitees`) },
    shown.map((p) => h(`span.mt-av${p.rsvp ? '.' + p.rsvp : ''}`, { 'data-tip': `${L(p.name_ar, p.name_en)}${p.rsvp ? ' · ' + L(...RSVP[p.rsvp].slice(0, 2)) : ''}` }, avatar(p.name_ar))),
    more > 0 ? h('span.mt-av.more', `+${fmtNum(more)}`) : null);
}
export const person = (u) => (u ? L(u.name_ar, u.name_en) : '—');

// ---------------- meeting composer (create / edit) ----------------
// A custom sheet instead of formDialog: date + time + duration, a searchable
// people picker grouped by department, restricted switch, quick agenda.
export async function composer({ meeting = null, committees = [], preset = {} } = {}) {
  const dir = await directory().catch(() => []);
  const me = state.me.user;
  const edit = !!meeting;
  const start = meeting ? new Date(meeting.starts_at) : (() => { const d = preset.date ? new Date(`${preset.date}T10:00:00`) : new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0); return d; })();
  const dur = meeting ? minutesBetween(meeting.starts_at, meeting.ends_at) : 60;
  const sel = new Map(); // id -> required
  if (!edit) for (const id of preset.attendee_ids || []) if (id !== me.id) sel.set(id, true);
  const eligibleCommittees = committees.filter((c) => ['chair', 'secretary'].includes(c.my_role ?? c.role));

  const f = {
    title: h('input.field', { id: 'mt-f-title', type: 'text', maxlength: 200, value: meeting?.title || preset.title || '', placeholder: L('مثال: متابعة جاهزية إطلاق البوابة', 'e.g. Portal launch readiness review'), required: true }),
    date: h('input.field', { id: 'mt-f-date', type: 'date', value: localDay(start.toISOString()), required: true }),
    time: h('input.field', { id: 'mt-f-time', type: 'time', step: 900, value: `${pad(start.getHours())}:${pad(start.getMinutes())}`, required: true }),
    duration: h('select.field', { id: 'mt-f-dur' }, [15, 30, 45, 60, 90, 120, 180, 240].map((m) => h('option', { value: m, selected: m === dur || null }, duration(m)))),
    location: h('input.field', { id: 'mt-f-loc', type: 'text', maxlength: 200, value: meeting?.location || '', placeholder: L('القاعة أو المكتب', 'Room or office') }),
    link: h('input.field', { id: 'mt-f-link', type: 'url', maxlength: 500, value: meeting?.virtual_link || '', placeholder: 'https://…', dir: 'ltr' }),
    secretary: h('select.field', { id: 'mt-f-sec' }, h('option', { value: '' }, L('— أنا (المنظّم) —', '— Me (organizer) —')),
      dir.filter((u) => u.id !== me.id).map((u) => h('option', { value: u.id, selected: (meeting?.secretary?.id || preset.secretary_id) === u.id || null }, `${L(u.name_ar, u.name_en)} — ${L(u.dept_ar, u.dept_en)}`))),
    confidential: h('input.switch', { id: 'mt-f-conf', type: 'checkbox', checked: meeting?.confidential || preset.confidential || null }),
    agenda: h('textarea.field', { id: 'mt-f-agenda', rows: 3, placeholder: L('بند في كل سطر', 'One item per line') }),
  };
  let type = meeting?.type || preset.type || 'management';
  let committeeId = preset.committee_id || '';
  const typeSeg = h('div.tabs.mt-seg', { role: 'radiogroup', 'aria-label': L('نوع الاجتماع', 'Meeting type') });
  const committeeRow = h('div.form-row.full');
  const drawType = () => {
    typeSeg.replaceChildren(...Object.entries(TYPE).filter(([k]) => k !== 'committee' || eligibleCommittees.length || type === 'committee').map(([k, v]) => h(`button${k === type ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(k === type), disabled: edit || null, onclick: () => { type = k; drawType(); } }, icon(v[3]), L(v[0], v[1]))));
    committeeRow.replaceChildren();
    if (type === 'committee' && !edit) {
      const s = h('select.field', { id: 'mt-f-cm', onchange: (e) => { committeeId = e.target.value; const c = eligibleCommittees.find((x) => x.id === committeeId); if (c?.confidential) f.confidential.checked = true; } },
        h('option', { value: '' }, L('— اختر اللجنة —', '— Select committee —')), eligibleCommittees.map((c) => h('option', { value: c.id, selected: c.id === committeeId || null }, `${L(c.name_ar, c.name_en)}${c.confidential ? L(' (سرية)', ' (restricted)') : ''}`)));
      committeeRow.append(h('label.lbl', { for: 'mt-f-cm' }, L('اللجنة', 'Committee'), h('span.req', ' *')), s, h('div.helper', L('يُدعى أعضاء اللجنة تلقائياً ويُحتسب النصاب منهم.', 'Committee members are invited automatically and count towards quorum.')));
    }
  };
  drawType();

  // People picker
  const search = h('input.field', { type: 'search', placeholder: L('ابحث بالاسم أو الإدارة…', 'Search name or department…'), 'aria-label': L('بحث في الموظفين', 'Search staff') });
  const chips = h('div.mt-picked', { 'aria-live': 'polite' });
  const listEl = h('div.mt-people', { role: 'group', 'aria-label': L('المدعوون', 'Invitees') });
  const drawPicked = () => chips.replaceChildren(...(sel.size ? [...sel].map(([id, req]) => {
    const u = dir.find((x) => x.id === id); if (!u) return null;
    return h(`span.mt-pick${req ? '' : '.opt'}`, avatar(u.name_ar), h('span', L(u.name_ar, u.name_en)),
      h('button.mt-pick-req', { type: 'button', 'aria-pressed': String(req), 'data-tip': L('حضور مطلوب/اختياري', 'Required/optional'), onclick: () => { sel.set(id, !req); drawPicked(); } }, req ? L('مطلوب', 'Required') : L('اختياري', 'Optional')),
      h('button.icon-btn.sm', { type: 'button', 'aria-label': L(`إزالة ${u.name_ar}`, `Remove ${u.name_en}`), onclick: () => { sel.delete(id); drawPicked(); drawList(); } }, icon('x')));
  }) : [h('span.faint.tiny', L('لم تختر مدعوين بعد', 'No invitees yet'))]));
  const drawList = () => {
    const q = search.value.trim().toLowerCase();
    const groups = new Map();
    for (const u of dir) {
      if (u.id === me.id) continue;
      const hay = `${u.name_ar} ${u.name_en} ${u.dept_ar} ${u.dept_en} ${u.title_ar || ''}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const g = L(u.dept_ar, u.dept_en); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(u);
    }
    listEl.replaceChildren(...[...groups].map(([g, us]) => h('div.mt-people-group', h('div.mt-people-head', g),
      us.map((u) => h('label.mt-person', h('input', { type: 'checkbox', checked: sel.has(u.id) || null, onchange: (e) => { if (e.target.checked) sel.set(u.id, true); else sel.delete(u.id); drawPicked(); } }),
        avatar(u.name_ar), h('span.grow', h('span.mt-person-name', L(u.name_ar, u.name_en)), h('span.mt-person-meta', L(u.title_ar || '', u.title_en || ''))))))));
    if (!groups.size) listEl.append(h('p.faint.tiny', L('لا نتائج', 'No matches')));
  };
  search.addEventListener('input', drawList);
  drawPicked(); drawList();

  const err = h('div.error-text', { role: 'alert', 'aria-live': 'assertive' });
  const row = (label, el, { full = false, req = false, help } = {}) => h(`div.form-row${full ? '.full' : ''}`, h('label.lbl', { for: el.id }, label, req ? h('span.req', { 'aria-hidden': 'true' }, ' *') : null), el, help ? h('div.helper', help) : null);
  const body = h('div.mt-composer',
    h('div.form-grid',
      row(L('عنوان الاجتماع', 'Title'), f.title, { full: true, req: true }),
      h('div.form-row.full', h('span.lbl', L('النوع', 'Type')), typeSeg),
      committeeRow,
      h('div.form-row.full.mt-when', row(L('التاريخ', 'Date'), f.date, { req: true }), row(L('البداية', 'Start'), f.time, { req: true }), row(L('المدة', 'Duration'), f.duration)),
      row(L('المكان', 'Location'), f.location),
      row(L('رابط الاجتماع الافتراضي', 'Virtual meeting link'), f.link, { help: L('اختياري — يبدأ بـ https://', 'Optional — must start with https://') }),
      row(L('أمين السر', 'Secretary'), f.secretary, { full: true, help: L('يكتب المحضر ويعمّمه؛ لا يعتمد محضره بنفسه.', 'Writes and circulates the minutes; never approves them.') }),
      edit ? null : h('div.form-row.full', h('span.lbl', L('المدعوون', 'Invitees')), chips, search, listEl),
      edit ? null : row(L('جدول الأعمال (اختياري)', 'Agenda (optional)'), f.agenda, { full: true }),
      h('div.form-row.full.mt-conf-row', h('label.check-label', f.confidential, h('span', h('strong', L('اجتماع سري للغاية', 'Restricted meeting')), h('span.helper', L('يظهر للمدعوين فقط، ويُخفى عنوانه في القوائم، ويُسجَّل كل اطلاع، ولا يصل إليه المساعد الذكي.', 'Only invitees see it; its title is masked in lists; every view is logged; Ask AI never reads it.'))))),
      h('div.full', err)));

  let out = null;
  const ok = await modal(edit ? L('تعديل الاجتماع', 'Edit meeting') : L('اجتماع جديد', 'New meeting'), body,
    [{ label: L('إلغاء', 'Cancel'), value: false }, { label: edit ? L('حفظ التغييرات', 'Save changes') : L('جدولة وإرسال الدعوات', 'Schedule & invite'), value: true, primary: true }],
    { wide: true, beforeClose: () => {
      err.textContent = '';
      const title = f.title.value.trim();
      if (title.length < 3) { err.textContent = L('اكتب عنواناً واضحاً (3 أحرف على الأقل).', 'Enter a clear title (3+ characters).'); f.title.focus(); return false; }
      if (!f.date.value || !f.time.value) { err.textContent = L('حدّد التاريخ ووقت البداية.', 'Pick a date and a start time.'); f.date.focus(); return false; }
      const startsAt = new Date(`${f.date.value}T${f.time.value}`);
      if (Number.isNaN(+startsAt)) { err.textContent = L('وقت غير صالح.', 'Invalid time.'); return false; }
      if (!edit && type === 'committee' && !committeeId) { err.textContent = L('اختر اللجنة.', 'Choose the committee.'); return false; }
      const link = f.link.value.trim();
      if (link && !/^https:\/\//i.test(link)) { err.textContent = L('رابط الاجتماع يجب أن يبدأ بـ https://', 'The meeting link must start with https://'); f.link.focus(); return false; }
      out = {
        title, starts_at: startsAt.toISOString(), duration_min: Number(f.duration.value),
        location: f.location.value.trim() || null, virtual_link: link || null, secretary_id: f.secretary.value || null, confidential: f.confidential.checked,
      };
      if (!edit) {
        out.type = type;
        if (type === 'committee') out.committee_id = committeeId;
        if (preset.project_id) out.project_id = preset.project_id;
        out.attendees = [...sel].map(([user_id, required]) => ({ user_id, required }));
        out.agenda = f.agenda.value.split('\n').map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 30).map((t) => ({ title: t }));
      }
      return true;
    } });
  return ok ? out : null;
}

// Simple confirmation with an optional reason.
export async function confirmWithReason(title, text, { danger = true, confirmLabel, reasonLabel, required = false } = {}) {
  const ta = h('textarea.field', { rows: 3, maxlength: 500, id: 'mt-reason' });
  const err = h('div.error-text', { role: 'alert' });
  let reason = '';
  const ok = await modal(title, h('div.stack', h('p.muted', text), reasonLabel ? h('div.form-row', h('label.lbl', { for: 'mt-reason' }, reasonLabel), ta) : null, err),
    [{ label: L('تراجع', 'Back'), value: false }, { label: confirmLabel || L('تأكيد', 'Confirm'), value: true, primary: !danger, danger }],
    { beforeClose: () => { reason = ta.value.trim(); if (required && reason.length < 3) { err.textContent = L('يُرجى ذكر السبب.', 'Please give a reason.'); ta.focus(); return false; } return true; } });
  return ok ? { reason } : null;
}

// Access log with human labels for the recorded actions (views and changes).
const ACCESS = {
  view: ['اطّلع', 'Viewed', 'eye'], summary: ['طلب ملخصاً', 'Summarised', 'spark'], created: ['أنشأ', 'Created', 'calendarPlus'], updated: ['عدّل البيانات', 'Edited', 'pencil'],
  cancelled: ['ألغى', 'Cancelled', 'ban'], invited: ['دعا أشخاصاً', 'Invited', 'userPlus'], uninvited: ['أزال مدعواً', 'Removed invitee', 'userX'], attendance: ['سجّل الحضور', 'Attendance', 'userCheck'],
  minutes_saved: ['حدّث المحضر', 'Edited minutes', 'notebook'], minutes_circulated: ['عمّم المحضر', 'Circulated minutes', 'send'], minutes_revised: ['أعاد المحضر للمسودة', 'Minutes to draft', 'undo'],
  minutes_review_approved: ['اعتمد المحضر', 'Approved minutes', 'check'], minutes_commented: ['علّق على المحضر', 'Commented', 'messageSquare'], minutes_approved: ['اعتُمد المحضر', 'Minutes approved', 'badgeCheck'],
  decision_added: ['سجّل قراراً', 'Recorded decision', 'gavel'], action_added: ['أضاف تكليفاً', 'Added action', 'listChecks'], action_accepted: ['قبل تكليفاً', 'Accepted action', 'check'], action_declined: ['اعتذر عن تكليف', 'Declined action', 'x'],
};
export function accessLog(rows) {
  if (!rows?.length) return h('p.faint.tiny', L('لم يُسجَّل اطلاع بعد', 'No access recorded yet'));
  return h('ul.mt-access-list', rows.map((r) => {
    const [ar, en, ic] = ACCESS[r.action] || (r.action.startsWith('rsvp_') ? ['ردّ على الدعوة', 'Replied', 'mailCheck'] : r.action.startsWith('decision_') ? ['حدّث قراراً', 'Updated decision', 'gavel'] : r.action.startsWith('agenda_') ? ['عدّل جدول الأعمال', 'Edited agenda', 'listOrdered'] : [r.action, r.action, 'pencil']);
    return h('li', h('span.mt-access-ic', icon(ic)), h('span.grow', h('b', L(r.name_ar, r.name_en)), ' ', h('span.faint', L(ar, en))), h('span.tiny.faint', `${fmtDate(r.at)} · ${fmtTime(r.at)}`));
  }));
}

export function toastErr(e) { toast(e?.message || String(e), { kind: 'error' }); }
export { h, icon, L, fmtNum, fmtDate, fmtTime };
