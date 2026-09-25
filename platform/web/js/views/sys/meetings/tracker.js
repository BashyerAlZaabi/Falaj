// Meetings — «القرارات والتكليفات»: one tracker across every meeting I can see,
// with the linked task status of each action item. Filters live in the hash
// (#/sys/meetings/decisions/<kind>/<scope>/<status>) so live refreshes keep them.
import { h, icon, skeleton, errorState, emptyState, statRow, statTile, dataTable, filterBar, act, fmtNum, L, whoChip } from '../../../sys-kit.js';
import * as C from './common.js';

const ui = { q: '' }; // search text (transient)
const KINDS = [['actions', 'التكليفات', 'Action items', 'listChecks'], ['decisions', 'القرارات', 'Decisions', 'gavel']];
const SCOPES = [['mine', 'المسندة إليّ', 'Assigned to me'], ['all', 'كل ما أراه', 'Everything I can see']];
const STATUSES = [['open', 'المفتوحة', 'Open'], ['overdue', 'المتأخرة', 'Overdue'], ['done', 'المنجزة', 'Done'], ['all', 'الكل', 'All']];

export async function render(root, ctx, tab) {
  const page = h('div.mt-page');
  root.append(page);
  const [kind = 'actions', scope = 'mine', status = 'open'] = ctx.params.slice(1);
  const f = { kind: KINDS.some((k) => k[0] === kind) ? kind : 'actions', scope: scope === 'all' ? 'all' : 'mine', status: STATUSES.some((s) => s[0] === status) ? status : 'open' };
  const load = () => Promise.all([
    C.call(`/tracker?mine=${f.scope === 'mine' ? 1 : 0}${f.status !== 'all' ? `&status=${f.status}` : ''}${ui.q ? `&q=${encodeURIComponent(ui.q)}` : ''}`),
    C.call('/tracker'),
  ]).then(([t, everything]) => paint(page, ctx, tab, f, t, everything)).catch((e) => C.fill(page, ...C.shell(ctx, tab), h('section.card', errorState(e, () => load()))));
  if (ctx.soft) { await load(); return; }
  C.fill(page, ...C.shell(ctx, tab), h('div.stat-row', skeleton('stat'), skeleton('stat'), skeleton('stat')), h('section.card', skeleton('table', 6)));
  load();
}

const href = (f, patch) => { const x = { ...f, ...patch }; return `#/sys/meetings/decisions/${x.kind}/${x.scope}/${x.status}`; };

function paint(page, ctx, tab, f, t, everything) {
  const s = everything.stats;
  const rows = f.kind === 'actions' ? t.actions : t.decisions;
  C.fill(page, 
    ...C.shell(ctx, tab, { counts: { decisions: s.mine_open } }),
    statRow([
      statTile({ label: L('تكليفاتي المفتوحة', 'My open action items'), value: s.mine_open, icon: 'listChecks', tone: s.mine_open ? 'emph' : null, href: href(f, { kind: 'actions', scope: 'mine', status: 'open' }) }),
      statTile({ label: L('قرارات قيد المتابعة', 'Decisions being followed up'), value: s.decisions_open, icon: 'gavel', href: href(f, { kind: 'decisions', scope: 'all', status: 'open' }) }),
      statTile({ label: L('متأخرة', 'Overdue'), value: s.overdue, icon: 'clockAlert', tone: s.overdue ? 'crit' : 'good', hint: s.overdue ? L('قرارات وتكليفات تجاوزت موعدها', 'Past their target date') : L('لا شيء متأخر', 'Nothing overdue'), href: href(f, { scope: 'all', status: 'overdue' }) }),
      statTile({ label: L('أُنجز خلال 30 يوماً', 'Done in the last 30 days'), value: s.done_30d, icon: 'circleCheck', tone: 'good', href: href(f, { scope: 'all', status: 'done' }) }),
    ]),
    h('section.card.mt-tracker', { 'aria-labelledby': 'mt-tr-title' },
      h('div.mt-tr-bar',
        h('h2.sr#mt-tr-title', L('القرارات والتكليفات', 'Decisions and action items')),
        h('nav.tabs.mt-seg', { 'aria-label': L('النوع', 'Kind') }, KINDS.map(([k, ar, en, ic]) => h(`a${f.kind === k ? '.on' : ''}`, { href: href(f, { kind: k }), 'aria-current': f.kind === k ? 'page' : null }, icon(ic), L(ar, en)))),
        h('nav.tabs.mt-seg', { 'aria-label': L('النطاق', 'Scope') }, SCOPES.map(([k, ar, en]) => h(`a${f.scope === k ? '.on' : ''}`, { href: href(f, { scope: k }), 'aria-current': f.scope === k ? 'page' : null }, L(ar, en)))),
        filterBar({
          search: { placeholder: L('ابحث في القرارات والتكليفات…', 'Search decisions and actions…'), value: ui.q, onInput: (v) => { ui.q = v; reloadSoft(page, ctx, tab, f); } },
          selects: [{ label: L('الحالة', 'Status'), value: f.status, options: STATUSES.map(([value, ar, en]) => ({ value, label: L(ar, en) })), onChange: (v) => { location.hash = href(f, { status: v }); } }],
        })),
      rows.length ? (f.kind === 'actions' ? actionsTable(ctx, rows) : decisionsTable(rows))
        : emptyState({ icon: f.kind === 'actions' ? 'listChecks' : 'gavel', title: f.status === 'overdue' ? L('لا شيء متأخر', 'Nothing overdue') : L('لا عناصر مطابقة', 'Nothing matches'),
          body: f.scope === 'mine' ? L('لا توجد تكليفات أو قرارات مسندة إليك بهذه الحالة. جرّب «كل ما أراه».', 'Nothing assigned to you in this state. Try “Everything I can see”.') : L('لا توجد عناصر بهذه الحالة في اجتماعاتك.', 'Nothing in this state across your meetings.'),
          actions: f.scope === 'mine' ? [{ label: L('عرض كل ما أراه', 'Show everything I can see'), onClick: () => { location.hash = href(f, { scope: 'all' }); } }] : [] }),
      h('p.tiny.faint.mt-hint', icon('lockKeyhole'), L(' بنود الاجتماعات السرية تظهر مقنّعة هنا؛ تفاصيلها داخل الاجتماع حيث يُسجَّل الاطلاع.', ' Items from restricted meetings are masked here; details open inside the meeting, where access is logged.'))));
}
let searchSeq = 0;
async function reloadSoft(page, ctx, tab, f) {
  const seq = ++searchSeq;
  try {
    const [t, everything] = await Promise.all([C.call(`/tracker?mine=${f.scope === 'mine' ? 1 : 0}${f.status !== 'all' ? `&status=${f.status}` : ''}${ui.q ? `&q=${encodeURIComponent(ui.q)}` : ''}`), C.call('/tracker')]);
    if (seq !== searchSeq || !page.isConnected) return;
    const focused = document.activeElement?.type === 'search';
    paint(page, ctx, tab, f, t, everything);
    if (focused) { const el = page.querySelector('input[type=search]'); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); }
  } catch (e) { C.toastErr(e); }
}

const meetingCell = (x) => h('a.mt-tr-meeting', { href: `#/sys/meetings/m/${x.meeting.id}` }, x.meeting.masked ? icon('lockKeyhole') : null, h('span', C.titleOf(x.meeting)), h('small.faint', C.dayMonth(C.localDay(x.meeting.starts_at))));
function actionsTable(ctx, rows) {
  return dataTable({
    caption: L('التكليفات', 'Action items'),
    columns: [
      { key: 'title', label: L('التكليف', 'Action'), sort: (a) => a.title || '', render: (a) => h('div.mt-tr-title', a.masked ? h('span.mt-mask-ic', { 'data-tip': C.maskedTip }, icon('lockKeyhole')) : null, h('span', a.title || L('تكليف من اجتماع سري', 'Action from a restricted meeting'))) },
      { key: 'meeting', label: L('الاجتماع', 'Meeting'), sort: (a) => a.meeting.starts_at, render: meetingCell },
      { key: 'assignee', label: L('المكلّف', 'Assignee'), sort: (a) => a.assignee?.name_ar || '', render: (a) => whoChip(a.assignee) },
      { key: 'due', label: L('الاستحقاق', 'Due'), sort: (a) => a.due_date || '9999', render: (a) => (a.due_date ? h(`span.chip.tiny.${a.overdue ? 'crit' : 'outline'}`, icon(a.overdue ? 'clockAlert' : 'calendar'), C.dayMonth(a.due_date)) : h('span.faint', '—')) },
      { key: 'status', label: L('الحالة', 'Status'), sort: (a) => a.status, render: (a) => C.chip(C.ACTION, a.status) },
      { key: 'task', label: L('المهمة المرتبطة', 'Linked task'), render: (a) => (a.task ? C.chip(C.TASK, a.task.status) : a.status === 'pending_acceptance' ? h('span.tiny.faint', L('تُنشأ عند القبول', 'Created on acceptance')) : h('span.faint', '—')) },
      { key: 'go', label: '', render: (a) => (a.status === 'pending_acceptance' && a.assignee?.id === ctx.user.id ? h('a.btn.sm.primary', { href: `#/sys/meetings/m/${a.meeting.id}/actions` }, L('ردّ', 'Respond')) : '') },
    ],
    rows, sortKey: 'due', onRow: (a) => { location.hash = `#/sys/meetings/m/${a.meeting.id}/actions`; },
  });
}
function decisionsTable(rows) {
  return dataTable({
    caption: L('القرارات', 'Decisions'),
    columns: [
      { key: 'number', label: '#', num: true, width: '48px', sort: (d) => d.number, render: (d) => h('span.mt-dec-num', fmtNum(d.number)) },
      { key: 'text', label: L('القرار', 'Decision'), sort: (d) => d.text || '', render: (d) => h('div.mt-tr-title', d.masked ? h('span.mt-mask-ic', { 'data-tip': C.maskedTip }, icon('lockKeyhole')) : null, h('span', d.text || L('قرار في اجتماع سري', 'Decision in a restricted meeting'))) },
      { key: 'meeting', label: L('الاجتماع', 'Meeting'), sort: (d) => d.meeting.starts_at, render: meetingCell },
      { key: 'owner', label: L('المسؤول', 'Owner'), sort: (d) => d.owner?.name_ar || '', render: (d) => whoChip(d.owner) },
      { key: 'due', label: L('المستهدف', 'Target'), sort: (d) => d.due_date || '9999', render: (d) => (d.due_date ? h(`span.chip.tiny.${d.overdue ? 'crit' : 'outline'}`, C.dayMonth(d.due_date)) : h('span.faint', '—')) },
      { key: 'status', label: L('الحالة', 'Status'), sort: (d) => d.status, render: (d) => C.chip(C.DECISION, d.status) },
    ],
    rows, onRow: (d) => { location.hash = `#/sys/meetings/m/${d.meeting.id}/decisions`; },
  });
}
void act;
