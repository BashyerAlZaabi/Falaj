// Internal Audit — «المهام»: engagement board by phase (IA landing).
import { board, statRow, statTile, filterBar, departments, go } from '../../../sys-kit.js';
import { h, icon, L, fmtNum, fmtDate, call, HREF, PHASES, deptChip, qChip, deptName, nextCard, btn, formDialog, toast, demoBadge, personOpt } from './common.js';

const ui = { mine: false, dept: '' }; // survives soft refreshes

export async function load() {
  const y = new Date().getUTCFullYear();
  const [engagements, plan] = await Promise.all([call(`/engagements?year=${y}`), call(`/plan?year=${y}`)]);
  return { engagements, plan };
}

export function header(tab, me, ctx, data) {
  return {
    badges: demoBadge(data?.engagements),
    eyebrow: L(`التدقيق الداخلي · خطة ${me.year}`, `Internal Audit · ${me.year} plan`),
    title: L('مهام التدقيق', 'Audit engagements'),
    sub: L('كل مهمة من التخطيط حتى إغلاق الملاحظات. افتح المهمة لإدارة طلبات المعلومات وأوراق العمل والملاحظات والتقرير.', 'Every engagement from planning to closing its findings. Open one to manage requests, working papers, findings and the report.'),
    actions: [{ label: L('مهمة جديدة', 'New engagement'), icon: 'plus', primary: true, onClick: () => newEngagement(ctx) }],
  };
}

// The single most useful next step for this auditor right now.
function nextStep(me) {
  const c = me.counts; const head = me.roles.head;
  const items = [
    head && c.closures_pending && { n: c.closures_pending, ic: 'fileCheck', ar: `تحقق من إغلاق ${fmtNum(c.closures_pending)} ${c.closures_pending === 1 ? 'ملاحظة منفذة' : 'ملاحظات منفذة'}`, en: `Validate ${c.closures_pending} implemented finding(s)`, href: `${HREF}/findings/decide`, cta: L('تحقق الآن', 'Validate now') },
    head && c.ext_pending && { n: c.ext_pending, ic: 'globe', ar: `${fmtNum(c.ext_pending)} ${c.ext_pending === 1 ? 'طلب' : 'طلبات'} للمدقق الخارجي بانتظار قرارك`, en: `${c.ext_pending} external request(s) awaiting you`, href: `${HREF}/external`, cta: L('افتح الطلبات', 'Open requests') },
    c.requests_to_review && { n: c.requests_to_review, ic: 'mailCheck', ar: `راجع ${fmtNum(c.requests_to_review)} ${c.requests_to_review === 1 ? 'رداً' : 'ردود'} على طلبات المعلومات`, en: `Review ${c.requests_to_review} response(s)`, href: `${HREF}/requests`, cta: L('مراجعة', 'Review') },
    head && c.drafts && { n: c.drafts, ic: 'pencil', ar: `${fmtNum(c.drafts)} ملاحظات مسودة تنتظر الإصدار`, en: `${c.drafts} draft findings to issue`, href: `${HREF}/findings/drafts`, cta: L('مراجعة المسودات', 'Review drafts') },
    c.requests_overdue && { n: c.requests_overdue, ic: 'clockAlert', ar: `تابع ${fmtNum(c.requests_overdue)} ${c.requests_overdue === 1 ? 'طلب معلومات متأخر' : 'طلبات معلومات متأخرة'} مع الإدارات`, en: `Chase ${c.requests_overdue} overdue request(s)`, href: `${HREF}/requests/overdue`, cta: L('المتأخرة', 'Overdue') },
  ].filter(Boolean);
  if (!items.length) return nextCard({ tone: 'good', icon: 'circleCheck', title: L('لا شيء عاجل — كل شيء ضمن موعده', 'Nothing urgent — everything is on time'), body: L('واصل العمل الميداني في مهامك الجارية.', 'Carry on with fieldwork in your open engagements.') });
  const [first, ...rest] = items;
  return nextCard({
    tone: first.ic === 'clockAlert' ? 'warn' : 'emph', icon: first.ic, title: L(first.ar, first.en),
    body: rest.length ? h('span.aud-next-more', L('وأيضاً: ', 'Also: '), rest.map((r, i) => [i ? h('span.faint', ' · ') : null, h('a', { href: r.href }, L(r.ar, r.en))])) : null,
    action: btn(first.cta, { primary: true, href: first.href }),
  });
}

function engagementCard(e) {
  const f = e.findings;
  return h('a.board-card.aud-ecard', { href: `${HREF}/e/${e.id}`, 'aria-label': `${e.title} — ${deptName(e.department)}` },
    h('div.aud-ecard-top', deptChip(e.department), qChip(e.quarter), e.mine ? h('span.chip.tiny.info', icon('user'), L('مهمتي', 'Mine')) : null),
    h('div.bc-title', e.title),
    h('div.aud-phasebar', { 'aria-hidden': 'true' }, PHASES.slice(1).map((p, i) => h(`i${i < e.phase_index ? '.on' : ''}`))),
    h('div.bc-meta',
      e.lead ? h('span.aud-lead', icon('userCheck'), L(e.lead.name_ar, e.lead.name_en)) : null,
      e.team.length > 1 ? h('span.faint', L(`+${fmtNum(e.team.length - 1)}`, `+${e.team.length - 1}`)) : null),
    (f.total || e.requests.open) ? h('div.aud-ecard-foot',
      f.high ? h('span.aud-pill.risk-high', { 'data-tip': L('ملاحظات عالية الخطورة', 'High-risk findings') }, icon('flame'), fmtNum(f.high)) : null,
      f.medium ? h('span.aud-pill.risk-medium', { 'data-tip': L('ملاحظات متوسطة الخطورة', 'Medium-risk findings') }, icon('alert'), fmtNum(f.medium)) : null,
      f.low ? h('span.aud-pill.risk-low', { 'data-tip': L('ملاحظات منخفضة الخطورة', 'Low-risk findings') }, icon('circleDot'), fmtNum(f.low)) : null,
      f.drafts ? h('span.aud-pill', { 'data-tip': L('مسودات', 'Drafts') }, icon('pencil'), fmtNum(f.drafts)) : null,
      h('span.grow'),
      e.requests.overdue ? h('span.aud-pill.late', { 'data-tip': L('طلبات معلومات متأخرة', 'Overdue information requests') }, icon('clockAlert'), fmtNum(e.requests.overdue)) : e.requests.to_review ? h('span.aud-pill.emph', { 'data-tip': L('ردود للمراجعة', 'Responses to review') }, icon('mailCheck'), fmtNum(e.requests.to_review)) : null)
      : h('div.aud-ecard-foot.faint.tiny', e.phase === 'planned' ? [icon('calendar'), e.start_date ? L(`يبدأ ${fmtDate(e.start_date)}`, `Starts ${fmtDate(e.start_date)}`) : L('لم يُحدد موعد البدء', 'Start not set')] : e.phase === 'closed' ? [icon('badgeCheck'), L('أُغلقت جميع الملاحظات', 'All findings closed')] : [icon('scanSearch'), L('لا ملاحظات بعد', 'No findings yet')]));
}

export function paint(tab, me, ctx, { engagements, plan }) {
  const open = engagements.filter((e) => !['planned', 'closed'].includes(e.phase));
  const highOpen = engagements.reduce((n, e) => n + (e.phase !== 'closed' ? e.findings.high : 0), 0);
  const overdueReq = engagements.reduce((n, e) => n + e.requests.overdue, 0);
  const issued = engagements.filter((e) => e.report_issued_at).length;
  const depts = [...new Map(engagements.map((e) => [e.department_id, e.department])).values()];
  const refresh = () => { const b = document.querySelector('.aud-board-wrap'); if (b) b.replaceChildren(drawBoard()); };
  const drawBoard = () => {
    const rows = engagements.filter((e) => (!ui.mine || e.mine) && (!ui.dept || e.department_id === ui.dept));
    const closed = rows.filter((e) => e.phase === 'closed');
    return h('div.stack', board(PHASES.filter((p) => p.key !== 'closed').map((p) => ({ key: p.key, ar: p.ar, en: p.en, tone: p.key === 'follow_up' ? 'sand' : p.key === 'reporting' ? 'emph' : p.key === 'planned' ? null : 'info' })), rows, {
      columnOf: (e) => e.phase, renderCard: engagementCard, emptyText: L('لا مهام', 'None'),
    }), closed.length ? h('section.aud-closed', { 'aria-label': L('مهام مغلقة', 'Closed engagements') }, h('span.aud-closed-label', icon('badgeCheck'), L('مغلقة هذا العام', 'Closed this year'), h('span.count.num', fmtNum(closed.length))),
      closed.map((e) => h('a.aud-closed-item', { href: `${HREF}/e/${e.id}` }, h('span.grow', e.title), h('span.tiny.faint', `${deptName(e.department)}${e.closed_at ? ` · ${fmtDate(e.closed_at)}` : ''}`)))) : null);
  };
  return h('div.aud-board-page',
    nextStep(me),
    statRow([
      statTile({ label: L('مهام جارية', 'Open engagements'), value: open.length, icon: 'kanban', hint: L(`${fmtNum(open.filter((e) => e.mine).length)} منها لك`, `${open.filter((e) => e.mine).length} are yours`) }),
      statTile({ label: L('ملاحظات عالية الخطورة', 'High-risk findings'), value: highOpen, icon: 'flame', tone: highOpen ? 'emph' : 'good', hint: L('في المهام غير المغلقة', 'In engagements not yet closed'), href: `${HREF}/findings` }),
      statTile({ label: L('طلبات معلومات متأخرة', 'Overdue requests'), value: overdueReq, icon: 'clockAlert', tone: overdueReq ? 'warn' : 'good', href: `${HREF}/requests/overdue` }),
      statTile({ label: L('إنجاز الخطة', 'Plan delivery'), value: `${fmtNum(issued)}/${fmtNum(engagements.length)}`, icon: 'radar', hint: L(`تقارير صادرة · الخطة ${plan.plan.status === 'approved' ? 'معتمدة' : 'غير معتمدة بعد'}`, `Reports issued · plan ${plan.plan.status === 'approved' ? 'approved' : 'not approved yet'}`), href: `${HREF}/plan` }),
    ]),
    filterBar({
      selects: [{ label: L('الإدارة', 'Department'), value: ui.dept, options: [{ value: '', label: L('كل الإدارات', 'All departments') }, ...depts.map((d) => ({ value: d.id, label: deptName(d) }))], onChange: (v) => { ui.dept = v; refresh(); } }],
      extra: [h('label.check-label.aud-toggle', h('input.switch', { type: 'checkbox', checked: ui.mine || null, onchange: (e) => { ui.mine = e.target.checked; refresh(); } }), L('مهامي فقط', 'Only mine'))],
    }),
    h('div.aud-board-wrap', drawBoard()));
}

// ---------------- new engagement ----------------
export async function newEngagement(ctx, { universe } = {}) {
  const y = new Date().getUTCFullYear();
  const [plan, people, depts] = await Promise.all([call(`/plan?year=${y}`), call('/people'), departments()]);
  const v = await formDialog({
    title: L('مهمة تدقيق جديدة', 'New audit engagement'), wide: true,
    intro: plan.plan.status === 'approved' ? L('الخطة معتمدة؛ ستُعلَّم المهمة الجديدة «مضافة بعد الاعتماد» ليطّلع عليها رئيس التدقيق ولجنة التدقيق.', 'The plan is approved; the new engagement will be flagged “added after approval”.') : null,
    values: { universe_id: universe?.id, department_id: universe?.department_id, title: universe ? L(`تدقيق ${universe.name_ar}`, `Audit of ${universe.name_en || universe.name_ar}`) : '', quarter: String(Math.min(4, Math.floor(new Date().getUTCMonth() / 3) + 2)), lead_id: ctx.user.id },
    fields: [
      { name: 'universe_id', type: 'select', label: L('عنصر مجال التدقيق', 'Audit universe item'), options: plan.universe.map((u) => ({ value: u.id, label: `${deptName(u.department)} — ${L(u.name_ar, u.name_en || u.name_ar)} (${u.score})` })), placeholder: L('— بدون (مهمة خاصة) —', '— None (special engagement) —') },
      { name: 'department_id', type: 'select', label: L('الإدارة الخاضعة للتدقيق', 'Auditee department'), options: depts.filter((d) => d.id !== 'dept_ia').map((d) => ({ value: d.id, label: L(d.name_ar, d.name_en) })), help: L('تُستنتج من عنصر مجال التدقيق إن اخترته', 'Derived from the universe item when chosen') },
      { name: 'title', label: L('عنوان المهمة', 'Title'), required: true, full: true, maxLength: 200 },
      { name: 'quarter', type: 'select', label: L('ربع التنفيذ', 'Quarter'), required: true, options: [1, 2, 3, 4].map((q) => ({ value: String(q), label: L(`الربع ${q}`, `Q${q}`) })) },
      { name: 'lead_id', type: 'select', label: L('قائد المهمة', 'Lead auditor'), required: true, options: people.auditors.map(personOpt) },
      { name: 'start_date', type: 'date', label: L('تاريخ البدء المخطط', 'Planned start') },
      { name: 'end_date', type: 'date', label: L('تاريخ الانتهاء المخطط', 'Planned end') },
      { name: 'team', type: 'multiselect', label: L('فريق التدقيق', 'Audit team'), options: people.auditors.map(personOpt) },
      { name: 'scope', type: 'textarea', label: L('النطاق', 'Scope'), rows: 3, maxLength: 3000 },
      { name: 'objectives', type: 'textarea', label: L('الأهداف', 'Objectives'), rows: 3, maxLength: 3000 },
    ],
    submitLabel: L('إنشاء المهمة', 'Create engagement'),
  });
  if (!v) return;
  const u = plan.universe.find((x) => x.id === v.universe_id);
  const department_id = u ? u.department.id : v.department_id;
  if (!department_id) { toast(L('اختر الإدارة الخاضعة للتدقيق أو عنصراً من مجال التدقيق', 'Choose the auditee department or a universe item'), { kind: 'error' }); return; }
  try {
    const e = await call('/engagements', { method: 'POST', body: { title: v.title, department_id, universe_id: v.universe_id || undefined, quarter: Number(v.quarter), lead_id: v.lead_id, team: v.team, scope: v.scope || undefined, objectives: v.objectives || undefined, start_date: v.start_date || undefined, end_date: v.end_date || undefined } });
    toast(L('أُنشئت المهمة', 'Engagement created'));
    go(ctx, 'e', e.id);
  } catch (err) { toast(err.message, { kind: 'error' }); }
}
