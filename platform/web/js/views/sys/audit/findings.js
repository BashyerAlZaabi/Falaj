// Internal Audit — finding lists by persona:
//  «الملاحظات» (IA: every finding, quick views + filters),
//  «ملاحظات إدارتي» (auditee manager: issued findings of my departments),
//  «خطط المعالجة» (employee: action plans assigned to me).
import { statRow, statTile, filterBar, dataTable } from '../../../sys-kit.js';
import { segmented } from '../../../ui.js';
import { h, icon, L, fmtNum, call, HREF, riskChip, findingChip, actionChip, deptName, dueLabel, emptyState, nextCard, btn, phaseChip, demoBadge } from './common.js';

const ui = { q: '', risk: '', dept: '' };

export async function load(tab) {
  if (tab === 'actions') return { findings: await call('/findings?mine=1') };
  if (tab === 'mine') { const [findings, engagements] = await Promise.all([call('/findings'), call('/engagements')]); return { findings, engagements }; }
  return { findings: await call('/findings') };
}
export function header(tab, me, ctx, data) {
  const badges = demoBadge(data?.findings);
  if (tab === 'mine') return { badges, eyebrow: L('التدقيق الداخلي', 'Internal Audit'), title: L('ملاحظات إدارتي', 'My department’s findings'), sub: L('الملاحظات الصادرة على إدارتك: قدّم الرد وخطة المعالجة، وتابع التنفيذ حتى يعتمد التدقيق الداخلي الإغلاق.', 'Issued findings for your department: respond with an action plan and follow it until Internal Audit validates closure.') };
  if (tab === 'actions') return { badges, eyebrow: L('التدقيق الداخلي', 'Internal Audit'), title: L('خطط المعالجة المسندة إليك', 'Your action plans'), sub: L('إجراءات تصحيحية أسندتها إليك إدارتك استجابةً لملاحظات التدقيق. أبلغ بالتنفيذ مع الدليل قبل تاريخ الاستحقاق.', 'Corrective actions your department assigned to you. Report implementation with evidence before the due date.') };
  return { badges, eyebrow: L(`التدقيق الداخلي · ${me.year}`, `Internal Audit · ${me.year}`), title: L('الملاحظات', 'Findings'), sub: L('كل ملاحظات التدقيق من المسودة حتى الإغلاق. المسودات تبقى داخل مكتب التدقيق حتى يصدرها رئيس التدقيق.', 'Every finding from draft to closure. Drafts stay inside IA until the CAE issues them.') };
}

// Card used by the auditee and action-owner views.
function findingCard(f, { cta } = {}) {
  const a = f.action;
  return h(`article.card.aud-fcard${a?.overdue ? '.late' : ''}`,
    h('div.aud-req-head', riskChip(f.risk), findingChip(f.status), h('span.grow'), h('span.tiny.faint', f.ref)),
    h('h3.aud-req-title', { dir: 'auto' }, h('a', { href: `${HREF}/f/${f.id}` }, f.title)),
    h('p.aud-para.muted.aud-clamp', { dir: 'auto' }, f.recommendation),
    a ? h('div.aud-fcard-action', icon('listChecks'), h('span.grow.aud-clamp1', a.description), actionChip(a.status), dueLabel(a.due_date, { done: ['implemented', 'closed'].includes(a.status) })) : null,
    h('div.aud-fcard-foot', h('span.tiny.faint', `${f.engagement.title} · ${deptName(f.department)}`), h('span.grow'), a?.owner && !a.mine ? h('span.tiny.faint', icon('user'), L(a.owner.name_ar, a.owner.name_en)) : null,
      cta || btn(L('فتح', 'Open'), { sm: true, tertiary: true, href: `${HREF}/f/${f.id}` })));
}
const section = (title, list, opts = {}) => (list.length ? h(opts.collapsed ? 'details.aud-group' : 'section.aud-group', h(opts.collapsed ? 'summary.section' : 'div.section', title, h('span.count', fmtNum(list.length))), h('div.aud-fgrid', list.map((f) => findingCard(f, { cta: opts.cta?.(f) })))) : null);

function paintMine(me, { findings, engagements }) {
  const awaiting = findings.filter((f) => f.status === 'issued');
  const follow = findings.filter((f) => f.status === 'in_follow_up');
  const impl = findings.filter((f) => f.status === 'implemented');
  const closed = findings.filter((f) => f.status === 'closed');
  const overdue = findings.filter((f) => f.action?.overdue);
  const next = awaiting.length
    ? nextCard({ tone: 'warn', icon: 'messageSquare', title: L(`${fmtNum(awaiting.length)} ${awaiting.length === 1 ? 'ملاحظة صادرة بانتظار ردك' : 'ملاحظات صادرة بانتظار ردك'}`, `${awaiting.length} issued finding(s) awaiting your response`), body: L('قدّم موقف الإدارة وخطة المعالجة ومسؤول التنفيذ وتاريخه.', 'Give your position, action plan, owner and date.'), action: btn(L('الرد الآن', 'Respond now'), { primary: true, href: `${HREF}/f/${awaiting[0].id}` }) })
    : overdue.length ? nextCard({ tone: 'warn', icon: 'clockAlert', title: L(`${fmtNum(overdue.length)} ${overdue.length === 1 ? 'خطة معالجة متأخرة' : 'خطط معالجة متأخرة'} في إدارتك`, `${overdue.length} overdue action plan(s)`), body: L('تابع مع المسؤولين عن التنفيذ وحدّث الحالة.', 'Follow up with the owners.'), action: btn(L('عرض المتأخرة', 'Show overdue'), { primary: true, href: `${HREF}/f/${overdue[0].id}` }) })
      : findings.length ? nextCard({ tone: 'good', icon: 'circleCheck', title: L('لا شيء بانتظارك الآن', 'Nothing awaiting you'), body: L('ستصلك تنبيهات عند صدور ملاحظات جديدة أو طلبات معلومات.', 'You’ll be alerted to new findings or information requests.') }) : null;
  const engs = (engagements || []).filter((e) => e.phase !== 'closed');
  return h('div.aud-mine',
    next,
    findings.length ? statRow([
      statTile({ label: L('بانتظار ردك', 'Awaiting your response'), value: awaiting.length, icon: 'messageSquare', tone: awaiting.length ? 'warn' : 'good' }),
      statTile({ label: L('قيد المعالجة', 'In follow-up'), value: follow.length, icon: 'listChecks' }),
      statTile({ label: L('خطط متأخرة', 'Overdue plans'), value: overdue.length, icon: 'clockAlert', tone: overdue.length ? 'warn' : 'good' }),
      statTile({ label: L('مغلقة', 'Closed'), value: closed.length, icon: 'badgeCheck', tone: 'good' }),
    ]) : null,
    engs.length ? h('section.aud-group', h('div.section', L('مهام التدقيق الجارية على إدارتك', 'Engagements on your department'), h('span.count', fmtNum(engs.length))),
      h('div.aud-engs', engs.map((e) => h('a.card.interactive.aud-eng-mini', { href: `${HREF}/e/${e.id}` }, h('div.row', phaseChip(e.phase), h('span.grow'), e.requests.open ? h('span.chip.tiny.warn', icon('mailCheck'), L(`${fmtNum(e.requests.open)} طلب مفتوح`, `${e.requests.open} open requests`)) : null), h('div.aud-eng-mini-title', e.title), h('div.tiny.faint', L(`فريق التدقيق: ${e.lead?.name_ar || '—'}`, `Lead: ${e.lead?.name_en || '—'}`)))))) : null,
    findings.length ? [
      section(L('بانتظار ردك', 'Awaiting your response'), awaiting, { cta: (f) => btn(L('الرد', 'Respond'), { sm: true, primary: true, href: `${HREF}/f/${f.id}` }) }),
      section(L('قيد المعالجة', 'In follow-up'), follow),
      section(L('منفذة — بانتظار تحقق التدقيق', 'Implemented — awaiting validation'), impl),
      section(L('مغلقة', 'Closed'), closed, { collapsed: true }),
    ] : h('div.card', emptyState({ icon: 'searchCheck', title: L('لا ملاحظات صادرة على إدارتك', 'No issued findings for your department'), body: L('تظهر هنا ملاحظات التدقيق بعد أن يصدرها رئيس التدقيق الداخلي؛ المسودات لا تُعرض خارج مكتب التدقيق.', 'Findings appear here once issued by the CAE; drafts never leave Internal Audit.') })));
}

function paintActions(me, { findings }) {
  const open = findings.filter((f) => f.status === 'in_follow_up');
  const waiting = findings.filter((f) => f.status === 'implemented');
  const closed = findings.filter((f) => f.status === 'closed');
  const overdue = open.filter((f) => f.action?.overdue);
  const first = [...open].sort((a, b) => a.action.due_date.localeCompare(b.action.due_date))[0];
  return h('div.aud-actions',
    first ? nextCard({ tone: overdue.length ? 'warn' : 'emph', icon: overdue.length ? 'clockAlert' : 'listChecks', title: overdue.length ? L(`${fmtNum(overdue.length)} ${overdue.length === 1 ? 'خطة متأخرة' : 'خطط متأخرة'} — حدّث حالتها`, `${overdue.length} overdue — update them`) : L('نفّذ خطتك التالية قبل موعدها', 'Deliver your next plan on time'),
      body: h('span', h('strong', first.title), ' · ', dueLabel(first.action.due_date)), action: btn(L('تحديث الحالة', 'Update status'), { primary: true, href: `${HREF}/f/${first.id}` }) })
      : findings.length ? nextCard({ tone: 'good', icon: 'circleCheck', title: L('لا خطط مفتوحة بانتظارك', 'No open plans'), body: L('أحسنت! تابع ما ينتظر تحقق التدقيق الداخلي.', 'Well done — some may await IA validation.') }) : null,
    findings.length ? statRow([
      statTile({ label: L('مفتوحة', 'Open'), value: open.length, icon: 'listChecks' }),
      statTile({ label: L('متأخرة', 'Overdue'), value: overdue.length, icon: 'clockAlert', tone: overdue.length ? 'warn' : 'good' }),
      statTile({ label: L('بانتظار التحقق', 'Awaiting validation'), value: waiting.length, icon: 'hourglass' }),
      statTile({ label: L('مغلقة في موعدها', 'Closed'), value: closed.length, icon: 'award', tone: 'good', hint: L('+10 نقاط لكل خطة نُفذت في موعدها', '+10 points per on-time plan') }),
    ]) : null,
    findings.length ? [section(L('بانتظار تنفيذك', 'To implement'), open), section(L('منفذة — بانتظار التحقق', 'Implemented — awaiting validation'), waiting), section(L('مغلقة', 'Closed'), closed, { collapsed: true })]
      : h('div.card', emptyState({ icon: 'listChecks', title: L('لا خطط معالجة مسندة إليك', 'No action plans assigned to you'), body: L('عندما تُسند إليك إدارتك إجراءً تصحيحياً لملاحظة تدقيق صادرة، سيظهر هنا مع تنبيه. لا تُعرض عليك أي بيانات تدقيق أخرى.', 'When your department assigns you a corrective action for an issued finding, it appears here with an alert. No other audit data is shown to you.') })));
}

const QUICK = [
  { key: 'open', ar: 'المفتوحة', en: 'Open', test: (f) => ['issued', 'in_follow_up', 'implemented'].includes(f.status) },
  { key: 'decide', ar: 'بانتظار قراري', en: 'My decisions', head: true, test: (f, me) => (f.status === 'implemented' || f.status === 'draft') && f.raised_by?.id !== me.user },
  { key: 'drafts', ar: 'المسودات', en: 'Drafts', test: (f) => f.status === 'draft' },
  { key: 'overdue', ar: 'المتأخرة', en: 'Overdue', test: (f) => f.action?.overdue },
  { key: 'closed', ar: 'المغلقة', en: 'Closed', test: (f) => f.status === 'closed' },
  { key: 'all', ar: 'الكل', en: 'All', test: () => true },
];
function paintIA(me, ctx, { findings }) {
  const quick = QUICK.filter((q) => !q.head || me.roles.head);
  const cur = quick.find((q) => q.key === ctx.params[1]) || quick[0];
  const meRef = { user: ctx.user.id };
  const depts = [...new Map(findings.map((f) => [f.department.id, f.department])).values()];
  const rows = () => findings.filter((f) => cur.test(f, meRef) && (!ui.risk || f.risk === ui.risk) && (!ui.dept || f.department.id === ui.dept) && (!ui.q || `${f.title} ${f.ref} ${f.engagement.title}`.toLowerCase().includes(ui.q.toLowerCase())));
  const tableWrap = h('div');
  const draw = () => tableWrap.replaceChildren(dataTable({
    caption: L('الملاحظات', 'Findings'), rows: rows(), onRow: (f) => { location.hash = `${HREF}/f/${f.id}`; },
    empty: emptyState({ compact: true, icon: 'searchCheck', title: L('لا ملاحظات مطابقة', 'No matching findings') }),
    columns: [
      { key: 'title', label: L('الملاحظة', 'Finding'), render: (f) => h('div.aud-cell-title', h('a', { href: `${HREF}/f/${f.id}` }, f.title), h('div.tiny.faint', `${f.ref} · ${f.engagement.title}`)), sort: (f) => f.title },
      { key: 'dept', label: L('الإدارة', 'Department'), render: (f) => deptName(f.department), sort: (f) => f.department.name_ar },
      { key: 'risk', label: L('الخطورة', 'Risk'), render: (f) => riskChip(f.risk, { prefix: false }), sort: (f) => ({ high: 0, medium: 1, low: 2 }[f.risk]) },
      { key: 'status', label: L('الحالة', 'Status'), render: (f) => findingChip(f.status), sort: (f) => ['draft', 'issued', 'in_follow_up', 'implemented', 'closed'].indexOf(f.status) },
      { key: 'due', label: L('استحقاق خطة المعالجة', 'Action due'), render: (f) => (f.action ? dueLabel(f.action.due_date, { done: ['implemented', 'closed'].includes(f.action.status) }) : h('span.faint', '—')), sort: (f) => f.action?.due_date || '9999' },
    ],
  }));
  draw();
  return h('div.aud-findings',
    statRow([
      statTile({ label: L('مسودات', 'Drafts'), value: findings.filter((f) => f.status === 'draft').length, icon: 'pencil', href: `${HREF}/findings/drafts` }),
      statTile({ label: L('بانتظار رد الإدارة', 'Awaiting response'), value: findings.filter((f) => f.status === 'issued').length, icon: 'hourglass', tone: 'warn' }),
      statTile({ label: L('بانتظار التحقق', 'To validate'), value: findings.filter((f) => f.status === 'implemented').length, icon: 'fileCheck', tone: 'emph', href: me.roles.head ? `${HREF}/findings/decide` : null }),
      statTile({ label: L('خطط متأخرة', 'Overdue plans'), value: findings.filter((f) => f.action?.overdue).length, icon: 'clockAlert', tone: 'warn', href: `${HREF}/findings/overdue` }),
    ]),
    h('div.aud-quick', segmented(quick.map((q) => [q.key, L(q.ar, q.en), fmtNum(findings.filter((f) => q.test(f, meRef)).length)]), cur.key, (v) => { location.hash = `${HREF}/findings/${v}`; }, { label: L('عرض سريع', 'Quick view') })),
    filterBar({
      search: { placeholder: L('ابحث في الملاحظات…', 'Search findings…'), value: ui.q, onInput: (v) => { ui.q = v; draw(); } },
      selects: [
        { label: L('الخطورة', 'Risk'), value: ui.risk, options: [{ value: '', label: L('كل درجات الخطورة', 'All risks') }, { value: 'high', label: L('عالية', 'High') }, { value: 'medium', label: L('متوسطة', 'Medium') }, { value: 'low', label: L('منخفضة', 'Low') }], onChange: (v) => { ui.risk = v; draw(); } },
        { label: L('الإدارة', 'Department'), value: ui.dept, options: [{ value: '', label: L('كل الإدارات', 'All departments') }, ...depts.map((d) => ({ value: d.id, label: deptName(d) }))], onChange: (v) => { ui.dept = v; draw(); } },
      ],
    }),
    h('section.card.sys-card', tableWrap));
}

export function paint(tab, me, ctx, data) {
  if (tab === 'mine') return paintMine(me, data);
  if (tab === 'actions') return paintActions(me, data);
  return paintIA(me, ctx, data);
}
