// Internal Audit — finding record page (#/sys/audit/f/<id>): the 4C, the
// recommendation, the management response and action plan, follow-up timeline
// and closure validation. Each viewer sees only what their role allows.
import { sysHeader, stepper, card, grid, timeline, confidentialBanner, confirmDialog, directory, go } from '../../../sys-kit.js';
import { accessList } from './common.js';
import { h, icon, L, fmtNum, fmtDate, call, HREF, riskChip, findingChip, actionChip, deptChip, dueLabel, docList, docField, formDialog, act, toast, nextCard, btn, back, mount, demoChip, para, state } from './common.js';

const STEPS = [{ ar: 'إثبات الملاحظة', en: 'Drafted' }, { ar: 'الإصدار', en: 'Issued' }, { ar: 'رد الإدارة', en: 'Response' }, { ar: 'التنفيذ', en: 'Implementation' }, { ar: 'التحقق والإغلاق', en: 'Validation' }];
const STEP_OF = { draft: 0, issued: 2, in_follow_up: 3, implemented: 4, closed: 5 };
const KIND = {
  created: ['أُثبتت الملاحظة (مسودة)', 'Finding drafted', 'pencil'], issued: ['صدرت الملاحظة للإدارة', 'Issued to management', 'send', 'emph'],
  response: ['رد الإدارة وخطة المعالجة', 'Management response & action plan', 'messageSquare'], progress: ['تحديث التنفيذ', 'Progress update', 'loader'],
  implemented: ['أُبلغ عن التنفيذ مع الدليل', 'Reported implemented with evidence', 'fileCheck', 'good'], returned: ['أُعيدت الخطة للاستكمال', 'Returned for completion', 'reply', 'crit'],
  closed: ['اعتُمد الإغلاق بعد التحقق', 'Closure validated', 'badgeCheck', 'good'], note: ['ملاحظة داخلية لفريق التدقيق', 'Internal IA note', 'lock'],
};

export async function render(root, ctx) {
  const id = ctx.params[1];
  await mount(root, ctx, () => call(`/findings/${id}`), (f) => page(f, ctx));
}

function page(f, ctx) {
  const v = f.viewer; const c = f.can; const a = f.action;
  const backTo = v.ia ? [`${HREF}/e/${f.engagement.id}/findings`, L('ملاحظات المهمة', 'Engagement findings')] : v.auditee ? [`${HREF}/mine`, L('ملاحظات إدارتي', 'My department')] : v.owner ? [`${HREF}/actions`, L('خطط المعالجة', 'My action plans')] : [`${HREF}/committee`, L('لوحة اللجنة', 'Committee')];
  const head = sysHeader(ctx, {
    eyebrow: `${f.ref} · ${f.engagement.title}`, title: f.title, sub: false,
    badges: [riskChip(f.risk), findingChip(f.status), deptChip(f.department), demoChip(f)].filter(Boolean),
    actions: [c.edit ? { label: L('تعديل', 'Edit'), icon: 'pencil', onClick: () => edit(f) } : null, c.withdraw ? { label: L('سحب المسودة', 'Withdraw draft'), icon: 'trash', danger: true, onClick: () => withdraw(f, ctx) } : null].filter(Boolean),
  });
  const main = [];
  const four = [['المعيار', 'Criteria', f.criteria, 'scale'], ['الوضع القائم', 'Condition', f.condition, 'scanSearch'], ['السبب', 'Cause', f.cause, 'network'], ['الأثر', 'Effect', f.effect, 'zap']].filter(([, , txt]) => txt !== undefined);
  main.push(card(L('الملاحظة', 'Finding'), h(`div.aud-4c${four.length === 1 ? '.single' : ''}`, four.map(([ar, en, txt, ic]) => h('section.aud-4c-item', h('div.aud-4c-label', icon(ic), L(ar, en)), para(txt))))));
  main.push(h('section.card.sys-card.aud-rec', h('div.card-head', h('h2.card-title', icon('lightbulb'), L('التوصية', 'Recommendation'))), para(f.recommendation)));
  if (f.response_text) main.push(card(L('رد الإدارة', 'Management response'), h('div.row-wrap', h(`span.chip.tiny.${f.position === 'agree' ? 'good' : 'warn'}`, icon(f.position === 'agree' ? 'thumbsUp' : 'scale'), f.position === 'agree' ? L('موافقة', 'Agree') : L('موافقة جزئية', 'Partially agree')), f.response_by ? h('span.tiny.faint', `${L(f.response_by.name_ar, f.response_by.name_en)} · ${fmtDate(f.response_at)}`) : h('span.tiny.faint', fmtDate(f.response_at))), para(f.response_text)));
  if (a) main.push(h(`section.card.sys-card.aud-action${a.overdue ? '.late' : ''}`, h('div.card-head', h('h2.card-title', icon('listChecks'), L('خطة المعالجة', 'Action plan')), actionChip(a.status)),
    para(a.description),
    h('div.aud-action-grid',
      h('div', h('span.lbl-sm', L('المسؤول عن التنفيذ', 'Owner')), a.owner ? h('span.who-inline', icon('user'), L(a.owner.name_ar, a.owner.name_en), a.mine ? h('span.chip.tiny.info', L('أنت', 'You')) : null) : h('span.faint', deptChip(f.department))),
      h('div', h('span.lbl-sm', L('تاريخ الاستحقاق', 'Due date')), dueLabel(a.due_date, { done: ['implemented', 'closed'].includes(a.status) })),
      a.implemented_at ? h('div', h('span.lbl-sm', L('أُبلغ عن التنفيذ', 'Reported done')), h('span', fmtDate(a.implemented_at))) : null,
      a.returned_count ? h('div', h('span.lbl-sm', L('مرات الإعادة', 'Returned')), h('span.num', fmtNum(a.returned_count))) : null),
    f.evidence?.length ? h('div', h('div.lbl-sm', L('أدلة التنفيذ', 'Evidence')), docList(f.evidence)) : null));

  const side = [
    confidentialBanner(v.ia ? 'ملاحظة سرية: تظهر للإدارة الخاضعة للتدقيق بعد إصدارها فقط، ويُسجَّل كل اطلاع.' : 'ملاحظة تدقيق سرية — يُسجَّل كل اطلاع عليها.', v.ia ? 'Confidential: visible to the auditee only once issued; every view is logged.' : 'Confidential audit finding — every view is logged.'),
    card(h('div.row.grow', h('h2.card-title', L('سجل المتابعة', 'Follow-up history')), c.note ? btn(L('ملاحظة داخلية', 'Internal note'), { sm: true, tertiary: true, ic: 'lock', onClick: () => note(f) }) : null),
      timeline(f.updates.map((u) => { const k = KIND[u.kind] || [u.kind, u.kind, 'circleDot']; return { at: u.at, ar: `${k[0]}${u.note ? ` — ${u.note}` : ''}`, en: `${k[1]}${u.note ? ` — ${u.note}` : ''}`, who: u.who, icon: k[2], tone: u.internal ? null : k[3] }; }))),
    v.ia && f.raised_by ? card(L('معلومات داخلية', 'Internal details'), h('dl.sys-kv', h('dt', L('أثبتها', 'Raised by')), h('dd', L(f.raised_by.name_ar, f.raised_by.name_en)), h('dt', L('أصدرها', 'Issued by')), h('dd', f.issued_by ? L(f.issued_by.name_ar, f.issued_by.name_en) : '—'), h('dt', L('المهمة', 'Engagement')), h('dd', h('a', { href: `${HREF}/e/${f.engagement.id}` }, f.engagement.title)))) : null,
    f.access_log ? card(L('سجل الاطلاع', 'Access log'), accessList(f.access_log)) : null,
  ];
  return [back(...backTo), head, stepper(STEPS, STEP_OF[f.status], { label: L('مراحل الملاحظة', 'Finding stages') }), nextStep(f, ctx), grid('main-side', h('div.stack', main), h('div.stack', side.filter(Boolean)))];
}

function nextStep(f, ctx) {
  const c = f.can; const a = f.action;
  if (c.issue) return nextCard({ tone: 'emph', icon: 'send', title: L('راجع المسودة وأصدرها للإدارة', 'Review and issue to management'), body: L('بعد الإصدار تظهر الملاحظة لمدير الإدارة الخاضعة للتدقيق ليقدّم ردّه وخطة المعالجة.', 'Once issued, the auditee manager sees it and gives a response and action plan.'), action: btn(L('إصدار الملاحظة', 'Issue finding'), { primary: true, ic: 'send', onClick: (e) => issue(f, e.currentTarget) }) });
  if (c.issue_blocked_sod) return nextCard({ tone: 'warn', icon: 'shieldAlert', title: L('فصل المهام: لا تُصدر ملاحظة أثبتّها بنفسك', 'Segregation of duties: you raised this finding'), body: L('يصدرها رئيس تدقيق آخر أو تُعاد صياغتها من مدقق في الفريق.', 'Another CAE must issue it, or a team auditor must own the draft.') });
  if (c.edit) return nextCard({ tone: 'navy', icon: 'pencil', title: L('مسودة — تُستكمل ثم يصدرها رئيس التدقيق', 'Draft — complete it for the CAE to issue'), body: L('المسودات لا تظهر خارج مكتب التدقيق الداخلي.', 'Drafts are never visible outside Internal Audit.'), action: btn(L('تعديل المسودة', 'Edit draft'), { primary: true, ic: 'pencil', onClick: () => edit(f) }) });
  if (c.respond) return nextCard({ tone: 'warn', icon: 'messageSquare', title: L('قدّم رد الإدارة وخطة المعالجة', 'Give the management response and action plan'), body: L('حدّد موقف الإدارة والإجراء المطلوب ومسؤول التنفيذ وتاريخه.', 'State your position, the action, its owner and due date.'), action: btn(L('الرد الآن', 'Respond now'), { primary: true, ic: 'reply', onClick: (e) => respond(f, e.currentTarget) }) });
  if (c.progress) return nextCard({ tone: a.overdue ? 'warn' : 'emph', icon: 'listChecks', title: a.overdue ? L('خطة المعالجة متأخرة — حدّث حالتها', 'Action plan overdue — update it') : L('نفّذ خطة المعالجة وأبلغ بالتنفيذ مع الدليل', 'Implement the plan and report it with evidence'),
    body: L('التنفيذ قبل تاريخ الاستحقاق يمنحك +10 نقاط تميّز بعد تحقق التدقيق الداخلي.', 'Implementing by the due date earns +10 excellence points once validated.'),
    action: btn(L('تم التنفيذ', 'Mark implemented'), { primary: true, ic: 'fileCheck', onClick: (e) => progress(f, 'implemented', e.currentTarget) }), secondary: [btn(L('تحديث التقدم', 'Progress update'), { ic: 'loader', onClick: (e) => progress(f, 'in_progress', e.currentTarget) })] });
  if (c.close) return nextCard({ tone: 'emph', icon: 'fileCheck', title: L('تحقق من التنفيذ واعتمد الإغلاق', 'Verify implementation and validate closure'), body: L('راجع دليل التنفيذ في سجل المتابعة قبل الاعتماد.', 'Check the evidence in the history before validating.'),
    action: btn(L('اعتماد الإغلاق', 'Validate closure'), { primary: true, ic: 'badgeCheck', onClick: (e) => close(f, 'close', e.currentTarget) }), secondary: [btn(L('إعادة للتنفيذ', 'Return'), { ic: 'reply', onClick: (e) => close(f, 'return', e.currentTarget) })] });
  if (c.close_blocked_sod) return nextCard({ tone: 'warn', icon: 'shieldAlert', title: L('فصل المهام: لا تعتمد إغلاق ملاحظة أثبتّها أو شاركت في معالجتها', 'Segregation of duties: you raised or remediated this finding'), body: L('يعتمد الإغلاق رئيس تدقيق آخر مستقل عن الملاحظة وخطة معالجتها.', 'Another CAE, independent of the finding and its action plan, must validate closure.') });
  if (f.status === 'closed') return nextCard({ tone: 'good', icon: 'badgeCheck', title: L('الملاحظة مغلقة', 'Finding closed'), body: f.closed_at ? L(`اعتُمد الإغلاق في ${fmtDate(f.closed_at)}${f.closed_by ? ` — ${f.closed_by.name_ar}` : ''}`, `Closed on ${fmtDate(f.closed_at)}`) : null });
  if (f.status === 'issued') return nextCard({ tone: 'navy', icon: 'hourglass', title: L('بانتظار رد الإدارة', 'Awaiting management response'), body: L(`صدرت في ${fmtDate(f.issued_at)}`, `Issued on ${fmtDate(f.issued_at)}`) });
  if (f.status === 'implemented') return nextCard({ tone: 'navy', icon: 'hourglass', title: L('منفذة — بانتظار تحقق التدقيق الداخلي', 'Implemented — awaiting IA validation') });
  if (a) return nextCard({ tone: a.overdue ? 'warn' : 'navy', icon: a.overdue ? 'clockAlert' : 'loader', title: a.overdue ? L('خطة المعالجة متأخرة', 'Action plan overdue') : L('خطة المعالجة قيد التنفيذ', 'Action plan in progress'), body: dueLabel(a.due_date) });
  void ctx; return null;
}

// ---------------- actions ----------------
const FIELDS = (f = {}) => [
  { name: 'title', label: L('عنوان الملاحظة', 'Title'), required: true, full: true, maxLength: 300 },
  { name: 'risk', type: 'select', label: L('درجة الخطورة', 'Risk rating'), required: true, options: [['high', 'عالية', 'High'], ['medium', 'متوسطة', 'Medium'], ['low', 'منخفضة', 'Low']].map(([value, ar, en]) => ({ value, label: L(ar, en) })) },
  f.workpapers?.length ? { name: 'workpaper_id', type: 'select', label: L('ورقة العمل المرتبطة', 'Working paper'), options: f.workpapers.map((w) => ({ value: w.id, label: `${w.ref} — ${w.title}` })) } : null,
  { name: 'criteria', type: 'textarea', label: L('المعيار (ما يجب أن يكون)', 'Criteria (what should be)'), rows: 2 },
  { name: 'condition', type: 'textarea', label: L('الوضع القائم (ما وُجد)', 'Condition (what was found)'), required: true, rows: 3 },
  { name: 'cause', type: 'textarea', label: L('السبب', 'Cause'), rows: 2 },
  { name: 'effect', type: 'textarea', label: L('الأثر', 'Effect'), rows: 2 },
  { name: 'recommendation', type: 'textarea', label: L('التوصية', 'Recommendation'), required: true, rows: 3 },
].filter(Boolean);
export async function newFinding(e, workpapers = []) {
  const v = await formDialog({ title: L('ملاحظة جديدة', 'New finding'), intro: L('تُحفظ مسودةً داخل مكتب التدقيق حتى يصدرها رئيس التدقيق.', 'Saved as a draft inside IA until the CAE issues it.'), wide: true, fields: FIELDS({ workpapers }), submitLabel: L('حفظ المسودة', 'Save draft') });
  if (!v) return null;
  try { const f = await call(`/engagements/${e.id}/findings`, { method: 'POST', body: { ...v, workpaper_id: v.workpaper_id || undefined } }); location.hash = `${HREF}/f/${f.id}`; return f; }
  catch (err) { toast(err.message, { kind: 'error' }); return null; }
}
async function edit(f) {
  const v = await formDialog({ title: L('تعديل المسودة', 'Edit draft'), wide: true, values: f, fields: FIELDS().filter((x) => x.name !== 'workpaper_id'), submitLabel: L('حفظ', 'Save') });
  if (!v) return;
  await act(null, () => call(`/findings/${f.id}`, { method: 'PUT', body: v }), { success: L('حُفظت المسودة', 'Draft saved') });
}
async function withdraw(f, ctx) {
  if (!(await confirmDialog(L('سحب المسودة', 'Withdraw draft'), L('ستُسحب الملاحظة ولن تظهر في المهمة. يبقى الإجراء مسجلاً في سجل التدقيق.', 'The finding will be withdrawn from the engagement; the action stays in the audit trail.'), { danger: true, confirmLabel: L('سحب', 'Withdraw') }))) return;
  const r = await act(null, () => call(`/findings/${f.id}/withdraw`, { method: 'POST', body: { confirm: true } }), { success: L('سُحبت المسودة', 'Draft withdrawn') });
  if (r) go(ctx, 'e', f.engagement.id, 'findings');
}
async function issue(f, el) {
  if (!(await confirmDialog(L('إصدار الملاحظة', 'Issue the finding'), L(`ستظهر الملاحظة «${f.title}» لمدير ${f.department.name_ar} ويُطلب منه الرد وخطة المعالجة. لا يمكن تعديلها بعد الإصدار.`, `“${f.title}” becomes visible to the ${f.department.name_en} manager, who must respond. It cannot be edited afterwards.`), { confirmLabel: L('إصدار', 'Issue') }))) return;
  await act(el, () => call(`/findings/${f.id}/issue`, { method: 'POST', body: { confirm: true } }), { success: L('صدرت الملاحظة وأُبلغ مدير الإدارة', 'Issued; the manager was notified') });
}
async function respond(f, el) {
  const dir = await directory();
  const depts = state.me.managed_departments || [];
  const people = dir.filter((u) => depts.includes(u.department_id));
  const v = await formDialog({ title: L('رد الإدارة وخطة المعالجة', 'Management response & action plan'), intro: f.title, wide: true, values: { position: 'agree', owner_id: state.me.user.id },
    fields: [
      { name: 'position', type: 'select', label: L('موقف الإدارة', 'Position'), required: true, options: [{ value: 'agree', label: L('موافقة', 'Agree') }, { value: 'partial', label: L('موافقة جزئية', 'Partially agree') }] },
      { name: 'due_date', type: 'date', label: L('تاريخ التنفيذ المستهدف', 'Target date'), required: true, min: new Date().toISOString().slice(0, 10) },
      { name: 'response_text', type: 'textarea', label: L('رد الإدارة', 'Management response'), required: true, rows: 3, maxLength: 4000 },
      { name: 'action_description', type: 'textarea', label: L('الإجراء التصحيحي', 'Corrective action'), required: true, rows: 3, maxLength: 3000 },
      { name: 'owner_id', type: 'select', label: L('مسؤول التنفيذ', 'Owner'), required: true, full: true, options: people.map((u) => ({ value: u.id, label: `${L(u.name_ar, u.name_en)} — ${L(u.title_ar || '', u.title_en || '')}` })) },
    ], submitLabel: L('إرسال الرد', 'Submit response') });
  if (!v) return;
  await act(el, () => call(`/findings/${f.id}/respond`, { method: 'POST', body: v }), { success: L('أُرسل الرد وأُسندت خطة المعالجة', 'Response sent and action plan assigned') });
}
async function progress(f, status, el) {
  const v = await formDialog({ title: status === 'implemented' ? L('الإبلاغ عن التنفيذ', 'Report implementation') : L('تحديث التقدم', 'Progress update'), intro: f.action.description, wide: status === 'implemented',
    fields: [{ name: 'note', type: 'textarea', label: status === 'implemented' ? L('ما الذي نُفّذ؟ وما الدليل؟', 'What was done, and the evidence?') : L('ما الذي استجد؟', 'What changed?'), required: status === 'implemented', rows: 4, maxLength: 3000 }, status === 'implemented' ? await docField() : null].filter(Boolean),
    submitLabel: status === 'implemented' ? L('إبلاغ التدقيق الداخلي', 'Notify Internal Audit') : L('حفظ', 'Save') });
  if (!v) return;
  await act(el, () => call(`/findings/${f.id}/progress`, { method: 'POST', body: { status, note: v.note || '', doc_ids: v.doc_ids || [] } }), { success: status === 'implemented' ? L('أُبلغ التدقيق الداخلي للتحقق والإغلاق', 'Internal Audit notified to validate') : L('حُدّث التقدم', 'Progress updated') });
}
async function close(f, decision, el) {
  const v = await formDialog({ title: decision === 'close' ? L('اعتماد إغلاق الملاحظة', 'Validate closure') : L('إعادة خطة المعالجة للتنفيذ', 'Return the action plan'), intro: f.title,
    fields: [{ name: 'note', type: 'textarea', label: decision === 'close' ? L('نتيجة التحقق (اختياري)', 'Validation note (optional)') : L('سبب الإعادة', 'Why is it returned?'), required: decision !== 'close', rows: 3 }],
    submitLabel: decision === 'close' ? L('اعتماد الإغلاق', 'Validate') : L('إعادة', 'Return') });
  if (!v) return;
  await act(el, () => call(`/findings/${f.id}/close`, { method: 'POST', body: { decision, note: v.note || '' } }), { success: decision === 'close' ? L('أُغلقت الملاحظة', 'Finding closed') : L('أُعيدت الخطة للتنفيذ', 'Returned for completion') });
}
async function note(f) {
  const v = await formDialog({ title: L('ملاحظة داخلية', 'Internal note'), intro: L('تظهر لفريق التدقيق الداخلي فقط.', 'Visible to Internal Audit only.'), fields: [{ name: 'note', type: 'textarea', label: L('الملاحظة', 'Note'), required: true, rows: 3 }] });
  if (!v) return;
  await act(null, () => call(`/findings/${f.id}/note`, { method: 'POST', body: v }), { success: L('أُضيفت الملاحظة', 'Note added') });
}
