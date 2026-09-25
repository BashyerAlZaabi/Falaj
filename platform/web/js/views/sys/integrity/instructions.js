// «التعليمات» — line managers: ONLY the mitigation instructions they must enforce
// («الاسم: التعليمات»). No declaration, interest or gift details ever reach this screen.
import { h, icon, L, fmtDate, toast, emptyState, act, avatar, confirmDialog } from '../../../sys-kit.js';
import { call, MITIGATION, lbl, ago } from './common.js';

export async function instructionsTab() {
  const rows = await call('/instructions');
  const pending = rows.filter((r) => !r.acknowledged_at);
  const cardFor = (r) => h(`article.card.integ-instr${r.acknowledged_at ? '.done' : ''}`,
    h('header.integ-instr-head', avatar(r.person.name_ar), h('div.grow', h('strong', L(r.person.name_ar, r.person.name_en)), h('span', [L(r.person.title_ar, r.person.title_en), L(r.person.dept_ar, r.person.dept_en)].filter(Boolean).join(' · '))),
      h('span.chip.tiny.purple', icon(MITIGATION[r.kind]?.[2] || 'circleDot'), lbl(MITIGATION, r.kind))),
    h('blockquote.integ-instr-text', r.instruction),
    h('footer.integ-instr-foot',
      h('span.tiny.faint', icon('calendar'), L(`سارية منذ ${fmtDate(r.since)}`, `In force since ${fmtDate(r.since)}`)),
      r.acknowledged_at ? h('span.chip.tiny.good', icon('circleCheck'), L(`أكّدتَ التطبيق ${ago(r.acknowledged_at)}`, `Acknowledged ${ago(r.acknowledged_at)}`))
        : h('button.btn.primary.sm', { type: 'button', onclick: async (e) => {
          const ok = await confirmDialog(L('تأكيد تطبيق التعليمات', 'Acknowledge the instruction'), L(`تؤكد أنك ستطبّق هذه التعليمات عند توزيع المهام واللجان الخاصة بـ${r.person.name_ar}. يُسجَّل التأكيد.`, `You confirm you will apply this instruction when assigning work and committees. The acknowledgement is logged.`), { confirmLabel: L('أؤكد التطبيق', 'I acknowledge') });
          if (ok && await act(e.currentTarget, () => call(`/mitigations/${r.id}/acknowledge`, { method: 'POST', body: {} }))) toast(L('شكراً — سُجّل تأكيدك', 'Thank you — acknowledged'));
        } }, icon('userCheck'), L('تأكيد التطبيق', 'Acknowledge'))));
  return {
    actions: [],
    body: h('div.integ-instructions',
      h('div.callout.integ-instr-callout', icon('eyeOff'), h('span', L('تعرض هذه الصفحة التعليمات التي يلزمك تطبيقها فقط. تفاصيل الإفصاح سرية للغاية ولا يطّلع عليها إلا ضابط الامتثال — وهذا مقصود لحماية خصوصية زملائك.', 'This page shows only the instructions you must apply. Disclosure details are restricted to the compliance officer — by design, to protect your colleagues’ privacy.'))),
      rows.length ? [
        pending.length ? h('div.section', L('بانتظار تأكيدك', 'Awaiting your acknowledgement'), h('span.count', String(pending.length))) : null,
        pending.length ? h('div.integ-instr-grid', pending.map(cardFor)) : null,
        rows.length > pending.length ? h('div.section', L('تعليمات سارية مؤكَّدة', 'Acknowledged instructions in force')) : null,
        rows.length > pending.length ? h('div.integ-instr-grid', rows.filter((r) => r.acknowledged_at).map(cardFor)) : null,
      ] : emptyState({ icon: 'userCheck', title: L('لا توجد تعليمات تخص فريقك', 'No instructions for your team'), body: L('عندما يصدر ضابط الامتثال تعليمات تنحٍّ أو إعادة توزيع لأحد أعضاء فريقك ستظهر هنا — دون تفاصيل الإفصاح.', 'When the compliance officer issues a recusal or reassignment for someone in your team it appears here — without any disclosure details.') })),
  };
}
