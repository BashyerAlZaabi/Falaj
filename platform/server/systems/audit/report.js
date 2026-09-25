// Internal Audit — engagement report content: the Documents-module HTML and a
// transparent, deterministic executive-summary draft (used when no model is
// connected or when the user has not opted in to share findings with Ask AI).
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const RISK_AR = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
export const POSITION_AR = { agree: 'موافقة', partial: 'موافقة جزئية' };
const Q_AR = ['الأول', 'الثاني', 'الثالث', 'الرابع'];

function countAr(n, [one, two, few, many]) {
  if (n === 0) return `لا ${many}`;
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}
export const findingsCountAr = (n) => countAr(n, ['ملاحظة واحدة', 'ملاحظتين', 'ملاحظات', 'ملاحظة']);

// Deterministic summary from the engagement record and its non-draft findings.
export function localSummary(e, findings) {
  const by = { high: 0, medium: 0, low: 0 };
  for (const f of findings) by[f.risk]++;
  const withPlan = findings.filter((f) => f.action).length;
  const lines = [];
  lines.push(`نفّذ مكتب التدقيق الداخلي مهمة «${e.title}» على ${e.dept_ar} ضمن خطة التدقيق لعام ${e.plan_year} (الربع ${Q_AR[e.quarter - 1]}).`);
  if (e.objectives) lines.push(`هدفت المهمة إلى ${e.objectives.replace(/^\s*(هدفت|تهدف)\s+(المهمة\s+)?(إلى\s+)?/, '').replace(/[.。]\s*$/, '')}.`);
  if (!findings.length) lines.push('لم تُسفر أعمال التدقيق عن ملاحظات جوهرية، وتبيّن أن الضوابط المختبرة تعمل بصورة مرضية ضمن نطاق المهمة.');
  else {
    const parts = ['high', 'medium', 'low'].filter((k) => by[k]).map((k) => `${by[k]} ${RISK_AR[k]} الخطورة`);
    lines.push(`أسفرت أعمال التدقيق عن ${findingsCountAr(findings.length)} (${parts.join('، ')}).`);
    const top = findings.filter((f) => f.risk === 'high').slice(0, 2);
    if (top.length) lines.push(`أبرزها: ${top.map((f) => `«${f.title}»`).join(' و')}.`);
    if (withPlan) lines.push(`وافقت الإدارة على خطط معالجة لـ${withPlan === findings.length ? 'جميع الملاحظات' : findingsCountAr(withPlan)}، وسيتابع مكتب التدقيق تنفيذها حتى الإغلاق.`);
    else lines.push('ننتظر ردود الإدارة وخطط المعالجة على الملاحظات الصادرة.');
  }
  return lines.join(' ');
}

export function reportHtml(e, findings, issuer, issuedAt) {
  const rows = findings.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f.title)}</td><td>${RISK_AR[f.risk]}</td><td>${esc(f.recommendation)}</td><td>${f.response_text ? `${POSITION_AR[f.position] || ''}: ${esc(f.response_text)}` : 'بانتظار رد الإدارة'}</td><td>${f.action ? esc(f.action.owner_name_ar || '') : '—'}</td><td>${f.action ? esc(f.action.due_date) : '—'}</td></tr>`).join('');
  const detail = findings.map((f, i) => `<h3>${i + 1}. ${esc(f.title)} (خطورة ${RISK_AR[f.risk]})</h3>
<p><strong>المعيار:</strong> ${esc(f.criteria) || '—'}</p><p><strong>الوضع القائم:</strong> ${esc(f.condition) || '—'}</p>
<p><strong>السبب:</strong> ${esc(f.cause) || '—'}</p><p><strong>الأثر:</strong> ${esc(f.effect) || '—'}</p>
<p><strong>التوصية:</strong> ${esc(f.recommendation) || '—'}</p>
${f.action ? `<p><strong>خطة المعالجة:</strong> ${esc(f.action.description)} — المسؤول: ${esc(f.action.owner_name_ar || '')}، تاريخ الاستحقاق: ${esc(f.action.due_date)}</p>` : ''}`).join('\n');
  return `<h1>تقرير التدقيق الداخلي: ${esc(e.title)}</h1>
<p><strong>الجهة الخاضعة للتدقيق:</strong> ${esc(e.dept_ar)} · <strong>خطة عام:</strong> ${e.plan_year} · <strong>الربع:</strong> ${Q_AR[e.quarter - 1]}</p>
<p><strong>تاريخ الإصدار:</strong> ${esc(String(issuedAt).slice(0, 10))} · <strong>أصدره:</strong> ${esc(issuer.name_ar)} (${esc(issuer.title_ar || 'رئيس التدقيق الداخلي')})</p>
<h2>الملخص التنفيذي</h2>
${String(e.exec_summary || '').split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('\n')}
<h2>النطاق والأهداف</h2>
<p><strong>النطاق:</strong> ${esc(e.scope) || '—'}</p>
<p><strong>الأهداف:</strong> ${esc(e.objectives) || '—'}</p>
<h2>جدول الملاحظات</h2>
${findings.length ? `<table><thead><tr><th>#</th><th>الملاحظة</th><th>الخطورة</th><th>التوصية</th><th>رد الإدارة</th><th>المسؤول</th><th>الاستحقاق</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>لا توجد ملاحظات.</p>'}
${findings.length ? `<h2>تفاصيل الملاحظات</h2>\n${detail}` : ''}
<p><em>تقرير سري — للاستخدام الداخلي ولجنة التدقيق فقط.</em></p>`;
}
