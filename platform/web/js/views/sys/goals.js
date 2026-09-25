// My Goals — أهدافي.
// Tabs (#/sys/goals/<tab>/<id>): today (hero: today's checklist + this week, quick
// add), periods (lanes daily → yearly + history), alignment (my goals → strategic
// objectives), team (managers: goals their team chose to share, read-only).
import {
  h, icon, L, fmtDate, getLang, sysHeader, sysTabs, currentTab, go, statusChip, progress, openSheet, toast, act, emptyState, errorState, skeleton, dataTable, avatar, dateTime,
} from '../../sys-kit.js';
import { ring, nf, pctText } from './strategy/viz.js';
import { call, TYPES, TYPE, STATUS, typeLabel, periodName, measureText, objChip, visChip, goalSheet, goalRow, createDialog, openGoalId } from './goals/shared.js';

const RAG = { on_track: ['على المسار', 'On track', 'good'], at_risk: ['معرّض للخطر', 'At risk', 'warn'], off_track: ['خارج المسار', 'Off track', 'crit'], no_data: ['لم يُرصد', 'Not reported', 'outline'] };
const ui = { lastTab: null, quickType: 'daily', history: 'all' };
let memberSheet = null;

export async function render(root, ctx) {
  const page = h('div.gl');
  root.append(page);
  const asked = ctx.params[0];
  const quiet = ctx.soft || (asked && ui.lastTab === asked);
  const reload = () => load(true);
  async function load(silent) {
    try {
      const sum = await call('/summary');
      const tabs = [
        { key: 'today', ar: 'اليوم', en: 'Today', icon: 'sun', count: Math.max(0, sum.today_total - sum.today_done) },
        { key: 'periods', ar: 'الفترات', en: 'Periods', icon: 'calendarDays' },
        { key: 'alignment', ar: 'التوافق', en: 'Alignment', icon: 'compass' },
        sum.team_size ? { key: 'team', ar: 'فريقي', en: 'My team', icon: 'usersRound' } : null,
      ].filter(Boolean);
      const tab = currentTab(ctx, tabs, 'today');
      const body = await TABS[tab](ctx, sum, reload);
      page.replaceChildren(header(ctx, sum, reload), sysTabs(ctx, tabs, tab), body);
      ui.lastTab = tab;
      openFromHash(ctx, tab, reload);
    } catch (e) {
      if (silent && page.childElementCount) { toast(e.message, { kind: 'error' }); return; }
      page.replaceChildren(sysHeader(ctx), h('div.card', errorState(e, () => { page.replaceChildren(sysHeader(ctx), skel()); load(); })));
    }
  }
  if (quiet) { await load(true); return; }
  page.append(sysHeader(ctx, { sub: false }), skel());
  load();
}
const skel = () => h('div.gl-skel', { 'aria-busy': 'true' }, h('div.card', skeleton('card')), h('div.gl-skel-grid', h('div.card', skeleton('list', 4)), h('div.card', skeleton('list', 3))));

function header(ctx, sum, reload) {
  return sysHeader(ctx, {
    sub: L('أهدافك الشخصية لكل فترة — خاصة بك افتراضياً، ومرتبطة بما يهم الجهة', 'Your personal goals for every period — private by default, aligned to what matters'),
    actions: [{ label: L('هدف جديد', 'New goal'), icon: 'plus', primary: true, onClick: (e) => createDialog(e.currentTarget, { type: ctx.params[0] === 'periods' ? 'weekly' : 'daily', reload }) }],
  });
}

// Open the goal / member sheet named in the hash; closing it trims the hash.
function openFromHash(ctx, tab, reload) {
  const [, a, b] = ctx.params;
  const trim = (id) => { if (location.hash.includes(`/${id}`)) history.replaceState(null, '', `#/sys/${ctx.key}/${tab}${tab === 'team' && b && id === b ? `/${a}` : ''}`); };
  if (tab === 'team') {
    if (a && b) { goalSheet(b, { reload, onClose: trim }); return; }
    if (a) { openMember(ctx, a, reload); return; }
    memberSheet?.close(); return;
  }
  if (a) { if (openGoalId() !== a || ctx.soft) goalSheet(a, { reload, onClose: trim }); }
}

// ================================================================ TODAY (hero)
async function renderToday(ctx, sum, reload) {
  const wrap = h('div.gl-today');
  const today = sum.today;
  const d = new Date(`${today}T12:00:00Z`);
  const hour = new Date(Date.now() + 4 * 3600e3).getUTCHours();
  const firstName = (ctx.user ? L(ctx.user.name_ar, ctx.user.name_en) : '').split(' ')[0];
  const dayName = d.toLocaleDateString(getLang() === 'ar' ? 'ar-AE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const open = (g) => go(ctx, 'today', g.id);

  // ---- hero: greeting · quick add · rings
  const input = h('input.field.gl-quick-input', { type: 'text', maxlength: 200, required: true, placeholder: ui.quickType === 'daily' ? L('ما الذي ستنجزه اليوم؟', 'What will you get done today?') : L('ما هدفك لهذا الأسبوع؟', 'What is your goal this week?'), 'aria-label': L('عنوان الهدف', 'Goal title') });
  const quick = h('form.gl-quick', { onsubmit: async (e) => {
    e.preventDefault();
    const title = input.value.trim(); if (title.length < 2) { input.focus(); return; }
    const r = await act(e.currentTarget.querySelector('button[type=submit]'), () => call('/goals', { method: 'POST', body: { title, period_type: ui.quickType } }));
    if (r) { toast(L('أُضيف الهدف', 'Goal added')); input.value = ''; reload(); }
  } },
  h('div.gl-quick-types', { role: 'radiogroup', 'aria-label': L('الفترة', 'Period') }, ['daily', 'weekly'].map((t) => h(`button.gl-qt${ui.quickType === t ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(ui.quickType === t), onclick: () => { ui.quickType = t; reload(); } }, t === 'daily' ? L('لليوم', 'Today') : L('للأسبوع', 'This week')))),
  input,
  h('button.btn.primary', { type: 'submit' }, icon('plus'), L('أضف', 'Add')),
  h('button.btn.ghost', { type: 'button', 'data-tip': L('خيارات أكثر: قياس رقمي، خطوات، ربط استراتيجي', 'More options: numeric, steps, alignment'), 'aria-label': L('هدف بخيارات أكثر', 'Goal with more options'), onclick: (e) => createDialog(e.currentTarget, { type: ui.quickType, reload }) }, icon('sliders')));
  const todayPct = sum.today_total ? Math.round((sum.today_done / sum.today_total) * 100) : null;
  wrap.append(h('section.gl-hero',
    h('div.gl-hero-main',
      h('span.eyebrow', dayName),
      h('h2.gl-greet', `${hour < 12 ? L('صباح الخير', 'Good morning') : L('مساء الخير', 'Good evening')}${firstName ? L(`، ${firstName}`, `, ${firstName}`) : ''}`, h('span.gl-greet-sub', sum.today_total
        ? L(`حققت ${nf(sum.today_done, 0)} من ${nf(sum.today_total, 0)} أهداف اليوم${sum.today_done === sum.today_total ? ' — يوم مكتمل!' : ''}`, `${nf(sum.today_done, 0)} of ${nf(sum.today_total, 0)} of today’s goals achieved${sum.today_done === sum.today_total ? ' — day complete!' : ''}`)
        : L('ابدأ بهدف واحد واضح لليوم', 'Start with one clear goal for today'))),
      quick,
      h('div.gl-hero-facts',
        sum.streak ? h('span.gl-streak', icon('flame'), L(`سلسلة ${nf(sum.streak, 0)} ${sum.streak === 1 ? 'يوم عمل' : 'أيام عمل'}`, `${nf(sum.streak, 0)}-day streak`)) : null,
        h('span', icon('compass'), L(`${nf(sum.aligned_count, 0)} من ${nf(sum.current_count, 0)} أهدافك الحالية مرتبطة بالاستراتيجية`, `${nf(sum.aligned_count, 0)} of ${nf(sum.current_count, 0)} current goals aligned to strategy`)),
        !sum.workday ? h('span', icon('sun'), L('عطلة نهاية الأسبوع — خطّط لأسبوع العمل القادم', 'Weekend — plan the coming work week')) : null)),
    h('div.gl-hero-rings',
      h('div.gl-ring-block', ring({ value: todayPct, size: 132, stroke: 11, tone: 'brand', label: sum.today_total ? `${nf(sum.today_done, 0)}/${nf(sum.today_total, 0)}` : '—', sub: L('اليوم', 'Today'), title: L('أهداف اليوم المتحققة', 'Today’s goals achieved') })),
      h('div.gl-ring-block', ring({ value: sum.week_progress, size: 96, stroke: 9, tone: 'accent', label: sum.week_progress == null ? '—' : pctText(sum.week_progress), sub: L('الأسبوع', 'Week'), title: L('متوسط تقدم أهداف الأسبوع', 'Average weekly progress') })))));

  // ---- main: today's checklist, missed, this week
  const todayList = sum.today_goals.length
    ? h('ul.gl-list', sum.today_goals.map((g) => goalRow(g, { onOpen: open, reload, compact: true })))
    : emptyState({ compact: true, icon: 'sun', title: L('لا أهداف لليوم بعد', 'No goals for today yet'), body: L('أضف هدفاً واحداً على الأقل من الأعلى — الأهداف الصغيرة الواضحة تُنجَز.', 'Add at least one goal above — small, clear goals get done.') });
  const main = h('div.gl-main',
    h('section.card.gl-card', h('div.card-head', h('h2.card-title', icon('sun'), L('أهداف اليوم', 'Today’s goals')), h('span.chip.tiny.outline', `${nf(sum.today_done, 0)}/${nf(sum.today_total, 0)}`)), todayList),
    sum.missed.length ? h('section.card.gl-card.gl-missed', h('div.card-head', h('h2.card-title', icon('clockAlert'), L('من أيام سابقة', 'From earlier days')), h('span.tiny.faint', L('لم تتحقق — انقلها لليوم أو ألغها', 'Not achieved — carry to today or cancel'))),
      h('ul.gl-list', sum.missed.map((g) => h('li.gl-row.st-missed',
        h('span.gl-check.ro', { 'aria-hidden': 'true' }, icon('clockAlert')),
        h('button.gl-row-main', { type: 'button', onclick: () => open(g) }, h('span.gl-title', g.title), h('span.gl-meta', h('span', periodName('daily', g.period_start, g.period_end, today)), objChip(g))),
        h('button.btn.sm.tertiary', { type: 'button', onclick: async (e) => { const r = await act(e.currentTarget, () => call(`/goals/${g.id}/carry`, { method: 'POST', body: {} })); if (r) { toast(L('نُقل الهدف إلى اليوم', 'Moved to today')); reload(); } } }, icon('arrowRight', 'flip-rtl'), L('انقله لليوم', 'Carry to today')))))) : null,
    h('section.card.gl-card', h('div.card-head', h('h2.card-title', icon('calendarDays'), L('هذا الأسبوع', 'This week')), h('span.tiny.faint', periodName('weekly', sum.periods.weekly.start, sum.periods.weekly.end, today)), h('span.grow'),
      h('button.btn.sm.ghost', { type: 'button', onclick: (e) => createDialog(e.currentTarget, { type: 'weekly', reload }) }, icon('plus'), L('هدف أسبوعي', 'Weekly goal'))),
    sum.week_goals.length ? h('ul.gl-list', sum.week_goals.map((g) => goalRow(g, { onOpen: open, reload, compact: true })))
      : emptyState({ compact: true, icon: 'calendarDays', title: L('لا أهداف أسبوعية', 'No weekly goals'), body: L('حدّد هدفاً أو هدفين يصنعان فرقاً هذا الأسبوع.', 'Pick one or two goals that make a difference this week.') })));

  // ---- side: privacy, alignment, team
  const side = h('aside.gl-side',
    h('section.card.gl-card.gl-privacy-card', h('div.card-head', h('h2.card-title', icon('shield'), L('خصوصية أهدافك', 'Your goals’ privacy'))),
      h('p.gl-privacy-lead', L(`${nf(sum.private_count, 0)} خاصة · ${nf(sum.shared_count, 0)} مشتركة`, `${nf(sum.private_count, 0)} private · ${nf(sum.shared_count, 0)} shared`)),
      h('p.tiny.muted', sum.shared_with.length
        ? L(`الأهداف المشتركة يراها للقراءة والتشجيع فقط: ${sum.shared_with.map((u) => u.name_ar).join('، ')}. لا يراها غيرهم — ولا الموارد البشرية أو مدير المنصة.`, `Shared goals are read-only for: ${sum.shared_with.map((u) => u.name_en).join(', ')}. Nobody else sees them — not HR, not the platform admin.`)
        : L('لا يوجد مدير يطّلع على أهدافك المشتركة حالياً.', 'No manager currently sees your shared goals.')),
      sum.viewers.length ? h('div', h('div.tiny.faint.gl-mt', L('آخر اطلاع', 'Recent views')), h('ul.gl-viewers', sum.viewers.slice(0, 4).map((v) => h('li', avatar(v.name_ar), h('span.grow', L(v.name_ar, v.name_en)), h('span.tiny.faint', `${v.action === 'comment' ? L('علّق', 'commented') : L('اطّلع', 'viewed')} · ${fmtDate(v.at)}`))))) : h('p.tiny.faint', L('لم يطّلع أحد على أهدافك مؤخراً.', 'Nobody viewed your goals recently.'))),
    h('a.card.gl-card.gl-align-teaser', { href: '#/sys/goals/alignment' },
      ring({ value: sum.current_count ? (sum.aligned_count / sum.current_count) * 100 : null, size: 64, tone: 'emph', label: sum.current_count ? pctText((sum.aligned_count / sum.current_count) * 100) : '—' }),
      h('div.grow', h('strong', L('أهدافك والاستراتيجية', 'Your goals & strategy')), h('div.tiny.muted', L('اربط أهدافك بالأهداف الاستراتيجية لترى أثر عملك', 'Align your goals with strategic objectives to see your impact'))), icon('chevron', 'flip-rtl')),
    sum.team_size ? h('a.card.gl-card.gl-align-teaser', { href: '#/sys/goals/team' }, h('span.gl-team-ic', icon('usersRound')), h('div.grow', h('strong', L('فريقي', 'My team')), h('div.tiny.muted', L(`${nf(sum.team_size, 0)} من فريقك — ترى ما يختارون مشاركته فقط`, `${nf(sum.team_size, 0)} people — you see only what they choose to share`))), icon('chevron', 'flip-rtl')) : null);
  wrap.append(h('div.gl-layout', main, side));
  return wrap;
}

// ================================================================ PERIODS (lanes)
async function renderPeriods(ctx, sum, reload) {
  const r = await call('/lanes');
  const wrap = h('div.gl-periods');
  const open = (g) => go(ctx, 'periods', g.id);
  wrap.append(h('div.gl-lanes', r.lanes.map((lane) => h(`section.gl-lane.l-${lane.type}`, { 'aria-label': typeLabel(lane.type) },
    h('header.gl-lane-head',
      ring({ value: lane.progress, size: 52, tone: lane.total && lane.achieved === lane.total ? 'good' : 'brand', label: lane.progress == null ? '—' : nf(lane.progress, 0), title: L(`متوسط التقدم ${nf(lane.progress, 0)}%`, `Average progress ${nf(lane.progress, 0)}%`) }),
      h('div.grow', h('h3', icon(TYPE[lane.type][2]), typeLabel(lane.type)), h('div.tiny.faint', periodName(lane.type, lane.start, lane.end, r.today)), h('div.tiny', L(`${nf(lane.achieved, 0)} من ${nf(lane.total, 0)} متحققة`, `${nf(lane.achieved, 0)} of ${nf(lane.total, 0)} achieved`)))),
    lane.goals.length ? h('ul.gl-lane-list', lane.goals.map((g) => h('li', h(`button.gl-goal-card.st-${g.status}`, { type: 'button', onclick: () => open(g) },
      h('div.gc-top', statusChip(g.status, STATUS), h('span.grow'), g.visibility === 'manager' ? h('span.gl-shared', { 'aria-label': L('مشترك مع المدير', 'Shared with manager') }, icon('eye')) : h('span.gl-shared', { 'aria-label': L('خاص', 'Private') }, icon('lock'))),
      h('div.gc-title', g.title),
      measureText(g) ? h('div.gc-measure.tiny.faint', measureText(g)) : null,
      h('div.gc-bar', progress(g.progress, { tone: g.status === 'achieved' ? 'good' : g.status === 'missed' ? 'warn' : null, label: L('التقدم', 'Progress') }), h('span.num.tabular', pctText(g.progress))),
      g.objective?.code || g.children.length ? h('div.gc-foot', objChip(g), g.children.length ? h('span.tiny.faint', icon('listChecks'), L(`${nf(g.children.length, 0)} فرعية`, `${nf(g.children.length, 0)} sub`)) : null) : null))))
      : h('div.gl-lane-empty', h('p.tiny.faint', L('لا أهداف لهذه الفترة', 'No goals for this period'))),
    h('button.btn.sm.ghost.gl-lane-add', { type: 'button', onclick: (e) => createDialog(e.currentTarget, { type: lane.type, reload }) }, icon('plus'), L(`هدف ${TYPE[lane.type][0]}`, `${TYPE[lane.type][1]} goal`))))));

  const hist = r.history.filter((g) => ui.history === 'all' || g.status === ui.history);
  wrap.append(h('section.card.gl-card.gl-history',
    h('div.card-head', h('h2.card-title', icon('history'), L('السجل', 'History')), h('span.tiny.faint', L('آخر 120 يوماً', 'Last 120 days')), h('span.grow'),
      h('div.tabs.gl-seg', { role: 'tablist', 'aria-label': L('تصفية السجل', 'Filter history') }, [['all', 'الكل', 'All'], ['achieved', 'متحققة', 'Achieved'], ['missed', 'لم تتحقق', 'Missed']].map(([k, ar, en]) => h(`button${ui.history === k ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(ui.history === k), onclick: () => { ui.history = k; reload(); } }, L(ar, en))))),
    hist.length ? dataTable({
      caption: L('سجل الأهداف السابقة', 'Past goals'),
      columns: [
        { key: 'title', label: L('الهدف', 'Goal'), sort: (g) => g.title, render: (g) => h('div.gl-hist-title', h('strong', g.title), objChip(g)) },
        { key: 'type', label: L('الفترة', 'Period'), sort: (g) => g.period_start, render: (g) => h('div', h('div', typeLabel(g.period_type)), h('div.tiny.faint', periodName(g.period_type, g.period_start, g.period_end, r.today))) },
        { key: 'progress', label: L('التقدم', 'Progress'), sort: (g) => g.progress, render: (g) => h('div.gl-hist-bar', progress(g.progress, { tone: g.status === 'achieved' ? 'good' : null }), h('span.num.tabular', pctText(g.progress))) },
        { key: 'status', label: L('النتيجة', 'Outcome'), sort: (g) => g.status, render: (g) => h('div', statusChip(g.status, STATUS), g.carried_to ? h('span.tiny.faint', ` ${L('نُقل', 'carried')}`) : null) },
      ],
      rows: hist, onRow: open, sortKey: 'type', sortDir: 'desc',
    }) : emptyState({ compact: true, icon: 'history', title: L('لا شيء في السجل بعد', 'Nothing in history yet'), body: L('تظهر هنا أهدافك بعد انتهاء فتراتها.', 'Your goals appear here once their period ends.') })));
  return wrap;
}

// ================================================================ ALIGNMENT
async function renderAlignment(ctx, sum, reload) {
  const a = await call('/alignment');
  const wrap = h('div.gl-align');
  const open = (g) => go(ctx, 'alignment', g.id);
  const pctAligned = a.total ? (a.aligned_count / a.total) * 100 : null;
  wrap.append(h('section.gl-align-hero',
    ring({ value: pctAligned, size: 108, stroke: 10, tone: 'emph', label: pctAligned == null ? '—' : pctText(pctAligned), sub: L('مرتبطة', 'aligned') }),
    h('div.grow', h('h2', L('كيف تخدم أهدافك استراتيجية الجهة', 'How your goals serve the strategy')),
      h('p.muted', L(`${nf(a.aligned_count, 0)} من ${nf(a.total, 0)} أهدافك الحالية والسنوية مرتبطة بهدف استراتيجي. الربط يوضح أثر عملك اليومي في الخطة، ويظهر لمديرك عند مشاركة الهدف.`, `${nf(a.aligned_count, 0)} of ${nf(a.total, 0)} of your current and yearly goals are aligned to a strategic objective. Alignment shows how your daily work moves the plan.`))),
    h('a.btn', { href: '#/sys/strategy/map' }, icon('network'), L('الخريطة الاستراتيجية', 'Strategy map'))));
  const tree = h('div.gl-tree', a.pillars.map((p) => h('section.gl-tree-pillar',
    h('h3.gl-tree-head', icon('layers'), L(p.pillar_ar, p.pillar_en)),
    h('ul.gl-tree-objs', p.objectives.map((o) => h(`li.gl-tree-obj${o.goals.length ? '.has' : ''}`,
      h('div.gl-obj-line', h('span.stg-code', o.code), h('span.grow', L(o.title_ar, o.title_en)), statusChip(o.status, RAG),
        h('button.icon-btn.sm', { type: 'button', 'aria-label': L(`أضف هدفاً يخدم ${o.code}`, `Add a goal serving ${o.code}`), 'data-tip': L('أضف هدفاً يخدم هذا الهدف', 'Add a goal serving this objective'), onclick: (e) => createDialog(e.currentTarget, { type: 'monthly', objectiveId: o.id, reload }) }, icon('plus'))),
      o.goals.length ? h('ul.gl-tree-goals', o.goals.map((g) => h('li', h('button.gl-tree-goal', { type: 'button', onclick: () => open(g) },
        h('span.gl-type', typeLabel(g.period_type)), h('span.grow', g.title), progress(g.progress, { tone: g.status === 'achieved' ? 'good' : null }), h('span.num.tabular.tiny', pctText(g.progress)))))) : null))))));
  wrap.append(h('div.gl-align-grid', h('section.card.gl-card', h('div.card-head', h('h2.card-title', L('شجرة التوافق', 'Alignment tree'))), a.pillars.length ? tree : emptyState({ compact: true, icon: 'compass', title: L('لا توجد خطة استراتيجية نشطة', 'No active strategic plan') })),
    h('section.card.gl-card', h('div.card-head', h('h2.card-title', L('غير مرتبطة', 'Not aligned')), h('span.chip.tiny.outline', nf(a.unaligned.length, 0))),
      a.unaligned.length ? h('ul.gl-list', a.unaligned.map((g) => h('li.gl-row', h('span.gl-type', typeLabel(g.period_type)), h('button.gl-row-main', { type: 'button', onclick: () => open(g) }, h('span.gl-title', g.title), h('span.gl-meta', h('span', L('اضغط لفتح الهدف وربطه من «تعديل»', 'Open the goal and align it via “Edit”')))))))
        : emptyState({ compact: true, icon: 'circleCheck', title: L('كل أهدافك مرتبطة', 'All your goals are aligned'), body: L('ممتاز — عملك يخدم الاستراتيجية مباشرة.', 'Great — your work serves the strategy directly.') }))));
  return wrap;
}

// ================================================================ TEAM (managers)
async function renderTeam(ctx, sum, reload) {
  const t = await call('/team');
  const wrap = h('div.gl-team');
  wrap.append(h('div.callout.sys-banner.confidential', { role: 'note' }, icon('shield'), h('span', L('ترى فقط الأهداف التي اختار أعضاء فريقك مشاركتها معك، للقراءة والتشجيع. الأهداف الخاصة لا تظهر لأحد، ويُسجَّل كل اطلاع ويراه صاحب الهدف.', 'You only see goals your team chose to share with you — read-only, for encouragement. Private goals are never shown, and every view is logged and visible to the goal’s owner.'))));
  if (!t.members.length) { wrap.append(h('div.card', emptyState({ icon: 'usersRound', title: L('لا أعضاء في فريقك', 'No team members'), body: L('يظهر هنا من تكون مديرهم المباشر أو مدير إدارتهم.', 'People you directly manage appear here.') }))); return wrap; }
  wrap.append(h('div.gl-team-grid', t.members.map((m) => h('button.card.gl-member', { type: 'button', onclick: () => go(ctx, 'team', m.id) },
    h('div.gl-member-head', avatar(m.name_ar, 'lg'), h('div.grow', h('strong', L(m.name_ar, m.name_en)), h('div.tiny.faint', L(m.title_ar || '', m.title_en || m.title_ar || '')), h('div.tiny.faint', L(m.dept_ar, m.dept_en))),
      ring({ value: m.progress, size: 56, tone: 'brand', label: m.progress == null ? '—' : nf(m.progress, 0), title: L('متوسط تقدم الأهداف المشتركة', 'Average progress of shared goals') })),
    h('div.gl-member-stats',
      h('span', h('strong.num', nf(m.shared_current, 0)), L('أهداف مشتركة', 'shared goals')),
      h('span', h('strong.num', nf(m.achieved_month, 0)), L('تحققت هذا الشهر', 'achieved this month')),
      h('span', h('strong.num', nf(m.aligned, 0)), L('مرتبطة بالاستراتيجية', 'aligned'))),
    m.top.length ? h('ul.gl-member-top', m.top.map((g) => h('li', h('span.gl-type', typeLabel(g.period_type)), h('span.grow', g.title), h('span.num.tabular.tiny', pctText(g.progress)))))
      : h('p.tiny.faint', L('لم يشارك أهدافاً حالية بعد', 'No shared current goals yet'))))));
  return wrap;
}
async function openMember(ctx, userId, reload) {
  let r;
  try { r = await call(`/team/${encodeURIComponent(userId)}`); } catch (e) { toast(e.message, { kind: 'error' }); history.replaceState(null, '', `#/sys/${ctx.key}/team`); return; }
  const today = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
  const body = h('div.gl-sheet',
    h('div.callout.sys-banner.confidential', icon('eye'), h('span', L('تُعرض الأهداف المشتركة معك فقط. اطلاعك مسجّل ويظهر لصاحب الهدف.', 'Only goals shared with you are shown. Your view is logged and visible to the owner.'))),
    r.goals.length ? h('ul.gl-list', r.goals.map((g) => h(`li.gl-row.st-${g.status}`,
      h('span.gl-check.ro', { 'aria-hidden': 'true' }, icon(g.status === 'achieved' ? 'check' : g.status === 'missed' ? 'clockAlert' : 'circleDot')),
      h('button.gl-row-main', { type: 'button', onclick: () => go(ctx, 'team', userId, g.id) }, h('span.gl-title', g.title),
        h('span.gl-meta', h('span.gl-type', typeLabel(g.period_type)), h('span', periodName(g.period_type, g.period_start, g.period_end, today)), measureText(g) ? h('span.tabular', measureText(g)) : null, objChip(g))),
      h('span.gl-pct.num.tabular', pctText(g.progress)))))
      : emptyState({ compact: true, icon: 'lock', title: L('لا أهداف مشتركة', 'No shared goals'), body: L('لم يشارك هذا الموظف أي هدف معك في الفترة الأخيرة.', 'This person has not shared any goal with you recently.') }));
  if (memberSheet?.el?.isConnected && memberSheet.userId === userId) { memberSheet.setBody(body); return; }
  const sheet = openSheet({ title: L(r.member.name_ar, r.member.name_en), subtitle: `${L(r.member.title_ar || '', r.member.title_en || r.member.title_ar || '')} · ${L(r.member.dept_ar, r.member.dept_en)}`, body, wide: true });
  memberSheet = { ...sheet, userId };
  const obs = new MutationObserver(() => { if (!sheet.el.isConnected) { obs.disconnect(); if (location.hash === `#/sys/${ctx.key}/team/${userId}`) history.replaceState(null, '', `#/sys/${ctx.key}/team`); } });
  obs.observe(document.body, { childList: true });
  void reload; void visChip; void dateTime;
}

const TABS = { today: renderToday, periods: renderPeriods, alignment: renderAlignment, team: renderTeam };
void TYPES;
