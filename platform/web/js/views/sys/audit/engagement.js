// Internal Audit — engagement record page (#/sys/audit/e/<id>[/<section>]):
// phase stepper, next step, and sections: overview · information requests ·
// working papers (IA only, restricted) · findings · report.
import { sysHeader, sysTabs, stepper, card, grid, confidentialBanner, dataTable, openSheet, accessLogList, confirmDialog, whoChip } from '../../../sys-kit.js';
import { h, icon, L, fmtNum, fmtDate, call, HREF, PHASES, phaseChip, phaseLabel, riskChip, findingChip, deptName, qChip, dueLabel, nextCard, btn, back, mount, demoChip, para, formDialog, act, toast, emptyState, personOpt, skeleton, errorState, statusChip } from './common.js';
import { requestCard } from './requests.js';
import { newFinding } from './finding.js';

const drafts = new Map(); // engagement id → unsaved executive-summary text (survives live refreshes)
const aiNotes = new Map(); // engagement id → label of the last drafted summary

export async function render(root, ctx) {
  const [, id, section = 'overview'] = ctx.params;
  await mount(root, ctx, async () => {
    const e = await call(`/engagements/${id}`);
    const wps = section === 'workpapers' && e.can.workpapers ? await call(`/engagements/${id}/workpapers`) : null;
    return { e, wps };
  }, ({ e, wps }) => page(e, wps, section, ctx));
}

function sectionsFor(e) {
  const v = e.viewer;
  return [
    { key: 'overview', ar: 'نظرة عامة', en: 'Overview', icon: 'layers' },
    v.ia || e.requests_list.length ? { key: 'requests', ar: 'طلبات المعلومات', en: 'Requests', icon: 'mailCheck', count: e.requests.open } : null,
    v.ia ? { key: 'workpapers', ar: 'أوراق العمل', en: 'Working papers', icon: 'lockKeyhole', count: e.workpapers?.n } : null,
    { key: 'findings', ar: 'الملاحظات', en: 'Findings', icon: 'fileWarning', count: e.findings_list.length },
    v.ia || e.report.issued_at ? { key: 'report', ar: 'التقرير', en: 'Report', icon: 'fileText' } : null,
  ].filter(Boolean).map((t) => ({ ...t, key: `e/${e.id}/${t.key}`, short: t.key }));
}

function page(e, wps, section, ctx) {
  const v = e.viewer;
  const tabs = sectionsFor(e);
  const cur = tabs.find((t) => t.short === section) || tabs[0];
  const backTo = v.ia ? [`${HREF}/board`, L('مهام التدقيق', 'Engagements')] : v.committee ? [`${HREF}/plan`, L('خطة التدقيق', 'Audit plan')] : [`${HREF}/mine`, L('ملاحظات إدارتي', 'My department')];
  const head = sysHeader(ctx, {
    eyebrow: L(`${deptName(e.department)} · الربع ${fmtNum(e.quarter)} · ${e.plan_year}`, `${deptName(e.department)} · Q${e.quarter} · ${e.plan_year}`), title: e.title, sub: false,
    badges: [phaseChip(e.phase), e.risk_score ? h('span.chip.tiny.outline', { 'data-tip': L('درجة مخاطر عنصر مجال التدقيق', 'Universe risk score') }, icon('radar'), L(`المخاطر ${e.risk_score}/25`, `Risk ${e.risk_score}/25`)) : null,
      e.added_after_approval ? h('span.chip.tiny.warn', icon('plus'), L('أضيفت بعد اعتماد الخطة', 'Added after plan approval')) : null, demoChip(e)].filter(Boolean),
    actions: e.can.edit ? [{ label: L('تعديل', 'Edit'), icon: 'pencil', onClick: () => editEngagement(e) }] : [],
  });
  const body = { overview, requests, workpapers, findings, report }[cur.short](e, ctx, wps);
  return [back(...backTo), head, stepper(PHASES, e.phase_index, { label: L('مراحل المهمة', 'Engagement phases') }), nextStep(e, ctx), sysTabs(ctx, tabs, cur.key), body];
}

// ---------------- next step ----------------
function nextStep(e, ctx) {
  const v = e.viewer; const c = e.can;
  const to = (s) => `${HREF}/e/${e.id}/${s}`;
  if (v.ia) {
    if (e.phase === 'planned') return nextCard({ tone: 'navy', icon: 'compass', title: L('المهمة مخطط لها ولم تبدأ', 'Planned — not started'), body: L(`عند البدء يُبلَّغ مدير ${deptName(e.department)} وتظهر له المهمة.`, `Starting notifies the ${deptName(e.department)} manager.`), action: c.advance ? btn(L('بدء مرحلة التخطيط', 'Start planning'), { primary: true, ic: 'play', onClick: (ev) => advance(e, 'planning', ev.currentTarget) }) : null });
    if (e.phase === 'planning') return nextCard({ tone: 'emph', icon: 'compass', title: L('خطط المهمة وأرسل طلبات المعلومات', 'Plan the work and send information requests'), body: L('حدّد برنامج العمل في أوراق العمل ثم انتقل إلى العمل الميداني.', 'Set up the work programme in working papers, then move to fieldwork.'), action: c.advance ? btn(L('بدء العمل الميداني', 'Start fieldwork'), { primary: true, ic: 'play', onClick: (ev) => advance(e, 'fieldwork', ev.currentTarget) }) : null, secondary: [c.add_request ? btn(L('طلب معلومات', 'Request info'), { ic: 'mailCheck', onClick: () => newRequest(e) }) : null] });
    if (e.phase === 'fieldwork') {
      if (e.requests.to_review) return nextCard({ tone: 'emph', icon: 'mailCheck', title: L(`راجع ${fmtNum(e.requests.to_review)} ${e.requests.to_review === 1 ? 'رداً' : 'ردود'} من الإدارة`, `Review ${e.requests.to_review} response(s)`), action: btn(L('مراجعة الردود', 'Review'), { primary: true, href: to('requests') }) });
      return nextCard({ tone: 'emph', icon: 'scanSearch', title: L('نفّذ الاختبارات وأثبت الملاحظات', 'Run the tests and record findings'), body: e.requests.overdue ? L(`${fmtNum(e.requests.overdue)} طلب معلومات متأخر لدى الإدارة`, `${e.requests.overdue} overdue request(s)`) : L('عند اكتمال العمل الميداني انتقل إلى إعداد التقرير.', 'When fieldwork is complete, move to reporting.'),
        action: c.add_finding ? btn(L('ملاحظة جديدة', 'New finding'), { primary: true, ic: 'plus', onClick: () => newFinding(e) }) : null, secondary: [c.advance ? btn(L('الانتقال لإعداد التقرير', 'Move to reporting'), { ic: 'fileText', onClick: (ev) => advance(e, 'reporting', ev.currentTarget) }) : null] });
    }
    if (e.phase === 'reporting') {
      if (c.issue_report_blocked) return nextCard({ tone: 'warn', icon: 'pencil', title: L(`${fmtNum(c.issue_report_blocked)} ملاحظات مسودة تحتاج إلى إصدار أو سحب`, `${c.issue_report_blocked} draft finding(s) to issue or withdraw`), body: L('تُصدر الملاحظات أولاً لتحصل على ردود الإدارة، ثم يصدر التقرير.', 'Issue findings first to get management responses, then the report.'), action: btn(L('مراجعة الملاحظات', 'Review findings'), { primary: true, href: to('findings') }) });
      if (c.issue_report) return nextCard({ tone: 'emph', icon: 'send', title: L('التقرير جاهز للإصدار', 'Report ready to issue'), body: L('راجع الملخص التنفيذي ثم أصدر التقرير؛ يُنشأ مستند في «المستندات» ويُتاح للجنة التدقيق والإدارة.', 'Check the executive summary, then issue: a Document is created and shared with the committee and management.'), action: btn(L('إلى التقرير', 'Go to report'), { primary: true, href: to('report') }) });
      return nextCard({ tone: 'emph', icon: 'fileText', title: L('أكمل الملخص التنفيذي', 'Complete the executive summary'), body: L('يصدر رئيس التدقيق التقرير بعد اكتماله.', 'The CAE issues the report once complete.'), action: btn(L('إلى التقرير', 'Go to report'), { primary: true, href: to('report') }) });
    }
    if (e.phase === 'follow_up') {
      if (c.close) return nextCard({ tone: 'good', icon: 'badgeCheck', title: L('أُغلقت جميع الملاحظات — أغلق المهمة', 'All findings closed — close the engagement'), action: btn(L('إغلاق المهمة', 'Close engagement'), { primary: true, ic: 'badgeCheck', onClick: (ev) => closeEngagement(e, ev.currentTarget) }) });
      return nextCard({ tone: 'navy', icon: 'listChecks', title: L(`متابعة ${fmtNum(e.findings.open)} ${e.findings.open === 1 ? 'ملاحظة مفتوحة' : 'ملاحظات مفتوحة'}`, `Following up ${e.findings.open} open finding(s)`), body: L('تُغلق المهمة بعد اعتماد إغلاق جميع الملاحظات.', 'The engagement closes once every finding is closed.'), action: btn(L('الملاحظات', 'Findings'), { primary: true, href: to('findings') }) });
    }
    return nextCard({ tone: 'good', icon: 'badgeCheck', title: L('المهمة مغلقة', 'Engagement closed'), body: e.closed_at ? L(`أُغلقت في ${fmtDate(e.closed_at)}`, `Closed on ${fmtDate(e.closed_at)}`) : null });
  }
  if (v.auditee) {
    const mine = e.requests_list.filter((r) => r.can.respond);
    if (mine.length) return nextCard({ tone: 'warn', icon: 'mailCheck', title: L(`${fmtNum(mine.length)} ${mine.length === 1 ? 'طلب معلومات بانتظار ردك' : 'طلبات معلومات بانتظار ردك'}`, `${mine.length} request(s) awaiting your reply`), action: btn(L('الرد', 'Reply'), { primary: true, href: to('requests') }) });
    const waiting = e.findings_list.filter((f) => f.status === 'issued');
    if (waiting.length) return nextCard({ tone: 'warn', icon: 'messageSquare', title: L('ملاحظة صادرة بانتظار رد الإدارة', 'Issued finding awaiting your response'), body: waiting[0].title, action: btn(L('الرد الآن', 'Respond now'), { primary: true, href: `${HREF}/f/${waiting[0].id}` }) });
    return nextCard({ tone: 'navy', icon: 'info', title: L(`المهمة في مرحلة «${phaseLabel(e.phase)}»`, `Engagement is in ${phaseLabel(e.phase)}`), body: L('سيتواصل معك فريق التدقيق عبر طلبات المعلومات والملاحظات الصادرة.', 'The audit team will reach you through requests and issued findings.') });
  }
  if (e.report.issued_at) return nextCard({ tone: 'emph', icon: 'fileCheck', title: L('صدر تقرير هذه المهمة', 'The report has been issued'), body: L(`بتاريخ ${fmtDate(e.report.issued_at)}`, `On ${fmtDate(e.report.issued_at)}`), action: btn(L('عرض التقرير', 'View report'), { primary: true, href: to('report') }) });
  return nextCard({ tone: 'navy', icon: 'hourglass', title: L('لم يصدر التقرير بعد', 'Report not issued yet'), body: L(`المرحلة الحالية: ${phaseLabel(e.phase)}`, `Current phase: ${phaseLabel(e.phase)}`) });
}

// ---------------- sections ----------------
function overview(e) {
  const v = e.viewer; const f = e.findings;
  return grid('main-side',
    h('div.stack',
      card(L('النطاق والأهداف', 'Scope & objectives'), h('div.aud-scope', h('div', h('div.lbl-sm', L('النطاق', 'Scope')), para(e.scope)), h('div', h('div.lbl-sm', L('الأهداف', 'Objectives')), para(e.objectives)))),
      card(L('الجدول الزمني', 'Timeline'), h('dl.sys-kv', h('dt', L('ربع التنفيذ', 'Quarter')), h('dd', qChip(e.quarter, e.plan_year)), h('dt', L('البدء المخطط', 'Planned start')), h('dd', e.start_date ? fmtDate(e.start_date) : '—'), h('dt', L('الانتهاء المخطط', 'Planned end')), h('dd', e.end_date ? [fmtDate(e.end_date), e.overdue ? h('span.chip.tiny.warn', { style: { marginInlineStart: '8px' } }, icon('clockAlert'), L('تجاوزت الموعد', 'Past planned end')) : null] : '—'),
        h('dt', L('بدأت', 'Started')), h('dd', e.started_at ? fmtDate(e.started_at) : '—'), h('dt', L('صدر التقرير', 'Report issued')), h('dd', e.report_issued_at ? fmtDate(e.report_issued_at) : '—')))),
    h('div.stack',
      card(L('فريق التدقيق', 'Audit team'), h('ul.aud-team', e.team.map((u) => h('li', whoChip(u), u.id === e.lead?.id ? h('span.chip.tiny.navy', L('قائد المهمة', 'Lead')) : null)))),
      card(L('لمحة', 'At a glance'), h('div.aud-glance',
        h('div', h('strong.num', fmtNum(f.total)), h('span', L('ملاحظات', 'findings'))),
        h('div.risk-high', h('strong.num', fmtNum(f.high)), h('span', L('عالية', 'high'))),
        h('div.risk-medium', h('strong.num', fmtNum(f.medium)), h('span', L('متوسطة', 'medium'))),
        h('div.risk-low', h('strong.num', fmtNum(f.low)), h('span', L('منخفضة', 'low')))),
      v.ia || e.requests.total ? h('p.tiny.faint', L(`طلبات المعلومات: ${fmtNum(e.requests.total)} (مفتوحة ${fmtNum(e.requests.open)}، متأخرة ${fmtNum(e.requests.overdue)})`, `Requests: ${e.requests.total} (${e.requests.open} open, ${e.requests.overdue} overdue)`)) : null,
      v.ia && e.workpapers ? h('p.tiny.faint', L(`أوراق العمل: ${fmtNum(e.workpapers.n)} (مسودة ${fmtNum(e.workpapers.draft || 0)})`, `Working papers: ${e.workpapers.n} (${e.workpapers.draft || 0} draft)`)) : null)));
}

function requests(e) {
  const list = e.requests_list;
  return h('div.stack',
    e.can.add_request ? h('div.aud-section-bar', h('p.tiny.faint.grow', L(`تُوجَّه الطلبات إلى مدير ${deptName(e.department)} ويصله تنبيه.`, `Requests go to the ${deptName(e.department)} manager with an alert.`)), btn(L('طلب معلومات جديد', 'New request'), { primary: true, ic: 'plus', onClick: () => newRequest(e) })) : null,
    list.length ? h('div.aud-req-list', list.map((r) => requestCard(r, { showEngagement: false })))
      : h('div.card', emptyState({ icon: 'mailCheck', title: L('لا طلبات معلومات بعد', 'No information requests yet'), body: e.can.add_request ? L('اطلب المستندات والبيانات اللازمة من الإدارة الخاضعة للتدقيق.', 'Ask the auditee for the documents and data you need.') : null, actions: e.can.add_request ? [{ label: L('طلب معلومات جديد', 'New request'), primary: true, onClick: () => newRequest(e) }] : [] })));
}

const WPRES = { pending: ['قيد الاختبار', 'Pending', 'outline', 'hourglass'], satisfactory: ['مرضٍ', 'Satisfactory', 'good', 'circleCheck'], exception: ['استثناء', 'Exception', 'warn', 'alert'] };
const WPSTAT = { draft: ['مسودة', 'Draft', 'outline', 'pencil'], reviewed: ['تمت المراجعة', 'Reviewed', 'good', 'badgeCheck'] };
function workpapers(e, ctx, wps) {
  return h('div.stack',
    confidentialBanner('أوراق العمل سرية للغاية: للمدققين الداخليين فقط، ومحجوبة عن الإدارة واللجنة والمدقق الخارجي والمساعد الذكي. يُسجَّل كل اطلاع وتعديل.', 'Restricted: internal auditors only — hidden from management, the committee, the external auditor and Ask AI. Every view and change is logged.', { level: 'restricted' }),
    e.can.add_workpaper ? h('div.aud-section-bar', h('span.grow'), btn(L('ورقة عمل جديدة', 'New working paper'), { primary: true, ic: 'plus', onClick: () => editWorkpaper(e) })) : null,
    h('section.card.sys-card', dataTable({
      caption: L('أوراق العمل', 'Working papers'), rows: wps || [], onRow: (w) => workpaperSheet(e, w.id),
      empty: emptyState({ compact: true, icon: 'notebook', title: L('لا أوراق عمل بعد', 'No working papers yet'), body: L('وثّق خطوات الاختبار والأدلة والاستنتاج لكل إجراء تدقيق.', 'Document test steps, evidence and conclusion for each procedure.') }),
      columns: [
        { key: 'ref', label: L('المرجع', 'Ref'), render: (w) => h('span.num', w.ref), sort: (w) => w.ref, width: '84px' },
        { key: 'title', label: L('الإجراء', 'Procedure'), render: (w) => h('strong', w.title), sort: (w) => w.title },
        { key: 'result', label: L('النتيجة', 'Result'), render: (w) => statusChip(w.result, WPRES), sort: (w) => w.result },
        { key: 'status', label: L('الحالة', 'Status'), render: (w) => statusChip(w.status, WPSTAT), sort: (w) => w.status },
        { key: 'by', label: L('المعد / المراجع', 'Prepared / reviewed'), render: (w) => h('span.tiny', `${w.prepared_by_user?.name_ar || '—'}${w.reviewed_by_user ? ` / ${w.reviewed_by_user.name_ar}` : ''}`) },
      ],
    })));
}

function findings(e) {
  const v = e.viewer; const list = e.findings_list;
  if (!v.ia && !v.auditee && !e.report.issued_at) return h('div.card', emptyState({ icon: 'lock', title: L('تظهر الملاحظات بعد إصدار التقرير', 'Findings appear once the report is issued') }));
  return h('div.stack',
    e.can.add_finding ? h('div.aud-section-bar', h('p.tiny.faint.grow', L('تُحفظ الملاحظات مسودات داخل مكتب التدقيق حتى يصدرها رئيس التدقيق.', 'Findings stay drafts inside IA until the CAE issues them.')), btn(L('ملاحظة جديدة', 'New finding'), { primary: true, ic: 'plus', onClick: () => newFindingWithWps(e) })) : null,
    h('section.card.sys-card', dataTable({
      caption: L('الملاحظات', 'Findings'), rows: list, onRow: (f) => { location.hash = `${HREF}/f/${f.id}`; },
      empty: emptyState({ compact: true, icon: 'searchCheck', title: v.ia ? L('لا ملاحظات بعد', 'No findings yet') : L('لا ملاحظات صادرة', 'No issued findings'), body: v.ia ? null : L('المسودات لا تُعرض خارج مكتب التدقيق.', 'Drafts are not shown outside IA.') }),
      columns: [
        { key: 'title', label: L('الملاحظة', 'Finding'), render: (f) => h('div.aud-cell-title', h('a', { href: `${HREF}/f/${f.id}` }, f.title), h('div.tiny.faint', f.ref)), sort: (f) => f.ref },
        { key: 'risk', label: L('الخطورة', 'Risk'), render: (f) => riskChip(f.risk, { prefix: false }), sort: (f) => ({ high: 0, medium: 1, low: 2 }[f.risk]) },
        { key: 'status', label: L('الحالة', 'Status'), render: (f) => findingChip(f.status), sort: (f) => f.status },
        { key: 'due', label: L('استحقاق المعالجة', 'Action due'), render: (f) => (f.action ? dueLabel(f.action.due_date, { done: ['implemented', 'closed'].includes(f.action.status) }) : h('span.faint', '—')), sort: (f) => f.action?.due_date || '9999' },
      ],
    })));
}

function report(e, ctx) {
  const v = e.viewer; const r = e.report;
  if (r.issued_at) {
    return grid('main-side',
      h('div.stack', card(L('الملخص التنفيذي', 'Executive summary'), para(r.exec_summary)),
        card(L('ملاحظات التقرير', 'Report findings'), e.findings_list.length ? h('ul.list.separated', e.findings_list.map((f) => h('li.clickable', { tabindex: 0, onclick: () => { location.hash = `${HREF}/f/${f.id}`; }, onkeydown: (ev) => { if (ev.key === 'Enter') location.hash = `${HREF}/f/${f.id}`; } }, riskChip(f.risk, { prefix: false }), h('span.grow', h('span.title', f.title)), findingChip(f.status)))) : h('p.faint', L('لا ملاحظات', 'No findings')))),
      h('div.stack', card(L('التقرير الصادر', 'Issued report'), h('dl.sys-kv', h('dt', L('تاريخ الإصدار', 'Issued')), h('dd', fmtDate(r.issued_at)), h('dt', L('أصدره', 'Issued by')), h('dd', r.issued_by ? L(r.issued_by.name_ar, r.issued_by.name_en) : '—')),
        r.doc_id ? btn(L('فتح التقرير في المستندات', 'Open in Documents'), { primary: true, ic: 'fileText', onClick: () => import('../../../editor.js').then((m) => m.open(r.doc_id)) }) : h('p.tiny.faint', L('نسخة المستند متاحة لرئيس التدقيق ولجنة التدقيق ومدير الإدارة.', 'The document copy is shared with the CAE, the committee and the department manager.')),
        h('p.tiny.faint', L('يمكن تصدير المستند إلى Word أو PDF من محرر المستندات.', 'Export to Word or PDF from the document editor.')))));
  }
  if (!v.ia) return h('div.card', emptyState({ icon: 'hourglass', title: L('لم يصدر التقرير بعد', 'The report has not been issued yet') }));
  const c = e.can;
  const val = drafts.has(e.id) ? drafts.get(e.id) : (r.exec_summary || '');
  const ta = h('textarea.field.aud-summary', { rows: 9, maxlength: 6000, id: `sum-${e.id}`, disabled: !c.edit_summary || null, 'aria-label': L('الملخص التنفيذي', 'Executive summary'), placeholder: L('اكتب الملخص التنفيذي للتقرير، أو اطلب مسودة ذكية…', 'Write the executive summary, or ask for a smart draft…'), oninput: (ev) => { drafts.set(e.id, ev.target.value); count.textContent = fmtNum(ev.target.value.trim().length); } }, val);
  const count = h('span.num', fmtNum(val.trim().length));
  const note = aiNotes.get(e.id);
  const checks = [
    [e.phase === 'reporting', L('المهمة في مرحلة إعداد التقرير', 'Engagement is in reporting')],
    [!c.issue_report_blocked, c.issue_report_blocked ? L(`${fmtNum(c.issue_report_blocked)} ملاحظات مسودة لم تُصدر`, `${c.issue_report_blocked} drafts not issued`) : L('جميع الملاحظات صادرة', 'All findings issued')],
    [val.trim().length >= 30, L('ملخص تنفيذي من 30 حرفاً على الأقل', 'Executive summary ≥ 30 characters')],
  ];
  return grid('main-side',
    card(h('div.row.grow', h('h2.card-title', L('الملخص التنفيذي', 'Executive summary')), h('span.tiny.faint', count, L(' حرفاً', ' chars'))),
      ta,
      note ? h(`div.aud-ai-note.${note.method}`, icon(note.method === 'ai' ? 'spark' : 'sigma'), L(note.note_ar, note.note_en)) : null,
      h('div.aud-summary-actions',
        c.draft_summary ? btn(L('مسودة ذكية', 'Smart draft'), { tertiary: true, ic: 'spark', onClick: (ev) => smartDraft(e, ev.currentTarget) }) : null,
        c.edit_summary ? btn(L('حفظ', 'Save'), { ic: 'check', onClick: (ev) => saveSummary(e, ev.currentTarget) }) : null,
        h('span.grow'),
        c.issue_report || c.issue_report_blocked ? btn(L('إصدار التقرير', 'Issue report'), { primary: true, ic: 'send', onClick: (ev) => issueReport(e, ev.currentTarget) }) : null)),
    card(L('قائمة التحقق قبل الإصدار', 'Pre-issue checklist'), h('ul.aud-checks', checks.map(([ok, label]) => h(`li.${ok ? 'ok' : 'todo'}`, icon(ok ? 'circleCheck' : 'circleDashed'), label))),
      h('p.tiny.faint', L('عند الإصدار يُنشأ مستند «تقرير» في وحدة المستندات باسمك (قابل للتصدير إلى Word وPDF)، ويُشارك للاطلاع مع لجنة التدقيق ومدير الإدارة.', 'Issuing creates a “report” Document under your name (exportable to Word/PDF), shared read-only with the committee and the department manager.'))));
}

// ---------------- actions ----------------
async function advance(e, to, el) {
  if (to === 'planning' && !(await confirmDialog(L('بدء المهمة', 'Start the engagement'), L(`سيُبلَّغ مدير ${deptName(e.department)} ببدء المهمة وستظهر له في النظام.`, `The ${deptName(e.department)} manager will be notified and will see the engagement.`), { confirmLabel: L('بدء', 'Start') }))) return;
  await act(el, () => call(`/engagements/${e.id}/phase`, { method: 'POST', body: { to } }), { success: L(`انتقلت المهمة إلى «${phaseLabel(to)}»`, `Moved to ${phaseLabel(to)}`) });
}
async function closeEngagement(e, el) {
  if (!(await confirmDialog(L('إغلاق المهمة', 'Close the engagement'), L('أُغلقت جميع الملاحظات. ستُغلق المهمة وتُحفظ للأرشيف.', 'All findings are closed. The engagement will be closed and archived.'), { confirmLabel: L('إغلاق', 'Close') }))) return;
  await act(el, () => call(`/engagements/${e.id}/phase`, { method: 'POST', body: { to: 'closed' } }), { success: L('أُغلقت المهمة', 'Engagement closed') });
}
async function newRequest(e) {
  const v = await formDialog({ title: L('طلب معلومات جديد', 'New information request'), intro: L(`يُوجَّه إلى مدير ${deptName(e.department)}.`, `Goes to the ${deptName(e.department)} manager.`), wide: true, fields: [
    { name: 'title', label: L('المطلوب', 'What is needed'), required: true, full: true, maxLength: 300 },
    { name: 'due_date', type: 'date', label: L('تاريخ الاستحقاق', 'Due date'), required: true, min: new Date().toISOString().slice(0, 10) },
    { name: 'details', type: 'textarea', label: L('تفاصيل', 'Details'), rows: 3, maxLength: 3000 },
  ], submitLabel: L('إرسال الطلب', 'Send request') });
  if (!v) return;
  try { await call(`/engagements/${e.id}/requests`, { method: 'POST', body: { title: v.title, due_date: v.due_date, details: v.details || undefined } }); toast(L('أُرسل الطلب وأُبلغ مدير الإدارة', 'Request sent; the manager was notified')); }
  catch (err) { toast(err.message, { kind: 'error' }); }
}
async function newFindingWithWps(e) {
  const wps = await call(`/engagements/${e.id}/workpapers`).catch(() => []);
  return newFinding(e, wps);
}
async function editEngagement(e) {
  const people = await call('/people');
  const v = await formDialog({ title: L('تعديل المهمة', 'Edit engagement'), wide: true,
    values: { title: e.title, scope: e.scope, objectives: e.objectives, quarter: String(e.quarter), start_date: e.start_date, end_date: e.end_date, lead_id: e.lead?.id, team: e.team.map((t) => t.id) },
    fields: [
      { name: 'title', label: L('العنوان', 'Title'), required: true, full: true, maxLength: 200 },
      e.phase === 'planned' ? { name: 'quarter', type: 'select', label: L('ربع التنفيذ', 'Quarter'), required: true, options: [1, 2, 3, 4].map((q) => ({ value: String(q), label: L(`الربع ${q}`, `Q${q}`) })) } : null,
      { name: 'lead_id', type: 'select', label: L('قائد المهمة', 'Lead'), required: true, options: people.auditors.map(personOpt) },
      { name: 'start_date', type: 'date', label: L('البدء المخطط', 'Planned start') }, { name: 'end_date', type: 'date', label: L('الانتهاء المخطط', 'Planned end') },
      { name: 'team', type: 'multiselect', label: L('الفريق', 'Team'), options: people.auditors.map(personOpt) },
      { name: 'scope', type: 'textarea', label: L('النطاق', 'Scope'), rows: 3 }, { name: 'objectives', type: 'textarea', label: L('الأهداف', 'Objectives'), rows: 3 },
    ].filter(Boolean) });
  if (!v) return;
  const body = { ...v, quarter: v.quarter ? Number(v.quarter) : undefined, start_date: v.start_date || undefined, end_date: v.end_date || undefined };
  await act(null, () => call(`/engagements/${e.id}`, { method: 'PUT', body }), { success: L('حُفظت التعديلات', 'Saved') });
}
async function smartDraft(e, el) {
  const r = await act(el, () => call(`/engagements/${e.id}/summary-draft`, { method: 'POST', body: {} }));
  if (!r) return;
  drafts.set(e.id, r.text); aiNotes.set(e.id, r);
  const ta = document.getElementById(`sum-${e.id}`);
  if (ta) { ta.value = r.text; ta.dispatchEvent(new Event('input')); }
  const box = ta?.closest('.card');
  box?.querySelector('.aud-ai-note')?.remove();
  ta?.after(h(`div.aud-ai-note.${r.method}`, icon(r.method === 'ai' ? 'spark' : 'sigma'), L(r.note_ar, r.note_en)));
  toast(r.method === 'ai' ? L('جُهزت مسودة — راجعها قبل الحفظ', 'Draft ready — review before saving') : L('جُهزت مسودة محلية شفافة من بيانات المهمة', 'Transparent local draft prepared from the engagement data'), { kind: 'info' });
}
async function saveSummary(e, el) {
  const text = document.getElementById(`sum-${e.id}`)?.value ?? '';
  const r = await act(el, () => call(`/engagements/${e.id}/summary`, { method: 'PUT', body: { exec_summary: text } }), { success: L('حُفظ الملخص التنفيذي', 'Summary saved') });
  if (r) drafts.delete(e.id);
}
async function issueReport(e, el) {
  const text = document.getElementById(`sum-${e.id}`)?.value ?? '';
  if (e.can.issue_report_blocked) { toast(L('أصدِر الملاحظات المسودة أو اسحبها أولاً', 'Issue or withdraw the draft findings first'), { kind: 'error' }); return; }
  if (text.trim().length < 30) { toast(L('الملخص التنفيذي قصير جداً', 'The executive summary is too short'), { kind: 'error' }); document.getElementById(`sum-${e.id}`)?.focus(); return; }
  if (!(await confirmDialog(L('إصدار تقرير التدقيق', 'Issue the audit report'), L(`سيُنشأ مستند التقرير في «المستندات» ويُتاح للجنة التدقيق ولمدير ${deptName(e.department)}، وتنتقل المهمة إلى المتابعة. لا يمكن التراجع عن الإصدار.`, `A report Document is created and shared with the committee and the ${deptName(e.department)} manager; the engagement moves to follow-up. This cannot be undone.`), { confirmLabel: L('إصدار', 'Issue') }))) return;
  const r = await act(el, () => call(`/engagements/${e.id}/issue-report`, { method: 'POST', body: { exec_summary: text, confirm: true } }), { success: L('صدر التقرير وأُنشئ المستند', 'Report issued; Document created') });
  if (r) { drafts.delete(e.id); aiNotes.delete(e.id); location.hash = `${HREF}/e/${e.id}/report`; }
}

// ---------------- working paper sheet & form ----------------
async function workpaperSheet(e, id) {
  const sheet = openSheet({ title: L('ورقة عمل', 'Working paper'), body: skeleton('card'), wide: true, badges: [h('span.chip.tiny.crit.class-chip', icon('lockKeyhole'), L('سري للغاية', 'Restricted'))] });
  try {
    const w = await call(`/workpapers/${id}`);
    const acts = h('div.row-wrap',
      w.can.edit ? btn(L('تعديل', 'Edit'), { ic: 'pencil', onClick: () => { sheet.close(); editWorkpaper(e, w); } }) : null,
      w.can.review ? btn(L('اعتماد المراجعة', 'Sign off review'), { primary: true, ic: 'badgeCheck', onClick: async (ev) => { const r = await act(ev.currentTarget, () => call(`/workpapers/${id}/review`, { method: 'POST', body: {} }), { success: L('اعتُمدت مراجعة ورقة العمل', 'Review signed off') }); if (r) sheet.close(); } }) : null);
    sheet.setBody(h('div.stack',
      h('div', h('div.eyebrow', w.ref), h('h3.t-title3', w.title), h('div.row-wrap', statusChip(w.result, WPRES), statusChip(w.status, WPSTAT))),
      h('div', h('div.lbl-sm', L('خطوات الاختبار', 'Test steps')), para(w.procedure)),
      h('div', h('div.lbl-sm', L('ملاحظات الأدلة', 'Evidence notes')), para(w.evidence)),
      h('div', h('div.lbl-sm', L('الاستنتاج', 'Conclusion')), para(w.conclusion)),
      h('dl.sys-kv', h('dt', L('أعدها', 'Prepared by')), h('dd', w.prepared_by_user ? L(w.prepared_by_user.name_ar, w.prepared_by_user.name_en) : '—'), h('dt', L('راجعها', 'Reviewed by')), h('dd', w.reviewed_by_user ? `${L(w.reviewed_by_user.name_ar, w.reviewed_by_user.name_en)} · ${fmtDate(w.reviewed_at)}` : '—')),
      w.can.review_blocked_sod ? h('div.callout', icon('shieldAlert'), L('فصل المهام: لا تراجع ورقة عمل أعددتها بنفسك.', 'Segregation of duties: you cannot review your own working paper.')) : null,
      acts.childElementCount ? acts : null,
      w.access_log ? h('div', h('div.lbl-sm', L('سجل الاطلاع', 'Access log')), accessLogList(w.access_log)) : null));
  } catch (err) { sheet.setBody(errorState(err)); }
}
async function editWorkpaper(e, w = null) {
  const v = await formDialog({ title: w ? L('تعديل ورقة العمل', 'Edit working paper') : L('ورقة عمل جديدة', 'New working paper'), wide: true, values: w || { result: 'pending' },
    fields: [
      { name: 'title', label: L('إجراء التدقيق', 'Audit procedure'), required: true, full: true, maxLength: 300 },
      { name: 'result', type: 'select', label: L('النتيجة', 'Result'), required: true, options: Object.entries(WPRES).map(([value, [ar, en]]) => ({ value, label: L(ar, en) })) },
      { name: 'procedure', type: 'textarea', label: L('خطوات الاختبار', 'Test steps'), rows: 4 },
      { name: 'evidence', type: 'textarea', label: L('ملاحظات الأدلة', 'Evidence notes'), rows: 3 },
      { name: 'conclusion', type: 'textarea', label: L('الاستنتاج', 'Conclusion'), rows: 2 },
    ], submitLabel: L('حفظ', 'Save') });
  if (!v) return;
  await act(null, () => (w ? call(`/workpapers/${w.id}`, { method: 'PUT', body: v }) : call(`/engagements/${e.id}/workpapers`, { method: 'POST', body: v })), { success: L('حُفظت ورقة العمل', 'Working paper saved') });
}
