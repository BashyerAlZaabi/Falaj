// «سجل الهدايا» — declare a gift or hospitality with live policy guidance; the
// published policy; my register. The system proposes, the compliance officer decides.
import { h, icon, L, fmtDate, fmtNum, toast, modal, emptyState, dataTable, debounce, statusChip } from '../../../sys-kit.js';
import { call, GIFT, DECISION, lbl, chip, demoChip, money, daysWord } from './common.js';
import { openRecord } from './record.js';

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysSince = (d) => Math.round((Date.parse(`${todayIso()}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 864e5);

export async function giftsTab(env) {
  const policy = await call('/policy');
  const gifts = env.ov.gifts;
  const year = new Date().getUTCFullYear();
  const thisYear = gifts.filter((g) => g.received_on.startsWith(String(year)));
  const onTime = thisYear.filter((g) => g.prompt).length;
  const todo = gifts.filter((g) => g.status === 'decided');
  const p = env.params[0];
  if (p === 'new' && !dialogOpen) setTimeout(() => declareGift(env), 0);
  else if (p && p.startsWith('gift:')) setTimeout(() => openRecord(env, 'gift', p.slice(5), { tab: 'gifts' }), 0);

  const hero = h('section.card.integ-gift-hero',
    h('div.integ-gift-hero-main',
      h('span.eyebrow', L('الهدايا والضيافة', 'Gifts & hospitality')),
      h('h2.integ-hero-title', L('هل تلقيت هدية أو دعوة ضيافة؟', 'Received a gift or an invitation?')),
      h('p.integ-hero-sub', L(`أفصح عنها خلال ${policy.prompt_days} أيام — حتى لو اعتذرت عنها. يقترح النظام القرار فوراً وفق السياسة، ويعتمده ضابط الامتثال.`, `Declare it within ${policy.prompt_days} days — even if you declined it. The system proposes a decision instantly; the compliance officer confirms it.`)),
      h('div.integ-hero-actions', h('button.btn.primary.lg', { type: 'button', onclick: () => declareGift(env) }, icon('gift'), L('أفصح عن هدية', 'Declare a gift')),
        h('span.integ-hero-hint', icon('medal'), L('الإفصاح في الوقت يمنحك نقاط تميّز بعد اعتماد القرار', 'Timely declarations earn excellence points once decided')))),
    h('div.integ-gift-stats',
      stat(fmtNum(thisYear.length), L(`هداياك في ${year}`, `Your gifts in ${year}`), null, 'gift'),
      stat(thisYear.length ? `${fmtNum(onTime)}/${fmtNum(thisYear.length)}` : '—', L('أُفصح عنها في الوقت', 'Declared on time'), onTime && onTime === thisYear.length ? 'good' : null, 'calendarCheck'),
      stat(fmtNum(todo.length), L('بانتظار تأكيدك', 'Awaiting your confirmation'), todo.length ? 'warn' : null, 'alarm')));

  const rules = h('section.integ-policy', { 'aria-labelledby': 'integ-policy-title' },
    h('div.integ-policy-head', h('h2.integ-sec-title#integ-policy-title', icon('scale'), L('السياسة في لمحة', 'The policy at a glance')), h('span.tiny.faint', L('يقترح النظام القرار آلياً بهذه القواعد، ويعتمد ضابط الامتثال القرار النهائي.', 'The system applies these rules to propose; the compliance officer decides.'))),
    h('ol.integ-rules', policy.rules.map((r) => h('li.integ-rule', h('div.integ-rule-top', h('span.integ-rule-ic', icon(r.icon || 'scale')), r.outcome ? chip(DECISION, r.outcome) : h('span.chip.tiny.sand', icon('calendarClock'), L(`${r.threshold} أيام`, `${r.threshold} days`))),
      h('strong', L(r.title_ar, r.title_en)), h('p', L(r.body_ar, r.body_en))))));

  const table = h('section.card.integ-register',
    h('div.card-head', h('h2.card-title', L('سجل هداياي', 'My gift register')), h('span.card-sub', L('لا يطّلع عليه إلا أنت وضابط الامتثال', 'Visible only to you and the compliance officer'))),
    dataTable({
      caption: L('سجل هداياي', 'My gift register'),
      columns: [
        { key: 'description', label: L('الهدية', 'Gift'), render: (g) => h('span.integ-cell-main', h('strong', g.description), h('span.tiny.faint', g.kind === 'hospitality' ? L('ضيافة', 'Hospitality') : L('هدية', 'Gift'))), sort: (g) => g.description },
        { key: 'giver_name', label: L('الجهة المانحة', 'Giver'), sort: (g) => g.giver_name },
        { key: 'received_on', label: L('التاريخ', 'Date'), render: (g) => fmtDate(g.received_on), sort: (g) => g.received_on },
        { key: 'value_aed', label: L('القيمة', 'Value'), num: true, render: (g) => h('span.num.tabular', money(g.value_aed)), sort: (g) => g.value_aed },
        { key: 'proposal', label: L('المقترح', 'Proposed'), render: (g) => chip(DECISION, g.proposal.decision) },
        { key: 'status', label: L('الحالة', 'Status'), render: (g) => (g.decision ? h('span.integ-cell-status', statusChip(g.status, GIFT), h('span.tiny.faint', lbl(DECISION, g.decision))) : statusChip(g.status, GIFT)), sort: (g) => g.status },
      ],
      rows: gifts, sortKey: 'received_on', sortDir: 'desc',
      onRow: (g) => openRecord(env, 'gift', g.id, { tab: 'gifts' }),
      empty: emptyState({ icon: 'gift', title: L('لم تُفصح عن أي هدية بعد', 'No gifts declared yet'), body: L('عندما تتلقى هدية أو دعوة، أفصح عنها هنا خلال 5 أيام.', 'When you receive a gift or invitation, declare it here within 5 days.'), actions: [{ label: L('أفصح عن هدية', 'Declare a gift'), primary: true, icon: 'gift', onClick: () => declareGift(env) }] }),
    }));

  return {
    actions: todo.length
      ? [{ label: L('أفصح عن هدية', 'Declare a gift'), icon: 'gift', onClick: () => declareGift(env) }, { label: L('أكّد تنفيذ القرار', 'Confirm completion'), icon: 'circleCheck', primary: true, onClick: () => openRecord(env, 'gift', todo[0].id, { tab: 'gifts' }) }]
      : [{ label: L('أفصح عن هدية', 'Declare a gift'), icon: 'gift', primary: true, onClick: () => declareGift(env) }],
    body: h('div.integ-gifts', giftTodo(env, 'gifts'), hero, rules, table),
  };
}
// «ما المطلوب مني؟» — a decided gift waits for the discloser to confirm the action.
export function giftTodo(env, tab) {
  const todo = env.ov.gifts.filter((g) => g.status === 'decided');
  if (!todo.length) return null;
  return h('div.integ-todo', { role: 'status' }, todo.slice(0, 2).map((g) => h('div.integ-todo-row',
    h('span.integ-todo-ic', icon(DECISION[g.decision]?.[3] || 'gift')),
    h('div.grow', h('strong', L(`صدر قرار بشأن «${g.description}»: ${lbl(DECISION, g.decision)}`, `Decision on “${g.description}”: ${lbl(DECISION, g.decision)}`)),
      h('span', L('نفّذ القرار ثم أكّد هنا ليكتمل الإفصاح.', 'Carry it out, then confirm here to complete the declaration.'))),
    h('button.btn.primary.sm', { type: 'button', onclick: () => openRecord(env, 'gift', g.id, { tab }) }, icon('circleCheck'), L('أكّد التنفيذ', 'Confirm')))));
}
const stat = (v, label, tone, ic) => h(`div.integ-mini-stat${tone ? '.' + tone : ''}`, ic ? h('span.integ-mini-ic', icon(ic)) : null, h('strong.num.tabular', v), h('span', label));

// ---------------- declare dialog with live guidance ----------------
let dialogOpen = false; // a live refresh must never stack a second dialog
export async function declareGift(env) {
  if (dialogOpen) return;
  dialogOpen = true;
  try { await giftDialog(env); } finally { dialogOpen = false; }
}
async function giftDialog() {
  const policy = await call('/policy').catch(() => ({ providers: [], prompt_days: 5, token_limit: 200 }));
  const v = { giver_type: 'organisation', kind: 'gift', received_on: todayIso(), offered_only: false, cash: false, active_tender: false, provider_id: '', value_aed: null };
  const errs = {};
  const field = (name, label, control, { required, help, full } = {}) => {
    const target = control.matches('input,select,textarea') ? control : control.querySelector('input,select,textarea');
    target.id = `ig-${name}`; target.setAttribute('aria-describedby', `ig-${name}-err`);
    errs[name] = h('div.error-text', { id: `ig-${name}-err`, 'aria-live': 'polite' });
    return h(`div.form-row${full ? '.full' : ''}`, h('label.lbl', { for: target.id }, label, required ? h('span.req', { 'aria-hidden': 'true' }, ' *') : null), control, help ? h('div.helper', help) : null, errs[name]);
  };
  const seg = (name, opts) => h('div.segmented.integ-seg', { role: 'radiogroup' }, opts.map(([val, text, ic]) => h(`button${v[name] === val ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(v[name] === val), onclick: (e) => { v[name] = val; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); refresh(); } }, ic ? icon(ic) : null, text)));
  const input = (name, attrs = {}) => h('input.field', { value: v[name] ?? '', oninput: (e) => { v[name] = attrs.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value; refresh(); }, ...attrs });
  const giver = input('giver_name', { maxlength: 200, placeholder: L('اسم الجهة أو الشخص', 'Organisation or person') });
  const provider = h('select.field', { onchange: (e) => { v.provider_id = e.target.value; const p = policy.providers.find((x) => x.id === v.provider_id); if (p && !v.giver_name) { v.giver_name = L(p.name_ar, p.name_en).replace(/\s*\((تجريبية|demo)\)\s*$/, ''); giver.value = v.giver_name; } refresh(); } },
    h('option', { value: '' }, L('— ليست مقدّم خدمة مسجّلاً —', '— Not a registered provider —')), policy.providers.map((p) => h('option', { value: p.id }, L(p.name_ar, p.name_en))));
  const check = (name, label, help) => h('label.integ-check', h('input', { type: 'checkbox', onchange: (e) => { v[name] = e.target.checked; refresh(); } }), h('span', h('strong', label), help ? h('small', help) : null));
  const form = h('div.form-grid',
    field('description', L('الهدية أو الضيافة', 'Gift or hospitality'), input('description', { maxlength: 500, placeholder: L('مثال: سلة تمور، دعوة عشاء، درع تذكاري', 'e.g. Dates hamper, dinner invitation, plaque') }), { required: true, full: true }),
    h('div.form-row', h('span.lbl', L('النوع', 'Type')), seg('kind', [['gift', L('هدية', 'Gift'), 'gift'], ['hospitality', L('ضيافة', 'Hospitality'), 'party']])),
    field('value_aed', L('القيمة التقديرية', 'Estimated value'), h('div.money-field', input('value_aed', { type: 'number', min: 0, step: 1, inputmode: 'decimal', placeholder: '0' }), h('span.cur', L('د.إ', 'AED'))), { required: true, help: L('تقدير معقول يكفي', 'A reasonable estimate is enough') }),
    field('giver_name', L('الجهة المانحة', 'Giver'), giver, { required: true }),
    h('div.form-row', h('span.lbl', L('المانح', 'Giver type')), seg('giver_type', [['organisation', L('جهة', 'Organisation'), 'building'], ['person', L('شخص', 'Person'), 'user']])),
    field('provider_id', L('مقدّم خدمة مسجّل؟', 'Registered provider?'), provider),
    field('received_on', L('تاريخ الاستلام أو العرض', 'Received or offered on'), input('received_on', { type: 'date', max: todayIso() }), { required: true }),
    field('occasion', L('المناسبة', 'Occasion'), input('occasion', { maxlength: 200, placeholder: L('اختياري', 'Optional') }), { full: true }),
    h('div.form-row.full.integ-checks',
      check('offered_only', L('عُرضت عليّ ولم أستلمها', 'Offered but not received')),
      check('cash', L('نقد أو بطاقة هدايا أو قسيمة', 'Cash, gift card or voucher')),
      check('active_tender', L('المانح مشارك في مناقصة أو طلب عروض قائم', 'The giver is in an active tender or RFQ'), L('إن لم تكن متأكداً فاسأل قسم المشتريات', 'Not sure? Ask Procurement'))));
  const guide = h('aside.integ-guide', { 'aria-live': 'polite' });
  const paint = (p) => {
    const since = v.received_on ? daysSince(v.received_on) : 0;
    const late = since > policy.prompt_days;
    guide.replaceChildren(
      h('span.eyebrow', L('إرشاد فوري وفق السياسة', 'Live policy guidance')),
      p ? h(`div.integ-guide-result.${DECISION[p.decision][2]}`, h('span.integ-guide-ic', icon(DECISION[p.decision][3])), h('div', h('small', L('المقترح', 'Proposed')), h('strong', lbl(DECISION, p.decision)))) : h('div.integ-guide-result.idle', h('span.integ-guide-ic', icon('scale')), h('div', h('small', L('المقترح', 'Proposed')), h('strong', L('أدخل القيمة التقديرية', 'Enter the estimated value')))),
      p ? h('p.integ-guide-reason', L(p.reason_ar, p.reason_en)) : h('p.integ-guide-reason', L('سيظهر هنا ما تقترحه السياسة، ويعتمد ضابط الامتثال القرار النهائي.', 'The policy’s proposal appears here; the compliance officer records the final decision.')),
      h('ul.integ-guide-facts',
        h('li', icon('gift'), L(`حد الهدايا الرمزية: ${policy.token_limit ?? 200} درهم`, `Token-gift limit: AED ${policy.token_limit ?? 200}`)),
        v.provider_id && !v.active_tender && !v.cash ? h('li.warn', icon('handshake'), L('مقدّم خدمة: إن كان لديه مناقصة قائمة فيُعتذر دائماً', 'Provider: if they have an active tender, always decline')) : null,
        h(`li${late ? '.warn' : '.good'}`, icon(late ? 'clockAlert' : 'calendarCheck'), late ? L(`مضى ${daysWord(since)} — الإفصاح المتأخر أفضل من عدمه`, `${since} days ago — late is better than never`) : L(`في الوقت (خلال ${policy.prompt_days} أيام)`, `On time (within ${policy.prompt_days} days)`))),
      h('p.integ-guide-privacy', icon('lock'), L('لا يطّلع على إفصاحك إلا ضابط الامتثال.', 'Only the compliance officer sees your declaration.')));
  };
  let seq = 0;
  const refresh = debounce(async () => {
    if (v.value_aed == null && !v.cash && !v.active_tender) { paint(null); return; }
    const my = ++seq;
    try { const p = await call('/policy/check', { method: 'POST', body: { value_aed: Math.max(0, Number(v.value_aed) || 0), cash: v.cash, active_tender: v.active_tender, kind: v.kind } }); if (my === seq) paint(p); } catch { /* keep the last guidance */ }
  }, 180);
  paint(null);
  const formErr = h('div.error-text', { 'aria-live': 'polite' });
  const body = h('div.integ-gift-dialog', h('div.integ-gift-form', form, formErr), guide);
  let created = null;
  await modal(L('الإفصاح عن هدية أو ضيافة', 'Declare a gift or hospitality'), body, [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('تقديم الإفصاح', 'Submit declaration'), value: true, primary: true }], {
    wide: true,
    beforeClose: async () => {
      let first = null;
      const need = { description: L('صف الهدية', 'Describe the gift'), giver_name: L('اذكر الجهة المانحة', 'Enter the giver'), received_on: L('حدّد التاريخ', 'Pick the date') };
      for (const [k, m] of Object.entries(need)) { const bad = !String(v[k] || '').trim(); errs[k].textContent = bad ? m : ''; if (bad && !first) first = k; }
      const badValue = v.value_aed == null || !(v.value_aed >= 0);
      errs.value_aed.textContent = badValue ? L('أدخل قيمة تقديرية (0 أو أكثر)', 'Enter an estimated value (0 or more)') : '';
      if (badValue && !first) first = 'value_aed';
      if (v.received_on && v.received_on > todayIso()) { errs.received_on.textContent = L('التاريخ لا يكون في المستقبل', 'The date cannot be in the future'); first ||= 'received_on'; }
      if (first) { body.querySelector(`#ig-${first}`)?.focus(); return false; }
      try {
        created = await call('/gifts', { method: 'POST', body: {
          description: v.description.trim(), giver_name: v.giver_name.trim(), giver_type: v.giver_type, kind: v.kind, value_aed: Number(v.value_aed), received_on: v.received_on,
          occasion: v.occasion?.trim() || undefined, provider_id: v.provider_id || undefined, offered_only: v.offered_only, cash: v.cash, active_tender: v.active_tender } });
        return true;
      } catch (e) { formErr.textContent = e.message; return false; }
    },
  });
  if (location.hash.endsWith('/gifts/new')) history.replaceState(null, '', '#/sys/integrity/gifts');
  if (created) toast(L(`شكراً — أُفصح عن الهدية. المقترح: ${lbl(DECISION, created.proposal.decision)}`, `Thank you — declared. Proposed: ${lbl(DECISION, created.proposal.decision)}`));
}
