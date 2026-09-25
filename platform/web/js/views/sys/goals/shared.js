// My Goals — shared pieces: labels, period names, the goal side-sheet (owner or
// permitted manager, read-only for the latter), create/progress dialogs and the
// quick actions used by every tab. The server enforces ownership & visibility.
import {
  h, icon, L, getLang, statusChip, progress, openSheet, formDialog, confirmDialog, toast, act, timeline, sysApi, dateTime, menu, avatar,
} from '../../../sys-kit.js';
import { ring, nf, pctText } from '../strategy/viz.js';
import { celebrate } from '../../../game.js';

export const call = sysApi('goals');
export const TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
export const TYPE = { daily: ['يومي', 'Daily', 'sun'], weekly: ['أسبوعي', 'Weekly', 'calendarDays'], monthly: ['شهري', 'Monthly', 'calendar'], quarterly: ['ربع سنوي', 'Quarterly', 'layers'], yearly: ['سنوي', 'Yearly', 'flag'] };
export const STATUS = { active: ['نشط', 'Active', 'info', 'circleDot'], achieved: ['تحقق', 'Achieved', 'good', 'circleCheck'], missed: ['لم يتحقق', 'Missed', 'warn', 'clockAlert'], cancelled: ['ملغى', 'Cancelled', 'outline', 'circleX'] };
export const MEASURE = { binary: ['إنجاز / عدم إنجاز', 'Done / not done'], numeric: ['رقمي بمستهدف', 'Numeric target'], checklist: ['قائمة خطوات', 'Checklist'], rollup: ['يُجمَّع من أهداف فرعية', 'Rolls up sub-goals'] };
export const typeLabel = (t) => L(TYPE[t][0], TYPE[t][1]);
const KUDOS = [['أحسنت! عمل رائع، استمر', 'Great work — keep going'], ['فخور بتقدمك في هذا الهدف', 'Proud of your progress on this'], ['هل تحتاج دعماً لإنجازه؟ أنا متاح', 'Need support to get there? I’m available']];

const loc = () => (getLang() === 'ar' ? 'ar-AE' : 'en-GB');
const dt = (iso) => new Date(`${iso}T12:00:00Z`);
export function periodName(type, start, end, today) {
  if (type === 'daily') return start === today ? L('اليوم', 'Today') : dt(start).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (type === 'weekly') return `${L('أسبوع', 'Week')} ${dt(start).toLocaleDateString(loc(), { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${dt(end).toLocaleDateString(loc(), { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
  if (type === 'monthly') return dt(start).toLocaleDateString(loc(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (type === 'quarterly') { const q = Math.floor(Number(start.slice(5, 7)) / 3) + 1; return L(`الربع ${['الأول', 'الثاني', 'الثالث', 'الرابع'][q - 1]} ${start.slice(0, 4)}`, `Q${q} ${start.slice(0, 4)}`); }
  return start.slice(0, 4);
}
export const measureText = (g) => (g.measure === 'numeric' ? `⁦${nf(g.current_value)} / ${nf(g.target_value)}⁩ ${g.unit || ''}`.trim() : g.measure === 'checklist' ? L(`${nf(g.items_done, 0)} من ${nf(g.items_total, 0)} خطوات`, `${nf(g.items_done, 0)} of ${nf(g.items_total, 0)} steps`) : g.measure === 'rollup' ? L(`${nf(g.children.filter((c) => c.status === 'achieved').length, 0)} من ${nf(g.children.length, 0)} أهداف فرعية`, `${nf(g.children.filter((c) => c.status === 'achieved').length, 0)} of ${nf(g.children.length, 0)} sub-goals`) : null);
export const visChip = (g) => (g.visibility === 'manager' ? h('span.chip.tiny.navy', { 'data-tip': L('يراه مديرك المباشر ومدير إدارتك فقط', 'Visible to your line manager and department manager only') }, icon('eye'), L('مشترك مع المدير', 'Shared with manager')) : h('span.chip.tiny.outline', { 'data-tip': L('لا يراه أحد غيرك', 'Only you can see it') }, icon('lock'), L('خاص', 'Private')));
export const objChip = (g) => (g.objective?.code ? h('span.chip.tiny.sand', { 'data-tip': L(g.objective.title_ar || '', g.objective.title_en || g.objective.title_ar || '') }, icon('compass'), g.objective.code) : null);

// Quick completion toggle (binary/numeric/checklist → achieved; achieved → reopen).
export async function toggleDone(btn, g, reload) {
  if (g.status === 'achieved') {
    const r = await act(btn, () => call(`/goals/${g.id}/status`, { method: 'POST', body: { to: 'active' } }));
    if (r) { toast(L('أُعيد فتح الهدف', 'Goal reopened')); reload(); }
    return;
  }
  if (g.measure === 'rollup') { toast(L('يتحقق هذا الهدف من أهدافه الفرعية', 'This goal completes through its sub-goals'), { kind: 'info' }); return; }
  const r = await act(btn, () => call(`/goals/${g.id}/checkin`, { method: 'POST', body: { done: true } }));
  if (r) { celebrate(btn); toast(L(`أحسنت! تحقق «${g.title}»`, `Well done! “${g.title}” achieved`)); reload(); }
}

export async function progressDialog(btn, g, reload) {
  const v = await formDialog({ title: L('سجّل تقدّمك', 'Check in'), intro: g.title, values: { value: g.current_value }, fields: [
    g.measure === 'numeric' ? { name: 'value', label: L(`القيمة الحالية${g.unit ? ` (${g.unit})` : ''} — المستهدف ${nf(g.target_value)}`, `Current value${g.unit ? ` (${g.unit})` : ''} — target ${nf(g.target_value)}`), type: 'number', min: 0, step: 'any', required: true } : null,
    { name: 'note', label: L('ملاحظة (اختياري)', 'Note (optional)'), type: 'textarea', rows: 3, maxLength: 1000, placeholder: L('ماذا أنجزت؟ ما التالي؟', 'What did you get done? What’s next?'), required: g.measure !== 'numeric' },
  ].filter(Boolean), submitLabel: L('تسجيل', 'Save') });
  if (!v) return;
  const body = {}; if (v.value != null) body.value = v.value; if (v.note) body.note = v.note;
  const r = await act(btn, () => call(`/goals/${g.id}/checkin`, { method: 'POST', body }));
  if (r) { if (r.just_achieved) { celebrate(btn, { big: g.period_type !== 'daily' }); toast(L(`تحقق الهدف «${g.title}»`, `Goal achieved: “${g.title}”`)); } else toast(L('سُجّل التقدم', 'Progress saved')); reload(); }
}

export async function alignDialog(btn, g, reload) {
  const objectives = await call('/objectives').catch(() => []);
  const v = await formDialog({ title: L('ربط الهدف بالاستراتيجية', 'Align this goal'), intro: g.title, values: { objective_id: g.objective?.id || '' }, fields: [
    { name: 'objective_id', label: L('الهدف الاستراتيجي', 'Strategic objective'), type: 'select', required: true, full: true, options: objectives.map((o) => ({ value: o.id, label: `${o.code} · ${L(o.title_ar, o.title_en)}` })) },
  ], submitLabel: L('ربط', 'Align') });
  if (!v) return;
  const r = await act(btn, () => call(`/goals/${g.id}`, { method: 'PUT', body: { objective_id: v.objective_id } }));
  if (r) { toast(L('رُبط الهدف بالاستراتيجية', 'Goal aligned')); reload?.(); }
}
export async function createDialog(btn, { type = 'daily', parentId, objectiveId, reload } = {}) {
  const [objectives, parents] = await Promise.all([call('/objectives').catch(() => []), call(`/parents?type=${type}`).catch(() => [])]);
  const v = await formDialog({ title: L('هدف جديد', 'New goal'), wide: true, values: { period_type: type, measure: 'binary', parent_id: parentId || '', objective_id: objectiveId || '', visibility: '' }, fields: [
    { name: 'title', label: L('الهدف', 'Goal'), required: true, full: true, maxLength: 200, placeholder: L('مثال: إنهاء مراجعة عقود التوريد', 'e.g. Finish reviewing supply contracts') },
    { name: 'period_type', label: L('الفترة', 'Period'), type: 'select', required: true, options: TYPES.map((t) => ({ value: t, label: typeLabel(t) })) },
    { name: 'date', label: L('تاريخ ضمن الفترة (اختياري)', 'A date inside the period (optional)'), type: 'date', help: L('اتركه فارغاً للفترة الحالية، أو اختر يوماً لتخطيط فترة قادمة', 'Leave empty for the current period, or pick a day to plan ahead') },
    { name: 'measure', label: L('طريقة القياس', 'How is it measured?'), type: 'select', required: true, options: Object.entries(MEASURE).map(([k, [ar, en]]) => ({ value: k, label: L(ar, en) })) },
    { name: 'visibility', label: L('من يراه؟', 'Who can see it?'), type: 'select', options: [{ value: '', label: L('افتراضي: خاص لليومي والأسبوعي، ومشترك مع المدير للأطول', 'Default: private for daily/weekly, shared for longer') }, { value: 'private', label: L('خاص بي فقط', 'Only me') }, { value: 'manager', label: L('مشترك مع مديري المباشر', 'Shared with my line manager') }] },
    { name: 'target_value', label: L('المستهدف الرقمي (للقياس الرقمي)', 'Numeric target (numeric goals)'), type: 'number', min: 0, step: 'any' },
    { name: 'unit', label: L('الوحدة', 'Unit'), maxLength: 30, placeholder: L('مثال: معاملة، ساعة، %', 'e.g. cases, hours, %') },
    { name: 'items', label: L('خطوات قائمة التحقق (سطر لكل خطوة)', 'Checklist steps (one per line)'), type: 'textarea', rows: 3 },
    { name: 'objective_id', label: L('الهدف الاستراتيجي المرتبط', 'Aligned strategic objective'), type: 'select', full: true, options: objectives.map((o) => ({ value: o.id, label: `${o.code} · ${L(o.title_ar, o.title_en)}` })), placeholder: L('— غير مرتبط —', '— Not aligned —') },
    parents.length ? { name: 'parent_id', label: L('يساهم في هدف أطول (اختياري)', 'Contributes to a longer goal (optional)'), type: 'select', full: true, options: parents.map((p) => ({ value: p.id, label: `${typeLabel(p.period_type)} · ${p.title}` })), placeholder: L('— لا —', '— None —') } : null,
    { name: 'description', label: L('وصف (اختياري)', 'Description (optional)'), type: 'textarea', rows: 2, maxLength: 2000 },
  ].filter(Boolean), submitLabel: L('إضافة الهدف', 'Add goal') });
  if (!v) return null;
  const body = { title: v.title, period_type: v.period_type, measure: v.measure };
  if (v.date) body.date = v.date;
  if (v.visibility) body.visibility = v.visibility;
  if (v.objective_id) body.objective_id = v.objective_id;
  if (v.parent_id) body.parent_id = v.parent_id;
  if (v.description) body.description = v.description;
  if (v.measure === 'numeric') { body.target_value = v.target_value; if (v.unit) body.unit = v.unit; }
  if (v.measure === 'checklist') body.items = String(v.items || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const r = await act(btn, () => call('/goals', { method: 'POST', body }));
  if (r) { toast(L('أُضيف الهدف', 'Goal added')); reload?.(); }
  return r;
}

// ---------------------------------------------------------------- goal sheet
let current = null;
export async function goalSheet(id, { reload, onClose } = {}) {
  let g;
  try { g = await call(`/goals/${encodeURIComponent(id)}`); } catch (e) { toast(e.message, { kind: 'error' }); onClose?.(); return; }
  const today = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
  const refresh = async () => { reload?.(); await goalSheet(id, { reload, onClose }); };
  const owner = g.is_owner;
  const actions = h('div.gl-sheet-actions');
  if (owner) {
    if (g.status === 'active') {
      if (g.measure === 'numeric') actions.append(h('button.btn.primary', { type: 'button', onclick: (e) => progressDialog(e.currentTarget, g, refresh) }, icon('trendUp'), L('سجّل تقدماً', 'Check in')));
      if (g.measure !== 'rollup') actions.append(h(`button.btn${g.measure === 'numeric' ? '' : '.primary'}`, { type: 'button', onclick: (e) => toggleDone(e.currentTarget, g, refresh) }, icon('check'), L('تحقق الهدف', 'Mark achieved')));
      if (g.measure !== 'numeric') actions.append(h('button.btn', { type: 'button', onclick: (e) => progressDialog(e.currentTarget, g, refresh) }, icon('messagePlus'), L('ملاحظة تقدم', 'Progress note')));
    } else if (g.status === 'missed' && g.can_carry) {
      actions.append(h('button.btn.primary', { type: 'button', onclick: async (e) => { const r = await act(e.currentTarget, () => call(`/goals/${g.id}/carry`, { method: 'POST', body: {} })); if (r) { toast(L('نُقل الهدف إلى اليوم', 'Moved to today')); reload?.(); await goalSheet(r.id, { reload, onClose }); } } }, icon('arrowRight', 'flip-rtl'), L('انقله إلى اليوم', 'Carry to today')));
    } else if (g.status === 'achieved' || g.status === 'cancelled') {
      actions.append(h('button.btn', { type: 'button', onclick: async (e) => { const r = await act(e.currentTarget, () => call(`/goals/${g.id}/status`, { method: 'POST', body: { to: 'active' } })); if (r) { toast(L('أُعيد فتح الهدف', 'Goal reopened')); refresh(); } } }, icon('undo'), L('إعادة فتح', 'Reopen')));
    }
    actions.append(h('span.grow'), h('button.btn.ghost', { type: 'button', 'aria-haspopup': 'menu', onclick: (e) => { const b = e.currentTarget; menu(b, [
      { label: L('تعديل', 'Edit'), icon: 'pencil', onClick: () => editDialog(b, g, refresh) },
      { label: g.visibility === 'manager' ? L('اجعله خاصاً', 'Make private') : L('شاركه مع مديري', 'Share with my manager'), icon: g.visibility === 'manager' ? 'lock' : 'eye', onClick: () => toggleVisibility(b, g, refresh) },
      g.status === 'active' ? { label: L('إلغاء الهدف', 'Cancel goal'), icon: 'circleX', onClick: async () => { const r = await act(b, () => call(`/goals/${g.id}/status`, { method: 'POST', body: { to: 'cancelled' } })); if (r) { toast(L('أُلغي الهدف', 'Goal cancelled')); refresh(); } } } : null,
      { sep: true },
      { label: L('حذف نهائي', 'Delete permanently'), icon: 'trash', danger: true, onClick: async () => {
        if (!(await confirmDialog(L('حذف الهدف نهائياً؟', 'Delete this goal permanently?'), L('سيُحذف الهدف مع خطواته وسجل تقدمه وتعليقاته. لا يمكن التراجع. إن أردت الاحتفاظ بالسجل استخدم «إلغاء الهدف».', 'The goal, its steps, check-ins and comments will be deleted. This cannot be undone. To keep the history, cancel it instead.'), { danger: true, confirmLabel: L('حذف نهائي', 'Delete') }))) return;
        const r = await act(b, () => call(`/goals/${g.id}/delete`, { method: 'POST', body: { confirm: true } }));
        if (r) { toast(L('حُذف الهدف', 'Goal deleted')); current?.close(); reload?.(); }
      } },
    ]); } }, icon('more'), L('المزيد', 'More')));
  } else {
    actions.append(h('span.chip.tiny.outline', icon('eye'), L(`تطّلع بصفتك مدير ${g.owner?.name_ar || ''} — للقراءة والتشجيع فقط`, `Viewing as ${g.owner?.name_en || ''}’s manager — read and encourage only`)));
  }

  const facts = h('dl.sys-kv',
    h('dt', L('الفترة', 'Period')), h('dd', `${typeLabel(g.period_type)} · ${periodName(g.period_type, g.period_start, g.period_end, today)}`),
    h('dt', L('القياس', 'Measure')), h('dd', L(...MEASURE[g.measure]), measureText(g) ? h('span.faint', ` — ${measureText(g)}`) : null),
    g.objective ? [h('dt', L('يخدم الهدف الاستراتيجي', 'Serves objective')), h('dd', g.objective.code ? `${g.objective.code} · ${L(g.objective.title_ar, g.objective.title_en)}` : L('هدف استراتيجي لم يعد في الخطة النشطة', 'An objective no longer in the active plan'))] : null,
    g.parent ? [h('dt', L('يساهم في', 'Contributes to')), h('dd', h('button.linklike', { type: 'button', onclick: () => goalSheet(g.parent.id, { reload, onClose }) }, `${typeLabel(g.parent.period_type)} · ${g.parent.title}`))] : null,
    g.achieved_at ? [h('dt', L('تحقق في', 'Achieved on')), h('dd', dateTime(g.achieved_at))] : null);

  const items = g.measure === 'checklist' ? h('section', h('h3.gl-sub', L('الخطوات', 'Steps'), h('span.count', `${nf(g.items_done, 0)}/${nf(g.items_total, 0)}`)),
    h('ul.gl-items', g.items.map((it) => h(`li${it.done ? '.done' : ''}`,
      owner && g.status === 'active' ? h('button.gl-check', { type: 'button', 'aria-pressed': String(it.done), 'aria-label': `${it.title} — ${it.done ? L('منجزة', 'done') : L('غير منجزة', 'not done')}`, onclick: async (e) => { const r = await act(e.currentTarget, () => call(`/goals/${g.id}/checkin`, { method: 'POST', body: { item_id: it.id, item_done: !it.done } })); if (r) { if (r.just_achieved) { celebrate(e.currentTarget); toast(L('اكتملت كل الخطوات — تحقق الهدف!', 'All steps done — goal achieved!')); } refresh(); } } }, icon(it.done ? 'check' : 'circle'))
        : h('span.gl-check.ro', { 'aria-hidden': 'true' }, icon(it.done ? 'check' : 'circle')),
      h('span.grow', it.title),
      owner && g.status === 'active' && g.items_total > 1 ? h('button.icon-btn.sm', { type: 'button', 'aria-label': L('حذف الخطوة', 'Remove step'), onclick: async (e) => { const r = await act(e.currentTarget, () => call(`/goals/${g.id}/items/${it.id}/delete`, { method: 'POST', body: {} })); if (r) refresh(); } }, icon('x')) : null))),
    owner && g.status === 'active' ? h('form.gl-inline-add', { onsubmit: async (e) => { e.preventDefault(); const inp = e.currentTarget.querySelector('input'); const t = inp.value.trim(); if (!t) return; const r = await act(e.currentTarget.querySelector('button'), () => call(`/goals/${g.id}/items`, { method: 'POST', body: { title: t } })); if (r) refresh(); } },
      h('input.field', { type: 'text', maxlength: 200, placeholder: L('أضف خطوة…', 'Add a step…'), 'aria-label': L('خطوة جديدة', 'New step') }), h('button.btn.sm', { type: 'submit' }, icon('plus'), L('إضافة', 'Add'))) : null) : null;

  const children = g.children.length ? h('section', h('h3.gl-sub', L('أهداف فرعية تساهم فيه', 'Contributing sub-goals'), h('span.count', nf(g.children.length, 0))),
    h('ul.gl-kids', g.children.map((c) => h('li', h('button.gl-kid', { type: 'button', onclick: () => goalSheet(c.id, { reload, onClose }) },
      h('span.gl-type', typeLabel(c.period_type)), h('span.grow', c.title), h('span.tiny.faint', c.period_label), progress(c.progress, { tone: c.status === 'achieved' ? 'good' : null }), statusChip(c.status, STATUS)))))) : null;

  const comments = h('section.gl-comments', h('h3.gl-sub', L('تشجيع وتعليقات', 'Encouragement & comments'), h('span.count', nf(g.comments.length, 0))),
    g.comments.length ? h('ul.gl-comment-list', g.comments.map((c) => h('li', avatar(c.author?.name_ar || ''), h('div.grow', h('div.gl-c-head', h('strong', c.author ? L(c.author.name_ar, c.author.name_en) : ''), h('span.tiny.faint', dateTime(c.at))), h('div', c.body)))))
      : h('p.tiny.faint', owner ? (g.visibility === 'manager' ? L('سيظهر هنا تشجيع مديرك.', 'Your manager’s encouragement appears here.') : L('هذا الهدف خاص؛ لا يراه أحد غيرك.', 'This goal is private; nobody else can see it.')) : L('كن أول من يشجّع.', 'Be the first to encourage.')),
    !owner ? h('div.gl-kudos', KUDOS.map(([ar, en]) => h('button.btn.sm.tertiary', { type: 'button', onclick: (e) => sendComment(e.currentTarget, g, L(ar, en), refresh) }, L(ar, en)))) : null,
    owner && g.visibility !== 'manager' ? null : h('form.gl-inline-add', { onsubmit: async (e) => { e.preventDefault(); const inp = e.currentTarget.querySelector('input'); if (!inp.value.trim()) return; await sendComment(e.currentTarget.querySelector('button'), g, inp.value.trim(), refresh); } },
      h('input.field', { type: 'text', maxlength: 500, placeholder: owner ? L('ردّ على مديرك…', 'Reply to your manager…') : L('اكتب كلمة تشجيع…', 'Write a word of encouragement…'), 'aria-label': L('تعليق', 'Comment') }), h('button.btn.sm', { type: 'submit' }, icon('send', 'flip-rtl'), L('إرسال', 'Send'))));

  const history = h('section', h('h3.gl-sub', L('سجل التقدم', 'Progress history')),
    timeline(g.checkins.slice(0, 12).map((c) => ({ at: c.at, who: c.who, icon: { created: 'plus', achieved: 'circleCheck', progress: 'trendUp', item: 'listChecks', note: 'messageSquare', carried: 'arrowRight', cancelled: 'circleX', reopened: 'undo' }[c.kind] || 'circleDot', tone: c.kind === 'achieved' ? 'good' : c.kind === 'cancelled' ? 'crit' : null,
      ar: `${{ created: 'أُنشئ الهدف', achieved: 'تحقق الهدف', progress: `تحديث التقدم${c.value != null ? `: ${nf(c.value)}` : ''}`, item: 'تحديث خطوة', note: 'ملاحظة تقدم', carried: 'نُقل إلى يوم آخر', cancelled: 'أُلغي', reopened: 'أُعيد فتحه' }[c.kind] || c.kind}${c.note ? ` — ${c.note}` : ''}`,
      en: `${{ created: 'Goal created', achieved: 'Achieved', progress: `Progress update${c.value != null ? `: ${nf(c.value)}` : ''}`, item: 'Step updated', note: 'Progress note', carried: 'Carried to another day', cancelled: 'Cancelled', reopened: 'Reopened' }[c.kind] || c.kind}${c.note ? ` — ${c.note}` : ''}` }))));

  const privacy = owner ? h('section.gl-privacy', h('h3.gl-sub', icon('shield'), L('الخصوصية', 'Privacy')),
    h('p.tiny', g.visibility === 'manager'
      ? L(`مشترك للاطلاع مع: ${(g.shared_with || []).map((u) => u.name_ar).join('، ') || 'لا أحد حالياً'}. لا يراه أي شخص آخر، بما في ذلك الموارد البشرية ومدير المنصة.`, `Shared read-only with: ${(g.shared_with || []).map((u) => u.name_en).join(', ') || 'nobody right now'}. Nobody else — including HR and the platform admin — can see it.`)
      : L('خاص بك تماماً — لا يراه مديرك ولا أي جهة أخرى.', 'Fully private — not visible to your manager or anyone else.')),
    h('div.tiny.faint', L('من اطّلع على هذا الهدف', 'Who viewed this goal')), viewersList(g.viewers)) : null;

  const body = h('div.gl-sheet',
    h('div.gl-sheet-hero', ring({ value: g.progress, size: 104, stroke: 9, tone: g.status === 'achieved' ? 'good' : g.status === 'missed' ? 'warn' : g.status === 'cancelled' ? 'none' : 'brand', label: pctText(g.progress), sub: L(STATUS[g.status][0], STATUS[g.status][1]) }), facts),
    actions,
    g.description ? h('p.muted', g.description) : null,
    items, children, comments, history, privacy);
  const conf = { title: g.title, subtitle: `${typeLabel(g.period_type)} · ${periodName(g.period_type, g.period_start, g.period_end, today)}${owner ? '' : ` · ${L(g.owner?.name_ar || '', g.owner?.name_en || '')}`}`, badges: [statusChip(g.status, STATUS), visChip(g), objChip(g), g.is_demo ? h('span.chip.tiny.demo', L('تجريبي', 'Demo')) : null].filter(Boolean), body, wide: true };
  if (current && current.id === id && current.sheet.el.isConnected) { current.sheet.setBody(body); return current.sheet; }
  const sheet = openSheet(conf);
  current = { id, sheet, close: sheet.close };
  setTimeout(() => sheet.el.querySelector('.gl-sheet-actions .btn.primary, .gl-sheet-actions .btn')?.focus?.(), 60); // keyboard lands on the next step
  const obs = new MutationObserver(() => { if (!sheet.el.isConnected) { obs.disconnect(); if (current?.sheet === sheet) current = null; onClose?.(id); } });
  obs.observe(document.body, { childList: true });
  return sheet;
}
export const openGoalId = () => (current?.sheet?.el?.isConnected ? current.id : null);

const ACTIONS = { view: ['اطّلع', 'viewed', 'eye'], comment: ['علّق', 'commented', 'messageSquare'] };
function viewersList(rows) {
  if (!rows?.length) return h('p.tiny.faint', L('لم يطّلع أحد غيرك على هذا الهدف.', 'Nobody but you has viewed this goal.'));
  return h('ul.list.access-log', rows.map((r) => { const a = ACTIONS[r.action] || [r.action, r.action, 'pencil']; return h('li', icon(a[2]), h('span.grow', L(r.name_ar, r.name_en)), h('span.tiny.faint', `${L(a[0], a[1])} · ${dateTime(r.at)}`)); }));
}
async function sendComment(btn, g, text, done) {
  const r = await act(btn, () => call(`/goals/${g.id}/comments`, { method: 'POST', body: { body: text } }));
  if (r) { toast(L('أُرسل التعليق', 'Comment sent')); done(); }
}
async function toggleVisibility(btn, g, done) {
  const share = g.visibility !== 'manager';
  const ok = await confirmDialog(share ? L('مشاركة الهدف مع مديرك؟', 'Share this goal with your manager?') : L('إخفاء الهدف عن مديرك؟', 'Hide this goal from your manager?'),
    share ? L('سيتمكن مديرك المباشر ومدير إدارتك من الاطلاع على الهدف وتقدمه والتعليق تشجيعاً. لا يستطيعان تعديله. يمكنك إلغاء المشاركة في أي وقت.', 'Your line manager and department manager will be able to view this goal and its progress and leave encouragement. They cannot edit it. You can stop sharing at any time.')
      : L('لن يتمكن مديرك من رؤية الهدف بعد الآن. تبقى تعليقاته السابقة محفوظة لك.', 'Your manager will no longer see this goal. Previous comments stay with you.'), { confirmLabel: share ? L('مشاركة', 'Share') : L('اجعله خاصاً', 'Make private') });
  if (!ok) return;
  const r = await act(btn, () => call(`/goals/${g.id}`, { method: 'PUT', body: { visibility: share ? 'manager' : 'private', confirm: true } }));
  if (r) { toast(share ? L('أصبح الهدف مشتركاً مع مديرك', 'Now shared with your manager') : L('أصبح الهدف خاصاً', 'Goal is now private')); done(); }
}
async function editDialog(btn, g, done) {
  const objectives = await call('/objectives').catch(() => []);
  const v = await formDialog({ title: L('تعديل الهدف', 'Edit goal'), values: { title: g.title, description: g.description, target_value: g.target_value, unit: g.unit, objective_id: g.objective?.id || '' }, fields: [
    { name: 'title', label: L('الهدف', 'Goal'), required: true, full: true, maxLength: 200 },
    g.measure === 'numeric' ? { name: 'target_value', label: L('المستهدف', 'Target'), type: 'number', min: 0, step: 'any', required: true } : null,
    g.measure === 'numeric' ? { name: 'unit', label: L('الوحدة', 'Unit'), maxLength: 30 } : null,
    { name: 'objective_id', label: L('الهدف الاستراتيجي المرتبط', 'Aligned strategic objective'), type: 'select', full: true, options: objectives.map((o) => ({ value: o.id, label: `${o.code} · ${L(o.title_ar, o.title_en)}` })), placeholder: L('— غير مرتبط —', '— Not aligned —') },
    { name: 'description', label: L('الوصف', 'Description'), type: 'textarea', rows: 3, maxLength: 2000 },
  ].filter(Boolean) });
  if (!v) return;
  const body = { title: v.title, description: v.description || '', objective_id: v.objective_id || null };
  if (g.measure === 'numeric') { body.target_value = v.target_value; body.unit = v.unit || ''; }
  const r = await act(btn, () => call(`/goals/${g.id}`, { method: 'PUT', body }));
  if (r) { toast(L('حُفظ الهدف', 'Goal saved')); done(); }
}
export function goalRow(g, { onOpen, reload, compact = false } = {}) {
  const done = g.status === 'achieved';
  return h(`li.gl-row.st-${g.status}`,
    g.status === 'active' || done ? h('button.gl-check', { type: 'button', 'aria-pressed': String(done), 'aria-label': done ? L(`إعادة فتح «${g.title}»`, `Reopen “${g.title}”`) : L(`تحقق «${g.title}»`, `Mark “${g.title}” achieved`), onclick: (e) => toggleDone(e.currentTarget, g, reload) }, icon(done ? 'check' : 'circle'))
      : h('span.gl-check.ro', { 'aria-hidden': 'true' }, icon(g.status === 'missed' ? 'clockAlert' : 'circleX')),
    h('button.gl-row-main', { type: 'button', onclick: () => onOpen(g) },
      h('span.gl-title', g.title),
      h('span.gl-meta',
        compact ? null : h('span.gl-type', typeLabel(g.period_type)),
        measureText(g) ? h('span.tabular', measureText(g)) : null,
        objChip(g), g.parent ? h('span.gl-parent', icon('arrowUpRight', 'flip-rtl'), g.parent.title) : null,
        g.visibility === 'manager' ? h('span.gl-shared', { 'data-tip': L('مشترك مع المدير', 'Shared with manager') }, icon('eye')) : null)),
    g.measure === 'numeric' && g.status === 'active' ? h('button.btn.sm.tertiary.gl-plus', { type: 'button', 'aria-label': L(`أضف واحداً إلى «${g.title}»`, `Add one to “${g.title}”`), onclick: async (e) => { const b = e.currentTarget; const r = await act(b, () => call(`/goals/${g.id}/checkin`, { method: 'POST', body: { delta: 1 } })); if (r) { if (r.just_achieved) { celebrate(b); toast(L(`تحقق «${g.title}»`, `“${g.title}” achieved`)); } reload(); } } }, '+1') : null,
    g.status !== 'active' || g.measure === 'binary' ? null : h('span.gl-pct.num.tabular', pctText(g.progress)));
}
