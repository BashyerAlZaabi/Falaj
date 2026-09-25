// Internal Audit — «طلبات المعلومات» (PBC). IA: every request, grouped by what
// needs doing; department managers: requests addressed to them (+ external
// auditor requests routed to them by Internal Audit).
import { statRow, statTile, confidentialBanner } from '../../../sys-kit.js';
import { h, icon, L, fmtNum, fmtDate, call, HREF, requestChip, dueLabel, deptName, docList, docField, formDialog, act, emptyState, nextCard, btn, demoBadge } from './common.js';
import { extCard } from './external.js';

export async function load(tab, me) {
  if (me.roles.ia) return { reqs: await call('/requests'), ext: [] };
  const [reqs, ext] = await Promise.all([call('/requests?mine=1'), call('/ext')]);
  return { reqs, ext };
}
export function header(tab, me, ctx, data) {
  const badges = demoBadge([...(data?.reqs || []), ...(data?.ext || [])]);
  return me.roles.ia
    ? { badges, eyebrow: L('التدقيق الداخلي', 'Internal Audit'), title: L('طلبات المعلومات', 'Information requests'), sub: L('طلبات المستندات والبيانات من الإدارات الخاضعة للتدقيق. راجع الردود واقبلها أو أعدها للاستكمال.', 'Documents and data requested from auditees. Review responses and accept or return them.') }
    : { badges, eyebrow: L('التدقيق الداخلي', 'Internal Audit'), title: L('طلبات المعلومات الموجّهة إليك', 'Requests addressed to you'), sub: L('أرفق الرد ومستنداتك قبل تاريخ الاستحقاق. يطّلع على الرد فريق التدقيق فقط.', 'Reply with your documents before the due date. Only the audit team sees your reply.') };
}

export function requestCard(r, { highlight = false, showEngagement = true } = {}) {
  const respond = async (el) => {
    const v = await formDialog({ title: L('الرد على طلب المعلومات', 'Reply to the request'), intro: r.title, wide: true,
      fields: [{ name: 'response_text', type: 'textarea', label: L('الرد', 'Reply'), required: true, rows: 5, maxLength: 6000, placeholder: L('صف ما أرفقته وأي توضيح لازم…', 'Describe what you attach and any clarification…') }, await docField()],
      submitLabel: L('إرسال الرد', 'Send reply') });
    if (!v) return;
    await act(el, () => call(`/requests/${r.id}/respond`, { method: 'POST', body: { response_text: v.response_text, doc_ids: v.doc_ids || [] } }), { success: L('أُرسل الرد إلى فريق التدقيق', 'Reply sent to the audit team') });
  };
  const review = async (el, decision) => {
    let note;
    if (decision === 'return') {
      const v = await formDialog({ title: L('إعادة الرد للاستكمال', 'Return for completion'), fields: [{ name: 'note', type: 'textarea', label: L('ما الذي ينقص الرد؟', 'What is missing?'), required: true, rows: 3 }], submitLabel: L('إعادة', 'Return') });
      if (!v) return; note = v.note;
    }
    await act(el, () => call(`/requests/${r.id}/review`, { method: 'POST', body: { decision, note } }), { success: decision === 'accept' ? L('قُبل الرد', 'Response accepted') : L('أُعيد الطلب للاستكمال', 'Returned for completion') });
  };
  const done = ['responded', 'accepted'].includes(r.status);
  return h(`article.card.aud-req${r.overdue ? '.late' : ''}${highlight ? '.flash.selected' : ''}`, { id: `req-${r.id}` },
    h('div.aud-req-head', requestChip(r.status), dueLabel(r.due_date, { done }), h('span.grow'),
      showEngagement && r.engagement ? h('a.tiny.aud-eng-link', { href: `${HREF}/e/${r.engagement.id}/requests` }, icon('briefcase'), r.engagement.title) : null),
    h('h3.aud-req-title', { dir: 'auto' }, r.title),
    r.details ? h('p.aud-para.muted', { dir: 'auto' }, r.details) : null,
    h('div.aud-req-meta.tiny.faint', L(`من ${r.created_by?.name_ar || '—'} إلى ${r.to?.name_ar || '—'} · ${deptName(r.department)} · ${fmtDate(r.created_at)}`, `From ${r.created_by?.name_en || '—'} to ${r.to?.name_en || '—'} · ${deptName(r.department)} · ${fmtDate(r.created_at)}`)),
    r.status === 'returned' && r.review_note ? h('div.callout.aud-callout-warn', icon('reply'), h('div', h('strong', L('مطلوب استكمال: ', 'Needs completion: ')), r.review_note)) : null,
    r.response_text ? h('div.aud-reply', h('div.aud-reply-head', icon('messageSquare'), h('strong', L('الرد', 'Reply')), h('span.tiny.faint', `${r.responded_by ? r.responded_by.name_ar : ''} · ${fmtDate(r.responded_at)}`)), h('p.aud-para', { dir: 'auto' }, r.response_text), docList(r.docs)) : null,
    (r.can.respond || r.can.review) ? h('div.aud-req-actions',
      r.can.respond ? btn(r.status === 'returned' ? L('استكمال الرد', 'Complete reply') : L('الرد وإرفاق المستندات', 'Reply & attach'), { primary: true, ic: 'reply', onClick: (e) => respond(e.currentTarget) }) : null,
      r.can.review ? btn(L('قبول الرد', 'Accept'), { primary: true, ic: 'circleCheck', onClick: (e) => review(e.currentTarget, 'accept') }) : null,
      r.can.review ? btn(L('إعادة للاستكمال', 'Return'), { ic: 'reply', onClick: (e) => review(e.currentTarget, 'return') }) : null) : null);
}

function group(title, list, opts, { hint, collapsed = false } = {}) {
  if (!list.length) return null;
  const body = h('div.aud-req-list', list.map((r) => requestCard(r, { highlight: opts.highlight === r.id })));
  return collapsed
    ? h('details.aud-group', h('summary.section', title, h('span.count', fmtNum(list.length))), body)
    : h('section.aud-group', h('div.section', title, h('span.count', fmtNum(list.length)), hint ? h('span.tiny.faint.aud-hint', hint) : null), body);
}

export function paint(tab, me, ctx, { reqs, ext }) {
  const sub = ctx.params[1];
  const highlight = sub && sub !== 'overdue' ? sub : null;
  if (highlight) setTimeout(() => document.getElementById(`req-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  const overdue = reqs.filter((r) => r.overdue);
  if (me.roles.ia) {
    const list = sub === 'overdue' ? overdue : reqs;
    return h('div.aud-requests',
      statRow([
        statTile({ label: L('بانتظار مراجعتك', 'To review'), value: reqs.filter((r) => r.status === 'responded').length, icon: 'mailCheck', tone: 'emph' }),
        statTile({ label: L('مفتوحة لدى الإدارات', 'Open with departments'), value: reqs.filter((r) => ['open', 'returned'].includes(r.status)).length, icon: 'inbox' }),
        statTile({ label: L('متأخرة', 'Overdue'), value: overdue.length, icon: 'clockAlert', tone: overdue.length ? 'warn' : 'good', href: `${HREF}/requests/overdue` }),
        statTile({ label: L('مقبولة', 'Accepted'), value: reqs.filter((r) => r.status === 'accepted').length, icon: 'circleCheck', tone: 'good' }),
      ]),
      sub === 'overdue' ? h('div.callout', icon('filter'), L('تعرض الطلبات المتأخرة فقط · ', 'Showing overdue requests only · '), h('a', { href: `${HREF}/requests` }, L('عرض الكل', 'Show all'))) : null,
      list.length ? [
        group(L('بانتظار مراجعتك', 'Awaiting your review'), list.filter((r) => r.status === 'responded'), { highlight }, { hint: L('اقبل الرد أو أعده مع توضيح ما ينقصه', 'Accept, or return with what is missing') }),
        group(L('معادة للاستكمال', 'Returned for completion'), list.filter((r) => r.status === 'returned'), { highlight }),
        group(L('مفتوحة لدى الإدارات', 'Open with departments'), list.filter((r) => r.status === 'open').sort((a, b) => a.due_date.localeCompare(b.due_date)), { highlight }),
        group(L('مقبولة', 'Accepted'), list.filter((r) => r.status === 'accepted'), { highlight }, { collapsed: true }),
      ] : h('div.card', emptyState({ icon: 'inboxEmpty', title: L('لا توجد طلبات', 'No requests'), body: L('تُرسل طلبات المعلومات من صفحة المهمة.', 'Requests are sent from an engagement page.') })));
  }
  const open = reqs.filter((r) => ['open', 'returned'].includes(r.status));
  const extOpen = ext.filter((x) => x.status === 'assigned');
  const first = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return h('div.aud-requests',
    open.length || extOpen.length
      ? nextCard({ tone: overdue.length ? 'warn' : 'emph', icon: overdue.length ? 'clockAlert' : 'mailCheck',
        title: L(`${fmtNum(open.length + extOpen.length)} ${open.length + extOpen.length === 1 ? 'طلب بانتظار ردك' : 'طلبات بانتظار ردك'}`, `${open.length + extOpen.length} request(s) awaiting your reply`),
        body: overdue.length ? L(`${fmtNum(overdue.length)} منها تجاوز موعده — الرد في الموعد يمنحك نقاط التميّز.`, `${overdue.length} past due — replying on time earns excellence points.`) : L('الرد قبل تاريخ الاستحقاق يمنحك نقاط التميّز بعد قبول فريق التدقيق له.', 'Replying on time earns excellence points once the audit team accepts it.'),
        action: first ? btn(L('ابدأ بالأقرب استحقاقاً', 'Start with the nearest'), { primary: true, onClick: () => document.getElementById(`req-${first.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }) : null })
      : nextCard({ tone: 'good', icon: 'circleCheck', title: L('لا طلبات بانتظارك', 'Nothing awaiting you'), body: L('ستصلك هنا طلبات مكتب التدقيق الداخلي والمدقق الخارجي الموجّهة لإدارتك.', 'Requests from Internal Audit and the external auditor routed to your department appear here.') }),
    reqs.length ? [
      group(L('بانتظار ردك', 'Awaiting your reply'), open, { highlight }),
      group(L('تم الرد', 'Answered'), reqs.filter((r) => ['responded', 'accepted'].includes(r.status)), { highlight }, { collapsed: !highlight }),
    ] : null,
    ext.length ? h('section.aud-group', h('div.section', icon('globe'), L('طلبات المدقق الخارجي المسندة إليك', 'External auditor requests routed to you'), h('span.count', fmtNum(ext.length))),
      confidentialBanner('يمر ردك على مكتب التدقيق الداخلي للمراجعة قبل الإفراج عنه للمدقق الخارجي. لا تُرسل أي مراسلات داخلية.', 'Your reply is reviewed by Internal Audit before release to the external auditor. Do not include internal correspondence.'),
      h('div.aud-req-list', ext.map((x) => extCard(x, { highlight: sub === x.id })))) : null,
    !reqs.length && !ext.length ? h('div.card', emptyState({ icon: 'inboxEmpty', title: L('لا توجد طلبات معلومات', 'No information requests'), body: L('عند بدء مهمة تدقيق على إدارتك ستصلك طلبات المعلومات هنا مع تنبيه.', 'When an engagement starts on your department, requests arrive here with an alert.') })) : null);
}
