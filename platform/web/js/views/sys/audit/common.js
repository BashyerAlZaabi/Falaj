// Internal Audit UI — shared labels, chips and small building blocks.
import { h, icon, L as baseL, fmtNum, fmtDate, getLang, sysApi, statusChip, openSheet, toast, act, formDialog, api, emptyState, errorState, skeleton, state } from '../../../sys-kit.js';

export const call = sysApi('audit');
// English copy uses "item(s)" placeholders; resolve them against the number before them.
export const L = (ar, en) => baseL(ar, typeof en === 'string' ? en.replace(/(\d+)([^\d(]*?)([A-Za-z]+)\(s\)/g, (m, n, mid, w) => `${n}${mid}${w}${n === '1' ? '' : 's'}`) : en);
export const HREF = '#/sys/audit';

// Ordinal risk uses one hue (gazelle red) stepped toward the surface; never vermilion.
export const RISK = { high: ['عالية', 'High', 'risk-high', 'flame'], medium: ['متوسطة', 'Medium', 'risk-medium', 'alert'], low: ['منخفضة', 'Low', 'risk-low', 'circleDot'] };
export function riskChip(r, { tiny = true, prefix = true } = {}) {
  const [ar, en, cls, ic] = RISK[r] || RISK.low;
  return h(`span.chip.risk-chip.${cls}${tiny ? '.tiny' : ''}`, icon(ic), prefix ? L(`خطورة ${ar}`, `${en} risk`) : L(ar, en));
}
export const PHASES = [
  { key: 'planned', ar: 'مخطط لها', en: 'Planned', icon: 'calendarDays' },
  { key: 'planning', ar: 'التخطيط', en: 'Planning', icon: 'compass' },
  { key: 'fieldwork', ar: 'العمل الميداني', en: 'Fieldwork', icon: 'scanSearch' },
  { key: 'reporting', ar: 'إعداد التقرير', en: 'Reporting', icon: 'fileText' },
  { key: 'follow_up', ar: 'المتابعة', en: 'Follow-up', icon: 'listChecks' },
  { key: 'closed', ar: 'مغلقة', en: 'Closed', icon: 'badgeCheck' },
];
const PHASE_MAP = Object.fromEntries(PHASES.map((p) => [p.key, [p.ar, p.en, p.key === 'closed' ? 'good' : p.key === 'planned' ? 'outline' : p.key === 'follow_up' ? 'sand' : 'navy', p.icon]]));
export const phaseChip = (p) => statusChip(p, PHASE_MAP);
export const phaseLabel = (p) => { const x = PHASES.find((q) => q.key === p); return x ? L(x.ar, x.en) : p; };

export const FSTATUS = {
  draft: ['مسودة', 'Draft', 'outline', 'pencil'],
  issued: ['بانتظار رد الإدارة', 'Awaiting response', 'warn', 'hourglass'],
  in_follow_up: ['قيد المعالجة', 'In follow-up', 'navy', 'listChecks'],
  implemented: ['منفذة — بانتظار التحقق', 'Implemented — to validate', 'purple', 'fileCheck'],
  closed: ['مغلقة', 'Closed', 'good', 'badgeCheck'],
};
export const findingChip = (s) => statusChip(s, FSTATUS);
export const ASTATUS = { open: ['لم يبدأ', 'Not started', 'outline', 'circleDashed'], in_progress: ['قيد التنفيذ', 'In progress', 'navy', 'loader'], implemented: ['منفذة', 'Implemented', 'purple', 'fileCheck'], closed: ['مغلقة', 'Closed', 'good', 'badgeCheck'] };
export const actionChip = (s) => statusChip(s, ASTATUS);
export const RSTATUS = { open: ['بانتظار الرد', 'Awaiting reply', 'outline', 'inbox'], returned: ['معاد للاستكمال', 'Returned', 'warn', 'reply'], responded: ['تم الرد — للمراجعة', 'Answered — to review', 'purple', 'mailCheck'], accepted: ['مقبول', 'Accepted', 'good', 'circleCheck'] };
export const requestChip = (s) => statusChip(s, RSTATUS);
export const XSTATUS = {
  submitted: ['مستلم — بانتظار الإسناد', 'Received — to assign', 'warn', 'inbox'], assigned: ['لدى الإدارة المختصة', 'With the department', 'navy', 'building'],
  prepared: ['بانتظار مراجعة التدقيق', 'Awaiting IA review', 'purple', 'eyeCheck'], released: ['تم الرد', 'Answered', 'good', 'circleCheck'], in_progress: ['قيد الإعداد', 'In progress', 'navy', 'hourglass'],
};
export const extChip = (s) => statusChip(s, XSTATUS);

export const deptName = (d) => (d ? L(d.name_ar, d.name_en) : '—');
export const deptChip = (d) => h('span.chip.tiny.outline', icon('building'), deptName(d));
export const qChip = (q, y) => h('span.chip.tiny.outline.q-chip', L(`الربع ${fmtNum(q)}`, `Q${q}`), y ? [h('span.faint', ' · '), h('span.num.faint', String(y))] : null);
export const demoChip = (x) => (x?.is_demo ? h('span.chip.demo.tiny', L('تجريبي', 'Demo')) : null);
// One page-level chip instead of one per card.
export const demoBadge = (rows = []) => (rows.some((r) => r?.is_demo) ? [h('span.chip.demo.tiny', { 'data-tip': L('تتضمن الصفحة بيانات تجريبية للعرض', 'This page includes demo data') }, L('بيانات تجريبية', 'Demo data'))] : []);
export const nf = (n) => h('span.num.tabular', fmtNum(n));

// Due-date label: "متأخر 5 أيام" / "بعد 3 أيام" / "اليوم".
const today = () => new Date().toISOString().slice(0, 10);
export const daysFrom = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 864e5);
function daysAr(n) { return n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${fmtNum(n)} أيام` : `${fmtNum(n)} يوماً`; }
export function dueLabel(iso, { done = false } = {}) {
  if (!iso) return h('span.faint', '—');
  const d = daysFrom(iso);
  const date = h('span.due-date', fmtDate(iso));
  if (done) return h('span.due', date);
  if (d < 0) return h('span.due.late', icon('clockAlert'), L(`متأخر ${daysAr(-d)}`, `${-d} d overdue`), h('span.faint', ' · '), date);
  if (d === 0) return h('span.due.soon', icon('alarm'), L('اليوم', 'Today'));
  if (d <= 3) return h('span.due.soon', icon('clock'), L(`بعد ${daysAr(d)}`, `in ${d} d`), h('span.faint', ' · '), date);
  return h('span.due', icon('calendar'), date);
}

export const back = (href, label) => h('a.aud-back', { href }, icon('chevron', 'flip-rtl back-ic'), label);
export const kv = (pairs) => h('dl.sys-kv', pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', k), h('dd', v ?? '—')]));
export const para = (text) => (text ? h('p.aud-para', { dir: 'auto' }, text) : h('p.faint', '—'));
export function pageFrame(root) { const page = h('div.aud'); root.append(page); return page; }

// Load-then-paint with skeleton on first visit, seamless swap on soft refresh.
export async function mount(root, ctx, load, paint, { skel = 'card' } = {}) {
  const page = pageFrame(root);
  const run = async () => {
    try { const data = await load(); page.replaceChildren(...[].concat(paint(data)).filter(Boolean)); }
    catch (e) { page.replaceChildren(h('div.card', errorState(e.status === 404 ? { message: L('العنصر غير موجود أو غير متاح لك.', 'This item does not exist or is not available to you.') } : e, e.status === 404 ? null : () => { page.replaceChildren(skeletonPage(skel)); run(); }))); }
  };
  if (ctx.soft) { await run(); return page; }
  page.replaceChildren(skeletonPage(skel));
  run();
  return page;
}
export function skeletonPage(kind = 'card') {
  return h('div.aud-skel', { 'aria-busy': 'true' }, h('div.sk.sk-title'), h('div.stat-row', [1, 2, 3, 4].map(() => h('div.stat-tile', skeleton('stat')))), h('div.card', skeleton(kind === 'board' ? 'list' : kind, 5)));
}

// "What should I do next?" — one primary action with context.
export function nextCard({ tone = 'navy', icon: ic = 'target', title, body, action, secondary = [] }) {
  return h(`section.aud-next.${tone}`, { 'aria-label': L('الخطوة التالية', 'Next step') },
    h('span.aud-next-ic', { 'aria-hidden': 'true' }, icon(ic)),
    h('div.grow', h('div.aud-next-eyebrow', L('الخطوة التالية', 'Next step')), h('div.aud-next-title', title), body ? h('div.aud-next-body', body) : null),
    h('div.aud-next-actions', ...secondary.filter(Boolean), action || null));
}
export const btn = (label, { primary, tertiary, danger, ic, onClick, href, sm } = {}) => {
  const cls = `${primary ? '.primary' : tertiary ? '.tertiary' : ''}${danger ? '.danger' : ''}${sm ? '.sm' : ''}`;
  return href ? h(`a.btn${cls}`, { href }, ic ? icon(ic) : null, label) : h(`button.btn${cls}`, { type: 'button', onclick: onClick }, ic ? icon(ic) : null, label);
};

// ---------------- linked documents ----------------
export function docList(docs = []) {
  if (!docs.length) return null;
  return h('ul.aud-docs', docs.map((d) => h('li', h('button.aud-doc', { type: 'button', disabled: d.missing || null, onclick: () => viewDoc(d) }, icon('fileText'), h('span.grow', d.title), d.missing ? h('span.tiny.faint', L('لم يعد متاحاً', 'No longer available')) : icon('eye')))));
}
export async function viewDoc(d) {
  const sheet = openSheet({ title: d.title, subtitle: L('مستند مرفق — عرض للقراءة فقط، ويُسجَّل الاطلاع', 'Attached document — read-only; access is logged'), body: skeleton('card'), wide: true });
  try {
    const r = await call(`/links/${d.id}`);
    const body = h('article.aud-docview');
    body.innerHTML = r.content_html || ''; // sanitised server-side by the Documents module (whitelisted tags, no attributes)
    sheet.setBody(r.missing ? emptyState({ icon: 'fileWarning', title: L('المستند لم يعد متاحاً', 'Document no longer available') }) : body);
  } catch (e) { sheet.setBody(errorState(e)); }
}
// The current user's own documents (only these can be attached).
export async function myDocs() {
  const me = state.me.user.id;
  return (await api('/api/documents').catch(() => [])).filter((d) => d.owner_id === me).map((d) => ({ value: d.id, label: d.title }));
}
export async function docField() {
  const opts = await myDocs();
  return opts.length
    ? { name: 'doc_ids', type: 'multiselect', label: L('إرفاق من مستنداتي', 'Attach from my documents'), options: opts, help: L('تُعرض للمستلم للقراءة فقط عبر هذا الطلب، ولا تتغير صلاحيات المستند.', 'Shown read-only through this record; the document’s own sharing does not change.') }
    : { name: 'doc_info', type: 'info', label: L('لا توجد مستندات تملكها لإرفاقها. يمكنك إنشاء مستند من «المستندات» ثم إرفاقه.', 'You own no documents to attach. Create one in Documents first.') };
}

// Access log with readable actions; repeated views by the same person within a minute collapse into one row.
const ACCESS = { view: ['اطلاع', 'Viewed', 'eye'], list: ['اطلاع على القائمة', 'Viewed list', 'eye'], create: ['إنشاء', 'Created', 'plus'], update: ['تعديل', 'Edited', 'pencil'], review: ['مراجعة واعتماد', 'Reviewed', 'badgeCheck'], issue: ['إصدار', 'Issued', 'send'], issue_report: ['إصدار التقرير', 'Issued report', 'send'], respond: ['رد الإدارة', 'Responded', 'messageSquare'], progress: ['تحديث التنفيذ', 'Progress update', 'loader'], close: ['اعتماد الإغلاق', 'Closed', 'badgeCheck'], return: ['إعادة', 'Returned', 'reply'], withdraw: ['سحب', 'Withdrawn', 'trash'], note: ['ملاحظة داخلية', 'Internal note', 'lock'], release: ['إفراج', 'Released', 'send'] };
export function accessList(rows = []) {
  const out = [];
  for (const r of rows) { const prev = out[out.length - 1]; if (prev && prev.user_id === r.user_id && prev.action === r.action && String(prev.at).slice(0, 16) === String(r.at).slice(0, 16)) { prev.n++; continue; } out.push({ ...r, n: 1 }); }
  if (!out.length) return h('p.faint.tiny', L('لم يطّلع أحد بعد', 'No access recorded yet'));
  return h('ul.list.aud-access', out.slice(0, 12).map((r) => { const [ar, en, ic] = ACCESS[r.action] || [r.action, r.action, 'circleDot']; return h('li', icon(ic), h('span.grow', h('span.title', L(r.name_ar, r.name_en)), h('span.meta', `${L(ar, en)}${r.n > 1 ? ` ×${r.n}` : ''}`)), h('span.tiny.faint', `${fmtDate(r.at)}`)); }));
}
export const personOpt = (u) => ({ value: u.id, label: `${L(u.name_ar, u.name_en)} — ${L(u.title_ar || '', u.title_en || '')}` });
export { h, icon, fmtNum, fmtDate, getLang, toast, act, formDialog, emptyState, errorState, skeleton, statusChip, openSheet, api, state };
