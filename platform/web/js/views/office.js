// Agents Office (#/office) — agents PREPARE recurring work; every run produces a
// proposal and nothing executes until its owner reviews and approves it.
// Layout (desktop-first; container queries live in css/pages/office.css):
//   page head → pulse strip ("what's next" + excellence points) →
//   [review inbox · run history] + [my agents] side column.
// Excellence points shown here are read from GET /api/game/me (rules, quests,
// badges) — the client never computes or posts points.
import { api, rid } from '../api.js';
import { h, icon, toast, confirmDialog, skeleton, emptyState, errorState, isMac } from '../ui.js';
import { L, t, getLang, fmtNum } from '../i18n.js';
import { state, emit } from '../state.js';
import { celebrate, current as gameNow } from '../game.js';
import * as Editor from '../editor.js';
import * as Chat from '../chat.js';

// ---------------------------------------------------------------- vocabulary
const DAYS = [['الأحد', 'Sunday'], ['الإثنين', 'Monday'], ['الثلاثاء', 'Tuesday'], ['الأربعاء', 'Wednesday'], ['الخميس', 'Thursday'], ['الجمعة', 'Friday'], ['السبت', 'Saturday']];
export const schedText = (s) => (!s || s.type === 'manual' ? L('تشغيل يدوي', 'Manual') : s.type === 'daily' ? L(`يومياً ${s.time}`, `Daily ${s.time}`) : s.type === 'weekdays' ? L(`أيام العمل ${s.time}`, `Weekdays ${s.time}`) : L(`كل ${DAYS[s.day][0]} ${s.time}`, `Every ${DAYS[s.day][1]} ${s.time}`));

// Template look & English copy (the server only ships Arabic descriptions/labels).
const TPL = {
  daily_briefing: { icon: 'spark', tone: 'accent', en: 'Prepares your day — tasks, meetings, priorities and overdue items — as a document for you to review.' },
  delayed_report: { icon: 'fileText', tone: 'orange', en: 'Finds the delayed projects in your scope and prepares a report on them.' },
  overdue_escalation: { icon: 'alert', tone: 'red', en: 'Proposes raising overdue tasks to “Urgent”.' },
  progress_followup: { icon: 'gauge', tone: 'green', en: 'For projects whose progress has not been updated for a while, proposes a task for the owner to update it (never assumes a value).' },
  recurring_task: { icon: 'listChecks', tone: 'sand', en: 'Creates a task on a schedule (for example, submitting a weekly report).' },
  weekly_plan: { icon: 'calendarDays', tone: 'emph', en: 'Prepares a plan with your tasks and meetings for the next seven days.' },
  custom: { icon: 'wand', tone: 'neutral', en: 'You write the instructions and the agent plans the actions with the language model; needs a connected model service.' },
};
const tplMeta = (k) => TPL[k] || TPL.custom;
const tplName = (templates, k) => { const v = templates?.[k]; return v ? L(v.name_ar, v.name_en) : k; };
const tplDesc = (templates, k) => { const v = templates?.[k]; return L(v?.description_ar || '', tplMeta(k).en); };
const CFG = {
  scope: ['النطاق', 'Scope'], stale_days: ['أيام دون تحديث', 'Days without an update'], title: ['عنوان المهمة', 'Task title'], priority: ['الأولوية', 'Priority'],
  due_in_days: ['الاستحقاق بعد (أيام)', 'Due after (days)'], project_id: ['المشروع (اختياري)', 'Project (optional)'], assignee_id: ['المسؤول (اختياري)', 'Owner (optional)'], instructions: ['التعليمات', 'Instructions'],
};
const CFG_HELP = {
  stale_days: ['يتابع المشاريع التي لم تُحدَّث نسبة إنجازها خلال هذه المدة.', 'Follows up on projects whose progress was not updated within this period.'],
  due_in_days: ['يُحسب تاريخ الاستحقاق من يوم التشغيل.', 'The due date is counted from the day the agent runs.'],
  instructions: ['صف ما يجهّزه الوكيل بلغة واضحة — لن يُنفَّذ شيء قبل موافقتك.', 'Describe what the agent should prepare — nothing runs before you approve it.'],
  scope: ['نطاق الفريق متاح للمديرين فقط.', 'The team scope is available to managers only.'],
};
const ENUM = { mine: ['مهامي', 'Mine'], team: ['مهام الفريق', 'Team'], low: ['منخفضة', 'Low'], medium: ['متوسطة', 'Medium'], high: ['عالية', 'High'], urgent: ['عاجلة', 'Urgent'] };
const enumLabel = (v) => (ENUM[v] ? L(...ENUM[v]) : v);

// Proposal item tools → glyph + label
const TOOL = {
  create_document: ['filePlus', 'مستند جديد', 'New document'], edit_document: ['pencil', 'تعديل مستند', 'Edit document'],
  create_task: ['taskPlus', 'مهمة جديدة', 'New task'], update_task: ['pencil', 'تحديث مهمة', 'Update task'],
  create_project: ['folderPlus', 'مشروع جديد', 'New project'], update_project: ['folder', 'تحديث مشروع', 'Update project'],
  create_event: ['calendar', 'موعد جديد', 'New meeting'], run_skill: ['fileText', 'تقرير', 'Report'],
  add_widget: ['grid', 'بطاقة في اللوحة', 'Dashboard card'], update_widget: ['grid', 'تحديث بطاقة', 'Update card'],
};
const EDITABLE = { create_task: ['title', 'priority', 'due_date'], update_task: ['priority'], create_document: ['title'] };
const EDIT_LBL = { title: ['العنوان', 'Title'], priority: ['الأولوية', 'Priority'], due_date: ['الاستحقاق', 'Due date'] };

// Run status → [ar, en, chip tone, icon, history group]
const RUN = {
  awaiting_review: ['بانتظار مراجعتك', 'Awaiting review', 'warn', 'inbox', 'none'],
  completed: ['نُفّذ', 'Completed', 'good', 'circleCheck', 'done'],
  partially_completed: ['نُفّذ جزئياً', 'Partially done', 'warn', 'circleDot', 'done'],
  failed: ['تعذّر', 'Failed', 'crit', 'circleX', 'failed'],
  rejected: ['مرفوض', 'Rejected', '', 'x', 'none'],
  nothing_to_do: ['لا شيء للتنفيذ', 'Nothing to do', '', 'circleDashed', 'none'],
  skipped: ['لم يُحدَّد شيء', 'Nothing selected', '', 'minus', 'none'],
  cancelled: ['أُلغي', 'Cancelled', '', 'circleX', 'none'],
  preparing: ['قيد التحضير', 'Preparing', 'info', 'loader', 'none'],
  executing: ['قيد التنفيذ', 'Executing', 'info', 'loader', 'none'],
};
const runMeta = (s) => RUN[s] || [s, s, '', 'circle', 'none'];
// Proposal item status (after review) → [icon, ar, en, tone]
const STEP = { done: ['circleCheck', 'نُفّذ', 'Done', 'good'], failed: ['circleX', 'تعذّر', 'Failed', 'crit'], skipped: ['minus', 'لم يُحدَّد', 'Not selected', 'none'], proposed: ['circleDashed', 'لم يُنفَّذ', 'Not run', 'none'] };

// Arabic counted phrases (1 → singular, 2 → dual, 3–10 → plural, 11+ → singular accusative)
const PLURAL = new Intl.PluralRules('ar');
const NOUN = {
  action: ['إجراء واحد', 'إجراءان', 'إجراءات', 'إجراءً', 'إجراء', 'action', 'actions'],
  proposal: ['مقترح واحد', 'مقترحان', 'مقترحات', 'مقترحاً', 'مقترح', 'proposal', 'proposals'],
  point: ['نقطة واحدة', 'نقطتان', 'نقاط', 'نقطة', 'نقطة', 'point', 'points'],
};
function count(n, noun) {
  const f = NOUN[noun];
  if (getLang() === 'en') return `${fmtNum(n)} ${n === 1 ? f[5] : f[6]}`;
  const c = PLURAL.select(n);
  if (c === 'one') return f[0];
  if (c === 'two') return f[1];
  return `${fmtNum(n)} ${c === 'few' ? f[2] : c === 'many' ? f[3] : f[4]}`;
}
const ptsWord = (n) => { if (getLang() === 'en') return n === 1 ? 'point' : 'points'; const c = PLURAL.select(n); return c === 'two' ? 'نقطتان' : c === 'few' ? 'نقاط' : 'نقطة'; };
// "+6 نقاط …" with the signed number kept LTR (reads "+6" in both directions)
const ptsNode = (n, ar = '', en = '') => [h('span.num', `+${fmtNum(n)}`), ' ', L(ar ? `${ptsWord(n)} ${ar}` : ptsWord(n), en ? `${ptsWord(n)} ${en}` : ptsWord(n))];

// Dates: server stamps are ISO (UTC) or SQLite "YYYY-MM-DD HH:MM:SS" (UTC)
const locale = () => (getLang() === 'ar' ? 'ar-AE' : 'en-GB');
const toDate = (s) => new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${String(s).replace(' ', 'T')}Z`);
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const clock = (d) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
function when(iso) {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : toDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Math.round((dayStart(d) - dayStart(new Date())) / 864e5);
  const day = diff === 0 ? L('اليوم', 'Today') : diff === 1 ? L('غداً', 'Tomorrow') : diff === -1 ? L('أمس', 'Yesterday')
    : Math.abs(diff) < 7 ? d.toLocaleDateString(locale(), { weekday: 'long' }) : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  return `${day} · ${clock(d)}`;
}
const longWhen = (d) => `${d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })} · ${clock(d)}`;
const stampOf = (iso) => { try { return toDate(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };
// Keep ISO dates inside server-written summaries on one line
const nb = (s) => String(s ?? '').split(/(\d{4}-\d{2}-\d{2})/).map((p, i) => (i % 2 ? h('span.office-nb', p) : p));
const quote = (s) => L(`«${s}»`, `“${s}”`);
// Names/summaries are user or server text: isolate their direction (Arabic inside the English UI and vice versa)
const bd = (s) => h('bdi', nb(s));
const quoteNode = (s) => [L('«', '“'), h('bdi', s), L('»', '”')];

// Points for a rule, only while today's cap still leaves room (server rules).
const rulePts = (g, key) => { const r = g?.rules?.find((x) => x.key === key); return r && g.today_xp < g.daily_cap ? r.points : null; };
const ptsChip = (n, label, title) => h('span.chip.tiny.purple.office-pts', { title: title || null }, icon('zap'), label || h('span.num', `+${fmtNum(n)}`));

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function reveal(el, { focus = false, block = 'center' } = {}) {
  if (!el) return;
  el.scrollIntoView({ block, behavior: reduceMotion() ? 'auto' : 'smooth' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  if (focus) el.focus({ preventScroll: true });
}
const busy = (btn, on) => { if (!btn) return; btn.classList.toggle('is-loading', on); btn.disabled = on; on ? btn.setAttribute('aria-busy', 'true') : btn.removeAttribute('aria-busy'); };

// View state that survives the soft re-renders triggered by realtime updates.
const PAGE_SIZE = 8;
const ui = {
  filter: 'all', agent: '', more: false,
  open: new Set(), closed: new Set(), // run-history rows the user expanded / collapsed
  undone: new Set(), // action ids undone in this session
  decisions: new Map(), // runId → Map(itemId → { id, selected, edits })
  previews: new Set(), // proposal items with the preview open
  focusRun: null, revealRun: null, flashAgent: null,
};

// ---------------------------------------------------------------- page
const load = () => Promise.all([
  api('/api/office/agents'), api('/api/office/runs?status=awaiting_review'), api('/api/office/runs'), api('/api/office/templates'),
  api('/api/game/me').catch(() => null),
]).then(([agents, pending, history, templates, game]) => ({ agents, pending, history, templates, game }));

export async function renderOffice(root, _params, { soft = false } = {}) {
  const page = h('div.office');
  root.append(page);
  if (soft) {
    const focus = captureFocus();
    let data;
    try { data = await load(); } catch (e) {
      // a background refresh failed: keep what is on screen rather than an error page
      const old = document.querySelector('#view .office');
      if (old) { page.replaceWith(old); return; }
      throw e;
    }
    draw(page, data);
    requestAnimationFrame(() => { restoreFocus(page, focus); afterDraw(page); });
    return;
  }
  // A normal visit shows the page skeleton straight away, then fills it in.
  paintSkeleton(page);
  const go = () => load().then((d) => { draw(page, d); requestAnimationFrame(() => afterDraw(page)); })
    .catch((e) => paintError(page, e, () => { paintSkeleton(page); go(); }));
  go();
}

function draw(page, d) {
  for (const id of ui.decisions.keys()) if (!d.pending.some((r) => r.id === id)) ui.decisions.delete(id);
  const ctx = { ...d, reviewPts: rulePts(d.game, 'review'), agentPts: rulePts(d.game, 'agent'), used: new Set(d.agents.map((a) => a.template)), cards: [] };
  const fresh = !d.agents.length && !d.pending.length && !d.history.length;
  page.replaceChildren(...[
    head(d.templates),
    fresh ? onboarding(ctx) : pulse(ctx),
    fresh ? null : h('div.office-grid', reviewsSection(ctx), agentsSection(ctx), historySection(ctx)),
  ].filter(Boolean));
}

function afterDraw(page) {
  if (ui.focusRun) { const el = page.querySelector(`#run-${CSS.escape(ui.focusRun)}`); ui.focusRun = null; if (el) reveal(el, { focus: true }); }
  if (ui.revealRun) { const el = page.querySelector(`[data-run="${CSS.escape(ui.revealRun)}"]`); ui.revealRun = null; if (el) { if (el.tagName === 'DETAILS') el.open = true; reveal(el, { block: 'nearest' }); } }
  if (ui.flashAgent) { const el = page.querySelector(`#agent-${CSS.escape(ui.flashAgent)}`); ui.flashAgent = null; if (el) reveal(el, { block: 'nearest' }); }
}

// Focus survives soft re-renders (e.g. typing in a proposal field while a realtime update lands).
function captureFocus() {
  const el = document.activeElement;
  if (!el?.closest?.('#view .office') || !el.dataset.fk) return null;
  let sel = null; try { sel = el.selectionStart != null ? [el.selectionStart, el.selectionEnd] : null; } catch {}
  return { key: el.dataset.fk, sel };
}
function restoreFocus(page, f) {
  if (!f) return;
  const el = page.querySelector(`[data-fk="${CSS.escape(f.key)}"]`);
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  if (f.sel) try { el.setSelectionRange(...f.sel); } catch {}
}

function paintSkeleton(page) {
  const cell = () => h('div.op-cell.is-sk', skeleton('stat'));
  page.replaceChildren(head(null),
    h('div.card.office-pulse', { 'aria-hidden': 'true' }, cell(), cell(), cell(), cell()),
    h('div.office-grid', { 'aria-busy': 'true', 'aria-label': L('جارٍ تحميل مكتب الوكلاء', 'Loading the Agents Office') },
      h('section.office-reviews', h('div.office-sec-head', h('div.sk.sk-title')), h('div.card', skeleton('card'), skeleton('list', 2))),
      h('section.office-agents', h('div.office-sec-head', h('div.sk.sk-title')), h('div.office-agent-list', h('div.card', skeleton('card')), h('div.card', skeleton('card')))),
      h('section.office-history', h('div.office-sec-head', h('div.sk.sk-title')), h('div.card', skeleton('list', 3)))));
}

function paintError(page, e, retry) {
  const box = errorState({ message: L('تعذّر تحميل مكتب الوكلاء. تحقّق من الاتصال ثم أعد المحاولة — لم يُنفَّذ أي إجراء.', 'The Agents Office could not be loaded. Check your connection and try again — nothing was run.') }, retry);
  if (e?.message) box.append(h('p.tiny.faint.office-tech', e.message));
  page.replaceChildren(head(null), h('section.card', box));
}

// ---------------------------------------------------------------- header
function head(templates) {
  const openBuilder = async () => builder(templates || await api('/api/office/templates'));
  return h('header.page-head.office-head',
    h('div.office-head-text',
      h('span.eyebrow', L('وكلاء يجهّزون عملك المتكرر', 'Agents that prepare your recurring work')),
      h('h1', L('مكتب الوكلاء', 'Agents Office')),
      h('p.sub', L('يعمل كل وكيل بصلاحياتك فقط ويعرض عليك ما جهّزه — لا يُنفَّذ أي إجراء قبل مراجعتك وموافقتك.', 'Each agent works within your permissions and shows you what it prepared — nothing runs until you review and approve it.'))),
    h('div.actions',
      h('button.btn.tertiary', { type: 'button', onclick: () => Chat.focus(L('ابنِ وكيلاً ', 'Build an agent that ')) }, icon('spark'), L('ابنِه بالمحادثة', 'Build by chat')),
      h('button.btn.primary', { type: 'button', onclick: openBuilder }, icon('plus'), L('وكيل جديد', 'New agent'))));
}

// ---------------------------------------------------------------- pulse ("what's next")
function pulse(ctx) {
  const { agents, pending, game } = ctx;
  const active = agents.filter((a) => a.enabled);
  const paused = agents.length - active.length;
  const next = active.filter((a) => a.next_run_at).sort((a, b) => String(a.next_run_at).localeCompare(String(b.next_run_at)))[0];
  const n = pending.length;
  const oldest = pending[pending.length - 1];
  const cells = [
    h(`div.op-cell.op-pending${n ? '.is-hot' : ''}`,
      h('span.op-label', n ? h('span.op-live', { 'aria-hidden': 'true' }) : icon('inbox'), L('بانتظار المراجعة', 'Awaiting review')),
      h('span.op-value.num', fmtNum(n)),
      h('span.op-meta', n ? L(`الأقدم: ${when(oldest.created_at)}`, `Oldest: ${when(oldest.created_at)}`) : L('لا شيء بانتظارك الآن', 'Nothing waiting for you')),
      n ? h('button.btn.sm.tertiary.op-cta', { type: 'button', onclick: () => reveal(document.getElementById(`run-${pending[0].id}`), { focus: true, block: 'start' }) }, L('ابدأ المراجعة', 'Start reviewing'), icon('arrowRight', 'flip-rtl')) : null),
    h('div.op-cell',
      h('span.op-label', icon('bot'), L('وكلاء مفعّلون', 'Active agents')),
      h('span.op-value.num', fmtNum(active.length), h('span.op-of', `/${fmtNum(agents.length)}`)),
      h('span.op-meta', paused ? L(`الموقوف مؤقتاً: ${fmtNum(paused)}`, `Paused: ${fmtNum(paused)}`) : agents.length ? L('كلها تعمل حسب جداولها', 'All running on schedule') : L('لم تبنِ وكيلاً بعد', 'No agents yet'))),
    h('div.op-cell',
      h('span.op-label', icon('calendarClock'), L('التشغيل القادم', 'Next run')),
      h('span.op-value.is-text', next ? when(next.next_run_at) : '—'),
      h('span.op-meta', next ? quoteNode(next.name) : L('لا تشغيل مجدول — شغّل وكلاءك يدوياً', 'Nothing scheduled — run agents manually'))),
    game ? excellenceCell(ctx) : null,
  ];
  return h('section.card.office-pulse', { 'aria-label': L('نظرة سريعة على المكتب', 'Office at a glance') }, cells);
}

function excellenceCell({ game, reviewPts }) {
  const quest = game.quests?.find((q) => q.key === 'review_agents');
  const questPts = rulePts(game, 'quest');
  const badge = game.badges?.find((b) => b.key === 'agent_lead');
  const capped = game.today_xp >= game.daily_cap;
  return h('div.op-cell.op-excel',
    h('a.op-label.op-link', { href: '#/achievements', 'aria-label': L('نقاط التميّز — عرض إنجازاتي', 'Excellence points — view my achievements') }, icon('zap'), L('نقاط التميّز اليوم', 'Excellence points today'), icon('chevron', 'sm flip-rtl')),
    h('span.op-value.op-glow.num', `+${fmtNum(game.today_xp)}`),
    h('span.op-meta', capped ? L(`بلغت الحد اليومي (${fmtNum(game.daily_cap)}) — تُحتسب النقاط مجدداً غداً`, `Daily cap (${fmtNum(game.daily_cap)}) reached — points resume tomorrow`)
      : reviewPts ? [L('كل مقترح تعتمده: ', 'Each proposal you approve: '), ...ptsNode(reviewPts)] : L('من عملك الفعلي فقط', 'Earned from real work only')),
    quest ? h(`div.op-quest${quest.done ? '.done' : ''}`, h('span.op-q-ic', { 'aria-hidden': 'true' }, icon(quest.done ? 'check' : 'target')),
      h('span.grow', quest.done ? L('أنجزت مهمة اليوم: مراجعة الوكلاء', 'Quest done: review your agents') : L('مهمة اليوم: راجع أعمال وكلائك', 'Quest: review your agents’ work')),
      !quest.done && questPts ? h('span.op-q-pts.num', `+${fmtNum(questPts)}`) : null) : null,
    badge && !badge.earned ? h('div.op-badge', { title: L(badge.desc_ar, badge.desc_en) },
      h('span.op-b-text', h('span', L(`شارة «${badge.ar}»`, `“${badge.en}” badge`)), h('span.num', `${fmtNum(Math.min(badge.have, badge.need))}/${fmtNum(badge.need)}`)),
      h('span.progress', { role: 'progressbar', 'aria-valuenow': badge.progress, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L(`التقدم نحو شارة «${badge.ar}»`, `Progress to the “${badge.en}” badge`) }, h('i', { style: { width: `${badge.progress}%` } })))
      : badge?.earned ? h('div.op-badge.earned', icon('badgeCheck', 'sm'), L(`حصلت على شارة «${badge.ar}»`, `“${badge.en}” badge earned`)) : null);
}

// ---------------------------------------------------------------- first run
function onboarding(ctx) {
  const steps = [
    ['bot', 'يجهّز الوكيل العمل في موعده', 'The agent prepares the work on schedule'],
    ['eye', 'تراجع المقترح وتعدّل ما تشاء', 'You review the proposal and edit anything'],
    ['check', 'تعتمده فيُنفَّذ بصلاحياتك — مع إمكانية التراجع', 'You approve it and it runs with your permissions — undo anytime'],
  ];
  return h('section.card.office-onboard', { 'aria-labelledby': 'office-ob-title' },
    h('div.ob-intro',
      h('span.ob-orb', { 'aria-hidden': 'true' }, icon('bot')),
      h('h2#office-ob-title', L('ابنِ أول وكيل لك', 'Build your first agent')),
      h('p', L('اختر قالباً جاهزاً لعمل تكرّره كل يوم أو كل أسبوع. لا يُنفَّذ شيء قبل موافقتك.', 'Pick a ready template for work you repeat every day or week. Nothing runs before you approve it.')),
      ctx.agentPts ? ptsChip(ctx.agentPts, ptsNode(ctx.agentPts, 'لأول وكيل من كل نوع', 'for your first agent of each type')) : null),
    h('ol.ob-flow', steps.map(([ic, ar, en], i) => h('li', h('span.ob-step-n.num', fmtNum(i + 1)), icon(ic), h('span', L(ar, en))))),
    h('div.office-tpls', Object.keys(ctx.templates).map((k) => tplCard(ctx, k, { onClick: () => builder(ctx.templates, { template: k }) }))));
}

function glyph(k, cls = '') { const m = tplMeta(k); return h(`span.office-glyph${cls ? '.' + cls : ''}`, { 'data-tone': m.tone, 'aria-hidden': 'true' }, icon(m.icon)); }

function tplCard(ctx, k, { onClick, radio = false, selected = false } = {}) {
  const eligible = ctx.agentPts && !ctx.used.has(k);
  return h(`button.card.interactive.office-tpl${selected ? '.selected' : ''}`, {
    type: 'button', 'data-v': k, onclick: onClick,
    role: radio ? 'radio' : null, 'aria-checked': radio ? String(selected) : null, tabindex: radio ? (selected ? 0 : -1) : null,
  },
  glyph(k),
  h('span.ot-text', h('span.ot-name', tplName(ctx.templates, k)), h('span.ot-desc', tplDesc(ctx.templates, k))),
  eligible ? ptsChip(ctx.agentPts, null, L(`+${ctx.agentPts} نقاط تميّز لأول وكيل من هذا النوع`, `+${ctx.agentPts} excellence points for your first agent of this type`)) : null);
}

// ---------------------------------------------------------------- review inbox
function reviewsSection(ctx) {
  const { pending, agents } = ctx;
  const cards = pending.map((r) => reviewCard(r, ctx));
  const selectedTotal = () => ctx.cards.reduce((a, c) => a + c.selected(), 0);
  const allBtn = pending.length > 1 ? h('button.btn.sm.tertiary', { type: 'button', onclick: (e) => approveAll(ctx, e.currentTarget, selectedTotal()) }, icon('checkCheck'), L(`اعتماد الكل (${fmtNum(pending.length)})`, `Approve all (${fmtNum(pending.length)})`)) : null;
  return h('section.office-reviews', { 'aria-labelledby': 'office-rev-title' },
    h('div.office-sec-head',
      h('h2#office-rev-title', `${L('بانتظار مراجعتك', 'Awaiting your review')} (${pending.length})`),
      allBtn),
    pending.length ? h('div.office-review-list', cards)
      : h('div.card.office-empty', emptyState({ compact: true, icon: 'checkCheck',
        title: L('لا شيء بانتظار مراجعتك', 'Nothing awaiting your review'),
        body: agents.length ? L('سيظهر هنا كل ما يجهّزه وكلاؤك لتراجعه وتعتمده. تريد نتيجة الآن؟ اضغط «حضّر الآن» على أي وكيل.', 'Whatever your agents prepare shows up here for you to review and approve. Want something now? Press “Prepare now” on any agent.')
          : L('ابنِ وكيلاً يجهّز عملك المتكرر، وستراجع ما يجهّزه هنا قبل أي تنفيذ.', 'Build an agent for your recurring work; you will review what it prepares here before anything runs.') })));
}

function decisionsFor(r) {
  let m = ui.decisions.get(r.id);
  if (!m) { m = new Map(r.proposal.map((i) => [i.id, { id: i.id, selected: true, edits: {} }])); ui.decisions.set(r.id, m); }
  for (const i of r.proposal) if (!m.has(i.id)) m.set(i.id, { id: i.id, selected: true, edits: {} });
  return m;
}

function reviewCard(r, ctx) {
  const st = decisionsFor(r);
  const total = r.proposal.length;
  const selected = () => [...st.values()].filter((d) => d.selected).length;
  const titleId = `run-${r.id}-title`;
  const scheduled = r.trigger === 'schedule';

  const approveN = h('span.num');
  const approveBtn = h('button.btn.primary.or-approve', { type: 'button', 'data-fk': `ap:${r.id}`, 'aria-keyshortcuts': 'Control+Enter Meta+Enter', onclick: () => approve() },
    icon('check'), h('span', L('موافقة وتنفيذ المحدد', 'Approve & run selected')), ' ', approveN);
  const rejectBtn = h('button.btn.ghost.or-reject', { type: 'button', 'data-fk': `rj:${r.id}`, onclick: () => reject() }, icon('x'), L('رفض', 'Reject'));
  const note = h('p.or-note', { 'aria-live': 'polite' });
  const countEl = h('span.or-count.num');
  const allCb = total > 1 ? h('input', { type: 'checkbox', id: `run-${r.id}-all`, 'data-fk': `all:${r.id}`, onchange: () => { for (const d of st.values()) d.selected = allCb.checked; rows.forEach((row) => row.sync()); sync(); } }) : null;

  const rows = r.proposal.map((it) => proposalItem(r, it, st.get(it.id), () => sync()));

  function sync() {
    const n = selected();
    approveN.textContent = `(${n})`;
    approveBtn.disabled = !n;
    countEl.textContent = L(`المحدد: ${fmtNum(n)} من ${fmtNum(total)}`, `Selected: ${fmtNum(n)} of ${fmtNum(total)}`);
    if (allCb) { allCb.checked = n === total; allCb.indeterminate = n > 0 && n < total; }
    note.classList.toggle('is-warn', !n);
    note.replaceChildren(icon(n ? 'shield' : 'info'), h('span', n
      ? L('لن يُنفَّذ إلا ما تحدده، ويمكنك تعديل الحقول قبل الموافقة والتراجع بعد التنفيذ من سجل التشغيل.', 'Only the selected items run. Edit fields before approving; undo afterwards from the run history.')
      : L('حدّد إجراءً واحداً على الأقل للموافقة، أو ارفض المقترح.', 'Select at least one item to approve, or reject the proposal.')),
    n ? h('span.or-kbd', { 'aria-hidden': 'true' }, h('kbd', isMac ? '⌘' : 'Ctrl'), h('kbd', '↵')) : null);
  }

  async function approve({ quiet = false } = {}) {
    if (!selected() || approveBtn.classList.contains('is-loading')) return null;
    busy(approveBtn, true); rejectBtn.disabled = true; card.setAttribute('aria-busy', 'true');
    try {
      const res = await api(`/api/office/runs/${r.id}/approve`, { method: 'POST', body: { decisions: [...st.values()] } });
      ui.decisions.delete(r.id);
      const done = res.proposal.filter((i) => i.status === 'done');
      const bad = res.proposal.filter((i) => i.status === 'failed').length;
      if (quiet) return res;
      if (ctx.pending.length === 1) ui.revealRun = r.id; // last one → show its result (and undo) in the history
      if (done.length) celebrate(approveBtn);
      const one = done.length === 1 && done[0].undoable && done[0].actionId ? done[0] : null;
      toast(!done.length ? L(`تعذّر تنفيذ عمل ${quote(r.agent_name)} — التفاصيل في سجل التشغيل`, `${quote(r.agent_name)} could not run — see the run history`)
        : bad ? L(`نُفّذ ${count(done.length, 'action')} وتعذّر ${count(bad, 'action')} — التفاصيل في سجل التشغيل`, `${count(done.length, 'action')} done, ${count(bad, 'action')} failed — see the run history`)
          : L(`اعتمدت عمل ${quote(r.agent_name)} — نُفّذ ${count(done.length, 'action')}`, `Approved ${quote(r.agent_name)} — ${count(done.length, 'action')} done`),
      { kind: bad || !done.length ? 'error' : null, ...(one && !bad ? { action: t('undo'), onAction: () => undoItem(one) } : {}) });
      const doc = done.find((i) => i.open_document);
      if (doc) Editor.open(doc.open_document);
      emit('data-changed', { entity: 'office' });
      return res;
    } catch (e) {
      toast(L(`تعذّر اعتماد ${quote(r.agent_name)}: ${e.message}`, `Could not approve ${quote(r.agent_name)}: ${e.message}`), { kind: 'error' });
      busy(approveBtn, false); approveBtn.disabled = !selected(); rejectBtn.disabled = false; card.removeAttribute('aria-busy');
      if (e.status === 409) emit('data-changed', { entity: 'office' });
      return null;
    }
  }

  async function reject() {
    const ok = await confirmDialog(L(`رفض مقترح ${quote(r.agent_name)}؟`, `Reject ${quote(r.agent_name)}?`),
      L(`لن يُنفَّذ أيٌّ من الإجراءات المقترحة (${fmtNum(total)}). يمكنك تحضير مقترح جديد متى شئت.`, `None of the ${fmtNum(total)} proposed actions will run. You can prepare a new proposal anytime.`),
      { confirmLabel: L('رفض المقترح', 'Reject proposal') });
    if (!ok) return;
    busy(rejectBtn, true); approveBtn.disabled = true;
    try {
      await api(`/api/office/runs/${r.id}/reject`, { method: 'POST' });
      ui.decisions.delete(r.id);
      toast(L(`رُفض مقترح ${quote(r.agent_name)} — لم يُنفَّذ شيء`, `Rejected ${quote(r.agent_name)} — nothing was run`));
      emit('data-changed', { entity: 'office' });
    } catch (e) {
      toast(L(`تعذّر رفض المقترح: ${e.message}`, `Could not reject the proposal: ${e.message}`), { kind: 'error' });
      busy(rejectBtn, false); approveBtn.disabled = !selected();
      if (e.status === 409) emit('data-changed', { entity: 'office' });
    }
  }

  const card = h('article.card.office-review', { id: `run-${r.id}`, tabindex: -1, 'aria-labelledby': titleId,
    onkeydown: (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); approve(); } } },
  h('header.or-head',
    glyph(r.template),
    h('div.or-titles',
      h('h3', { id: titleId }, h('bdi', r.agent_name)),
      h('div.or-meta',
        h('span.or-meta-item', icon('clock', 'sm'), h('time', { datetime: r.created_at, title: stampOf(r.created_at) }, when(r.created_at))),
        h('span.or-meta-item', icon(scheduled ? 'calendarClock' : 'play', 'sm'), scheduled ? L('تشغيل مجدول', 'Scheduled run') : L('تشغيل يدوي', 'Manual run')))),
    ctx.reviewPts ? ptsChip(ctx.reviewPts, ptsNode(ctx.reviewPts, 'عند الاعتماد', 'on approval'), L('تُحتسب نقاط التميّز عند تنفيذ إجراء واحد على الأقل', 'Excellence points count once at least one action runs')) : null),
  r.summary ? h('p.or-summary', bd(r.summary)) : null,
  h('div.or-items-head',
    allCb ? h('label.check-label.or-all', { for: allCb.id }, allCb, L('تحديد الكل', 'Select all')) : h('span.or-items-cap', L('الإجراء المقترح', 'Proposed action')),
    total > 1 ? countEl : null),
  h('ul.or-items', { 'aria-label': L('الإجراءات المقترحة', 'Proposed actions') }, rows),
  h('footer.or-foot', note, h('div.or-actions', rejectBtn, approveBtn)));

  ctx.cards.push({ approve, selected, card });
  sync();
  return card;
}

function proposalItem(r, it, d, onChange) {
  const [ic, ar, en] = TOOL[it.tool] || ['spark', 'إجراء', 'Action'];
  const cbId = `ri-${it.id}`;
  const edited = h('span.chip.tiny.info.or-edited', L('معدّل', 'Edited'));
  const cb = h('input', { type: 'checkbox', id: cbId, 'data-fk': `cb:${it.id}`, checked: d.selected || null, onchange: () => { d.selected = cb.checked; row.sync(); onChange(); } });
  const fields = (EDITABLE[it.tool] || []).filter((f) => it.input?.[f] !== undefined).map((f) => {
    const id = `re-${it.id}-${f}`;
    const cur = d.edits[f] ?? it.input[f];
    const el = f === 'priority'
      ? h('select.field', { id, 'data-fk': `ed:${it.id}:${f}` }, ['low', 'medium', 'high', 'urgent'].map((p) => h('option', { value: p, selected: cur === p || null }, enumLabel(p))))
      : h('input.field', { id, 'data-fk': `ed:${it.id}:${f}`, type: f === 'due_date' ? 'date' : 'text', value: cur ?? '', maxlength: f === 'title' ? 200 : null });
    const onEdit = () => { if (el.value === String(it.input[f] ?? '')) delete d.edits[f]; else d.edits[f] = el.value; paintEdited(); };
    el.addEventListener('input', onEdit); el.addEventListener('change', onEdit);
    return { el, wrap: h(`div.or-edit.or-edit-${f}`, h('label.lbl', { for: id }, L(...EDIT_LBL[f])), el) };
  });
  const paintEdited = () => { edited.classList.toggle('hidden', !Object.keys(d.edits).length); };
  const prevId = `rp-${it.id}`;
  const prev = it.preview ? h(`div.or-preview${ui.previews.has(it.id) ? '' : '.hidden'}`, { id: prevId, role: 'region', 'aria-label': L(`معاينة: ${it.summary}`, `Preview: ${it.summary}`) }, h('div.or-preview-body', { html: it.preview })) : null;
  const prevBtn = prev ? h('button.btn.sm.ghost.or-prev-btn', { type: 'button', 'aria-controls': prevId, 'data-fk': `pv:${it.id}`, onclick: () => { ui.previews.has(it.id) ? ui.previews.delete(it.id) : ui.previews.add(it.id); paintPrev(); } }) : null;
  const paintPrev = () => {
    if (!prev) return;
    const open = ui.previews.has(it.id);
    prev.classList.toggle('hidden', !open);
    prevBtn.setAttribute('aria-expanded', String(open));
    prevBtn.replaceChildren(icon(open ? 'eyeOff' : 'eye'), open ? L('إخفاء المعاينة', 'Hide preview') : L('معاينة', 'Preview'));
  };
  const row = h(`li.or-item${d.selected ? '' : '.is-off'}`,
    h('div.or-item-main',
      cb,
      h('span.or-glyph', { 'aria-hidden': 'true' }, icon(ic)),
      h('label.or-item-text', { for: cbId }, h('span.or-sum', bd(it.summary)), h('span.or-tool', L(ar, en), edited)),
      prevBtn),
    fields.length ? h('div.or-edits', fields.map((f) => f.wrap)) : null,
    prev);
  row.sync = () => { cb.checked = d.selected; row.classList.toggle('is-off', !d.selected); fields.forEach((f) => { f.el.disabled = !d.selected; }); };
  row.sync(); paintEdited(); paintPrev();
  return row;
}

async function approveAll(ctx, btn, selectedTotal) {
  const cards = ctx.cards.filter((c) => c.selected());
  if (!cards.length) { toast(L('لم تحدّد أي إجراء في المقترحات', 'No items are selected in any proposal'), { kind: 'info' }); return; }
  const ok = await confirmDialog(L(`اعتماد ${count(cards.length, 'proposal')}؟`, `Approve ${count(cards.length, 'proposal')}?`),
    L(`سيُنفَّذ ${count(selectedTotal, 'action')} محددة في كل المقترحات بصلاحياتك، ويمكنك التراجع عن كل إجراء من سجل التشغيل.`, `${count(selectedTotal, 'action')} selected across all proposals will run with your permissions; you can undo each from the run history.`),
    { confirmLabel: L('اعتماد الكل', 'Approve all') });
  if (!ok) return;
  busy(btn, true);
  let runs = 0; let done = 0; let bad = 0; let doc = null;
  for (const c of cards) {
    const res = await c.approve({ quiet: true });
    if (!res) continue;
    runs++;
    done += res.proposal.filter((i) => i.status === 'done').length;
    bad += res.proposal.filter((i) => i.status === 'failed').length;
    doc = doc || res.proposal.find((i) => i.status === 'done' && i.open_document)?.open_document;
  }
  busy(btn, false);
  if (!runs) return;
  if (done) celebrate(btn, { big: true });
  toast(bad ? L(`اعتمدت ${count(runs, 'proposal')}: نُفّذ ${count(done, 'action')} وتعذّر ${count(bad, 'action')}`, `Approved ${count(runs, 'proposal')}: ${count(done, 'action')} done, ${count(bad, 'action')} failed`)
    : L(`اعتمدت ${count(runs, 'proposal')} — نُفّذ ${count(done, 'action')}`, `Approved ${count(runs, 'proposal')} — ${count(done, 'action')} done`), { kind: bad ? 'error' : null });
  if (doc) Editor.open(doc);
  emit('data-changed', { entity: 'office' });
}

// ---------------------------------------------------------------- agents
function agentsSection(ctx) {
  const { agents } = ctx;
  return h('section.office-agents', { 'aria-labelledby': 'office-ag-title' },
    h('div.office-sec-head', h('h2#office-ag-title', `${L('وكلائي', 'My agents')} (${agents.length})`)),
    agents.length
      ? h('div.office-agent-list', agents.map((a) => agentCard(a, ctx)), addTile(ctx))
      : h('div.card.office-empty',
        emptyState({ compact: true, icon: 'bot', title: L('لا وكلاء بعد', 'No agents yet'), body: L('ابدأ بقالب جاهز — يجهّز الوكيل العمل في موعده وينتظر موافقتك.', 'Start from a ready template — the agent prepares work on schedule and waits for your approval.') }),
        h('div.office-tpls.is-compact', Object.keys(ctx.templates).filter((k) => k !== 'custom').map((k) => tplCard(ctx, k, { onClick: () => builder(ctx.templates, { template: k }) })))));
}

function addTile(ctx) {
  const unused = Object.keys(ctx.templates).filter((k) => !ctx.used.has(k));
  return h('button.office-add', { type: 'button', onclick: () => builder(ctx.templates) },
    h('span.oa-add-ic', { 'aria-hidden': 'true' }, icon('plus')),
    h('span.grow', h('span.oa-add-title', L('أضف وكيلاً', 'Add an agent')),
      h('span.oa-add-sub', L('ملخص يومي، تقرير المتأخرات، مهمة متكررة…', 'Daily briefing, delayed report, recurring task…'))),
    ctx.agentPts && unused.length ? ptsChip(ctx.agentPts, null, L(`+${ctx.agentPts} نقاط تميّز لأول وكيل من كل نوع جديد`, `+${ctx.agentPts} excellence points for the first agent of each new type`)) : null);
}

function agentCard(a, ctx) {
  const { templates, pending } = ctx;
  const nameId = `agent-${a.id}-name`;
  const tName = tplName(templates, a.template);
  const desc = a.description && a.description === templates[a.template]?.description_ar ? tplDesc(templates, a.template) : a.description;
  const scheduled = a.schedule?.type && a.schedule.type !== 'manual';
  const run = pending.find((r) => r.agent_id === a.id);

  const stateText = h('span.oa-switch-text', a.enabled ? L('مفعّل', 'On') : L('موقوف', 'Paused'));
  const sw = h('input.switch', { type: 'checkbox', role: 'switch', 'data-fk': `sw:${a.id}`, checked: a.enabled || null, 'aria-label': L(`تشغيل ${quote(a.name)} حسب الجدول`, `Run ${quote(a.name)} on schedule`), onchange: async () => {
    const on = sw.checked; sw.disabled = true;
    try {
      const r = await api(`/api/office/agents/${a.id}`, { method: 'PUT', body: { enabled: on } });
      toast(on ? L(`فُعّل ${quote(a.name)}${r?.next_run_at ? ` — التشغيل القادم ${when(r.next_run_at)}` : ''}`, `${quote(a.name)} is on${r?.next_run_at ? ` — next run ${when(r.next_run_at)}` : ''}`)
        : L(`أُوقف ${quote(a.name)} مؤقتاً — لن يعمل حسب الجدول حتى تعيد تفعيله`, `${quote(a.name)} is paused — it won’t run on schedule until you turn it back on`));
      emit('data-changed', { entity: 'office' });
    } catch (e) {
      sw.checked = !on;
      toast(L(`تعذّر تغيير حالة ${quote(a.name)}: ${e.message}`, `Could not change ${quote(a.name)}: ${e.message}`), { kind: 'error' });
    } finally { sw.disabled = false; stateText.textContent = sw.checked ? L('مفعّل', 'On') : L('موقوف', 'Paused'); }
  } });

  const fact = (ic, label, value, cls = '') => h(`div.oa-fact${cls}`, h('dt', icon(ic), label), h('dd', value));
  const nextValue = !a.enabled ? h('span.faint', L('موقوف مؤقتاً', 'Paused')) : a.next_run_at ? h('span.oa-next', h('span.dot.live', { 'aria-hidden': 'true' }), when(a.next_run_at)) : L('عند الطلب فقط', 'On demand only');

  const prepBtn = h('button.btn.sm.primary', { type: 'button', 'data-fk': `prep:${a.id}`, onclick: (e) => prepare(a, e.currentTarget) }, icon('spark'), L('حضّر الآن', 'Prepare now'));
  return h(`article.card.office-agent${a.enabled ? '' : '.is-paused'}`, { id: `agent-${a.id}`, 'aria-labelledby': nameId },
    h('header.oa-head',
      glyph(a.template),
      h('div.oa-titles',
        h('h3.oa-name', { id: nameId }, h('bdi', a.name)),
        h('div.oa-tpl', a.name.trim() === tName ? L('قالب جاهز', 'Ready template') : tName)),
      h('label.oa-switch', stateText, sw)),
    run ? h('button.oa-pending', { type: 'button', onclick: () => reveal(document.getElementById(`run-${run.id}`), { focus: true, block: 'start' }) },
      h('span.op-live', { 'aria-hidden': 'true' }), h('span.grow', L(`${count(a.pending_runs || 1, 'proposal')} بانتظار مراجعتك`, `${count(a.pending_runs || 1, 'proposal')} waiting for your review`)), icon('chevron', 'sm flip-rtl')) : null,
    desc ? h('p.oa-desc', h('bdi', desc)) : null,
    h('dl.oa-facts',
      fact('calendarClock', L('الجدول', 'Schedule'), scheduled ? schedText(a.schedule) : L('يدوي فقط', 'Manual only')),
      fact('clock', L('التشغيل القادم', 'Next run'), nextValue),
      fact('history', L('آخر تشغيل', 'Last run'), a.last_run_at ? when(a.last_run_at) : h('span.faint', L('لم يعمل بعد', 'Not run yet'))),
      a.config?.title ? fact('listChecks', L('المهمة', 'Task'), h('bdi', a.config.title), '.is-wide') : null),
    h('footer.oa-foot',
      prepBtn,
      h('button.btn.sm', { type: 'button', onclick: () => builder(templates, a) }, icon('pencil'), t('edit')),
      h('button.icon-btn.oa-del', { type: 'button', 'aria-label': L(`حذف ${quote(a.name)}`, `Delete ${quote(a.name)}`), 'data-tip': L('حذف الوكيل', 'Delete agent'), onclick: (e) => removeAgent(a, e.currentTarget) }, icon('trash'))));
}

async function prepare(a, btn) {
  busy(btn, true);
  try {
    const r = await api(`/api/office/agents/${a.id}/run`, { method: 'POST' });
    if (r.status === 'awaiting_review') {
      ui.focusRun = r.id;
      const away = state.route !== 'office';
      toast(L(`${quote(a.name)} جاهز للمراجعة — ${count(r.proposal.length, 'action')}`, `${quote(a.name)} is ready for review — ${count(r.proposal.length, 'action')}`),
        away ? { action: L('راجِع الآن', 'Review now'), onAction: () => { location.hash = '#/office'; } } : {});
    } else if (r.status === 'failed') {
      toast(L(`تعذّر تحضير ${quote(a.name)}: ${r.error || ''}`, `${quote(a.name)} could not prepare: ${r.error || ''}`), { kind: 'error', timeout: 8000 });
    } else {
      toast(r.summary || L(`لا شيء يحتاج ${quote(a.name)} إلى تحضيره الآن`, `Nothing for ${quote(a.name)} to prepare right now`), { kind: 'info' });
    }
    emit('data-changed', { entity: 'office' });
  } catch (e) {
    toast(L(`تعذّر تشغيل ${quote(a.name)}: ${e.message}`, `Could not run ${quote(a.name)}: ${e.message}`), { kind: 'error' });
  } finally { busy(btn, false); }
}

async function removeAgent(a, btn) {
  const n = a.pending_runs || 0;
  const ok = await confirmDialog(L(`حذف ${quote(a.name)}؟`, `Delete ${quote(a.name)}?`),
    n ? L(`سيُحذف الوكيل ويُلغى ${count(n, 'proposal')} بانتظار مراجعتك. لا يمكن التراجع عن الحذف.`, `The agent will be deleted and ${count(n, 'proposal')} awaiting review will be cancelled. This can’t be undone.`)
      : L('سيتوقف الوكيل ويُحذف من مكتبك. يبقى ما نفّذه سابقاً كما هو. لا يمكن التراجع عن الحذف.', 'The agent stops and is removed from your office. What it already ran stays as is. This can’t be undone.'),
    { danger: true, confirmLabel: L('حذف الوكيل', 'Delete agent') });
  if (!ok) return;
  busy(btn, true);
  try {
    await api(`/api/office/agents/${a.id}?confirm=1`, { method: 'DELETE' });
    toast(L(`حُذف الوكيل ${quote(a.name)}`, `Deleted ${quote(a.name)}`));
    emit('data-changed', { entity: 'office' });
  } catch (e) {
    busy(btn, false);
    toast(L(`تعذّر حذف ${quote(a.name)}: ${e.message}`, `Could not delete ${quote(a.name)}: ${e.message}`), { kind: 'error' });
  }
}

// ---------------------------------------------------------------- run history
const FILTERS = [['all', 'الكل', 'All'], ['done', 'نُفّذ', 'Done'], ['failed', 'تعذّر', 'Failed'], ['none', 'لم يُنفَّذ', 'Not run']];

function historySection(ctx) {
  const runs = ctx.history.filter((r) => r.status !== 'awaiting_review');
  const group = (r) => runMeta(r.status)[4];
  const agentsIn = [...new Map(runs.map((r) => [r.agent_id, r.agent_name])).entries()];
  if (ui.agent && !agentsIn.some(([id]) => id === ui.agent)) ui.agent = '';
  const body = h('div.office-hist-body');
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, runs.filter((r) => (k === 'all' || group(r) === k) && (!ui.agent || r.agent_id === ui.agent)).length]));

  const seg = h('div.tabs.office-seg', { role: 'group', 'aria-label': L('تصفية السجل حسب النتيجة', 'Filter history by result') },
    FILTERS.map(([k, ar, en]) => h(`button${ui.filter === k ? '.on' : ''}`, { type: 'button', 'data-fk': `flt:${k}`, 'aria-pressed': String(ui.filter === k), onclick: () => { ui.filter = k; ui.more = false; repaint(); } },
      L(ar, en), h('span.count.num', { 'data-k': k }, fmtNum(counts[k])))));
  const agentSel = agentsIn.length > 1 ? h('select.field.office-agent-filter', { 'aria-label': L('تصفية حسب الوكيل', 'Filter by agent'), 'data-fk': 'flt:agent', onchange: (e) => { ui.agent = e.target.value; ui.more = false; repaint(); } },
    h('option', { value: '' }, L('كل الوكلاء', 'All agents')), agentsIn.map(([id, name]) => h('option', { value: id, selected: ui.agent === id || null }, name))) : null;

  function repaint() {
    const scoped = runs.filter((r) => !ui.agent || r.agent_id === ui.agent);
    seg.querySelectorAll('button').forEach((b) => { const k = b.dataset.fk.slice(4); const on = ui.filter === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.querySelector('.count').textContent = fmtNum(scoped.filter((r) => k === 'all' || group(r) === k).length); });
    const list = scoped.filter((r) => ui.filter === 'all' || group(r) === ui.filter);
    const shown = ui.more ? list : list.slice(0, PAGE_SIZE);
    if (!runs.length) {
      body.replaceChildren(emptyState({ compact: true, icon: 'history', title: L('لا يوجد سجل بعد', 'No history yet'),
        body: L('كل مقترح تعتمده أو ترفضه يظهر هنا مع نتيجة كل إجراء وإمكانية التراجع.', 'Every proposal you approve or reject appears here, with each action’s result and undo.') }));
      return;
    }
    if (!list.length) {
      body.replaceChildren(emptyState({ compact: true, icon: 'filter', title: L('لا تشغيلات بهذا التصنيف', 'No runs match this filter'),
        actions: [{ label: L('عرض الكل', 'Show all'), onClick: () => { ui.filter = 'all'; ui.agent = ''; if (agentSel) agentSel.value = ''; repaint(); } }] }));
      return;
    }
    const firstActed = list.find((r) => r.proposal.some((i) => i.status !== 'proposed'))?.id;
    body.replaceChildren(...[
      h('ul.or-runs', shown.map((r) => h('li', runRow(r, r.id === firstActed)))),
      list.length > shown.length ? h('button.btn.ghost.block.office-more', { type: 'button', onclick: () => { ui.more = true; repaint(); } }, icon('chevronDown'), L(`عرض المزيد (${fmtNum(list.length - shown.length)})`, `Show ${fmtNum(list.length - shown.length)} more`)) : null,
      ctx.history.length >= 30 && (ui.more || list.length <= PAGE_SIZE) ? h('p.office-foot-note', L('يعرض السجل آخر 30 تشغيلاً.', 'History shows the latest 30 runs.')) : null,
    ].filter(Boolean));
  }
  repaint();

  return h('section.office-history', { 'aria-labelledby': 'office-hist-title' },
    h('div.office-sec-head', h('h2#office-hist-title', `${L('سجل التشغيل', 'Run history')} (${runs.length})`)),
    h('div.card.office-history-card', runs.length ? h('div.office-filters', seg, agentSel) : null, body));
}

function runRow(r, latest) {
  const [ar, en, tone, ic] = runMeta(r.status);
  const scheduled = r.trigger === 'schedule';
  const doneN = r.proposal.filter((i) => i.status === 'done').length;
  const expandable = r.proposal.length > 0 || !!r.error;
  const summaryText = r.error ? r.error : r.summary;
  const head = [
    h('span.or-run-ic', { 'data-tone': tone || 'none', 'aria-hidden': 'true' }, icon(ic)),
    h('span.or-run-main',
      h('span.or-run-name', h('bdi', r.agent_name)),
      summaryText ? h('span.or-run-sum', bd(summaryText)) : null),
    h('span.or-run-meta',
      h(`span.chip.tiny${tone ? '.' + tone : ''}`, L(ar, en), r.proposal.length && (r.status === 'completed' || r.status === 'partially_completed') ? h('span.num', ` ${fmtNum(doneN)}/${fmtNum(r.proposal.length)}`) : null),
      h('span.or-run-when', h('time', { datetime: r.created_at, title: stampOf(r.created_at) }, when(r.created_at)), ' · ', scheduled ? L('مجدول', 'Scheduled') : L('يدوي', 'Manual'))),
  ];
  if (!expandable) return h('div.or-run.is-flat', { 'data-run': r.id }, ...head);
  const open = ui.open.has(r.id) || (latest && !ui.closed.has(r.id));
  const det = h('details.or-run', { 'data-run': r.id, open: open || null, ontoggle: () => { if (det.open) { ui.open.add(r.id); ui.closed.delete(r.id); } else { ui.open.delete(r.id); ui.closed.add(r.id); } } },
    h('summary', { 'data-fk': `sum:${r.id}` }, ...head, icon('chevronDown', 'or-run-chev')),
    h('div.or-run-body',
      r.error ? h('p.or-run-err', { role: 'note' }, icon('circleAlert', 'sm'), h('span', r.error)) : null,
      r.proposal.length ? h('ul.or-steps', r.proposal.map(stepRow)) : null));
  return det;
}

function stepRow(i) {
  const [ic, ar, en, tone] = STEP[i.status] || STEP.proposed;
  const undone = i.actionId && ui.undone.has(i.actionId);
  return h('li.or-step', { 'data-tone': tone },
    h('span.or-step-ic', { role: 'img', 'aria-label': L(ar, en) }, icon(ic)),
    h('span.or-step-text', bd(i.summary),
      i.edited ? h('span.chip.tiny.info', L('عُدّل قبل التنفيذ', 'Edited before running')) : null,
      i.error ? h('span.or-step-err', i.error) : null),
    h('span.or-step-acts',
      i.status === 'done' && i.open_document ? h('button.btn.sm.ghost', { type: 'button', 'aria-label': L(`فتح المستند: ${i.summary}`, `Open document: ${i.summary}`), onclick: () => Editor.open(i.open_document) }, icon('fileText'), L('فتح', 'Open')) : null,
      undone ? h('span.chip.tiny', icon('undo'), L('تم التراجع', 'Undone'))
        : i.status === 'done' && i.undoable && i.actionId ? h('button.btn.sm.ghost', { type: 'button', 'aria-label': `${t('undo')}: ${i.summary}`, onclick: (e) => undoItem(i, e.currentTarget) }, icon('undo'), t('undo')) : null));
}

async function undoItem(i, btn) {
  busy(btn, true);
  const r = await api(`/api/actions/${i.actionId}/undo`, { method: 'POST' }).catch((e) => e.body || { error: e.message });
  if (r?.status === 'ok') {
    ui.undone.add(i.actionId);
    toast(L(`تم التراجع عن: ${i.summary}`, `Undone: ${i.summary}`));
    emit('data-changed', { entity: 'all' });
  } else {
    busy(btn, false);
    toast(r?.error || r?.message || L('تعذّر التراجع', 'Could not undo'), { kind: 'error' });
  }
}

// ---------------------------------------------------------------- builder
// A validated sheet (stays open while saving, shows server errors inline).
let sheetSeq = 0;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function sheet({ title, body, submitLabel, submitIcon, onSubmit, initial }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const id = `office-sheet-${++sheetSeq}`;
    let done = false; let saving = false;
    const errBox = h('div.callout.office-form-error.hidden', { role: 'alert' });
    const submit = h('button.btn.primary', { type: 'submit' }, submitIcon ? icon(submitIcon) : null, submitLabel);
    const cancel = h('button.btn.secondary', { type: 'button', onclick: () => close(null) }, t('cancel'));
    const form = h('form.modal.glass-4.wide.office-sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, novalidate: true, tabindex: -1 },
      h('div.sheet-grabber', { 'aria-hidden': 'true' }),
      h('h3', { id }, title),
      h('button.icon-btn.modal-close', { type: 'button', 'aria-label': t('close'), onclick: () => close(null) }, icon('x')),
      h('div.office-sheet-body', errBox, body),
      h('div.actions', cancel, submit));
    const wrap = h('div.modal-wrap', { onclick: (e) => { if (e.target === wrap && !saving) close(null); } }, form);
    const ctl = {
      setError(msg) { errBox.replaceChildren(...(msg ? [icon('circleAlert'), h('span', msg)] : [])); errBox.classList.toggle('hidden', !msg); if (msg) errBox.scrollIntoView?.({ block: 'nearest' }); },
      setBusy(b) { saving = b; busy(submit, b); cancel.disabled = b; },
    };
    const onNav = () => close(null);
    function close(v) {
      if (done) return; done = true;
      wrap.classList.add('leaving');
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('hashchange', onNav);
      setTimeout(() => { wrap.remove(); if (prevFocus?.isConnected) prevFocus.focus?.(); }, 200);
      resolve(v);
    }
    function onKey(e) {
      if ([...document.querySelectorAll('.modal-wrap:not(.leaving)')].pop() !== wrap) return;
      if (e.key === 'Escape' && !saving) { e.stopPropagation(); close(null); return; }
      if (e.key !== 'Tab') return;
      const f = [...form.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (saving || done) return;
      ctl.setError(null); ctl.setBusy(true);
      let res;
      try { res = await onSubmit(ctl); } catch (err) { ctl.setError(err?.message || String(err)); }
      if (done) return;
      ctl.setBusy(false);
      if (res) close(res);
    });
    document.body.append(wrap);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('hashchange', onNav);
    setTimeout(() => (initial?.() || form.querySelector('input, select, textarea') || submit).focus?.(), 40);
  });
}

// Arrow-key radio group (roving tabindex) over buttons carrying data-v.
function radioGroup(el, buttons, onPick) {
  el.addEventListener('keydown', (e) => {
    const rtl = document.documentElement.dir === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = Math.max(0, buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true'));
    onPick(buttons[(i + step + buttons.length) % buttons.length].dataset.v, true);
  });
}
function paintRadios(buttons, value, focus) {
  for (const b of buttons) {
    const on = b.dataset.v === value;
    b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    b.classList.toggle('on', on); b.classList.toggle('selected', on);
    if (on && focus) b.focus();
  }
}

// Next scheduled run, previewed locally (the server computes the real one).
function nextLocal(type, time, day) {
  if (type === 'manual' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return null;
  const [hh, mm] = time.split(':').map(Number);
  const now = new Date();
  for (let i = 0; i <= 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh, mm);
    if (d <= now) continue;
    const dow = d.getDay();
    if (type === 'weekdays' && (dow === 5 || dow === 6)) continue;
    if (type === 'weekly' && dow !== day) continue;
    return d;
  }
  return null;
}

export async function builder(templates, existing = null) {
  templates = templates || await api('/api/office/templates');
  const isEdit = !!existing?.id;
  const [projects, users, mine, game] = await Promise.all([
    api('/api/projects').catch(() => []), api('/api/users/assignable').catch(() => []),
    isEdit ? [] : api('/api/office/agents').catch(() => []),
    gameNow() || api('/api/game/me').catch(() => null),
  ]);
  const ctx = { templates, agentPts: isEdit ? null : rulePts(game, 'agent'), used: new Set((mine || []).map((a) => a.template)) };
  let tplKey = existing?.template && templates[existing.template] ? existing.template : Object.keys(templates).includes('daily_briefing') ? 'daily_briefing' : Object.keys(templates)[0];

  // --- template
  let tplButtons = [];
  let tplBlock;
  if (isEdit) {
    tplBlock = h('div.ob-tpl-fixed', glyph(tplKey), h('div.grow', h('div.ot-name', tplName(templates, tplKey)), h('div.ot-desc', L('لا يمكن تغيير قالب وكيل قائم — ابنِ وكيلاً جديداً لقالب آخر.', 'An existing agent keeps its template — build a new agent for another one.'))));
  } else {
    tplButtons = Object.keys(templates).map((k) => tplCard(ctx, k, { radio: true, selected: k === tplKey, onClick: () => pickTpl(k, true) }));
    tplBlock = h('div.office-tpls.ob-tpls', { role: 'radiogroup', 'aria-labelledby': 'ob-tpl-lbl' }, tplButtons);
    radioGroup(tplBlock, tplButtons, (k, f) => pickTpl(k, f));
  }

  // --- name + template config
  const name = h('input.field', { id: 'ob-name', value: existing?.name || '', maxlength: 120, autocomplete: 'off' });
  const cfgBox = h('div.form-grid.ob-cfg');
  const warnBox = h('div');
  let cfg = {};
  function drawCfg() {
    const tpl = templates[tplKey];
    cfg = {};
    cfgBox.replaceChildren();
    for (const [k, spec] of Object.entries(tpl.config || {})) {
      const cur = existing?.config?.[k] ?? spec.default ?? '';
      const id = `ob-cfg-${k}`;
      let el;
      if (spec.type === 'enum') el = h('select.field', { id }, spec.values.map((v) => h('option', { value: v, selected: cur === v || null }, enumLabel(v))));
      else if (spec.type === 'project') el = h('select.field', { id }, h('option', { value: '' }, L('بدون مشروع', 'No project')), projects.map((p) => h('option', { value: p.id, selected: cur === p.id || null }, p.name)));
      else if (spec.type === 'user') el = h('select.field', { id }, h('option', { value: '' }, L('أنا', 'Me')), users.filter((u) => u.id !== state.me?.user?.id).map((u) => h('option', { value: u.id, selected: cur === u.id || null }, L(u.name_ar, u.name_en))));
      else if (spec.type === 'text') el = h('textarea.field', { id, rows: 4 }, cur);
      else el = h('input.field', { id, type: spec.type === 'int' ? 'number' : 'text', value: cur, min: spec.type === 'int' ? 0 : null, max: spec.type === 'int' ? 365 : null, inputmode: spec.type === 'int' ? 'numeric' : null, maxlength: spec.type === 'string' ? 200 : null });
      const help = CFG_HELP[k] ? h('div.helper', { id: `${id}-help` }, L(...CFG_HELP[k])) : null;
      const err = h('div.error-text.hidden', { id: `${id}-err` });
      if (help) el.setAttribute('aria-describedby', help.id);
      if (spec.required) el.setAttribute('aria-required', 'true');
      const label = L(spec.label_ar, CFG[k]?.[1] || spec.label_ar);
      const setError = (msg) => { err.replaceChildren(...(msg ? [icon('circleAlert', 'sm'), msg] : [])); err.classList.toggle('hidden', !msg); msg ? el.setAttribute('aria-invalid', 'true') : el.removeAttribute('aria-invalid'); el.setAttribute('aria-describedby', [help?.id, msg ? err.id : null].filter(Boolean).join(' ')); };
      el.addEventListener('input', () => setError(null));
      cfg[k] = { el, spec, label, setError };
      cfgBox.append(h(`div.form-field.ob-field${spec.type === 'text' || k === 'title' ? '.ob-wide' : ''}`,
        h('label.lbl', { for: id }, label, spec.required ? h('span.ob-req', L('مطلوب', 'Required')) : null), el, help, err));
    }
    cfgBox.classList.toggle('hidden', !Object.keys(cfg).length);
    warnBox.replaceChildren(...(tplKey === 'custom' && state.me?.assistant?.mode === 'local'
      ? [h('div.callout.office-warn', icon('alert'), h('span', L('يتطلب هذا القالب خدمة نموذج لغوي متصلة، وهي غير متاحة حالياً — يمكنك بناؤه الآن لكن تحضيره سيتعذّر.', 'This template needs a connected language-model service, which isn’t available now — you can build it, but preparing will fail.')))] : []));
    if (!isEdit) name.placeholder = tplName(templates, tplKey);
  }
  function pickTpl(k, focus) { tplKey = k; paintRadios(tplButtons, k, focus); drawCfg(); }

  // --- schedule
  const sc = existing?.schedule || { type: 'daily', time: '07:00', day: 0 };
  let sType = ['manual', 'daily', 'weekdays', 'weekly'].includes(sc.type) ? sc.type : 'daily';
  let sDay = Number.isInteger(Number(sc.day)) ? Number(sc.day) : 0;
  const typeBtns = [['manual', L('يدوي', 'Manual')], ['daily', L('يومياً', 'Daily')], ['weekdays', L('أيام العمل', 'Weekdays')], ['weekly', L('أسبوعياً', 'Weekly')]]
    .map(([v, l]) => h('button', { type: 'button', role: 'radio', 'data-v': v, onclick: () => setType(v, true) }, l));
  const typeGroup = h('div.tabs.ob-tabs', { role: 'radiogroup', 'aria-labelledby': 'ob-when-lbl' }, typeBtns);
  radioGroup(typeGroup, typeBtns, (v, f) => setType(v, f));
  const dayBtns = DAYS.map((d, i) => h('button', { type: 'button', role: 'radio', 'data-v': String(i), onclick: () => setDay(i, true) }, L(d[0], d[1])));
  const dayGroup = h('div.tabs.ob-tabs.ob-days', { role: 'radiogroup', 'aria-labelledby': 'ob-day-lbl' }, dayBtns);
  radioGroup(dayGroup, dayBtns, (v, f) => setDay(Number(v), f));
  const sTime = h('input.field.ob-time', { id: 'ob-time', type: 'time', value: sc.time || '07:00' });
  const timeErr = h('div.error-text.hidden', { id: 'ob-time-err' });
  const timeWrap = h('div.form-field.ob-field', h('label.lbl', { for: 'ob-time' }, L('الوقت', 'Time')), sTime, timeErr);
  const dayWrap = h('div.form-field.ob-field.ob-wide', h('span.lbl#ob-day-lbl', L('اليوم', 'Day')), dayGroup);
  const nextLine = h('p.ob-next', { 'aria-live': 'polite' });
  function syncSched() {
    timeWrap.classList.toggle('hidden', sType === 'manual');
    dayWrap.classList.toggle('hidden', sType !== 'weekly');
    const nx = nextLocal(sType, sTime.value, sDay);
    nextLine.classList.toggle('is-manual', sType === 'manual');
    nextLine.replaceChildren(icon(sType === 'manual' ? 'play' : 'calendarClock'),
      sType === 'manual' ? h('span', L('لن يعمل تلقائياً — شغّله متى شئت بزر «حضّر الآن».', 'It won’t run by itself — start it anytime with “Prepare now”.'))
        : nx ? h('span', sType === 'weekdays' ? L('من الأحد إلى الخميس. ', 'Sunday to Thursday. ') : '', L('أول تشغيل: ', 'First run: '), h('strong', longWhen(nx)))
          : h('span', L('اختر وقتاً صالحاً للتشغيل.', 'Choose a valid time.')));
  }
  function setType(v, focus) { sType = v; paintRadios(typeBtns, v, focus); syncSched(); }
  function setDay(i, focus) { sDay = i; paintRadios(dayBtns, String(i), focus); syncSched(); }
  sTime.addEventListener('input', () => { timeErr.classList.add('hidden'); sTime.removeAttribute('aria-invalid'); syncSched(); });
  paintRadios(typeBtns, sType); paintRadios(dayBtns, String(sDay));
  drawCfg(); syncSched();

  const body = h('div.ob-form',
    h('h4.ob-sec#ob-tpl-lbl', icon('layers'), L('القالب', 'Template')),
    tplBlock, warnBox,
    h('h4.ob-sec', icon('settings'), L('الإعدادات', 'Settings')),
    h('div.form-grid.ob-cfg',
      h('div.form-field.ob-field.ob-wide', h('label.lbl', { for: 'ob-name' }, L('اسم الوكيل', 'Agent name')), name,
        h('div.helper', L('اتركه فارغاً لاستخدام اسم القالب.', 'Leave empty to use the template name.')))),
    cfgBox,
    h('h4.ob-sec#ob-when-lbl', icon('calendarClock'), L('متى يجهّز العمل؟', 'When does it prepare work?')),
    typeGroup,
    h('div.form-grid.ob-cfg.ob-sched', timeWrap, dayWrap),
    nextLine,
    h('div.callout.ob-safe', icon('shield'), h('span', L('يعمل الوكيل بصلاحياتك فقط: لا يحذف ولا يشارك ولا يغيّر الصلاحيات، ولا يصل إلى Vault — وكل ما يجهّزه ينتظر موافقتك.', 'The agent acts within your permissions only: it can’t delete, share or change permissions, can’t reach Vault — and everything it prepares waits for your approval.'))));

  const res = await sheet({
    title: isEdit ? L(`تعديل ${quote(existing.name)}`, `Edit ${quote(existing.name)}`) : L('وكيل جديد', 'New agent'),
    body, submitLabel: isEdit ? t('save') : L('بناء الوكيل', 'Build agent'), submitIcon: isEdit ? 'check' : 'bot',
    initial: () => (isEdit ? name : tplButtons.find((b) => b.getAttribute('aria-checked') === 'true')),
    onSubmit: async (ctl) => {
      // inline validation (the server validates again)
      let firstBad = null;
      for (const f of Object.values(cfg)) {
        const v = f.el.value.trim();
        let msg = null;
        if (f.spec.required && !v) msg = L(`أدخل ${f.spec.label_ar}`, `Enter the ${String(f.label).toLowerCase()}`);
        else if (f.spec.type === 'int' && v !== '' && !(Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 365)) msg = L('أدخل رقماً صحيحاً من 0 إلى 365', 'Enter a whole number from 0 to 365');
        f.setError(msg);
        if (msg && !firstBad) firstBad = f.el;
      }
      if (sType !== 'manual' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(sTime.value)) {
        timeErr.replaceChildren(icon('circleAlert', 'sm'), L('اختر وقت التشغيل', 'Choose a run time')); timeErr.classList.remove('hidden'); sTime.setAttribute('aria-invalid', 'true');
        firstBad = firstBad || sTime;
      }
      if (firstBad) { firstBad.focus(); return null; }
      const config = {};
      for (const [k, { el, spec }] of Object.entries(cfg)) { const v = el.value; if (v !== '') config[k] = spec.type === 'int' ? Number(v) : v; }
      const schedule = { type: sType, time: sTime.value || '07:00', day: sDay, tz_offset: new Date().getTimezoneOffset() };
      try {
        if (isEdit) {
          const a = await api(`/api/office/agents/${existing.id}`, { method: 'PUT', body: { name: name.value || existing.name, config, schedule } });
          return { agent: a || existing, edit: true };
        }
        const r = await api('/api/office/agents', { method: 'POST', body: { name: name.value || undefined, template: tplKey, config, schedule }, headers: { 'x-request-id': rid() } });
        if (r.status !== 'ok') throw new Error(r.error);
        return { agent: r.result };
      } catch (e) { ctl.setError(e.body?.error || e.body?.message || e.message); return null; }
    },
  });
  if (!res) return;
  const a = res.agent || {};
  if (res.edit) {
    toast(L(`حُفظت تعديلات ${quote(a.name)}${a.enabled && a.next_run_at ? ` — التشغيل القادم ${when(a.next_run_at)}` : ''}`, `Saved ${quote(a.name)}${a.enabled && a.next_run_at ? ` — next run ${when(a.next_run_at)}` : ''}`));
  } else {
    ui.flashAgent = a.id;
    toast(L(`بُني الوكيل ${quote(a.name)} — جهّز أول مقترح له الآن وراجعه`, `Built ${quote(a.name)} — prepare its first proposal now and review it`),
      a.id ? { action: L('حضّر أول مقترح', 'Prepare first proposal'), onAction: () => prepare(a), timeout: 8000 } : {});
  }
  emit('data-changed', { entity: 'office' });
}
