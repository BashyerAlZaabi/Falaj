// Conflicts & Gifts — record side-sheet (declaration · ad-hoc disclosure · gift).
// The same sheet serves the discloser (own record) and the compliance officer
// (every officer view is logged server-side and appears in the access log).
import { h, icon, L, fmtDate, toast, modal, confirmDialog, formDialog, stepper, confidentialBanner, act } from '../../../sys-kit.js';
import { call, DECL, GIFT, DECISION, INTEREST, MITIGATION, lbl, chip, demoChip, money, nameOf, deptOf, personLine, accessList, historyList, kv, section, openRouted, isOpen, daysWord } from './common.js';

const PATH = { declaration: 'declarations', disclosure: 'disclosures', gift: 'gifts' };
const STEPS = [{ ar: 'مسودة', en: 'Draft' }, { ar: 'مُقدَّم', en: 'Submitted' }, { ar: 'قيد المراجعة', en: 'Under review' }, { ar: 'القرار', en: 'Decision' }, { ar: 'مغلق', en: 'Closed' }];
const STEP_INDEX = { draft: 0, submitted: 1, under_review: 2, cleared: 3, mitigation: 3, closed: 4 };
const TITLE = { declaration: (r) => L(`الإقرار السنوي ${r.cycle?.year || ''}`, `Annual declaration ${r.cycle?.year || ''}`), disclosure: () => L('إفصاح طارئ', 'Ad-hoc disclosure'), gift: (r) => r.description };

// Open (or keep open) the sheet for type:id under the given tab route.
export async function openRecord(env, type, id, { tab }) {
  const ref = `${type}:${id}`;
  if (isOpen(ref)) return;
  let rec;
  try { rec = await call(`/${PATH[type]}/${encodeURIComponent(id)}`); }
  catch (e) { toast(e.message, { kind: 'error' }); if (location.hash.endsWith(ref)) history.replaceState(null, '', `#/sys/integrity/${tab}`); return; }
  const officer = !!env.roles.officer && !rec.own;
  const sheet = openRouted(tab, ref, {
    title: TITLE[type](rec),
    subtitle: officer ? `${nameOf(rec.person)} · ${deptOf(rec.person)}` : L('إفصاحك — لا يطّلع عليه إلا ضابط الامتثال', 'Your disclosure — only the compliance officer can see it'),
    body: h('div'), wide: true,
  });
  const draw = (r) => sheet.setBody(body(env, r, { officer, redraw: draw, close: sheet.close }));
  draw(rec);
  setTimeout(() => sheet.el.focus(), 60); // focus the dialog itself (screen readers announce the title)
}

function body(env, r, ctx) {
  const parts = [];
  // status strip
  const map = r.type === 'gift' ? GIFT : DECL;
  parts.push(h('div.integ-sheet-status', chip(map, r.status), demoChip(r.is_demo),
    r.type !== 'gift' && r.submitted_at ? h('span.tiny.faint', L(`قُدّم ${fmtDate(r.submitted_at)}`, `Submitted ${fmtDate(r.submitted_at)}`)) : null,
    r.type === 'gift' ? h('span.tiny.faint', L(`أُفصح عنها ${fmtDate(r.declared_at)}`, `Declared ${fmtDate(r.declared_at)}`)) : null));
  if (ctx.officer) parts.push(confidentialBanner('سري للغاية — اطلاعك على هذا الإفصاح مسجّل ويظهر لصاحبه.', 'Restricted — your view of this disclosure is logged and visible to the discloser.', { level: 'restricted' }));
  else if (r.own && env.roles.officer && r.status !== 'draft') parts.push(h('div.callout', icon('scale'), h('span', L('هذا إفصاحك: لا يمكنك مراجعته بنفسك — يتطلب ضابط امتثال آخر (فصل المهام).', 'This is your own disclosure: another compliance officer must review it (segregation of duties).'))));
  if (r.type !== 'gift') parts.push(stepper(STEPS, STEP_INDEX[r.status] ?? 0, { label: L('مراحل الإفصاح', 'Disclosure stages') }));

  if (ctx.officer) parts.push(section(L('صاحب الإفصاح', 'Discloser'), personLine(r.person)));
  if (r.type === 'declaration') parts.push(...declarationBody(r));
  if (r.type === 'disclosure') parts.push(...disclosureBody(r));
  if (r.type === 'gift') parts.push(...giftBody(r));

  if (r.decision_note || (r.status === 'draft' && r.return_note)) {
    parts.push(h(`div.integ-note${r.return_note && r.status === 'draft' ? '.warn' : ''}`, icon(r.status === 'draft' ? 'reply' : 'gavel'),
      h('div', h('strong', r.status === 'draft' && r.return_note ? L('طلب ضابط الامتثال استيضاحاً', 'The compliance officer asked for clarification') : L('ملاحظة ضابط الامتثال', 'Compliance officer’s note')), h('p', r.status === 'draft' && r.return_note ? r.return_note : r.decision_note))));
  }
  if (r.mitigations?.length) parts.push(section(L('تعليمات التخفيف', 'Mitigation instructions'), h('div.integ-mits', r.mitigations.map((m) => mitigationRow(env, r, m, ctx)))));
  parts.push(h('div.integ-sheet-two',
    section(L('السجل', 'History'), historyList(r.events)),
    section(ctx.officer ? L('سجل الاطلاع', 'Access log') : L('من اطّلع على هذا الإفصاح', 'Who viewed this disclosure'), accessList(r.access_log, { empty: L('لم يطّلع عليه أحد بعد.', 'Nobody has viewed it yet.') }))));
  const bar = actions(env, r, ctx);
  if (bar) parts.push(bar);
  return h('div.integ-sheet', parts);
}

function declarationBody(r) {
  const out = [];
  if (r.no_conflict === true) out.push(h('div.integ-verdict.good', icon('badgeCheck'), h('div', h('strong', L('لا يوجد تضارب مصالح', 'No conflict of interest')), h('p', L('أقرّ صاحب الإفصاح بعدم وجود مصالح تستدعي الإفصاح.', 'The discloser attested there is nothing to declare.')))));
  else if (r.interests?.length) out.push(section(L(`المصالح المُفصح عنها (${r.interests.length})`, `Declared interests (${r.interests.length})`), h('ul.integ-interests', r.interests.map(interestRow))));
  else out.push(h('p.faint', L('لم يُحدَّد بعد ما إذا كانت هناك مصالح.', 'Not completed yet.')));
  if (r.statement) out.push(section(L('ملاحظة مقدّم الإفصاح', 'Discloser’s note'), h('p.integ-quote', r.statement)));
  return out;
}
export function interestRow(i) {
  return h('li.integ-interest', h('span.integ-kind-ic', icon(INTEREST[i.kind]?.[2] || 'circleDot')),
    h('div.grow', h('div.integ-interest-top', h('strong', i.party_name), h('span.chip.tiny.outline', lbl(INTEREST, i.kind)), i.provider ? h('span.chip.tiny.navy', icon('handshake'), L('مقدّم خدمة مسجّل', 'Registered provider')) : null),
      i.details ? h('p', i.details) : null));
}
function disclosureBody(r) {
  return [kv([
    [L('الموقف أو المسألة', 'Matter'), r.matter],
    [L('الطرف ذو العلاقة', 'Related party'), h('span', r.related_party, r.provider ? h('span.chip.tiny.navy.integ-inline-chip', icon('handshake'), L('مقدّم خدمة مسجّل', 'Registered provider')) : null)],
    [L('طبيعة العلاقة', 'Relationship'), r.relationship || '—'],
    [L('التنحي المقترح', 'Proposed recusal'), r.proposed_recusal || '—'],
  ])];
}
function giftBody(r) {
  const flags = [r.kind === 'hospitality' ? [L('ضيافة', 'Hospitality'), 'outline', 'party'] : null, r.offered_only ? [L('عُرضت ولم تُستلم', 'Offered, not received'), 'outline', 'return'] : null,
    r.cash ? [L('نقد أو ما في حكمه', 'Cash or equivalent'), 'purple', 'banknote'] : null, r.active_tender ? [L('مناقصة قائمة', 'Active tender'), 'purple', 'ban'] : null,
    r.provider ? [L('مقدّم خدمة مسجّل', 'Registered provider'), 'navy', 'handshake'] : null].filter(Boolean);
  const d = r.proposal;
  return [
    h('div.integ-gift-head', h('div.integ-gift-value', h('span.num.tabular', money(r.value_aed)), h('span', L('القيمة التقديرية', 'Estimated value'))),
      h('div.integ-flags', flags.map(([t, tone, ic]) => h(`span.chip.tiny.${tone}`, icon(ic), t)))),
    kv([
      [L('الجهة المانحة', 'Giver'), `${r.giver_name} · ${r.giver_type === 'person' ? L('شخص', 'Person') : L('جهة', 'Organisation')}`],
      [L('المناسبة', 'Occasion'), r.occasion || '—'],
      [r.offered_only ? L('تاريخ العرض', 'Offered on') : L('تاريخ الاستلام', 'Received on'), fmtDate(r.received_on)],
      [L('مدة الإفصاح', 'Declared within'), h('span', r.days_to_declare === 0 ? L('في اليوم نفسه', 'Same day') : daysWord(r.days_to_declare), ' ', r.prompt ? h('span.chip.tiny.good', icon('check'), L('في الوقت', 'On time')) : h('span.chip.tiny.warn', L('بعد المهلة', 'Late')))],
    ]),
    h(`div.integ-proposal.${DECISION[d.decision]?.[2] || 'navy'}`, h('span.integ-proposal-ic', icon(DECISION[d.decision]?.[3] || 'scale')),
      h('div', h('span.eyebrow', L('مقترح النظام وفق السياسة', 'Policy proposal')), h('strong', lbl(DECISION, d.decision)), h('p', L(d.reason_ar, d.reason_en)))),
    r.decision ? h('div.integ-verdict', { class: r.decision === 'keep' ? 'good' : '' }, icon('gavel'), h('div', h('strong', L(`القرار النهائي: ${lbl(DECISION, r.decision)}`, `Final decision: ${lbl(DECISION, r.decision)}`)), h('p', r.completed_at ? L(`اكتمل التنفيذ ${fmtDate(r.completed_at)}`, `Completed ${fmtDate(r.completed_at)}`) : L('بانتظار تأكيد صاحب الإفصاح لتنفيذ القرار.', 'Awaiting the discloser’s confirmation.')))) : null,
  ];
}
function mitigationRow(env, r, m, ctx) {
  const lift = ctx.officer && m.status === 'active' ? h('button.btn.sm.destructive-soft', { type: 'button', onclick: async (e) => {
    const ok = await confirmDialog(L('رفع التعليمات؟', 'Lift this instruction?'), L('سيعود الموظف إلى المشاركة في هذه المسائل، وسيُبلَّغ هو ومديره المباشر. يُسجَّل الإجراء في سجل التدقيق.', 'The employee may take part in these matters again; they and their line manager are notified. The action is audited.'), { danger: true, confirmLabel: L('رفع التعليمات', 'Lift') });
    if (!ok) return;
    const res = await act(e.currentTarget, () => call(`/mitigations/${m.id}/lift`, { method: 'POST', body: { confirm: true } }), { success: L('رُفعت التعليمات', 'Instruction lifted') });
    if (res) ctx.redraw(await call(`/${PATH[r.type]}/${r.id}`));
  } }, icon('lockOpen'), L('رفع', 'Lift')) : null;
  return h(`div.integ-mit${m.status === 'lifted' ? '.lifted' : ''}`, h('span.integ-kind-ic', icon(MITIGATION[m.kind]?.[2] || 'circleDot')),
    h('div.grow', h('div.integ-mit-top', h('span.chip.tiny.purple', lbl(MITIGATION, m.kind)), m.status === 'lifted' ? h('span.chip.tiny.outline', L('مرفوعة', 'Lifted')) : null,
      h('span.chip.tiny.outline', icon(m.manager_visible ? 'userCheck' : 'eyeOff'), m.manager_visible ? L('يراها المدير المباشر', 'Shown to the line manager') : L('لا يراها المدير', 'Not shown to the manager'))),
    h('strong.integ-mit-text', m.instruction), h('span.tiny.faint', `${m.matter}${m.acknowledged_at ? L(` · أكّد المدير التطبيق ${fmtDate(m.acknowledged_at)}`, ` · manager acknowledged ${fmtDate(m.acknowledged_at)}`) : ''}`)), lift);
}

// ---------------- actions ----------------
function actions(env, r, ctx) {
  const post = async (btn, path, bodyObj, success) => {
    const res = await act(btn, () => call(`/${PATH[r.type]}/${r.id}/${path}`, { method: 'POST', body: bodyObj || {} }), { success });
    if (res) ctx.redraw(res);
    return res;
  };
  const btns = [];
  if (ctx.officer && r.type !== 'gift') {
    if (r.type === 'declaration' && ['submitted', 'under_review'].includes(r.status)) btns.push(h('button.btn', { type: 'button', onclick: async (e) => {
      const v = await formDialog({ title: L('طلب استيضاح', 'Ask for clarification'), intro: L('يعود الإقرار مسودةً إلى صاحبه مع ملاحظتك، دون أن يُحتسب ذلك عليه.', 'The declaration returns to the discloser as a draft with your note.'), fields: [{ name: 'note', label: L('ما الذي يحتاج إلى توضيح؟', 'What needs clarifying?'), type: 'textarea', required: true, maxLength: 1000 }], submitLabel: L('إرسال', 'Send') });
      if (v) post(e.target.closest('button'), 'return', { note: v.note }, L('أُعيد الإقرار لصاحبه للاستيضاح', 'Returned for clarification'));
    } }, icon('reply'), L('طلب استيضاح', 'Ask for clarification')));
    if (r.status === 'submitted') btns.push(h('button.btn.primary', { type: 'button', onclick: (e) => post(e.currentTarget, 'start', null, L('بدأت المراجعة', 'Review started')) }, icon('scanSearch'), L('بدء المراجعة', 'Start review')));
    if (r.status === 'under_review') {
      btns.push(h('button.btn', { type: 'button', onclick: async (e) => {
        const v = await formDialog({ title: L('اعتماد: لا يلزم إجراء', 'Clear: no action needed'), fields: [{ name: 'note', label: L('ملاحظة لصاحب الإفصاح (اختياري)', 'Note to the discloser (optional)'), type: 'textarea', maxLength: 1000 }], submitLabel: L('اعتماد', 'Clear') });
        if (v) post(e.target.closest('button'), 'decide', { outcome: 'cleared', note: v.note || undefined }, L('اعتُمد الإفصاح — لا يلزم إجراء', 'Cleared'));
      } }, icon('badgeCheck'), L('لا يلزم إجراء', 'No action needed')));
      btns.push(h('button.btn.primary', { type: 'button', onclick: async (e) => { const res = await mitigationDialog(r); if (res) { toast(L('اعتُمد مع تعليمات؛ أُبلغ المدير المباشر بالتعليمات فقط', 'Approved with instructions; the line manager sees only the instruction')); ctx.redraw(res); } void e; } }, icon('shieldAlert'), L('اعتماد مع تعليمات', 'Approve with instructions')));
    }
    if (['cleared', 'mitigation'].includes(r.status)) btns.push(h('button.btn', { type: 'button', onclick: async (e) => {
      const ok = await confirmDialog(L('إغلاق الحالة؟', 'Close the case?'), L('تبقى أي تعليمات سارية حتى تُرفع صراحةً.', 'Any instructions stay in force until lifted explicitly.'), { confirmLabel: L('إغلاق', 'Close') });
      if (ok) post(e.target.closest('button'), 'close', {}, L('أُغلقت الحالة', 'Case closed'));
    } }, icon('archive'), L('إغلاق الحالة', 'Close case')));
  }
  if (ctx.officer && r.type === 'gift' && r.status === 'declared') return giftDecision(r, post);
  if (!ctx.officer && r.own) {
    if (r.type === 'declaration' && r.status === 'draft') btns.push(h('a.btn.primary', { href: '#/sys/integrity/mine/declare' }, icon('pencil'), L('أكمل الإقرار', 'Continue declaration')));
    if (r.type === 'gift' && r.status === 'decided') btns.push(h('button.btn.primary', { type: 'button', onclick: async (e) => {
      const ok = await confirmDialog(L('تأكيد تنفيذ القرار', 'Confirm completion'), L(`هل نفّذت القرار «${lbl(DECISION, r.decision)}»؟`, `Have you completed “${lbl(DECISION, r.decision)}”?`), { confirmLabel: L('نعم، نُفّذ', 'Yes, done') });
      if (ok) post(e.target.closest('button'), 'complete', {}, L('شكراً — اكتمل الإفصاح عن الهدية', 'Thank you — gift declaration completed'));
    } }, icon('circleCheck'), L('أكّدت التنفيذ', 'Mark as done')));
  }
  return btns.length ? h('div.integ-sheet-bar', btns) : null;
}

function giftDecision(r, post) {
  let choice = r.proposal.decision;
  const note = h('textarea.field', { rows: 2, maxlength: 1000, id: 'integ-gd-note', placeholder: L('سبب القرار (مطلوب إذا خالف المقترح)', 'Reason (required when it differs from the proposal)') });
  const opts = h('div.integ-choices', { role: 'radiogroup', 'aria-label': L('القرار النهائي', 'Final decision') });
  const draw = () => opts.replaceChildren(...Object.keys(DECISION).map((k) => {
    const allowed = r.allowed_decisions.includes(k);
    return h(`button.integ-choice${choice === k ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(choice === k), disabled: allowed ? null : true, 'data-tip': allowed ? null : L('غير متاح وفق السياسة لهذه الحالة', 'Not allowed by the policy here'), onclick: () => { choice = k; draw(); } },
      icon(DECISION[k][3]), h('span', lbl(DECISION, k)), k === r.proposal.decision ? h('em', L('المقترح', 'Proposed')) : null);
  }));
  draw();
  return h('div.integ-sheet-bar.decide',
    h('div.grow', h('span.lbl', L('القرار النهائي', 'Final decision')), opts, h('label.sr-only', { for: 'integ-gd-note' }, L('سبب القرار', 'Reason')), note),
    h('button.btn.primary', { type: 'button', onclick: (e) => post(e.currentTarget, 'decide', { decision: choice, note: note.value.trim() || undefined }, L('سُجّل القرار وأُبلغ صاحب الإفصاح', 'Decision recorded')) }, icon('gavel'), L('اعتماد القرار', 'Record decision')));
}

// Officer: approve with mitigation instructions (manager sees only "name: instruction").
async function mitigationDialog(r) {
  const provider = r.type === 'declaration' ? r.interests.find((i) => i.provider) : r.provider ? { provider: r.provider, party_name: r.related_party } : null;
  const pName = provider ? (provider.party_name || L(provider.provider.name_ar, provider.provider.name_en)) : '';
  const rows = [provider
    ? { kind: 'recusal', matter: `تقييم عروض ${pName} وقرارات الشراء الخاصة بها`, provider_id: provider.provider?.id || provider.provider_id || '', instruction: `الامتناع عن تقييم عروض ${pName} وعن المشاركة في أي قرار شراء يخصها`, notify_manager: true }
    : { kind: 'recusal', matter: r.type === 'disclosure' ? r.matter : '', provider_id: '', instruction: '', notify_manager: true }];
  const providers = (await call('/policy').catch(() => ({ providers: [] }))).providers;
  const list = h('div.integ-mit-edit');
  const note = h('textarea.field', { rows: 2, maxlength: 1000, id: 'integ-md-note' });
  const err = h('div.error-text', { 'aria-live': 'polite' });
  const who = nameOf(r.person);
  const draw = () => list.replaceChildren(...rows.map((m, i) => {
    const preview = h('div.integ-preview', icon(m.kind === 'divestment' || (m.kind === 'other' && !m.notify_manager) ? 'eyeOff' : 'userCheck'),
      m.kind === 'divestment' || (m.kind === 'other' && !m.notify_manager) ? L('إجراء شخصي — لا يُعرض على المدير المباشر.', 'Personal action — not shown to the line manager.') : h('span', L('يرى المدير المباشر فقط: ', 'The line manager sees only: '), h('strong', `«${who}: ${m.instruction || '…'}»`)));
    const upd = (k, redraw = false) => (e) => { m[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; if (redraw) { const id = e.target.id; draw(); if (id) list.querySelector(`#${id}`)?.focus(); } };
    return h('fieldset.integ-mit-row', h('legend.sr-only', L(`تعليمات ${i + 1}`, `Instruction ${i + 1}`)),
      h('div.form-grid',
        h('div.form-row', h('label.lbl', { for: `mk-${i}` }, L('نوع الإجراء', 'Action')), h('select.field', { id: `mk-${i}`, onchange: upd('kind', true) }, Object.keys(MITIGATION).map((k) => h('option', { value: k, selected: m.kind === k || null }, lbl(MITIGATION, k))))),
        h('div.form-row', h('label.lbl', { for: `mp-${i}` }, L('مقدّم الخدمة (اختياري)', 'Provider (optional)')), h('select.field', { id: `mp-${i}`, onchange: upd('provider_id') }, h('option', { value: '' }, L('— لا يوجد —', '— None —')), providers.map((p) => h('option', { value: p.id, selected: m.provider_id === p.id || null }, L(p.name_ar, p.name_en))))),
        h('div.form-row.full', h('label.lbl', { for: `mm-${i}` }, L('المسألة', 'Matter')), h('input.field', { id: `mm-${i}`, value: m.matter, maxlength: 200, oninput: upd('matter') })),
        h('div.form-row.full', h('label.lbl', { for: `mi-${i}` }, L('التعليمات بإيجاز — دون تفاصيل الإفصاح', 'Instruction, briefly — no disclosure details')), h('input.field', { id: `mi-${i}`, value: m.instruction, maxlength: 240, oninput: (e) => { m.instruction = e.target.value; preview.querySelector('strong')?.replaceChildren(`«${who}: ${m.instruction || '…'}»`); } })),
        m.kind === 'other' ? h('label.check-label.full', h('input', { type: 'checkbox', id: `mn-${i}`, checked: m.notify_manager || null, onchange: upd('notify_manager', true) }), L('يلزم أن يطبّقها المدير المباشر', 'The line manager must enforce it')) : null),
      preview,
      rows.length > 1 ? h('button.btn.sm.ghost.integ-remove', { type: 'button', onclick: () => { rows.splice(i, 1); draw(); } }, icon('trash'), L('إزالة', 'Remove')) : null);
  }));
  draw();
  const content = h('div.integ-md', h('p.muted', L('اكتب التعليمات بلغة موجزة ومحايدة: هي كل ما سيراه المدير المباشر.', 'Keep instructions brief and neutral: they are all the line manager will see.')), list,
    h('button.btn.sm.tertiary', { type: 'button', onclick: () => { rows.push({ kind: 'recusal', matter: '', provider_id: '', instruction: '', notify_manager: true }); draw(); } }, icon('plus'), L('إضافة تعليمات أخرى', 'Add another instruction')),
    h('div.form-row', h('label.lbl', { for: 'integ-md-note' }, L('ملاحظة لصاحب الإفصاح (اختياري)', 'Note to the discloser (optional)')), note), err);
  let result = null;
  await modal(L('اعتماد مع تعليمات', 'Approve with instructions'), content, [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('اعتماد وإبلاغ', 'Approve & notify'), value: true, primary: true }], {
    wide: true,
    beforeClose: async () => {
      const bad = rows.find((m) => m.matter.trim().length < 3 || m.instruction.trim().length < 5);
      if (bad) { err.textContent = L('أكمل المسألة والتعليمات لكل إجراء.', 'Complete the matter and instruction for each action.'); return false; }
      try {
        result = await call(`/${PATH[r.type]}/${r.id}/decide`, { method: 'POST', body: { outcome: 'mitigation', note: note.value.trim() || undefined, mitigations: rows.map((m) => ({ kind: m.kind, matter: m.matter.trim(), instruction: m.instruction.trim(), provider_id: m.provider_id || undefined, notify_manager: m.kind === 'other' ? !!m.notify_manager : undefined })) } });
        return true;
      } catch (e) { err.textContent = e.message; return false; }
    },
  });
  return result;
}
