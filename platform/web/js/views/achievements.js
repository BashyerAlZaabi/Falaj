// "رحلة التميّز" — achievements: level, weekly rings, streak, quests, badges,
// department challenge, opt-in colleague board, transparent rules.
import { api } from '../api.js';
import { h, icon, toast, emptyState, skeleton } from '../ui.js';
import { L, fmtNum, fmtDate } from '../i18n.js';
import { ringsSvg, ringLegend, levelOrb, xpBar, questList, badgeTile, loadGame } from '../game.js';
import { state } from '../state.js';

const KIND = { task_done: ['إنجاز مهمة', 'Task completed'], on_time: ['في الموعد', 'On time'], early: ['إنجاز مبكر', 'Early delivery'], priority: ['أولوية عالية', 'High priority'], backlog: ['إغلاق متأخرة', 'Cleared overdue'], progress: ['تحديث نسبة إنجاز', 'Progress update'], document: ['مستند', 'Document'], review: ['مراجعة عمل وكيل', 'Agent review'], agent: ['بناء وكيل', 'Agent built'], quest: ['مهمة يومية', 'Daily quest'] };
const QUEST = { clear_overdue: ['إغلاق متأخرة', 'Clear overdue'], priority_task: ['مهمة ذات أولوية', 'Priority task'], update_progress: ['تحديث نسبة إنجاز', 'Update progress'], review_agents: ['مراجعة الوكلاء', 'Review agents'], deliver_one: ['إنجاز مهمة', 'Deliver one'] };

// Kinds from enterprise systems (goals, ideas, disclosures…) carry their own labels in the rules.
function kindLabel(kind, rules) {
  if (KIND[kind]) return L(...KIND[kind]);
  const r = rules.find((x) => x.key === kind);
  return r ? L(r.ar, r.en) : kind;
}

export async function renderAchievements(root) {
  const [g, team] = await Promise.all([loadGame(), api('/api/game/team')]);
  const u = state.me.user;
  root.append(h('header.page-head',
    h('div', h('span.eyebrow', L('إنجازاتي', 'My achievements')), h('h1', L('رحلة التميّز', 'Excellence journey')),
      h('p.sub', L('نقاطك محسوبة تلقائياً من عملك الفعلي في المنصة: الالتزام بالمواعيد، إغلاق المتأخرات، شفافية التقدم، وجودة التوثيق. لا يمكن إدخالها يدوياً، وتُلغى عند التراجع عن الإجراء.', 'Your points are computed automatically from real work: on-time delivery, clearing backlog, transparent progress, quality documentation. They cannot be entered manually and are removed if an action is undone.'))),
    h('div.actions', h('a.btn', { href: '#/tasks' }, icon('check'), L('مهامي', 'My tasks')))));

  // Hero: level · rings · streak
  const heat = h('div.heat', { role: 'img', 'aria-label': L('نشاط آخر 4 أسابيع', 'Activity, last 4 weeks') }, g.heat.map((d) => h('i', { class: d.weekend ? 'we' : '', 'data-l': d.xp === 0 ? 0 : d.xp < 20 ? 1 : d.xp < 45 ? 2 : 3, title: `${fmtDate(d.day)} · ${d.xp}` })));
  root.append(h('div.game-hero-grid',
    h('section.card.level-card', levelOrb(g, { size: 'lg' }), h('div.grow', h('span.eyebrow', L('المستوى الحالي', 'Current level')), xpBar(g),
      h('div.level-stats', h('div', h('strong.tabular.num', `+${fmtNum(g.today_xp)}`), h('span', L('اليوم', 'Today'))), h('div', h('strong.tabular.num', `+${fmtNum(g.week_xp)}`), h('span', L('هذا الأسبوع', 'This week'))), h('div', h('strong.tabular', fmtNum(g.xp)), h('span', L('الإجمالي', 'Total')))))),
    h('section.card.rings-card', h('h2.card-title', L('حلقات الأسبوع', 'This week’s rings')), h('div.rings-wrap', ringsSvg(g.rings, 176), ringLegend(g.rings)),
      h('div.tiny.faint', L(`هدف الإنجاز الأسبوعي: ${g.prefs.weekly_goal} مهام`, `Weekly delivery goal: ${g.prefs.weekly_goal} tasks`), ' · ', h('button.linklike', { type: 'button', onclick: () => editGoal(g) }, L('تعديل', 'Edit')))),
    h('section.card.streak-card', h('h2.card-title', L('السلسلة', 'Streak')),
      h('div.streak-big', h('span.flame', icon('zap')), h('span.t-numeral.tabular', String(g.streak.current)), h('span.muted', L('يوم عمل متتالٍ', 'working-day streak'))),
      h('div.tiny.faint', L(`أفضل سلسلة: ${g.streak.best} · عطلة نهاية الأسبوع لا تقطع السلسلة`, `Best: ${g.streak.best} · weekends never break it`)), heat)));

  // Quests + badges
  const earned = g.badges.filter((b) => b.earned).length;
  root.append(h('div.game-two',
    h('section.card', h('div.card-head', h('h2.card-title', L('مهام اليوم', 'Today’s quests')), h('span.chip.purple', icon('target'), L(`${g.quests.filter((q) => q.done).length}/${g.quests.length} مكتملة`, `${g.quests.filter((q) => q.done).length}/${g.quests.length} done`))),
      h('p.tiny.faint', L('مهام يومية مبنية على وضع عملك الحالي — كل واحدة تمنح 15 نقطة عند إكمالها فعلياً.', 'Daily quests built from your current work — each gives 15 points when actually completed.')), questList(g.quests)),
    h('section.card', h('div.card-head', h('h2.card-title', L('الشارات', 'Badges')), h('span.chip.info', `${earned}/${g.badges.length}`)),
      h('div.badges', [...g.badges].sort((a, b) => Number(b.earned) - Number(a.earned) || b.progress - a.progress).map(badgeTile)))));

  // Team challenge + boards
  const ch = team.challenge;
  const peopleBoard = h('div');
  const drawPeople = (t) => peopleBoard.replaceChildren(
    h('div.optin', h('label.check-label', h('input.switch', { type: 'checkbox', checked: t.opted_in || null, 'aria-describedby': 'optin-help', onchange: async (e) => {
      const r = await api('/api/game/prefs', { method: 'PUT', body: { leaderboard_opt_in: e.target.checked } }).catch((err) => { toast(err.message, { kind: 'error' }); return null; });
      if (!r) return; toast(e.target.checked ? L('انضممت إلى لوحة زملاء إدارتك', 'You joined your department board') : L('أُخفيت من لوحة الزملاء', 'You left the colleague board'));
      drawPeople(await api('/api/game/team'));
    } }), L('أظهرني في لوحة زملاء إدارتي', 'Show me on my department board'))),
    h('p.tiny.faint#optin-help', L('اختياري تماماً. تظهر فقط نقاط هذا الأسبوع لمن اختار الظهور من إدارتك، ولا تُعرض تفاصيل عملك لأحد.', 'Fully optional. Only this week’s points of colleagues in your department who opted in are shown; nobody sees your work details.')),
    t.people.length ? h('ol.people-board', t.people.map((p, i) => h(`li${p.me ? '.me' : ''}`, h('span.rank.tabular', String(i + 1)), h('span.grow', L(p.name_ar, p.name_en), p.me ? h('span.chip.tiny.info', L('أنت', 'You')) : null), h('strong.tabular', `${fmtNum(p.week_xp)}`), h('span.tiny.faint', L('نقطة', 'pts'))))) : emptyState({ compact: true, icon: 'people', title: L('لا أحد في اللوحة بعد', 'Nobody on the board yet'), body: L('عندما يختار زملاؤك الظهور ستراهم هنا.', 'Colleagues appear here when they opt in.') }));
  drawPeople(team);
  root.append(h('div.game-two',
    h('section.card.challenge', h('div.card-head', h('h2.card-title', L('تحدي الإدارة', 'Department challenge')), h('span.chip.outline', L('هذا الأسبوع', 'This week'))),
      ch ? [h('div.ch-title', L(`${ch.ar} — ${ch.department_ar}`, `${ch.en} — ${ch.department_en}`)),
        h('div.ch-meter', h('div.progress.lg', { role: 'progressbar', 'aria-valuenow': ch.value ?? 0, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { class: (ch.value ?? 0) >= ch.goal ? 'good' : '', style: { width: `${Math.min(100, ch.value ?? 0)}%` } }), h('span.goal-mark', { style: { insetInlineStart: `${ch.goal}%` } })),
          h('div.row', h('strong.t-title3.tabular', ch.value == null ? '—' : `${ch.value}%`), h('span.muted', L(`الهدف ${ch.goal}% · ${ch.week_done} مهمة أُنجزت`, `Goal ${ch.goal}% · ${ch.week_done} tasks done`))))] : null,
      h('div.section', { style: { marginTop: 'var(--space-6)' } }, L('ترتيب الإدارات', 'Department standings'), h('span.count', L('(متوسط النقاط لكل عضو)', '(avg points per member)'))),
      h('ol.dept-board', team.departments.map((d) => h(`li${d.mine ? '.mine' : ''}`, h('span.rank.tabular', String(d.rank)), h('span.grow', L(d.name_ar, d.name_en)), h('span.tiny.faint.tabular', d.on_time_rate == null ? '—' : L(`التزام ${d.on_time_rate}%`, `${d.on_time_rate}% on time`)), h('strong.tabular', fmtNum(d.xp_per_member)))))),
    h('section.card', h('h2.card-title', L('لوحة الزملاء (اختيارية)', 'Colleague board (opt-in)')), peopleBoard)));

  // History + rules
  root.append(h('div.game-two',
    h('section.card', h('h2.card-title', L('آخر النقاط', 'Recent points')),
      g.recent.length ? h('ul.list.xp-list', g.recent.map((e) => h('li', h('span.xp-kind', icon(e.kind === 'quest' ? 'target' : e.kind === 'document' ? 'doc' : e.kind === 'review' || e.kind === 'agent' ? 'bot' : e.kind === 'progress' ? 'gauge' : 'check')),
        h('span.grow', h('span.title', e.kind === 'quest' ? L(...(QUEST[e.ref] || [e.ref, e.ref])) : e.ref), h('span.meta', `${kindLabel(e.kind, g.rules)} · ${fmtDate(e.day)}`)), h('strong.xp-plus.tabular.num', `+${e.points}`))))
        : emptyState({ compact: true, icon: 'sparkle', title: L('ابدأ رحلتك', 'Start your journey'), body: L('أنجز مهمة في موعدها لتكسب أول نقاطك.', 'Complete a task on time to earn your first points.'), actions: [{ label: L('افتح مهامي', 'Open my tasks'), primary: true, onClick: () => { location.hash = '#/tasks'; } }] })),
    h('section.card', h('h2.card-title', L('كيف تُحتسب النقاط؟', 'How points work')),
      h('ul.rules', g.rules.map((r) => h('li', h('span.grow', L(r.ar, r.en)), h('strong.tabular.num', `+${r.points}`)))),
      h('p.tiny.faint', L(`الحد الأقصى ${g.daily_cap} نقطة يومياً لضمان العدالة. المكافأة على جودة العمل وتوقيته لا على كثرته.`, `Capped at ${g.daily_cap} points per day for fairness. Quality and timeliness are rewarded, not volume.`)),
      h('div.levels', g.levels.map((l) => h(`span.lv${l.n === g.level.n ? '.on' : l.n < g.level.n ? '.past' : ''}`, h('b', String(l.n)), L(l.ar, l.en), h('em.tabular', fmtNum(l.xp))))))));
  void u; void skeleton;
}

async function editGoal(g) {
  const { modal } = await import('../ui.js');
  const inp = h('input.field', { type: 'number', min: 1, max: 40, value: g.prefs.weekly_goal });
  const ok = await modal(L('هدف الإنجاز الأسبوعي', 'Weekly delivery goal'), h('div', h('label.lbl', L('عدد المهام أسبوعياً', 'Tasks per week')), inp, h('p.helper', L('اختر هدفاً واقعياً يناسب طبيعة عملك.', 'Pick a realistic goal for your role.'))), [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('حفظ', 'Save'), value: true, primary: true }]);
  if (!ok) return;
  await api('/api/game/prefs', { method: 'PUT', body: { weekly_goal: Number(inp.value) } });
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
