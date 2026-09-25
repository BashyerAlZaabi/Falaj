// Strategic Performance — «الإدارة» tab (strategy.admin / SPMO only; the server
// enforces the capability on every call). Plan, pillars, objectives, KPIs with
// annual targets, initiatives and milestones. Deletions and archiving ask for an
// explicit confirmation and are audited server-side.
import { h, icon, L, fmtDate, formDialog, confirmDialog, toast, act, emptyState, dataTable, menu, openSheet, statusChip, directory } from '../../../sys-kit.js';
import { nf, withUnit } from './viz.js';

const SECTIONS = [['structure', 'المحاور والأهداف', 'Pillars & objectives', 'layers'], ['kpis', 'المؤشرات والمستهدفات', 'KPIs & targets', 'gauge'], ['initiatives', 'المبادرات', 'Initiatives', 'rocket'], ['plan', 'الخطة', 'Plan', 'flag']];

export async function renderAdmin(ctx, sum, reload, { call, ui, INIT, FREQ }) {
  const d = await call('/admin');
  const wrap = h('div.stg-admin');
  if (!d.plan) { wrap.append(h('div.card', emptyState({ icon: 'compass', title: L('لا توجد خطة نشطة', 'No active plan') }))); return wrap; }
  const deptOpts = d.departments.map((x) => ({ value: x.id, label: L(x.name_ar, x.name_en) }));
  const years = []; for (let y = d.plan.start_year; y <= d.plan.end_year; y++) years.push(y);
  const done = (msg) => { toast(msg); reload(); };
  const post = (path, body, method = 'POST') => call(path, { method, body });
  async function remove(btn, what, path) {
    const ok = await confirmDialog(L(`حذف ${what}؟`, `Delete ${what}?`), L('سيُحذف نهائياً ويُسجَّل الإجراء في سجل التدقيق. لا يمكن التراجع.', 'It will be permanently deleted and the action is audited. This cannot be undone.'), { danger: true, confirmLabel: L('حذف نهائي', 'Delete permanently') });
    if (!ok) return;
    const r = await act(btn, () => post(path, { confirm: true }));
    if (r) done(L('حُذف العنصر', 'Deleted'));
  }

  const seg = h('div.tabs.stg-seg', { role: 'tablist', 'aria-label': L('أقسام الإدارة', 'Management sections') }, SECTIONS.map(([k, ar, en, ic]) => h(`button${ui.admin === k ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(ui.admin === k), onclick: () => { ui.admin = k; reload(); } }, icon(ic), L(ar, en))));
  wrap.append(h('div.stg-admin-head', seg, h('span.grow'), h('span.tiny.faint', icon('shield'), L('كل تغيير يُسجَّل في سجل التدقيق', 'Every change is audited'))));

  // ---------------- pillars & objectives
  const pillarForm = async (btn, p) => {
    const v = await formDialog({ title: p ? L('تعديل المحور', 'Edit pillar') : L('محور جديد', 'New pillar'), values: p || { weight: 1, sort: d.pillars.length + 1 }, fields: [
      { name: 'code', label: L('الرمز', 'Code'), required: true, placeholder: 'P5', maxLength: 24 },
      { name: 'weight', label: L('الوزن', 'Weight'), type: 'number', min: 0.01, max: 100, step: 'any', required: true },
      { name: 'title_ar', label: L('العنوان (عربي)', 'Title (Arabic)'), required: true, full: true, maxLength: 200 },
      { name: 'title_en', label: L('العنوان (إنجليزي)', 'Title (English)'), full: true, maxLength: 200 },
      { name: 'description_ar', label: L('الوصف', 'Description'), type: 'textarea', rows: 3, maxLength: 1000 },
      { name: 'sort', label: L('الترتيب', 'Order'), type: 'number', min: 0, max: 999 },
    ] });
    if (!v) return;
    const body = { ...v, sort: v.sort ?? 0 }; for (const k of Object.keys(body)) if (body[k] === '' || body[k] == null) delete body[k];
    const r = await act(btn, () => (p ? post(`/admin/pillars/${p.id}`, body, 'PUT') : post('/admin/pillars', body)));
    if (r) done(L('حُفظ المحور', 'Pillar saved'));
  };
  const objectiveForm = async (btn, o, pillarId) => {
    const v = await formDialog({ title: o ? L('تعديل الهدف الاستراتيجي', 'Edit strategic objective') : L('هدف استراتيجي جديد', 'New strategic objective'), values: o || { pillar_id: pillarId, weight: 1 }, fields: [
      { name: 'pillar_id', label: L('المحور', 'Pillar'), type: 'select', required: true, options: d.pillars.map((p) => ({ value: p.id, label: `${p.code} · ${L(p.title_ar, p.title_en)}` })) },
      { name: 'code', label: L('الرمز', 'Code'), required: true, placeholder: 'SO-1.3', maxLength: 24 },
      { name: 'title_ar', label: L('العنوان (عربي)', 'Title (Arabic)'), required: true, full: true, maxLength: 300 },
      { name: 'title_en', label: L('العنوان (إنجليزي)', 'Title (English)'), full: true, maxLength: 300 },
      { name: 'owner_dept_id', label: L('الإدارة المالكة', 'Owner department'), type: 'select', required: true, options: deptOpts },
      { name: 'weight', label: L('الوزن في المحور', 'Weight in pillar'), type: 'number', min: 0.01, max: 100, step: 'any', required: true },
      { name: 'description_ar', label: L('الوصف', 'Description'), type: 'textarea', rows: 3, maxLength: 2000 },
    ] });
    if (!v) return;
    const body = { ...v }; for (const k of Object.keys(body)) if (body[k] === '' || body[k] == null) delete body[k];
    const r = await act(btn, () => (o ? post(`/admin/objectives/${o.id}`, body, 'PUT') : post('/admin/objectives', body)));
    if (r) done(L('حُفظ الهدف', 'Objective saved'));
  };
  const rowTools = (items) => h('div.stg-row-tools', items.map(([label, ic, fn, danger]) => h(`button.icon-btn${danger ? '.danger' : ''}`, { type: 'button', 'aria-label': label, 'data-tip': label, onclick: (e) => fn(e.currentTarget) }, icon(ic))));

  if (ui.admin === 'structure') {
    wrap.append(h('section.card.stg-admin-card',
      h('div.card-head', h('h2.card-title', L('المحاور والأهداف الاستراتيجية', 'Pillars and strategic objectives')), h('button.btn.primary.sm', { type: 'button', onclick: (e) => pillarForm(e.currentTarget) }, icon('plus'), L('محور جديد', 'New pillar'))),
      h('div.stg-tree', d.pillars.map((p) => {
        const objs = d.objectives.filter((o) => o.pillar_id === p.id);
        return h('section.stg-tree-pillar',
          h('div.stg-tree-row.is-pillar', h('span.stg-code', p.code), h('strong.grow', L(p.title_ar, p.title_en)), h('span.tiny.faint', L(`الوزن ${nf(p.weight)}`, `Weight ${nf(p.weight)}`)),
            rowTools([[L('تعديل المحور', 'Edit pillar'), 'pencil', (b) => pillarForm(b, p)], [L('حذف المحور', 'Delete pillar'), 'trash', (b) => remove(b, L('المحور', 'the pillar'), `/admin/pillars/${p.id}/delete`), true]])),
          objs.map((o) => h('div.stg-tree-row', h('span.stg-code', o.code), h('span.grow', L(o.title_ar, o.title_en)), h('span.chip.tiny.outline', L(o.dept_ar, o.dept_en)), h('span.tiny.faint', L(`الوزن ${nf(o.weight)}`, `Weight ${nf(o.weight)}`)),
            rowTools([[L('تعديل الهدف', 'Edit objective'), 'pencil', (b) => objectiveForm(b, o)], [L('حذف الهدف', 'Delete objective'), 'trash', (b) => remove(b, L('الهدف', 'the objective'), `/admin/objectives/${o.id}/delete`), true]]))),
          h('button.btn.sm.ghost.stg-add-row', { type: 'button', onclick: (e) => objectiveForm(e.currentTarget, null, p.id) }, icon('plus'), L('إضافة هدف لهذا المحور', 'Add an objective to this pillar')));
      }))));
  }

  // ---------------- KPIs
  const kpiForm = async (btn, k) => {
    const dir = await directory().catch(() => []);
    const tv = Object.fromEntries((k?.targets || []).map((t) => [`t_${t.year}`, t.target]));
    const v = await formDialog({ title: k ? L(`تعديل ${k.code}`, `Edit ${k.code}`) : L('مؤشر أداء جديد', 'New KPI'), wide: true,
      values: k ? { ...k, ...tv, owner_user_id: k.owner_user_id || '' } : { direction: 'higher', measure: 'level', frequency: 'quarterly', unit_ar: '%', unit_en: '%', decimals: 1, weight: 1, min_value: 0 },
      fields: [
        { name: 'objective_id', label: L('الهدف الاستراتيجي', 'Strategic objective'), type: 'select', required: true, full: true, options: d.objectives.map((o) => ({ value: o.id, label: `${o.code} · ${L(o.title_ar, o.title_en)}` })) },
        { name: 'code', label: L('الرمز', 'Code'), required: true, placeholder: 'KPI-1.1.3', maxLength: 24 },
        { name: 'weight', label: L('الوزن في الهدف', 'Weight in objective'), type: 'number', min: 0.01, max: 100, step: 'any', required: true },
        { name: 'name_ar', label: L('اسم المؤشر (عربي)', 'Name (Arabic)'), required: true, full: true, maxLength: 300 },
        { name: 'name_en', label: L('اسم المؤشر (إنجليزي)', 'Name (English)'), full: true, maxLength: 300 },
        { name: 'definition_ar', label: L('التعريف', 'Definition'), type: 'textarea', rows: 2, maxLength: 2000 },
        { name: 'formula_ar', label: L('طريقة الاحتساب', 'Formula'), full: true, maxLength: 1000 },
        { name: 'direction', label: L('الاتجاه', 'Direction'), type: 'select', required: true, options: [{ value: 'higher', label: L('الأعلى أفضل', 'Higher is better') }, { value: 'lower', label: L('الأقل أفضل', 'Lower is better') }] },
        { name: 'frequency', label: L('دورية الرصد', 'Frequency'), type: 'select', required: true, options: Object.entries(FREQ).map(([v2, [ar, en]]) => ({ value: v2, label: L(ar, en) })) },
        { name: 'measure', label: L('طريقة المقارنة', 'Comparison'), type: 'select', required: true, options: [{ value: 'level', label: L('قيمة الفترة مقابل المستهدف السنوي', 'Period value vs annual target') }, { value: 'cumulative', label: L('تراكمي منذ بداية السنة مقابل مستهدف تناسبي', 'Year-to-date vs pro-rated target') }] },
        { name: 'unit_ar', label: L('الوحدة (عربي)', 'Unit (Arabic)'), required: true, maxLength: 30 },
        { name: 'unit_en', label: L('الوحدة (إنجليزي)', 'Unit (English)'), maxLength: 30 },
        { name: 'decimals', label: L('المنازل العشرية', 'Decimals'), type: 'number', min: 0, max: 3 },
        { name: 'min_value', label: L('أدنى قيمة مقبولة', 'Minimum value'), type: 'number', step: 'any' },
        { name: 'max_value', label: L('أعلى قيمة مقبولة', 'Maximum value'), type: 'number', step: 'any' },
        { name: 'baseline', label: L('خط الأساس', 'Baseline'), type: 'number', step: 'any' },
        { name: 'baseline_year', label: L('سنة خط الأساس', 'Baseline year'), type: 'number', min: 2000, max: 2100 },
        { name: 'owner_dept_id', label: L('الإدارة المالكة', 'Owner department'), type: 'select', required: true, options: deptOpts },
        { name: 'owner_user_id', label: L('مالك المؤشر (يرصد القيم)', 'KPI owner (reports values)'), type: 'user', help: L('يستطيع مدير الإدارة المالكة الرصد أيضاً', 'The owner department’s manager can also report') },
        { name: 'data_source_ar', label: L('مصدر البيانات', 'Data source'), full: true, maxLength: 300 },
        { type: 'info', label: L(`المستهدفات السنوية للخطة ${d.plan.start_year}–${d.plan.end_year}`, `Annual targets for ${d.plan.start_year}–${d.plan.end_year}`) },
        ...years.map((y) => ({ name: `t_${y}`, label: L(`مستهدف ${y}`, `${y} target`), type: 'number', step: 'any' })),
      ] });
    if (!v) return;
    const targets = years.filter((y) => v[`t_${y}`] != null).map((y) => ({ year: y, target: v[`t_${y}`] }));
    const body = {};
    for (const key of ['objective_id', 'code', 'name_ar', 'name_en', 'definition_ar', 'formula_ar', 'direction', 'frequency', 'measure', 'unit_ar', 'unit_en', 'decimals', 'min_value', 'max_value', 'baseline', 'baseline_year', 'owner_dept_id', 'owner_user_id', 'data_source_ar', 'weight']) {
      if (v[key] !== '' && v[key] != null) body[key] = v[key];
    }
    if (k && !v.owner_user_id) body.owner_user_id = '';
    body.targets = targets;
    void dir;
    const r = await act(btn, () => (k ? post(`/admin/kpis/${k.id}`, body, 'PUT') : post('/admin/kpis', body)));
    if (r) done(L('حُفظ المؤشر والمستهدفات', 'KPI and targets saved'));
  };
  if (ui.admin === 'kpis') {
    wrap.append(h('section.card.stg-admin-card',
      h('div.card-head', h('h2.card-title', L('المؤشرات والمستهدفات', 'KPIs and targets')), h('span.count.tiny.faint', nf(d.kpis.length, 0)), h('button.btn.primary.sm', { type: 'button', onclick: (e) => kpiForm(e.currentTarget) }, icon('plus'), L('مؤشر جديد', 'New KPI'))),
      dataTable({
        caption: L('مؤشرات الخطة', 'Plan KPIs'),
        columns: [
          { key: 'code', label: L('المؤشر', 'KPI'), sort: (k) => k.code, render: (k) => h('div.kt-name', h('span.stg-code', k.code), h('strong', L(k.name_ar, k.name_en)), k.active ? null : h('span.chip.tiny.outline', L('مؤرشف', 'Archived'))) },
          { key: 'owner', label: L('المالك', 'Owner'), render: (k) => h('div', h('div', k.owner_ar ? L(k.owner_ar, k.owner_en) : '—'), h('div.tiny.faint', L(k.dept_ar, k.dept_en))) },
          { key: 'freq', label: L('الدورية', 'Frequency'), render: (k) => L(...FREQ[k.frequency]) },
          { key: 'targets', label: L('المستهدفات', 'Targets'), render: (k) => h('div.stg-targets', k.targets.map((t) => h('span.chip.tiny.outline', h('span.faint', String(t.year)), h('strong.tabular', withUnit(t.target, k.unit_ar, k.unit_en, k.decimals))))) },
          { key: 'actuals', label: L('قيم مرصودة', 'Reported'), num: true, sort: (k) => k.actuals, render: (k) => h('span.num.tabular', nf(k.actuals, 0)) },
          { key: 'tools', label: L('إجراءات', 'Actions'), render: (k) => h('button.icon-btn', { type: 'button', 'aria-label': L(`إجراءات ${k.code}`, `${k.code} actions`), 'aria-haspopup': 'menu', onclick: (e) => { e.stopPropagation(); const b = e.currentTarget; menu(b, [
            { label: L('تعديل المؤشر والمستهدفات', 'Edit KPI and targets'), icon: 'pencil', onClick: () => kpiForm(b, k) },
            k.active ? { label: L('أرشفة المؤشر', 'Archive KPI'), icon: 'archive', onClick: async () => {
              if (!(await confirmDialog(L('أرشفة المؤشر؟', 'Archive this KPI?'), L('يختفي المؤشر من الخطة وبطاقة الأداء مع الاحتفاظ بسجل قيمه. يمكن استعادته لاحقاً.', 'The KPI leaves the plan and scorecard; its history is kept. It can be restored later.'), { confirmLabel: L('أرشفة', 'Archive') }))) return;
              const r = await act(b, () => post(`/admin/kpis/${k.id}/archive`, { confirm: true })); if (r) done(L('أُرشف المؤشر', 'KPI archived'));
            } } : { label: L('استعادة المؤشر', 'Restore KPI'), icon: 'undo', onClick: async () => { const r = await act(b, () => post(`/admin/kpis/${k.id}/restore`, {})); if (r) done(L('استُعيد المؤشر', 'KPI restored')); } },
            k.actuals ? null : { label: L('حذف المؤشر', 'Delete KPI'), icon: 'trash', danger: true, onClick: () => remove(b, L('المؤشر', 'the KPI'), `/admin/kpis/${k.id}/delete`) },
          ]); } }, icon('more')) },
        ],
        rows: d.kpis, sortKey: 'code',
      })));
  }

  // ---------------- initiatives & milestones
  const initForm = async (btn, i) => {
    const v = await formDialog({ title: i ? L(`تعديل ${i.code}`, `Edit ${i.code}`) : L('مبادرة جديدة', 'New initiative'), wide: true, values: i ? { ...i, owner_user_id: i.owner_user_id || '', project_id: i.project_id || '' } : { status: 'planned' }, fields: [
      { name: 'objective_id', label: L('الهدف الاستراتيجي', 'Strategic objective'), type: 'select', required: true, full: true, options: d.objectives.map((o) => ({ value: o.id, label: `${o.code} · ${L(o.title_ar, o.title_en)}` })) },
      { name: 'code', label: L('الرمز', 'Code'), required: true, placeholder: 'INI-09', maxLength: 24 },
      { name: 'status', label: L('الحالة', 'Status'), type: 'select', required: true, options: Object.entries(INIT).map(([v2, [ar, en]]) => ({ value: v2, label: L(ar, en) })) },
      { name: 'title_ar', label: L('العنوان (عربي)', 'Title (Arabic)'), required: true, full: true, maxLength: 300 },
      { name: 'title_en', label: L('العنوان (إنجليزي)', 'Title (English)'), full: true, maxLength: 300 },
      { name: 'owner_dept_id', label: L('الإدارة المالكة', 'Owner department'), type: 'select', required: true, options: deptOpts },
      { name: 'owner_user_id', label: L('مالك المبادرة', 'Initiative owner'), type: 'user' },
      { name: 'start_date', label: L('تاريخ البدء', 'Start date'), type: 'date' },
      { name: 'end_date', label: L('تاريخ الانتهاء', 'End date'), type: 'date' },
      { name: 'progress', label: L('نسبة التقدم المعلنة (عند عدم الربط بمشروع)', 'Reported progress (when no project is linked)'), type: 'number', min: 0, max: 100 },
      { name: 'project_id', label: L('المشروع المرتبط (ضمن صلاحياتك)', 'Linked project (within your scope)'), type: 'select', options: [...d.projects.map((p) => ({ value: p.id, label: `${p.name} — ${L(p.dept_ar, p.dept_en)}` })), ...(i?.project_id && !d.projects.some((p) => p.id === i.project_id) ? [{ value: i.project_id, label: L('مشروع مرتبط خارج نطاقك (بدون تغيير)', 'Linked project outside your scope (unchanged)') }] : [])] },
      { name: 'description_ar', label: L('الوصف', 'Description'), type: 'textarea', rows: 3, maxLength: 2000 },
    ] });
    if (!v) return;
    const body = {};
    for (const key of ['objective_id', 'code', 'status', 'title_ar', 'title_en', 'owner_dept_id', 'owner_user_id', 'start_date', 'end_date', 'progress', 'project_id', 'description_ar']) if (v[key] !== '' && v[key] != null) body[key] = v[key];
    if (i) { if (!v.owner_user_id) body.owner_user_id = ''; if (!v.project_id) body.project_id = ''; if (!v.start_date) body.start_date = ''; if (!v.end_date) body.end_date = ''; }
    for (const key of ['start_date', 'end_date']) if (body[key] === '') delete body[key];
    const r = await act(btn, () => (i ? post(`/admin/initiatives/${i.id}`, body, 'PUT') : post('/admin/initiatives', body)));
    if (r) done(L('حُفظت المبادرة', 'Initiative saved'));
  };
  const milestones = (i) => {
    const list = h('ul.stg-ms');
    const draw = (items) => list.replaceChildren(...(items.length ? items.map((m) => h(`li${m.done_at ? '.done' : ''}`, h('span.stg-check.ro', { 'aria-hidden': 'true' }, icon(m.done_at ? 'check' : 'circle')),
      h('div.grow', h('div', L(m.title_ar, m.title_en || m.title_ar)), h('div.tiny.faint', m.due_date ? fmtDate(m.due_date) : '')),
      h('button.icon-btn.danger', { type: 'button', 'aria-label': L('حذف المرحلة', 'Delete milestone'), onclick: (e) => remove(e.currentTarget, L('المرحلة', 'the milestone'), `/admin/initiatives/${i.id}/milestones/${m.id}/delete`) }, icon('trash')))) : [h('li.faint.tiny', L('لا مراحل بعد', 'No milestones yet'))]));
    draw(i.milestones);
    openSheet({ title: L(`مراحل ${i.code}`, `${i.code} milestones`), subtitle: L(i.title_ar, i.title_en), body: h('div.stg-sheet', list,
      h('button.btn.primary', { type: 'button', onclick: async (e) => {
        const v = await formDialog({ title: L('مرحلة جديدة', 'New milestone'), fields: [{ name: 'title_ar', label: L('العنوان', 'Title'), required: true, full: true, maxLength: 300 }, { name: 'due_date', label: L('الموعد', 'Due date'), type: 'date' }] });
        if (!v) return;
        const body = { title_ar: v.title_ar, ...(v.due_date ? { due_date: v.due_date } : {}) };
        const r = await act(e.currentTarget, () => post(`/admin/initiatives/${i.id}/milestones`, body));
        if (r) { i.milestones = [...i.milestones, r]; draw(i.milestones); done(L('أُضيفت المرحلة', 'Milestone added')); }
      } }, icon('plus'), L('إضافة مرحلة', 'Add milestone'))) });
  };
  if (ui.admin === 'initiatives') {
    wrap.append(h('section.card.stg-admin-card',
      h('div.card-head', h('h2.card-title', L('المبادرات الاستراتيجية', 'Strategic initiatives')), h('span.count.tiny.faint', nf(d.initiatives.length, 0)), h('button.btn.primary.sm', { type: 'button', onclick: (e) => initForm(e.currentTarget) }, icon('plus'), L('مبادرة جديدة', 'New initiative'))),
      dataTable({
        caption: L('المبادرات', 'Initiatives'),
        columns: [
          { key: 'code', label: L('المبادرة', 'Initiative'), sort: (i) => i.code, render: (i) => h('div.kt-name', h('span.stg-code', i.code), h('strong', L(i.title_ar, i.title_en))) },
          { key: 'status', label: L('الحالة', 'Status'), render: (i) => statusChip(i.status, INIT) },
          { key: 'owner', label: L('المالك', 'Owner'), render: (i) => h('div', h('div', i.owner_ar ? L(i.owner_ar, i.owner_en) : '—'), h('div.tiny.faint', L(i.dept_ar, i.dept_en))) },
          { key: 'project', label: L('المشروع', 'Project'), render: (i) => (!i.project_id ? h('span.faint', '—') : i.project_visible ? h('span.chip.tiny.navy', icon('folder'), L('مرتبط', 'Linked')) : h('span.chip.tiny.outline', icon('lock'), L('مرتبط — خارج نطاقك', 'Linked — outside your scope'))) },
          { key: 'ms', label: L('المراحل', 'Milestones'), render: (i) => h('span.num.tabular', `${nf(i.milestones.filter((m) => m.done_at).length, 0)}/${nf(i.milestones.length, 0)}`) },
          { key: 'tools', label: L('إجراءات', 'Actions'), render: (i) => h('button.icon-btn', { type: 'button', 'aria-label': L(`إجراءات ${i.code}`, `${i.code} actions`), 'aria-haspopup': 'menu', onclick: (e) => { e.stopPropagation(); const b = e.currentTarget; menu(b, [
            { label: L('تعديل المبادرة', 'Edit initiative'), icon: 'pencil', onClick: () => initForm(b, i) },
            { label: L('إدارة المراحل', 'Manage milestones'), icon: 'milestone', onClick: () => milestones(i) },
            { label: L('حذف المبادرة', 'Delete initiative'), icon: 'trash', danger: true, onClick: () => remove(b, L('المبادرة', 'the initiative'), `/admin/initiatives/${i.id}/delete`) },
          ]); } }, icon('more')) },
        ],
        rows: d.initiatives, sortKey: 'code',
      })));
  }

  // ---------------- plan
  if (ui.admin === 'plan') {
    const p = d.plan;
    wrap.append(h('section.card.stg-admin-card',
      h('div.card-head', h('h2.card-title', L('الخطة الاستراتيجية النشطة', 'Active strategic plan')), h('button.btn.primary.sm', { type: 'button', onclick: async (e) => {
        const v = await formDialog({ title: L('تعديل الخطة', 'Edit plan'), wide: true, values: p, fields: [
          { name: 'title_ar', label: L('العنوان (عربي)', 'Title (Arabic)'), required: true, full: true, maxLength: 200 },
          { name: 'title_en', label: L('العنوان (إنجليزي)', 'Title (English)'), full: true, maxLength: 200 },
          { name: 'start_year', label: L('سنة البداية', 'Start year'), type: 'number', min: 2000, max: 2100, required: true },
          { name: 'end_year', label: L('سنة النهاية', 'End year'), type: 'number', min: 2000, max: 2100, required: true },
          { name: 'vision_ar', label: L('الرؤية (عربي)', 'Vision (Arabic)'), type: 'textarea', rows: 3, maxLength: 1000 },
          { name: 'vision_en', label: L('الرؤية (إنجليزي)', 'Vision (English)'), type: 'textarea', rows: 3, maxLength: 1000 },
        ] });
        if (!v) return;
        const r = await act(e.currentTarget, () => post('/admin/plan', v, 'PUT'));
        if (r) done(L('حُفظت الخطة', 'Plan saved'));
      } }, icon('pencil'), L('تعديل', 'Edit'))),
      h('dl.sys-kv', h('dt', L('العنوان', 'Title')), h('dd', L(p.title_ar, p.title_en)), h('dt', L('المدة', 'Period')), h('dd', h('span.num', `${p.start_year} – ${p.end_year}`)),
        h('dt', L('الرؤية', 'Vision')), h('dd', L(p.vision_ar, p.vision_en || p.vision_ar)),
        h('dt', L('الهيكل', 'Structure')), h('dd', L(`${d.pillars.length} محاور · ${d.objectives.length} أهداف · ${d.kpis.filter((k) => k.active).length} مؤشراً نشطاً · ${d.initiatives.length} مبادرات`, `${d.pillars.length} pillars · ${d.objectives.length} objectives · ${d.kpis.filter((k) => k.active).length} active KPIs · ${d.initiatives.length} initiatives`)))));
  }
  return wrap;
}
