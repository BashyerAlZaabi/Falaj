// Shared work-item components (task rows, project cards, status/priority,
// progress bars), the task sheet, form-sheet primitives, and the tool/undo
// helpers used by every screen. Styling: css/pages/work.css (wk-*) on top of
// the component library.
import { api, rid } from './api.js';
import { h, icon, toast, confirmDialog, errorState } from './ui.js';
import { L, t, fmtDate, fmtNum, getLang } from './i18n.js';
import { state, emit } from './state.js';

export const STATUS = { todo: ['قيد الانتظار', 'To do'], in_progress: ['قيد التنفيذ', 'In progress'], done: ['منجزة', 'Done'] };
export const PRIORITY = { urgent: ['عاجلة', 'Urgent', 'crit'], high: ['عالية', 'High', 'warn'], medium: ['متوسطة', 'Medium', ''], low: ['منخفضة', 'Low', ''] };
export const PRIORITY_ORDER = ['low', 'medium', 'high', 'urgent']; // pickers: ascending urgency
export const statusLabel = (s) => (STATUS[s] ? L(...STATUS[s]) : String(s ?? ''));
export const priorityChip = (p) => (PRIORITY[p] ? h(`span.chip.tiny${PRIORITY[p][2] ? '.' + PRIORITY[p][2] : ''}`, L(PRIORITY[p][0], PRIORITY[p][1])) : null);

// ---------------------------------------------------------------- tools
// quiet: no success toast · message: specific success text (with Undo when undoable)
// raw: return error responses instead of toasting them (forms show errors inline)
export async function runTool(name, input, { quiet, message, raw } = {}) {
  let r = await api(`/api/tools/${name}`, { method: 'POST', body: { input, requestId: rid() } }).catch((e) => e.body || { status: 'error', error: e.message });
  if (!r || typeof r !== 'object') r = { status: 'error', error: L('تعذّر التنفيذ', 'Could not complete') };
  if (r.status === 'error') { if (raw) return r; toast(r.error, { kind: 'error' }); return null; }
  if (r.status === 'needs_confirmation') return r;
  if (!quiet && r.undoable && r.actionId) toast(message || L('تم الحفظ', 'Saved'), { action: t('undo'), onAction: () => undo(r.actionId) });
  else if (!quiet && message) toast(message);
  return r;
}
export async function undo(actionId) {
  const r = await api(`/api/actions/${actionId}/undo`, { method: 'POST' }).catch((e) => e.body);
  toast(r?.status === 'ok' ? L('تم التراجع', 'Undone') : (r?.error || L('تعذّر التراجع', 'Could not undo')), { kind: r?.status === 'ok' ? null : 'error' });
  emit('data-changed', { entity: 'all' });
}
export const undoToast = (msg, r) => toast(msg, r?.undoable && r.actionId ? { action: t('undo'), onAction: () => undo(r.actionId) } : {});

// ---------------------------------------------------------------- language helpers
export const quote = (s) => L(`«${s}»`, `“${s}”`);
const arRules = new Intl.PluralRules('ar');
// Arabic counted phrases: 1 → singular, 2 → dual, 3–10 → plural, 11–99 → accusative singular
const NOUNS = {
  project: { one: 'مشروع واحد', two: 'مشروعان', few: 'مشاريع', many: 'مشروعاً', other: 'مشروع', en: ['project', 'projects'] },
  task: { one: 'مهمة واحدة', two: 'مهمتان', few: 'مهام', many: 'مهمة', other: 'مهمة', en: ['task', 'tasks'] },
  day: { one: 'يوماً واحداً', two: 'يومين', few: 'أيام', many: 'يوماً', other: 'يوم', en: ['day', 'days'] },
  point: { one: 'نقطة واحدة', two: 'نقطتين', few: 'نقاط', many: 'نقطة', other: 'نقطة', en: ['pt', 'pts'] },
};
export function countText(n, noun) {
  const f = NOUNS[noun];
  if (getLang() === 'en') return `${fmtNum(n)} ${f.en[n === 1 ? 0 : 1]}`;
  const c = arRules.select(n);
  if (c === 'one' || c === 'two') return f[c];
  return `${fmtNum(n)} ${f[c] || f.other}`;
}
export const daysText = (n) => countText(n, 'day');

// Local calendar dates (YYYY-MM-DD) — due dates are date-only values.
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function dayDiff(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const n = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
}
const locale = () => (getLang() === 'ar' ? 'ar-AE' : 'en-GB');
const asDate = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
export const longDate = (iso) => (iso ? asDate(iso).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');
const weekday = (iso) => asDate(iso).toLocaleDateString(locale(), { weekday: 'long', timeZone: 'UTC' });

// Relative due label for a task → { text, tone, diff } (null when no due date)
export function dueInfo(tk) {
  if (!tk.due_date) return null;
  const diff = dayDiff(tk.due_date);
  if (tk.status === 'done') return { text: fmtDate(tk.due_date), tone: '', diff };
  if (tk.overdue || diff < 0) return { text: diff < 0 ? L(`متأخرة ${daysText(-diff)}`, `${daysText(-diff)} overdue`) : L('متأخرة', 'Overdue'), tone: 'crit', diff };
  if (diff === 0) return { text: L('اليوم', 'Today'), tone: 'warn', diff };
  if (diff === 1) return { text: L('غداً', 'Tomorrow'), tone: '', diff };
  if (diff < 7) return { text: weekday(tk.due_date), tone: '', diff };
  return { text: fmtDate(tk.due_date), tone: '', diff };
}

// ---------------------------------------------------------------- project state
// Presentation of the server-derived flags (delayed / at_risk / status); no new rules.
export function projectState(p) {
  if (p.delayed) return { key: 'delayed', tone: 'crit', icon: 'clock', label: p.days_overdue > 0 ? L(`متأخر ${daysText(p.days_overdue)}`, `${daysText(p.days_overdue)} late`) : L('متأخر', 'Delayed') };
  if (p.status === 'done') return { key: 'done', tone: 'good', icon: 'circleCheck', label: L('مكتمل', 'Completed') };
  if (p.status === 'cancelled') return { key: 'cancelled', tone: '', icon: 'circleX', label: L('ملغى', 'Cancelled') };
  if (p.status === 'on_hold') return { key: 'on_hold', tone: '', icon: 'pause', label: L('متوقف مؤقتاً', 'On hold') };
  if (p.at_risk) return { key: 'at_risk', tone: 'warn', icon: 'alert', label: L('معرّض للتأخر', 'At risk') };
  if (p.progress == null) return { key: 'missing', tone: '', icon: 'circleDashed', label: L('نسبة الإنجاز غير مسجّلة', 'Progress not reported') };
  return { key: 'on_track', tone: 'good', icon: 'circleCheck', label: L('ضمن الموعد', 'On track') };
}
export const projectTone = (p) => (p.delayed ? 'crit' : p.at_risk ? 'warn' : p.status === 'done' ? 'good' : '');
export const stateChip = (s, { tiny = true } = {}) => h(`span.chip${tiny ? '.tiny' : ''}${s.tone ? '.' + s.tone : ''}`, icon(s.icon), s.label);
// Progress vs the time-elapsed expectation (reference only) → null when not comparable
export function progressGap(p) {
  if (p.progress == null || p.expected_progress == null || p.status !== 'active') return null;
  const g = p.progress - p.expected_progress;
  if (Math.abs(g) < 5) return { tone: 'good', text: L('وفق المتوقع زمنياً', 'On pace with the schedule'), gap: g };
  return g < 0
    ? { tone: g <= -15 ? 'crit' : 'warn', text: L(`أقل من المتوقع بـ${countText(-g, 'point')}`, `${-g} pts behind expected`), gap: g }
    : { tone: 'good', text: L(`أعلى من المتوقع بـ${countText(g, 'point')}`, `${g} pts ahead of expected`), gap: g };
}
// Percent inside running text: isolate so Arabic context can't flip it to "%55"
export const pctText = (v) => (v == null ? '—' : `⁦${fmtNum(v)}%⁩`);

// ---------------------------------------------------------------- progress bar
// p: 0–100 or null (not reported — drawn distinctly, never as zero).
// opts.tone: good|warn|crit · opts.expected: time-elapsed tick · opts.lg: taller bar
export function progressBar(p, { tone, expected, lg, label } = {}) {
  const lbl = label || L('نسبة الإنجاز', 'Progress');
  if (p == null) return h(`div.progress.missing${lg ? '.lg' : ''}`, { title: L('نسبة الإنجاز غير مسجّلة', 'Progress not reported'), role: 'img', 'aria-label': `${lbl}: ${L('غير مسجّلة', 'not reported')}` });
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const bar = h(`div.progress${tone ? '.' + tone : ''}${lg ? '.lg' : ''}`, { role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': lbl }, h('i', { style: { width: `${clamp(p)}%` } }));
  if (expected == null) return bar;
  return h('div.wk-meter', bar, h('span.wk-expected', { style: { insetInlineStart: `${clamp(expected)}%` }, title: `${L('المتوقع زمنياً', 'Time-elapsed expectation')} ${expected}%`, 'aria-hidden': 'true' }));
}

// ---------------------------------------------------------------- project card
// Grid tile that links to the project (keyboard reachable, announced as a link).
export function projectCard(p) {
  const s = projectState(p);
  const gap = progressGap(p);
  const showState = !['on_track', 'missing'].includes(s.key);
  return h('li.wk-proj-item', { 'data-id': p.id },
    h('a.card.interactive.wk-proj', { href: `#/projects/${p.id}`, onclick: () => { state.selectedProjectId = p.id; state.projectName = p.name; } },
      h('div.wk-proj-top',
        h('span.wk-proj-dept', icon('building', 'sm'), h('span.truncate', L(p.dept_ar, p.dept_en) || '—')),
        h('span.wk-proj-chips', p.is_strategic ? strategicChip() : null, showState ? stateChip(s) : null)),
      h('h2.wk-proj-name', p.name),
      h('div.wk-proj-figure',
        p.progress == null
          ? h('span.wk-pct.is-missing', L('لم تُسجَّل نسبة بعد', 'No progress yet'))
          : h('span.wk-pct', h('bdi', fmtNum(p.progress)), h('span.wk-pct-unit', '%')),
        gap && gap.tone !== 'good' ? h(`span.wk-gap.${gap.tone}`, gap.text) : p.progress != null ? h('span.wk-gap', L('الإنجاز', 'Complete')) : null),
      progressBar(p.progress, { tone: projectTone(p), expected: p.status === 'active' ? p.expected_progress : null }),
      h('div.wk-proj-foot',
        h('span', icon('calendar', 'sm'), p.due_date ? `${L('الاستحقاق', 'Due')} ${fmtDate(p.due_date)}` : L('بلا تاريخ استحقاق', 'No due date')),
        p.tasks_total ? h('span', icon('listChecks', 'sm'), L(`${fmtNum(p.tasks_done)} من ${fmtNum(p.tasks_total)} منجزة`, `${p.tasks_done} of ${p.tasks_total} done`)) : null,
        p.progress_updated_at ? h('span.wk-proj-upd', `${L('حُدّثت', 'Updated')} ${fmtDate(p.progress_updated_at)}`) : null)));
}

// ---------------------------------------------------------------- task row
// opts.onToggle(status): after a successful toggle · opts.hideProject: inside a project page
// opts.onOpen(tk): override the default action (opens the task sheet)
export function taskRow(tk, { onToggle, hideProject = false, onOpen } = {}) {
  let done = tk.status === 'done';
  const li = h('li.wk-task', { 'data-id': tk.id });
  const check = h('button.check', { type: 'button', role: 'checkbox' });
  const paint = () => {
    li.classList.toggle('is-done', done);
    check.classList.toggle('on', done);
    check.setAttribute('aria-checked', String(done));
    check.setAttribute('aria-label', done ? L(`إعادة فتح ${quote(tk.title)}`, `Reopen ${quote(tk.title)}`) : L(`تحديد ${quote(tk.title)} كمنجزة`, `Mark ${quote(tk.title)} as done`));
    check.replaceChildren(...(done ? [icon('check')] : []));
  };
  paint();
  check.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (check.dataset.busy) return;
    const next = done ? 'todo' : 'done';
    done = !done; paint(); check.dataset.busy = '1'; // optimistic; reverted if the server refuses
    check.classList.remove('is-popping'); void check.offsetWidth; check.classList.add('is-popping');
    const r = await runTool('update_task', { id: tk.id, status: next }, { quiet: true });
    delete check.dataset.busy;
    if (!r || r.status !== 'ok') { done = !done; paint(); return; }
    tk.status = next;
    undoToast(next === 'done' ? L(`أُنجزت ${quote(tk.title)}`, `Completed ${quote(tk.title)}`) : L(`أُعيد فتح ${quote(tk.title)}`, `Reopened ${quote(tk.title)}`), r);
    onToggle?.(next);
  });
  const due = dueInfo(tk);
  const who = L(tk.assignee_ar, tk.assignee_en);
  const meId = state.me?.user?.id;
  const by = tk.assigner_ar ? L(tk.assigner_ar, tk.assigner_en) : null;
  // «من كلّفني»: work given to me by someone else is marked with who gave it
  const byMe = by && tk.assignee_id === meId;
  const meta = [
    byMe ? h('span.wk-meta-by', { title: L(`كلّفك بها ${by}`, `Assigned to you by ${by}`) }, icon('userCheck', 'sm'), L(`من ${by}`, `From ${by}`)) : null,
    !hideProject && tk.project_name ? h('span.wk-meta-proj', icon(tk.project_is_strategic ? 'compass' : 'folder', 'sm'), h('span.truncate', tk.project_name)) : null,
    who && !byMe ? h('span.wk-meta-who', who) : null,
    by && !byMe ? h('span.wk-meta-assigner', L(`أسندها ${by}`, `by ${by}`)) : null,
  ].filter(Boolean);
  const urgent = ['urgent', 'high'].includes(tk.priority) && !done;
  const kids = [check,
    h('button.wk-task-main', { type: 'button', 'aria-haspopup': 'dialog', onclick: () => { state.selectedTaskId = tk.id; (onOpen || openTask)(tk); } },
      h('span.wk-task-title', tk.title),
      meta.length ? h('span.wk-task-meta', meta.flatMap((m, i) => (i ? [h('span.wk-dot', { 'aria-hidden': 'true' }, '·'), m] : [m]))) : null),
    urgent || due ? h('span.wk-task-side',
      urgent ? h(`span.chip.tiny.${PRIORITY[tk.priority][2]}`, icon(tk.priority === 'urgent' ? 'zap' : 'flag'), L(PRIORITY[tk.priority][0], PRIORITY[tk.priority][1])) : null,
      due ? h(`span.wk-due${due.tone ? '.' + due.tone : ''}`, { title: longDate(tk.due_date) }, icon(due.tone === 'crit' ? 'clock' : 'calendar', 'sm'), due.text) : null) : null];
  li.append(...kids.filter(Boolean)); // native append would print "null"
  return li;
}

// ---------------------------------------------------------------- form sheet
// Modal on desktop / bottom sheet on phones (same .modal-wrap/.modal hooks as
// ui.js modal()), but it stays open while submitting, shows server errors
// inline, blocks double submits and keeps the primary action disabled until
// the form is valid. onSubmit(ctl) returns a value to close with, or undefined
// to stay open. onReady(ctl) runs once the sheet is in the DOM.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let sheetSeq = 0;
export function formSheet({ title, body, submitLabel, submitIcon, onSubmit, isValid, extra, wide = false, cancelLabel, onReady, autofocus = true }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const id = `wk-sheet-${++sheetSeq}`;
    let done = false; let busy = false; let dirty = false;
    const errBox = h('div.wk-form-error', { role: 'alert', hidden: true });
    const submit = h('button.btn.primary', { type: 'submit' }, submitIcon ? icon(submitIcon) : null, submitLabel);
    const cancel = h('button.btn.secondary', { type: 'button', onclick: () => close(null) }, cancelLabel || t('cancel'));
    const form = h(`form.modal.glass-4.wk-sheet${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, novalidate: true },
      h('div.sheet-grabber', { 'aria-hidden': 'true' }),
      h('h3', { id, tabindex: -1 }, title),
      h('button.icon-btn.modal-close', { type: 'button', 'aria-label': t('close'), onclick: () => close(null) }, icon('x')),
      h('div.wk-sheet-body', errBox, body),
      h('div.actions', extra ? h('div.wk-actions-extra', extra) : null, cancel, submit));
    const wrap = h('div.modal-wrap', { onclick: (e) => { if (e.target === wrap && !busy && !dirty) close(null); } }, form);
    const isTop = () => [...document.querySelectorAll('.modal-wrap:not(.leaving)')].pop() === wrap;
    const sync = () => { submit.disabled = busy || (isValid ? !isValid() : false); };
    const ctl = {
      form, close: (v) => close(v), revalidate: sync,
      setError(msg) { errBox.replaceChildren(...(msg ? [icon('circleAlert'), h('span', msg)] : [])); errBox.hidden = !msg; if (msg) errBox.scrollIntoView?.({ block: 'nearest' }); },
      setBusy(b) { busy = b; submit.classList.toggle('is-loading', b); submit.setAttribute('aria-busy', String(b)); cancel.disabled = b; sync(); },
    };
    function close(v) {
      if (done) return; done = true;
      wrap.classList.add('leaving');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => { wrap.remove(); if (prevFocus?.isConnected) prevFocus.focus?.(); }, 200);
      resolve(v);
    }
    function onKey(e) {
      if (!isTop()) return;
      if (e.key === 'Escape' && !busy) { e.stopPropagation(); close(null); return; }
      if (e.key !== 'Tab') return;
      const f = [...form.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
    form.addEventListener('input', () => { dirty = true; sync(); });
    form.addEventListener('change', () => { dirty = true; sync(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy || done || (isValid && !isValid())) return;
      ctl.setError(null); ctl.setBusy(true);
      let res;
      try { res = await onSubmit(ctl); } catch (err) { ctl.setError(err?.message || String(err)); }
      if (done) return;
      ctl.setBusy(false);
      if (res !== undefined && res !== null && res !== false) close(res);
    });
    document.body.append(wrap);
    document.addEventListener('keydown', onKey, true);
    sync();
    onReady?.(ctl);
    // New items: focus the first field. Viewing/editing: focus the title so phones don't pop the keyboard.
    setTimeout(() => ((autofocus && form.querySelector('.wk-sheet-body input:not([type=hidden]):not([tabindex="-1"]), .wk-sheet-body textarea')) || form.querySelector('h3')).focus?.(), 40);
  });
}

// Form field with a real <label for>, optional required mark and helper text.
export function formField(label, control, { required, helper, id } = {}) {
  const cid = id || control.id || `wk-f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = cid;
  if (required) control.setAttribute('aria-required', 'true');
  const help = helper ? h('div.helper', { id: `${cid}-help` }, helper) : null;
  if (help) control.setAttribute('aria-describedby', help.id);
  return h('div.form-field.wk-field', h('label.lbl', { for: cid }, label, required ? h('span.wk-req', L('مطلوب', 'Required')) : null), control, help);
}
// Group (radiogroup / composite control) with a visible caption.
export const formGroup = (label, control) => { const lid = `wk-g-${Math.random().toString(36).slice(2, 8)}`; control.setAttribute('aria-labelledby', lid); return h('div.form-field.wk-field', h('span.lbl', { id: lid }, label), control); };

// Radio-style segmented picker (role=radiogroup; arrow keys move the selection).
export function choice(options, value, { label, onChange } = {}) {
  const el = h('div.tabs.wk-choice', { role: 'radiogroup', 'aria-label': label || null });
  let cur = value;
  const btns = options.map(([v, text, tone]) => h(`button${tone ? `.wk-tone-${tone}` : ''}`, { type: 'button', role: 'radio', 'data-v': v, onclick: () => set(v, true) }, tone ? h('span.wk-choice-dot', { 'aria-hidden': 'true' }) : null, text));
  const paint = (focus) => { for (const b of btns) { const on = b.dataset.v === cur; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); } };
  function set(v, focus) {
    if (v === cur) { paint(focus); return; }
    cur = v; paint(focus);
    onChange?.(v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  el.addEventListener('keydown', (e) => {
    const rtl = document.documentElement.dir === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = Math.max(0, options.findIndex(([v]) => v === cur));
    set(options[(i + step + options.length) % options.length][0], true);
  });
  el.append(...btns);
  paint(false);
  Object.defineProperty(el, 'value', { get: () => cur, set: (v) => set(v, false) });
  return el;
}

// Date control: shows dates the way the rest of the app does ("الأحد، 5 أكتوبر"),
// opens the native picker, and offers quick chips. .value is YYYY-MM-DD or ''.
export function dateControl({ value = '', label, allowPast = true } = {}) {
  const native = h('input.wk-date-native', { type: 'date', tabindex: -1, 'aria-hidden': 'true', value: value || '' });
  if (!allowPast) native.min = isoDate(new Date());
  const text = h('span.wk-date-text');
  const btn = h('button.field.wk-date-btn', { type: 'button' }, icon('calendar'), text);
  const clear = h('button.icon-btn.wk-date-clear', { type: 'button', 'aria-label': L('إزالة التاريخ', 'Clear date'), onclick: () => { set(''); btn.focus(); } }, icon('x'));
  const add = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
  const eom = () => { const d = new Date(); return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  const QUICK = [[L('اليوم', 'Today'), () => add(0)], [L('غداً', 'Tomorrow'), () => add(1)], [L('بعد أسبوع', 'In a week'), () => add(7)], [L('نهاية الشهر', 'End of month'), eom]];
  const chips = QUICK.map(([l, fn]) => h('button.chip.wk-qchip', { type: 'button', 'aria-pressed': 'false', onclick: () => set(fn()) }, l));
  const wrap = h('div.wk-date', h('div.wk-date-box', btn, native, clear), h('div.wk-qchips', { role: 'group', 'aria-label': L('تواريخ سريعة', 'Quick dates') }, chips));
  function paint() {
    const v = native.value;
    text.textContent = v ? longDate(v) : L('بلا تاريخ', 'No date');
    wrap.classList.toggle('is-empty', !v);
    btn.setAttribute('aria-label', `${label || L('التاريخ', 'Date')}: ${v ? longDate(v) : L('بلا تاريخ', 'No date')}`);
    clear.hidden = !v;
    QUICK.forEach(([, fn], i) => chips[i].setAttribute('aria-pressed', String(!!v && v === fn())));
  }
  function set(v) { native.value = v || ''; paint(); native.dispatchEvent(new Event('change', { bubbles: true })); }
  btn.addEventListener('click', () => {
    try { native.showPicker(); } catch { wrap.classList.add('is-native'); native.classList.add('field'); native.tabIndex = 0; native.removeAttribute('aria-hidden'); native.setAttribute('aria-label', label || L('التاريخ', 'Date')); native.focus(); }
  });
  native.addEventListener('input', paint);
  native.addEventListener('change', paint);
  paint();
  Object.defineProperty(wrap, 'value', { get: () => native.value, set });
  return wrap;
}

// Short-lived caches for pickers (people and projects rarely change mid-task)
const cache = new Map();
function cached(key, url, ttl) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttl) return c.p;
  const p = api(url).catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), p });
  return p;
}
export const assignableUsers = () => cached('users', '/api/users/assignable', 60e3);
export const projectOptions = () => cached('projects', '/api/projects', 15e3);

// Assignee <select> that opens instantly and fills in place. Never silently
// reassigns: an assignee outside the assignable list is kept as an option.
export function assigneeSelect(current, currentName) {
  const me = state.me?.user;
  const cur = current || me?.id || '';
  const fallbackName = cur === me?.id ? L(me?.name_ar, me?.name_en) : currentName || L('المسؤول الحالي', 'Current assignee');
  const sel = h('select.field', { disabled: true, 'aria-busy': 'true' }, h('option', { value: cur }, fallbackName || L('جارٍ التحميل…', 'Loading…')));
  sel.loaded = false;
  assignableUsers().then((users) => {
    const opts = users.map((u) => h('option', { value: u.id }, L(u.name_ar, u.name_en) + (u.id === me?.id ? L(' (أنا)', ' (me)') : '')));
    if (cur && !users.some((u) => u.id === cur)) opts.unshift(h('option', { value: cur }, fallbackName));
    sel.replaceChildren(...opts);
    sel.value = cur;
    sel.loaded = true;
  }).catch(() => { /* keep the current assignee only */ }).finally(() => { sel.disabled = false; sel.removeAttribute('aria-busy'); });
  return sel;
}

// Auto-growing textarea (no resize grip)
export function textArea(value = '', attrs = {}) {
  const ta = h('textarea.field.wk-textarea', { rows: 2, ...attrs });
  ta.value = value;
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 240)}px`; };
  ta.addEventListener('input', fit); requestAnimationFrame(fit);
  return ta;
}

// ---------------------------------------------------------------- page helpers
// Arabic-insensitive search key (alef forms, taa marbuta, alef maqsura, diacritics)
export const normalize = (s) => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

// Live refreshes rebuild the view; keep the caret where the user was typing.
export function captureFocus() {
  const a = document.activeElement;
  const key = a?.dataset?.refocus;
  return key ? { key, value: a.value, start: a.selectionStart, end: a.selectionEnd } : null;
}
export function restoreFocus(page, f) {
  if (!f) return;
  setTimeout(() => {
    const el = page.querySelector(`[data-refocus="${f.key}"]`);
    if (!el?.isConnected || el.disabled) return;
    if (el.dataset.keepValue != null && f.value != null) el.value = f.value;
    el.focus({ preventScroll: true });
    try { el.setSelectionRange(f.start, f.end); } catch { /* number inputs have no selection */ }
  }, 0);
}

// Search field for list pages. .clear() empties it and notifies.
export function searchBox({ value = '', placeholder, label, onInput, key }) {
  const input = h('input.field', { type: 'search', value, placeholder, 'aria-label': label || placeholder, autocomplete: 'off', enterkeyhint: 'search', 'data-refocus': key || null });
  const clearBtn = h('button.icon-btn.wk-search-clear', { type: 'button', 'aria-label': L('مسح البحث', 'Clear search'), hidden: !value, onclick: () => { el.clear(); input.focus(); } }, icon('x'));
  const el = h('div.search-field.wk-search', { role: 'search' }, icon('search'), input, clearBtn);
  input.addEventListener('input', () => { clearBtn.hidden = !input.value; onInput(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.stopPropagation(); el.clear(); } });
  el.clear = () => { input.value = ''; clearBtn.hidden = true; onInput(''); };
  return el;
}

// Inline quick add: type a title, press Enter. input: extra create_task fields.
export function quickAdd({ key, placeholder, label, input = {} }) {
  const field = h('input.field.wk-quick-input', { type: 'text', placeholder, 'aria-label': label || placeholder, autocomplete: 'off', enterkeyhint: 'done', maxlength: 200, 'data-refocus': key, 'data-keep-value': '' });
  const hint = h('span.wk-quick-hint', { 'aria-hidden': 'true' }, h('kbd', '↵'));
  const form = h('form.wk-quick', { novalidate: true }, h('span.wk-quick-icon', { 'aria-hidden': 'true' }, icon('plus')), field, hint);
  const sync = () => form.classList.toggle('has-text', field.value.trim().length > 0);
  field.addEventListener('input', () => { field.removeAttribute('aria-invalid'); sync(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = field.value.trim();
    if (form.classList.contains('is-busy')) return;
    if (title.length < 2) { field.setAttribute('aria-invalid', 'true'); toast(L('اكتب عنواناً من حرفين على الأقل', 'Type a title of at least two characters'), { kind: 'info', timeout: 2500 }); return; }
    form.classList.add('is-busy'); field.readOnly = true;
    const r = await runTool('create_task', { title, ...input }, { quiet: true });
    form.classList.remove('is-busy'); field.readOnly = false;
    if (!r) { field.focus(); return; }
    field.value = ''; sync(); field.focus();
    undoToast(r.result?.project_name ? L(`أُضيفت ${quote(title)} إلى ${quote(r.result.project_name)}`, `Added ${quote(title)} to ${quote(r.result.project_name)}`) : L(`أُضيفت المهمة ${quote(title)}`, `Added ${quote(title)}`), r);
    emit('data-changed', { entity: 'task', id: r.result?.id });
  });
  sync();
  return form;
}

export const loadError = (err, retry) => h('section.card.wk-error-card', errorState(err, retry));

// ---------------------------------------------------------------- task sheet
// Open / edit a task (title, status, priority, due date, assignee, description),
// with a link to its project and a confirmed delete. Uses the same tools as the
// assistant (update_task / delete_task); the server enforces permissions.
export function openTask(tk) {
  let ctlRef = null;
  const title = h('input.field', { value: tk.title, maxlength: 200, autocomplete: 'off' });
  const status = choice(Object.keys(STATUS).map((k) => [k, statusLabel(k)]), tk.status, { label: L('الحالة', 'Status') });
  const prio = choice(PRIORITY_ORDER.map((k) => [k, L(PRIORITY[k][0], PRIORITY[k][1]), PRIORITY[k][2]]), tk.priority || 'medium', { label: L('الأولوية', 'Priority') });
  const due = dateControl({ value: tk.due_date || '', label: L('الاستحقاق', 'Due') });
  const who = assigneeSelect(tk.assignee_id, L(tk.assignee_ar, tk.assignee_en));
  const desc = textArea(tk.description || '', { placeholder: L('تفاصيل أو ملاحظات (اختياري)', 'Details or notes (optional)') });
  const onProject = tk.project_id && location.hash === `#/projects/${tk.project_id}`;
  const stamps = [tk.created_at ? `${L('أُنشئت', 'Created')} ${fmtDate(tk.created_at)}` : null, tk.status === 'done' && tk.completed_at ? `${L('أُنجزت', 'Completed')} ${fmtDate(tk.completed_at)}` : null].filter(Boolean);
  const body = h('div.wk-form',
    formField(L('العنوان', 'Title'), title, { required: true }),
    h('div.wk-form-grid', formGroup(L('الحالة', 'Status'), status), formGroup(L('الأولوية', 'Priority'), prio)),
    h('div.wk-form-grid', formGroup(L('الاستحقاق', 'Due'), due), formField(L('المسؤول', 'Assignee'), who)),
    formField(L('الوصف', 'Description'), desc),
    tk.project_id && !onProject ? h('a.wk-sheet-link', { href: `#/projects/${tk.project_id}`, onclick: () => ctlRef?.close(null) }, icon('folderOpen'), h('span.grow', L(`فتح المشروع ${quote(tk.project_name || '')}`, `Open project ${quote(tk.project_name || '')}`)), icon('chevron', 'sm flip-rtl')) : null,
    h('div.wk-sheet-foot',
      stamps.length ? h('p.wk-sheet-meta', stamps.join(' · ')) : h('span'),
      h('button.btn.sm.destructive-soft.wk-del', { type: 'button', onclick: () => delTask(tk, ctlRef) }, icon('trash'), L('حذف المهمة', 'Delete task'))));
  return formSheet({
    title: L('تفاصيل المهمة', 'Task details'), body, wide: true, submitLabel: t('save'), autofocus: false,
    onReady: (ctl) => { ctlRef = ctl; },
    isValid: () => title.value.trim().length >= 2,
    onSubmit: async (ctl) => {
      const input = { id: tk.id };
      const tt = title.value.trim();
      if (tt !== tk.title) input.title = tt;
      if (status.value !== tk.status) input.status = status.value;
      if (prio.value !== (tk.priority || 'medium')) input.priority = prio.value;
      if ((due.value || null) !== (tk.due_date || null)) input.due_date = due.value || null;
      if (who.loaded && who.value && who.value !== tk.assignee_id) input.assignee_id = who.value;
      if (desc.value !== (tk.description || '')) input.description = desc.value;
      if (Object.keys(input).length === 1) return true; // nothing changed
      const r = await runTool('update_task', input, { quiet: true, raw: true });
      if (!r || r.status === 'error') { ctl.setError(r?.error || L('تعذّر الحفظ', 'Could not save')); return undefined; }
      undoToast(L(`حُفظت تعديلات ${quote(tt)}`, `Saved changes to ${quote(tt)}`), r);
      emit('data-changed', { entity: 'task', id: tk.id });
      return r;
    },
  });
}
async function delTask(tk, ctl) {
  const r = await runTool('delete_task', { id: tk.id }, { quiet: true });
  if (r?.status !== 'needs_confirmation') return;
  const ok = await confirmDialog(L('حذف المهمة نهائياً؟', 'Delete this task permanently?'), `${r.confirmation.summary}. ${L('لا يمكن التراجع عن ذلك.', 'This can’t be undone.')}`, { danger: true, confirmLabel: L('حذف المهمة', 'Delete task') });
  const res = await api(`/api/confirmations/${r.confirmation.id}`, { method: 'POST', body: { accept: !!ok } }).catch((e) => e.body || { status: 'error', error: e.message });
  if (!ok) return;
  if (res?.status === 'ok') {
    ctl?.close(null);
    toast(L(`حُذفت المهمة ${quote(tk.title)}`, `Deleted ${quote(tk.title)}`));
    emit('data-changed', { entity: 'task', id: tk.id });
  } else toast(res?.error || L('تعذّر الحذف', 'Could not delete'), { kind: 'error' });
}

// ---------------------------------------------------------------- strategic portfolio helpers
// Presentation for strategic projects, allocations and capacity (server decides
// who may see or change what; these helpers never infer permissions).
export const isSpmoUser = () => !!state.me?.user?.caps?.includes('strategy.admin');
export const canSeePortfolio = () => isSpmoUser() || (!!state.me?.user && state.me.user.role !== 'employee');
export const canSeeCapacity = () => isSpmoUser() || ['manager', 'president'].includes(state.me?.user?.role);
export const strategicChip = (tiny = true) => h(`span.chip.purple.wk-strategic${tiny ? '.tiny' : ''}`, icon('compass'), L('استراتيجي', 'Strategic'));

// AED amounts: full ("2,400,000 درهم") or compact ("2.4 مليون درهم" / "AED 2.4M")
export function fmtAED(n, { compact = false } = {}) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (!compact || Math.abs(v) < 1e5) return L(`${fmtNum(Math.round(v))} درهم`, `AED ${fmtNum(Math.round(v))}`);
  const loc = getLang() === 'ar' ? 'ar-AE' : 'en-US';
  const m = v / 1e6;
  const num = m.toLocaleString(loc, { maximumFractionDigits: m >= 10 ? 0 : 1 });
  return L(`${num} مليون درهم`, `AED ${num}M`);
}
export const fteText = (v) => `${(Number(v) || 0).toLocaleString(getLang() === 'ar' ? 'ar-AE' : 'en-US', { maximumFractionDigits: 2 })} FTE`;

export const ALLOC_STATUS = {
  pending_manager: { label: ['بانتظار اعتماد المدير', 'Awaiting manager'], tone: 'warn', icon: 'hourglass' },
  active: { label: ['معتمد', 'Confirmed'], tone: 'good', icon: 'circleCheck' },
  declined: { label: ['لم يُعتمد', 'Declined'], tone: 'crit', icon: 'circleX' },
  ended: { label: ['منتهٍ', 'Ended'], tone: '', icon: 'circleDashed' },
};
export function allocChip(a, { tiny = true } = {}) {
  const s = ALLOC_STATUS[a.status] || ALLOC_STATUS.ended;
  return h(`span.chip${tiny ? '.tiny' : ''}${s.tone ? '.' + s.tone : ''}`, icon(s.icon), L(...s.label));
}
export const periodText = (from, to) => (from && to ? L(`${fmtDate(from)} – ${fmtDate(to)}`, `${fmtDate(from)} – ${fmtDate(to)}`) : to ? L(`حتى ${fmtDate(to)}`, `Until ${fmtDate(to)}`) : '—');

// Load meter: active load (solid) + pending (hatched), with a 100% capacity mark.
// Over 100% turns critical; the scale stretches so the overflow stays visible.
export function loadMeter(active, { pending = 0, label, lg = false } = {}) {
  const a = Math.max(0, Number(active) || 0); const pd = Math.max(0, Number(pending) || 0);
  const total = a + pd;
  const scale = Math.max(100, total) * (total > 100 ? 1.04 : 1);
  const tone = a > 100 ? 'crit' : total > 100 ? 'warn' : a >= 90 ? 'full' : '';
  const pct = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  const text = `${label || L('الحمل', 'Load')}: ${a}%${pd ? L(` + ${pd}% بانتظار الاعتماد`, ` + ${pd}% pending`) : ''}${total > 100 ? L(' — يتجاوز السعة', ' — over capacity') : ''}`;
  return h(`div.wk-load${lg ? '.lg' : ''}${tone ? '.' + tone : ''}`, { role: 'img', 'aria-label': text, title: text },
    h('i.wk-load-fill', { style: { width: pct(a) } }),
    pd ? h('i.wk-load-pend', { style: { insetInlineStart: pct(a), width: pct(pd) } }) : null,
    total > 100 ? h('i.wk-load-cap', { style: { insetInlineStart: pct(100) } }) : null);
}

// People pickers: everyone internal grouped by department (optgroups), or a subset.
export const staffDirectory = () => cached('directory', '/api/users/directory', 5 * 60e3);
export const portfolioMeta = () => cached('portfolio-meta', '/api/portfolio/meta', 60e3);
export function personSelect(people, { value = '', placeholder, first = [], firstLabel } = {}) {
  const sel = h('select.field');
  const opt = (u) => h('option', { value: u.id }, L(u.name_ar, u.name_en) + (u.title_ar ? ` — ${L(u.title_ar, u.title_en)}` : ''));
  if (placeholder) sel.append(h('option', { value: '' }, placeholder));
  if (first.length) sel.append(h('optgroup', { label: firstLabel || L('مقترحون', 'Suggested') }, first.map(opt)));
  const groups = new Map();
  for (const u of people) { if (first.some((f) => f.id === u.id)) continue; const k = L(u.dept_ar, u.dept_en) || '—'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); }
  for (const [k, list] of groups) sel.append(h('optgroup', { label: k }, list.map(opt)));
  sel.value = value;
  return sel;
}

// Percent control: slider + number (5–100, step 5 on the slider). .value is a number.
export function percentControl(value = 50, { min = 5, max = 100, label } = {}) {
  const num = h('input.field.wk-pc-num', { type: 'number', min, max, step: 1, inputmode: 'numeric', value, 'aria-label': label || L('النسبة المئوية', 'Percentage') });
  const range = h('input.wk-range', { type: 'range', min, max, step: 5, value, 'aria-label': `${label || L('النسبة', 'Percentage')} — ${L('منزلق', 'slider')}` });
  const wrap = h('div.wk-pc', range, h('div.wk-prog-num', num, h('span.wk-prog-pct', { 'aria-hidden': 'true' }, '%')));
  const fill = () => range.style.setProperty('--wk-fill', `${((Math.max(min, Math.min(max, Number(num.value) || 0)) - min) / (max - min)) * 100}%`);
  range.addEventListener('input', () => { num.value = range.value; fill(); wrap.dispatchEvent(new Event('change', { bubbles: true })); });
  num.addEventListener('input', () => { if (num.value !== '') range.value = num.value; fill(); });
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  fill();
  Object.defineProperty(wrap, 'value', { get: () => Number(num.value), set: (v) => { num.value = v; range.value = v; fill(); } });
  wrap.valid = () => Number.isInteger(Number(num.value)) && Number(num.value) >= min && Number(num.value) <= max;
  return wrap;
}
