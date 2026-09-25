// «الميزانية»: procurement budget lines (allocated / committed / spent) maintained
// by Finance (finance.budget) inside the portal. FS stays inside Vault and is
// never read from here. Managers see their departments; others their own lines.
import { h, icon, toast, emptyState, L, fmtNum, statRow, statTile, card, formDialog, openSheet, money, dataTable, departments } from '../../../sys-kit.js';
import { emit } from '../../../state.js';
import { call, aed, kv, hint, prChip, n } from './common.js';
import { budgetBar } from './requests.js';

const refresh = () => emit('data-changed', { entity: 'sys:procurement' });

export async function budgetTab(ctx, me) {
  const b = await call('/budget');
  const wrap = h('div.pc-budget');
  wrap.append(h('div.callout.vault.pc-callout', icon('vault'), h('div.grow', h('strong', L('مصدر الأرقام', 'Where these numbers come from')), h('div', L('تحدّث الإدارة المالية الاعتمادات والمصروف هنا؛ «الملتزم به» يُحجز تلقائياً عند اعتماد المالية لطلب الشراء ويُعدَّل عند إصدار أمر الشراء. النظام المالي FS يبقى داخل Vault ولا يُقرأ من هنا.', 'Finance maintains allocations and spend here; “committed” is reserved automatically when Finance approves a request and adjusted at PO issue. FS stays inside Vault and is never read from here.')))));
  const t = b.totals;
  if (t) wrap.append(statRow([
    statTile({ label: L('إجمالي الاعتمادات', 'Allocated'), value: money(t.allocated), icon: 'landmark' }),
    statTile({ label: L('ملتزم به', 'Committed'), value: money(t.committed), icon: 'lock', tone: 'emph' }),
    statTile({ label: L('مصروف', 'Spent'), value: money(t.spent), icon: 'receipt' }),
    statTile({ label: L('المتاح', 'Available'), value: money(t.available), icon: 'wallet', tone: t.available < 0 ? 'crit' : 'good' }),
    statTile({ label: L('الاستغلال', 'Utilisation'), value: t.utilisation, unit: '%', icon: 'gauge', tone: t.utilisation >= 90 ? 'crit' : t.utilisation >= 75 ? 'warn' : null }),
  ]));
  const tools = b.can_edit ? h('div.pc-toolbar', h('span.grow'), h('button.btn.primary', { type: 'button', onclick: () => newLine() }, icon('plus'), L('بند ميزانية جديد', 'New budget line'))) : null;
  if (tools) wrap.append(tools);
  if (!b.lines.length) { wrap.append(card(null, emptyState({ icon: 'wallet', title: L('لا توجد بنود ميزانية ضمن نطاقك', 'No budget lines in your scope'), body: L('تضيف الإدارة المالية بنود كل إدارة للسنة المالية.', 'Finance adds each department’s lines for the fiscal year.') }))); return wrap; }
  const groups = new Map();
  for (const l of b.lines) { const k = L(l.dept_ar, l.dept_en); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
  wrap.append(h('div.pc-legend.pc-budget-legend', h('span.pc-lg.spent', L('مصروف', 'Spent')), h('span.pc-lg.committed', L('ملتزم به', 'Committed')), h('span.pc-lg.avail', L('متاح', 'Available'))));
  for (const [dept, lines] of groups) {
    wrap.append(h('section.card.pc-budget-group', h('div.card-head', h('h2.card-title', dept), h('span.tiny.faint', L(`السنة المالية ${b.fiscal_year}`, `FY ${b.fiscal_year}`))),
      h('ul.pc-lines', lines.map((l) => lineRow(l, b.can_edit)))));
  }
  return wrap;
}
function lineRow(l, canEdit) {
  const a = l.amounts;
  const u = a?.utilisation;
  return h('li.pc-line',
    h('button.pc-line-main', { type: 'button', onclick: () => lineSheet(l.id), disabled: !a || null, 'aria-label': L(`تفاصيل البند ${l.code}`, `Line ${l.code} details`) },
      h('div.pc-line-name', h('span.pc-code.num', l.code), h('strong', L(l.name_ar, l.name_en)), l.is_demo ? h('span.chip.tiny.demo', L('تجريبي', 'Demo')) : null),
      a ? [budgetBar(a), h('div.pc-line-nums', h('span', L('الاعتماد', 'Allocated'), ' ', aed(a.allocated)), h('span', L('المتاح', 'Available'), ' ', h(`strong.num.tabular${a.available < 0 ? '.pc-neg' : ''}`, money(a.available))),
        h(`span.pc-util.${u >= 90 ? 'crit' : u >= 75 ? 'warn' : 'ok'}`, n(`${fmtNum(Math.round(u ?? 0))}%`)))] : h('span.tiny.faint', icon('lock'), L('الأرصدة للمالية ومديري الإدارة', 'Balances visible to Finance and managers'))),
    canEdit && a ? h('button.icon-btn', { type: 'button', 'aria-label': L(`تعديل البند ${l.code}`, `Edit ${l.code}`), onclick: () => editLine(l) }, icon('pencil')) : null);
}
async function lineSheet(id) {
  const l = await call(`/budget/${id}`).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (!l) return;
  const a = l.amounts;
  openSheet({ title: `${l.code} — ${L(l.name_ar, l.name_en)}`, subtitle: L(l.dept_ar, l.dept_en), body: h('div.pc-sheet',
    budgetBar(a),
    kv([[L('الاعتماد', 'Allocated'), aed(a.allocated)], [L('ملتزم به', 'Committed'), aed(a.committed)], [L('مصروف', 'Spent'), aed(a.spent)], [L('المتاح', 'Available'), aed(a.available)], [L('آخر تحديث', 'Last updated'), l.updated_by ? `${L(l.updated_by.name_ar, l.updated_by.name_en)}` : '—']]),
    h('h3.pc-mini-title', L('الالتزامات القائمة', 'Open commitments')),
    l.commitments?.length ? dataTable({ rows: l.commitments, columns: [
      { key: 'number', label: L('الطلب', 'Request'), render: (r) => h('a.num', { href: `#/sys/procurement/approvals/${r.id}` }, r.number) },
      { key: 'title', label: L('العنوان', 'Title') },
      { key: 'status', label: L('الحالة', 'Status'), render: (r) => prChip(r.status) },
      { key: 'reserved', label: L('المحجوز', 'Committed'), num: true, render: (r) => aed(r.reserved) },
    ] }) : hint(L('لا التزامات ضمن نطاق اطلاعك', 'No commitments in your scope'))) });
}
async function editLine(l) {
  const v = await formDialog({ title: L(`تعديل ${l.code}`, `Edit ${l.code}`), intro: L('لا يمكن أن يقل الاعتماد عن الملتزم به والمصروف. يُسجَّل كل تعديل في سجل التدقيق.', 'Allocation cannot drop below committed + spent. Every change is audited.'),
    fields: [
      { name: 'name_ar', label: L('اسم البند', 'Line name'), required: true },
      { name: 'allocated', label: L('الاعتماد', 'Allocated'), type: 'money', required: true, min: 0 },
      { name: 'spent', label: L('المصروف (من الإدارة المالية)', 'Spent (from Finance)'), type: 'money', required: true, min: 0 },
      { name: 'note', label: L('سبب التعديل', 'Reason'), type: 'textarea', rows: 2, maxLength: 300 },
    ], values: { name_ar: l.name_ar, allocated: l.amounts.allocated, spent: l.amounts.spent }, submitLabel: L('حفظ', 'Save') });
  if (!v) return;
  const r = await call(`/budget/${l.id}`, { method: 'PUT', body: { name_ar: v.name_ar, allocated: v.allocated, spent: v.spent, note: v.note || undefined } }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (r) { toast(L('حُدّث البند', 'Line updated')); refresh(); }
}
async function newLine() {
  const depts = await departments().catch(() => []);
  const v = await formDialog({ title: L('بند ميزانية جديد', 'New budget line'),
    fields: [
      { name: 'department_id', label: L('الإدارة', 'Department'), type: 'select', required: true, options: depts.map((d) => ({ value: d.id, label: L(d.name_ar, d.name_en) })) },
      { name: 'code', label: L('رمز البند', 'Code'), required: true, placeholder: `OPS-${new Date().getFullYear()}-220` },
      { name: 'name_ar', label: L('اسم البند', 'Name'), required: true },
      { name: 'allocated', label: L('الاعتماد', 'Allocated'), type: 'money', required: true, min: 0 },
    ], submitLabel: L('إضافة', 'Add') });
  if (!v) return;
  const r = await call('/budget', { method: 'POST', body: v }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (r) { toast(L('أُضيف البند', 'Line added')); refresh(); }
}
