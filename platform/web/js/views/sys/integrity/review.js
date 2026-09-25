// «المراجعة» — compliance officer only: queue board (new · under review · follow-up ·
// recently done), filters, the people who have not submitted yet, and the cycle.
// Opening a card logs the view server-side (the discloser sees it).
import { h, icon, L, fmtDate, fmtNum, toast, confirmDialog, formDialog, statTile, statRow, board, filterBar, confidentialBanner, emptyState, grid, act, avatar } from '../../../sys-kit.js';
import { call, DECISION, lbl, money, ago, nameOf, deptOf, count } from './common.js';
import { openRecord } from './record.js';

const ui = { type: 'all', q: '' }; // survives live refreshes (module state)
const TYPE = { declaration: ['إقرار سنوي', 'Annual declaration', 'fileSign'], disclosure: ['إفصاح طارئ', 'Ad-hoc disclosure', 'shieldAlert'], gift: ['هدية', 'Gift', 'gift'] };
const FLAG = {
  no_conflict: ['لا يوجد تضارب', 'No conflict', 'good', 'badgeCheck'], provider: ['مقدّم خدمة', 'Provider', 'navy', 'handshake'],
  cash: ['نقد', 'Cash', 'purple', 'banknote'], tender: ['مناقصة قائمة', 'Active tender', 'purple', 'ban'], over_limit: ['فوق الحد', 'Above limit', 'warn', 'handCoins'],
};

const fetchQueue = () => call(`/review?${new URLSearchParams({ type: ui.type, ...(ui.q ? { q: ui.q } : {}) })}`);
export async function reviewTab(env) {
  const data = await fetchQueue();
  const p = env.params[0];
  if (p && p.includes(':')) { const [t, id] = p.split(':'); if (TYPE[t]) setTimeout(() => openRecord(env, t, id, { tab: 'review' }), 0); }
  const c = data.counts; const cy = data.cycle;
  const rate = data.staff ? Math.round(((data.staff - data.pending.length) / data.staff) * 100) : null;
  const redraw = () => env.refresh();
  const cols = [
    { key: 'new', ar: 'جديدة', en: 'New', tone: 'emph' },
    { key: 'review', ar: 'قيد المراجعة', en: 'Under review', tone: 'warn' },
    { key: 'followup', ar: 'متابعة: تعليمات أو تنفيذ', en: 'Follow-up', tone: 'info' },
    { key: 'done', ar: `مُنجزة (آخر 30 يوماً)`, en: 'Done (last 30 days)', tone: 'good' },
  ];
  const cardFor = (it) => h('button.board-card.integ-case', { type: 'button', onclick: () => openRecord(env, it.type, it.id, { tab: 'review' }), 'aria-label': `${L(TYPE[it.type][0], TYPE[it.type][1])} — ${nameOf(it.person)}` },
    h('div.integ-case-top', h('span.integ-case-ic', icon(TYPE[it.type][2])), h('span.integ-case-type', L(it.title_ar, it.title_en))),
    h('div.integ-case-who', avatar(it.person.name_ar), h('span.grow', h('strong', nameOf(it.person)), h('span', deptOf(it.person)))),
    h('div.bc-meta',
      it.value_aed != null ? h('span.num.tabular', money(it.value_aed)) : null,
      ...it.flags.map((f) => { if (f.startsWith('interests:')) { const n = Number(f.split(':')[1]); return h('span.chip.tiny.outline', icon('fileSign'), count(n, ['مصلحة واحدة', 'مصلحتان', 'مصالح', 'مصلحة'], ['interest', 'interests'])); } const m = FLAG[f]; return m ? h(`span.chip.tiny.${m[2]}`, icon(m[3]), L(m[0], m[1])) : null; }),
      it.proposal ? h('span.chip.tiny.outline', L(`المقترح: ${lbl(DECISION, it.proposal)}`, `Proposed: ${lbl(DECISION, it.proposal)}`)) : null,
      it.own ? h('span.chip.tiny.warn', icon('scale'), L('إفصاحك — يتطلب مراجِعاً آخر', 'Yours — needs another reviewer')) : null),
    h('div.integ-case-when', icon('clock'), ago(it.at)));

  const pendingCard = h('section.card.integ-pending',
    h('div.card-head', h('h2.card-title', L('لم يقدّموا الإقرار بعد', 'Not submitted yet')), h('span.chip.tiny.outline', fmtNum(data.pending.length)),
      cy && cy.status === 'open' && data.pending.length ? h('button.btn.sm.tertiary', { type: 'button', onclick: async (e) => {
        const ok = await confirmDialog(L('إرسال تذكير لطيف؟', 'Send a friendly reminder?'), L(`سيصل تنبيه إلى ${fmtNum(data.pending.length)} موظفين لم يقدّموا إقرارهم، دون أي تفاصيل أخرى. يمكن الإرسال مرة كل 24 ساعة.`, `${data.pending.length} people who haven’t submitted get an alert — nothing else. Once every 24 hours.`), { confirmLabel: L('إرسال التذكير', 'Send reminder') });
        if (!ok) return;
        const r = await act(e.currentTarget, () => call(`/cycles/${cy.id}/remind`, { method: 'POST', body: {} }));
        if (r) toast(L(`أُرسل التذكير إلى ${fmtNum(r.reminded)} موظفين`, `Reminder sent to ${r.reminded} people`));
      } }, icon('bell'), L('تذكير', 'Remind')) : null),
    cy?.last_reminder_at ? h('p.integ-card-sub', L(`آخر تذكير ${ago(cy.last_reminder_at)}`, `Last reminder ${ago(cy.last_reminder_at)}`)) : null,
    data.pending.length ? h('ul.list.integ-pending-list', data.pending.map((p2) => h('li', avatar(p2.name_ar), h('div.grow', h('div.title', L(p2.name_ar, p2.name_en)), h('div.meta', L(p2.dept_ar, p2.dept_en))), h(`span.chip.tiny.${p2.started ? 'outline' : 'sand'}`, p2.started ? L('مسودة', 'Draft') : L('لم يبدأ', 'Not started')))))
      : emptyState({ compact: true, icon: 'badgeCheck', title: L('قدّم الجميع إقرارهم', 'Everyone has submitted'), body: L('شكراً لثقافة الشفافية في الجهة.', 'A culture of transparency.') }));

  const cycleCard = h('section.card.integ-cycle',
    h('div.card-head', h('h2.card-title', L('دورة الإقرار', 'Declaration cycle'))),
    cy ? [h('div.integ-cycle-year', h('strong.num.tabular', String(cy.year)), h(`span.chip.tiny.${cy.status === 'open' ? 'good' : 'outline'}`, cy.status === 'open' ? L('مفتوحة', 'Open') : L('مغلقة', 'Closed'))),
      h('dl.sys-kv', h('dt', L('فُتحت', 'Opened')), h('dd', fmtDate(cy.opens_on)), h('dt', L('الموعد النهائي', 'Due')), h('dd', fmtDate(cy.due_on), cy.status === 'open' ? h('span.tiny.faint', ` · ${cy.days_left >= 0 ? L(`متبقٍ ${cy.days_left} يوماً`, `${cy.days_left} days left`) : L('انتهى الموعد', 'past due')}`) : null))] : h('p.muted', L('لا توجد دورة بعد.', 'No cycle yet.')),
    h('div.btn-group',
      cy && cy.status === 'open' ? h('button.btn.sm.destructive-soft', { type: 'button', onclick: async (e) => {
        const ok = await confirmDialog(L(`إغلاق دورة ${cy.year}؟`, `Close the ${cy.year} cycle?`), L('لن يتمكن أحد من تقديم إقرار في هذه الدورة بعد الإغلاق. يُسجَّل الإجراء في سجل التدقيق.', 'Nobody can submit in this cycle after closing. The action is audited.'), { danger: true, confirmLabel: L('إغلاق الدورة', 'Close cycle') });
        if (ok && await act(e.currentTarget, () => call(`/cycles/${cy.id}/close`, { method: 'POST', body: { confirm: true } }), { success: L('أُغلقت الدورة', 'Cycle closed') })) redraw();
      } }, icon('archive'), L('إغلاق الدورة', 'Close cycle')) : h('button.btn.sm.primary', { type: 'button', onclick: async () => {
        const y = new Date().getUTCFullYear();
        const v = await formDialog({ title: L('فتح دورة إقرار جديدة', 'Open a new declaration cycle'), fields: [{ name: 'year', label: L('السنة', 'Year'), type: 'number', required: true, min: 2020, max: 2100 }, { name: 'due_on', label: L('الموعد النهائي', 'Due date'), type: 'date', required: true }], values: { year: cy && cy.year >= y ? cy.year + 1 : y }, submitLabel: L('فتح الدورة', 'Open cycle') });
        if (!v) return;
        try { await call('/cycles', { method: 'POST', body: { year: Number(v.year), due_on: v.due_on } }); toast(L('فُتحت الدورة وأُتيحت للجميع', 'Cycle opened for everyone')); redraw(); } catch (err) { toast(err.message, { kind: 'error' }); }
      } }, icon('calendarPlus'), L('فتح دورة جديدة', 'Open a new cycle'))));

  // Filters only repaint the board (the search field keeps focus while typing).
  const boardNode = (d) => (d.items.length ? board(cols, [...d.items].sort((a, b) => Number(a.own) - Number(b.own)), { columnOf: (i) => i.column, renderCard: cardFor, emptyText: L('لا شيء هنا', 'Nothing here') })
    : emptyState({ icon: 'inboxEmpty', title: ui.q || ui.type !== 'all' ? L('لا نتائج مطابقة', 'No matching cases') : L('لا توجد حالات', 'No cases'), body: L('ستظهر هنا الإقرارات والإفصاحات والهدايا فور تقديمها.', 'Declarations, disclosures and gifts appear here as soon as they are submitted.') }));
  const boardHost = h('div.integ-board-host', { 'aria-live': 'polite' }, boardNode(data));
  let seq = 0;
  const refilter = async () => { const my = ++seq; try { const d = await fetchQueue(); if (my === seq) boardHost.replaceChildren(boardNode(d)); } catch (e) { toast(e.message, { kind: 'error' }); } };
  const next = data.items.find((i) => i.column === 'new' && !i.own) || data.items.find((i) => i.column === 'review' && !i.own);
  return {
    actions: next ? [{ label: L('راجع التالي', 'Review next'), icon: 'scanSearch', primary: true, onClick: () => openRecord(env, next.type, next.id, { tab: 'review' }) }] : [],
    body: h('div.integ-review',
      statRow([
        statTile({ label: L('جديدة', 'New'), value: c.new, icon: 'inbox', tone: c.new ? 'emph' : null, hint: L('بانتظار بدء المراجعة', 'Awaiting review') }),
        statTile({ label: L('قيد المراجعة', 'Under review'), value: c.review, icon: 'scanSearch', tone: c.review ? 'warn' : null }),
        statTile({ label: L('هدايا بانتظار القرار', 'Gifts awaiting decision'), value: c.gifts, icon: 'gift' }),
        statTile({ label: L('تعليمات سارية', 'Instructions in force'), value: c.mitigations, icon: 'shieldAlert' }),
        statTile({ label: L('نسبة تقديم الإقرار', 'Submission rate'), value: rate == null ? null : `${fmtNum(rate)}%`, icon: 'percentCircle', tone: rate >= 80 ? 'good' : null, hint: cy ? L(`دورة ${cy.year}`, `${cy.year} cycle`) : null, href: '#/sys/integrity/reports' }),
      ]),
      confidentialBanner('سري للغاية — كل اطلاع على تفاصيل أي إفصاح يُسجَّل ويظهر لصاحبه في «من اطّلع على إفصاحي».', 'Restricted — every view of a disclosure is logged and shown to the discloser.', { level: 'restricted' }),
      filterBar({
        search: { placeholder: L('ابحث باسم الموظف…', 'Search by employee…'), value: ui.q, onInput: (q) => { ui.q = q; refilter(); } },
        selects: [{ label: L('النوع', 'Type'), value: ui.type, onChange: (t) => { ui.type = t; refilter(); }, options: [{ value: 'all', label: L('كل الأنواع', 'All types') }, { value: 'declaration', label: L('الإقرارات السنوية', 'Annual declarations') }, { value: 'disclosure', label: L('الإفصاحات الطارئة', 'Ad-hoc disclosures') }, { value: 'gift', label: L('الهدايا', 'Gifts') }] }],
      }),
      boardHost,
      grid('two', pendingCard, cycleCard)),
  };
}
