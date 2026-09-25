// Internal Audit — external auditor requests.
//  • External auditor (portal «طلباتي»): his own requests and released replies only.
//  • Internal Audit («المدقق الخارجي»): assign to a department manager, review, release.
//  • Assigned manager: prepare the reply (from the requests tab or the record page).
import { board, statRow, statTile, confirmDialog, confidentialBanner, sysHeader, stepper, card, grid } from '../../../sys-kit.js';
import { accessList } from './common.js';
import { h, icon, L, fmtNum, fmtDate, call, HREF, extChip, dueLabel, docList, docField, formDialog, act, toast, emptyState, nextCard, btn, back, mount, demoChip, demoBadge, para, statusChip } from './common.js';

// What the external auditor sees: no internal routing vocabulary.
const PUBLIC = { submitted: ['مستلم', 'Received', 'outline', 'inbox'], in_progress: ['قيد الإعداد', 'In progress', 'navy', 'hourglass'], released: ['تم الرد', 'Answered', 'good', 'circleCheck'] };
const pubChip = (s) => statusChip(s, PUBLIC);
// External identities never get Ask AI: drop the policy chip from their header.
const noAiChip = (head) => { head.querySelector('.ai-chip')?.remove(); return head; };

export const load = () => call('/ext');
export function header(tab, me, ctx, list) {
  if (tab === 'portal') return {
    badges: demoBadge(list),
    eyebrow: L('بوابة المدقق الخارجي', 'External auditor portal'), title: L('طلباتي', 'My requests'),
    sub: L('قدّم طلبات المعلومات إلى الجهة وتابع حالتها. تظهر هنا طلباتك والردود المعتمدة من مكتب التدقيق الداخلي فقط.', 'Submit information requests and follow their status. Only your requests and replies released by Internal Audit appear here.'),
    actions: [{ label: L('طلب جديد', 'New request'), icon: 'plus', primary: true, onClick: () => newRequest() }],
  };
  return { badges: demoBadge(list), eyebrow: L('التدقيق الداخلي', 'Internal Audit'), title: L('طلبات المدقق الخارجي', 'External auditor requests'),
    sub: L('يُسند مكتب التدقيق كل طلب إلى الإدارة المختصة، ويراجع الرد قبل الإفراج عنه. لا يطّلع المدقق الخارجي على التعليمات الداخلية أو هوية المُعِد.', 'IA routes each request to the right department and reviews the reply before release. The external auditor never sees internal instructions or who prepared it.') };
}

// ---------------- actions ----------------
async function newRequest() {
  const v = await formDialog({ title: L('طلب معلومات جديد', 'New information request'), wide: true, fields: [
    { name: 'title', label: L('المطلوب', 'What do you need?'), required: true, full: true, maxLength: 300, placeholder: L('مثال: تزويدنا بسجل الأصول الثابتة لعام 2025', 'e.g. Fixed asset register for 2025') },
    { name: 'details', type: 'textarea', label: L('تفاصيل', 'Details'), rows: 4, maxLength: 3000 },
    { name: 'due_date', type: 'date', label: L('مطلوب قبل', 'Needed by'), min: new Date().toISOString().slice(0, 10) },
  ], submitLabel: L('إرسال الطلب', 'Submit request') });
  if (!v) return;
  try { await call('/ext', { method: 'POST', body: { title: v.title, details: v.details || undefined, due_date: v.due_date || undefined } }); toast(L('أُرسل طلبك إلى مكتب التدقيق الداخلي', 'Your request was sent to Internal Audit')); }
  catch (e) { toast(e.message, { kind: 'error' }); }
}
async function assign(x, el) {
  const people = await call('/people');
  const v = await formDialog({ title: L('إسناد الطلب إلى إدارة', 'Route to a department'), intro: x.title, values: { to_user_id: x.assigned_to?.id, note: x.internal_note || '' }, fields: [
    { name: 'to_user_id', type: 'select', label: L('مدير الإدارة المختصة', 'Department manager'), required: true, options: people.managers.map((m) => ({ value: m.id, label: `${L(m.name_ar, m.name_en)} — ${L(m.dept_ar, m.dept_en)}` })) },
    { name: 'note', type: 'textarea', label: L('تعليمات داخلية (لا يراها المدقق الخارجي)', 'Internal instructions (never shown externally)'), rows: 3, maxLength: 2000 },
  ], submitLabel: L('إسناد', 'Assign') });
  if (!v) return;
  await act(el, () => call(`/ext/${x.id}/assign`, { method: 'POST', body: v }), { success: L('أُسند الطلب', 'Request routed') });
}
async function prepare(x, el) {
  const v = await formDialog({ title: L('إعداد الرد', 'Prepare the reply'), intro: x.title, wide: true, values: { response_text: x.response_text || '' }, fields: [
    x.internal_note ? { name: 'i', type: 'info', label: `${L('تعليمات مكتب التدقيق: ', 'IA instructions: ')}${x.internal_note}` } : null,
    { name: 'response_text', type: 'textarea', label: L('نص الرد', 'Reply'), required: true, rows: 5, maxLength: 6000 }, await docField(),
  ].filter(Boolean), submitLabel: L('إرسال لمراجعة التدقيق', 'Send for IA review') });
  if (!v) return;
  await act(el, () => call(`/ext/${x.id}/prepare`, { method: 'POST', body: { response_text: v.response_text, doc_ids: v.doc_ids || [] } }), { success: L('أُرسل الرد لمراجعة مكتب التدقيق', 'Sent to Internal Audit for review') });
}
async function release(x, el) {
  const v = await formDialog({ title: L('الإفراج عن الرد للمدقق الخارجي', 'Release to the external auditor'), wide: true, values: { released_text: x.response_text || '' },
    intro: L('راجع النص قبل الإفراج؛ يمكنك تحريره. سيطّلع المدقق الخارجي على هذا النص والمستندات المرفقة فقط.', 'Review the text before release; you may edit it. The external auditor sees only this text and the attached documents.'),
    fields: [{ name: 'released_text', type: 'textarea', label: L('نص الرد المُفرج عنه', 'Released reply'), required: true, rows: 6, maxLength: 6000 }], submitLabel: L('متابعة', 'Continue') });
  if (!v) return;
  if (!(await confirmDialog(L('تأكيد الإفراج', 'Confirm release'), L(`سيُتاح الرد و${fmtNum(x.docs.length)} مستند مرفق للمدقق الخارجي. لا يمكن التراجع عن الإفراج.`, `The reply and ${x.docs.length} attached document(s) become visible to the external auditor. This cannot be undone.`), { confirmLabel: L('إفراج', 'Release') }))) return;
  await act(el, () => call(`/ext/${x.id}/release`, { method: 'POST', body: { released_text: v.released_text, confirm: true } }), { success: L('أُفرج عن الرد', 'Reply released') });
}
async function sendBack(x, el) {
  const v = await formDialog({ title: L('إعادة الرد إلى الإدارة', 'Return to the department'), fields: [{ name: 'note', type: 'textarea', label: L('المطلوب تعديله', 'What should change'), required: true, rows: 3 }], submitLabel: L('إعادة', 'Return') });
  if (!v) return;
  await act(el, () => call(`/ext/${x.id}/return`, { method: 'POST', body: v }), { success: L('أُعيد الرد للإدارة', 'Returned to the department') });
}

// ---------------- cards ----------------
// Manager-facing card (requests tab).
export function extCard(x, { highlight = false } = {}) {
  return h(`article.card.aud-req${x.overdue ? '.late' : ''}${highlight ? '.flash.selected' : ''}`, { id: `req-${x.id}` },
    h('div.aud-req-head', extChip(x.status), dueLabel(x.due_date, { done: ['prepared', 'released'].includes(x.status) }), h('span.grow'), h('span.chip.tiny.outline', icon('globe'), L('المدقق الخارجي', 'External auditor'))),
    h('h3.aud-req-title', h('a', { href: `${HREF}/x/${x.id}` }, x.title)),
    x.details ? h('p.aud-para.muted', x.details) : null,
    x.internal_note ? h('div.callout', icon('shield'), h('div', h('strong', L('تعليمات مكتب التدقيق: ', 'IA instructions: ')), x.internal_note)) : null,
    x.return_note && x.status === 'assigned' ? h('div.callout.aud-callout-warn', icon('reply'), h('div', h('strong', L('مطلوب تعديل: ', 'Changes requested: ')), x.return_note)) : null,
    x.response_text ? h('div.aud-reply', h('div.aud-reply-head', icon('messageSquare'), h('strong', L('ردك', 'Your reply')), h('span.tiny.faint', fmtDate(x.prepared_at))), h('p.aud-para', x.response_text), docList(x.docs)) : null,
    x.can?.prepare ? h('div.aud-req-actions', btn(x.response_text ? L('تعديل الرد', 'Edit reply') : L('إعداد الرد', 'Prepare reply'), { primary: true, ic: 'reply', onClick: (e) => prepare(x, e.currentTarget) })) : null);
}
const PORTAL_STEPS = [{ ar: 'مستلم', en: 'Received' }, { ar: 'قيد الإعداد', en: 'In progress' }, { ar: 'تم الرد', en: 'Answered' }];
const portalIndex = (s) => (s === 'released' ? 3 : s === 'in_progress' ? 1 : 0);
function portalCard(x) {
  return h(`article.card.aud-portal-card${x.status === 'released' ? '.done' : ''}`,
    h('div.aud-req-head', pubChip(x.status), x.due_date ? h('span.tiny.faint', L(`مطلوب قبل ${fmtDate(x.due_date)}`, `Needed by ${fmtDate(x.due_date)}`)) : null, h('span.grow'), h('span.tiny.faint', L(`أُرسل ${fmtDate(x.created_at)}`, `Sent ${fmtDate(x.created_at)}`))),
    h('h3.aud-req-title', { dir: 'auto' }, h('a', { href: `${HREF}/x/${x.id}` }, x.title)),
    stepper(PORTAL_STEPS, portalIndex(x.status)),
    x.status === 'released' ? h('div.aud-reply.released', h('div.aud-reply-head', icon('circleCheck'), h('strong', L('الرد المعتمد', 'Released reply')), h('span.tiny.faint', fmtDate(x.released_at))), h('p.aud-para', { dir: 'auto' }, x.released_text), docList(x.docs)) : null);
}
function iaCard(x) {
  return h('a.board-card.aud-xcard', { href: `${HREF}/x/${x.id}` },
    h('div.bc-title', x.title),
    h('div.bc-meta', x.due_date ? dueLabel(x.due_date, { done: x.status === 'released' }) : h('span', L('بلا موعد محدد', 'No date'))),
    x.assigned_to ? h('div.bc-meta', icon('building'), L(`${x.assigned_to.name_ar} — ${x.assigned_to.dept_ar}`, `${x.assigned_to.name_en} — ${x.assigned_to.dept_en}`)) : null);
}

export function paint(tab, me, ctx, list) {
  if (tab === 'portal') {
    if (ctx.params[1] === 'new') setTimeout(async () => { history.replaceState(null, '', `${HREF}/portal`); await newRequest(); }, 60);
    const open = list.filter((x) => x.status !== 'released');
    return h('div.aud-portal',
      confidentialBanner('بوابة مخصصة للمدقق الخارجي: لا تظهر هنا أي بيانات داخلية أخرى للجهة.', 'Dedicated external auditor portal: no other internal data of the entity is shown here.'),
      statRow([
        statTile({ label: L('طلباتي', 'My requests'), value: list.length, icon: 'inbox' }),
        statTile({ label: L('قيد المعالجة', 'In progress'), value: open.length, icon: 'hourglass', tone: open.length ? 'emph' : null }),
        statTile({ label: L('تم الرد', 'Answered'), value: list.length - open.length, icon: 'circleCheck', tone: 'good' }),
      ]),
      list.length ? h('div.aud-portal-list', list.map(portalCard))
        : h('div.card', emptyState({ icon: 'inboxEmpty', title: L('لا طلبات بعد', 'No requests yet'), body: L('قدّم طلبك الأول وسيتابعه مكتب التدقيق الداخلي مع الإدارة المختصة.', 'Submit your first request; Internal Audit will route it to the right department.'), actions: [{ label: L('طلب جديد', 'New request'), primary: true, onClick: () => newRequest() }] })));
  }
  const cols = [{ key: 'submitted', ar: 'جديدة — للإسناد', en: 'New — to route', tone: 'warn' }, { key: 'assigned', ar: 'لدى الإدارة', en: 'With department', tone: 'info' }, { key: 'prepared', ar: 'بانتظار المراجعة والإفراج', en: 'To review & release', tone: 'emph' }, { key: 'released', ar: 'مُفرج عنها', en: 'Released', tone: 'good' }];
  const pending = list.filter((x) => ['submitted', 'prepared'].includes(x.status));
  return h('div.aud-ext',
    pending.length && me.roles.head
      ? nextCard({ tone: 'emph', icon: 'globe', title: L(`${fmtNum(pending.length)} ${pending.length === 1 ? 'طلب بانتظار قرارك' : 'طلبات بانتظار قرارك'}`, `${pending.length} request(s) awaiting you`), body: L('أسند الطلبات الجديدة للإدارة المختصة، وراجع الردود الجاهزة قبل الإفراج.', 'Route new requests; review ready replies before release.'), action: btn(L('افتح الأقدم', 'Open the oldest'), { primary: true, href: `${HREF}/x/${pending[pending.length - 1].id}` }) })
      : null,
    board(cols, list, { columnOf: (x) => x.status, renderCard: iaCard, emptyText: L('لا طلبات', 'None') }));
}

// ---------------- record page: #/sys/audit/x/<id> ----------------
export async function renderDetail(root, ctx) {
  const id = ctx.params[1];
  await mount(root, ctx, () => call(`/ext/${id}`), (x) => {
    const ext = !!x.external_view;
    const steps = ext ? PORTAL_STEPS : [{ ar: 'مستلم', en: 'Received' }, { ar: 'لدى الإدارة', en: 'With department' }, { ar: 'مراجعة التدقيق', en: 'IA review' }, { ar: 'تم الرد', en: 'Released' }];
    const idx = ext ? portalIndex(x.status) : { submitted: 0, assigned: 1, prepared: 2, released: 4 }[x.status];
    const can = x.can || {};
    let next = null;
    if (can.assign && x.status === 'submitted') next = nextCard({ tone: 'emph', icon: 'building', title: L('أسند الطلب إلى الإدارة المختصة', 'Route to the right department'), body: L('اختر مدير الإدارة وأضف تعليمات داخلية عند الحاجة.', 'Pick the manager and add internal instructions if needed.'), action: btn(L('إسناد', 'Route'), { primary: true, ic: 'send', onClick: (e) => assign(x, e.currentTarget) }) });
    else if (can.release || can.return) next = nextCard({ tone: 'emph', icon: 'eyeCheck', title: L('راجع الرد قبل الإفراج عنه', 'Review before release'), body: L('تأكد من أن الرد والمستندات لا تتضمن معلومات داخلية غير مطلوبة.', 'Make sure the reply and documents contain nothing internal that was not requested.'), action: can.release ? btn(L('مراجعة وإفراج', 'Review & release'), { primary: true, ic: 'send', onClick: (e) => release(x, e.currentTarget) }) : null, secondary: [can.return ? btn(L('إعادة للإدارة', 'Return'), { ic: 'reply', onClick: (e) => sendBack(x, e.currentTarget) }) : null] });
    else if (can.prepare) next = nextCard({ tone: 'emph', icon: 'reply', title: L('أعدّ الرد على طلب المدقق الخارجي', 'Prepare the reply'), body: L('سيراجع مكتب التدقيق الداخلي ردك قبل الإفراج عنه.', 'Internal Audit reviews your reply before release.'), action: btn(L('إعداد الرد', 'Prepare reply'), { primary: true, ic: 'reply', onClick: (e) => prepare(x, e.currentTarget) }) });
    else if (can.assign && x.status === 'assigned') next = nextCard({ tone: 'navy', icon: 'hourglass', title: L(`لدى ${x.assigned_to?.name_ar || 'الإدارة'} لإعداد الرد`, `With ${x.assigned_to?.name_en || 'the department'}`), body: x.due_date ? dueLabel(x.due_date) : null, secondary: [btn(L('إعادة الإسناد', 'Re-route'), { ic: 'building', onClick: (e) => assign(x, e.currentTarget) })] });
    else if (x.status === 'released') next = nextCard({ tone: 'good', icon: 'circleCheck', title: L('تم الرد على الطلب', 'Request answered'), body: L(`أُفرج عن الرد في ${fmtDate(x.released_at)}`, `Released on ${fmtDate(x.released_at)}`) });
    else next = nextCard({ tone: 'navy', icon: 'hourglass', title: L('الطلب قيد المعالجة', 'Request in progress'), body: ext ? L('يعمل مكتب التدقيق الداخلي مع الإدارة المختصة على الرد.', 'Internal Audit is working on it with the relevant department.') : null });
    const head = sysHeader(ctx, { eyebrow: ext ? L('بوابة المدقق الخارجي', 'External auditor portal') : L('طلب من المدقق الخارجي', 'External auditor request'), title: x.title, sub: false, badges: [ext ? pubChip(x.status) : extChip(x.status), demoChip(x)].filter(Boolean) });
    if (ext) noAiChip(head);
    const main = [card(L('الطلب', 'Request'), para(x.details || L('بلا تفاصيل إضافية', 'No further details')), h('dl.sys-kv', h('dt', L('تاريخ الطلب', 'Requested')), h('dd', fmtDate(x.created_at)), h('dt', L('مطلوب قبل', 'Needed by')), h('dd', x.due_date ? fmtDate(x.due_date) : '—'), !ext && x.requester ? [h('dt', L('مقدم الطلب', 'Requester')), h('dd', `${L(x.requester.name_ar, x.requester.name_en)} — ${L(x.org?.name_ar, x.org?.name_en)}`)] : null))];
    if (x.status === 'released') main.push(card(L('الرد المعتمد', 'Released reply'), para(x.released_text), docList(x.docs), ext ? null : h('p.tiny.faint', L(`أفرج عنه ${x.released_by?.name_ar || '—'} · ${fmtDate(x.released_at)}`, `Released by ${x.released_by?.name_en || '—'} · ${fmtDate(x.released_at)}`))));
    if (!ext && x.response_text && x.status !== 'released') main.push(card(L('الرد المُعد (داخلي)', 'Prepared reply (internal)'), para(x.response_text), docList(x.docs), h('p.tiny.faint', L(`أعده ${x.prepared_by?.name_ar || '—'} · ${fmtDate(x.prepared_at)}`, `Prepared by ${x.prepared_by?.name_en || '—'} · ${fmtDate(x.prepared_at)}`))));
    const side = ext ? [card(L('خصوصية البوابة', 'Portal privacy'), h('p.tiny.muted', L('ترى في هذه البوابة طلباتك والردود التي أفرج عنها مكتب التدقيق الداخلي فقط. تُسجَّل كل عملية اطلاع.', 'You see only your requests and replies released by Internal Audit. Every view is logged.')))]
      : [card(L('التوجيه الداخلي', 'Internal routing'), confidentialBanner('لا يطّلع المدقق الخارجي على هذا القسم', 'Never shown to the external auditor'),
        h('dl.sys-kv', h('dt', L('مسند إلى', 'Assigned to')), h('dd', x.assigned_to ? `${L(x.assigned_to.name_ar, x.assigned_to.name_en)} — ${L(x.assigned_to.dept_ar, x.assigned_to.dept_en)}` : '—'), h('dt', L('التعليمات', 'Instructions')), h('dd', x.internal_note || '—'), x.return_note ? [h('dt', L('آخر إعادة', 'Last return')), h('dd', x.return_note)] : null)),
      x.access_log ? card(L('سجل الاطلاع', 'Access log'), accessList(x.access_log)) : null];
    return [back(ext ? `${HREF}/portal` : x.requester ? `${HREF}/external` : `${HREF}/requests`, ext ? L('طلباتي', 'My requests') : L('الطلبات', 'Requests')), head,
      stepper(steps, idx), next, grid('main-side', h('div.stack', main), h('div.stack', side.filter(Boolean)))];
  });
}
