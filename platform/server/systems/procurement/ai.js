// AI support for procurement:
//  (a) scope of work / technical specification drafted from the purchase request
//      (model capability "generate"; transparent local template when no model);
//  (c) evaluation analysis narrative over MASKED findings only («المورّد أ/ب/ج»):
//      the model never receives provider names, people, amounts or the estimate —
//      only percentages, flags and scores. Deterministic narrative when no model.
// The committee decides; the output is advisory and labelled as such.
import { one, json, clean, deptBrief, Conflict, Forbidden } from '../kit.js';
import { complete } from '../../ai/services.js';
import { createDocument, saveDocument } from '../../services/documents.js';
import { CATEGORIES, DEFAULT_CRITERIA, isOfficer } from './schema.js';
import { itemsOf, requestRow } from './requests.js';
import { visibleRfq, findings, evaluation, setSpec, saveAnalysis, analysable } from './rfq.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CAT_REQ = {
  it: ['أن تكون الحلول والخدمات متوافقة مع معايير الأمن السيبراني الوطنية وسياسات حماية البيانات المعتمدة في الجهة.', 'استضافة البيانات داخل الدولة، وعدم نقلها أو معالجتها خارجها دون موافقة كتابية.', 'تقديم خطة تشغيل ودعم فني تتضمن اتفاقية مستوى خدمة (SLA) واضحة لأوقات الاستجابة والحل.', 'نقل المعرفة وتدريب الفريق الفني للجهة وتسليم الوثائق الفنية كاملة.'],
  supplies: ['أن تكون جميع البنود جديدة وغير مستعملة ومطابقة للمواصفات القياسية المعتمدة في الدولة.', 'إرفاق الكتالوجات وبيانات الشركة المصنّعة وبلد المنشأ لكل بند.', 'التوريد والتركيب والتشغيل في الموقع المحدد دون تكلفة إضافية.', 'ضمان المصنّع لمدة لا تقل عن سنتين مع توفر قطع الغيار.'],
  consulting: ['تقديم منهجية عمل تفصيلية وخطة زمنية بالمخرجات ومراحل التسليم.', 'فريق عمل مؤهل مع السير الذاتية للأعضاء الرئيسيين وخبرات سابقة مع جهات حكومية.', 'الحفاظ على سرية المعلومات وعدم استخدامها لأي غرض خارج نطاق العقد.', 'نقل المعرفة وتسليم جميع المخرجات بصيغ قابلة للتعديل وتصبح ملكاً للجهة.'],
  facilities: ['الالتزام بأنظمة الصحة والسلامة المهنية والبيئة المعمول بها.', 'توفير الكوادر المؤهلة والمعدات اللازمة وجدول زمني للصيانة الوقائية.', 'زمن استجابة للبلاغات الطارئة لا يتجاوز أربع ساعات.', 'تقارير شهرية بالأعمال المنفذة ومؤشرات الأداء.'],
};

// ---------------- (a) spec drafting ----------------
export function templateSpec(q, pr) {
  const items = itemsOf(pr.id);
  const dept = deptBrief(pr.department_id);
  const crit = json(q.criteria, DEFAULT_CRITERIA);
  const cat = CATEGORIES[q.category]?.[0] || q.category;
  return `<h2>نطاق العمل والمواصفات الفنية — ${esc(q.number)}</h2>
<p><strong>موضوع الطلب:</strong> ${esc(pr.title)} · <strong>الجهة الطالبة:</strong> ${esc(dept?.name_ar || '')} · <strong>الفئة:</strong> ${esc(cat)}</p>
<h3>1. الخلفية والهدف</h3>
<p>${esc(pr.justification)}</p>
<h3>2. نطاق التوريد / الخدمة</h3>
<table><thead><tr><th>#</th><th>البند</th><th>الكمية</th><th>الوحدة</th></tr></thead><tbody>
${items.map((i) => `<tr><td>${i.line_no}</td><td>${esc(i.description)}</td><td>${i.qty}</td><td>${esc(i.unit)}</td></tr>`).join('\n')}
</tbody></table>
<p>يُسعَّر كل بند منفرداً بسعر الوحدة شاملاً التوريد والتسليم وغير شامل ضريبة القيمة المضافة. البند غير المسعّر يُعدّ غير مقدَّم.</p>
<h3>3. المتطلبات الفنية العامة</h3>
<ul>${(CAT_REQ[q.category] || CAT_REQ.supplies).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<h3>4. التسليم والتنفيذ</h3>
<ul><li>يكتمل التسليم أو التنفيذ في موعد أقصاه ${esc(pr.needed_by)}، مع خطة زمنية مفصّلة ضمن العرض الفني.</li><li>يتم الاستلام بمحضر رسمي بعد التحقق من المطابقة للمواصفات.</li></ul>
<h3>5. معايير التقييم</h3>
<ul>${crit.map((c) => `<li>${esc(c.ar)} — ${c.weight}% من الدرجة الفنية</li>`).join('')}
<li>الوزن الفني ${q.tech_weight}% والمالي ${100 - q.tech_weight}%، وحد القبول الفني ${q.min_tech}%. تُحسب الدرجة المالية بمعادلة أقل سعر (أقل سعر ÷ سعر العرض × 100) بين العروض المكتملة والمجتازة فنياً.</li></ul>
<h3>6. الشروط العامة</h3>
<ul><li>تُقدَّم العروض عبر بوابة الموردين قبل موعد الإغلاق، وتبقى مختومة ولا يُطّلع على محتواها قبل فتحها بمفتاحين من عضوين في لجنة التقييم.</li>
<li>يجب أن تكون الرخصة التجارية وشهادة التسجيل الضريبي ووثيقة التأمين سارية المفعول طوال مدة العقد.</li>
<li>مدة صلاحية العرض لا تقل عن 90 يوماً من تاريخ الإغلاق.</li>
<li>يحق للجهة طلب إيضاحات حول الأسعار غير الاعتيادية، والترسية الكلية أو الجزئية، أو إلغاء الطلب وفق الأنظمة المعتمدة.</li></ul>`;
}
export async function draftSpec(user, id) {
  const q = visibleRfq(user, id);
  if (!isOfficer(user)) throw new Forbidden('إعداد نطاق العمل من صلاحية أخصائي المشتريات');
  if (q.status !== 'draft') throw new Conflict('نطاق العمل يُعدّ قبل نشر طلب العروض');
  const pr = requestRow(q.request_id);
  let html; let mode = 'template'; let model = null; let note = 'تحليل محلي — نموذج الذكاء الاصطناعي غير متصل: استُخدم القالب المعتمد للمشتريات';
  try {
    const items = itemsOf(pr.id).map((i) => `- ${i.description} — الكمية ${i.qty} ${i.unit}`).join('\n');
    const out = await complete({
      capability: 'generate', user, maxTokens: 2500,
      system: 'أنت أخصائي مشتريات حكومي في دولة الإمارات. اكتب «نطاق العمل والمواصفات الفنية» لطلب عروض أسعار بالعربية الفصحى وبصيغة HTML فقط (h2, h3, p, ul, li, table). اجعل المواصفات قابلة للقياس ومحايدة (لا علامات تجارية محددة إلا مع عبارة «أو ما يعادلها»). لا تذكر أي أسعار تقديرية أو أسماء موردين أو أشخاص. اختم بقسم «الشروط العامة» يذكر أن العروض مختومة حتى فتحها بمفتاحين وأن الوثائق النظامية يجب أن تكون سارية.',
      messages: [{ role: 'user', content: `رقم الطلب: ${q.number}\nالموضوع: ${pr.title}\nالفئة: ${CATEGORIES[q.category]?.[0]}\nالمبرر: ${pr.justification}\nالموعد المطلوب: ${pr.needed_by}\nالبنود:\n${items}\nمعايير التقييم الفني: ${json(q.criteria, DEFAULT_CRITERIA).map((c) => `${c.ar} ${c.weight}%`).join('، ')} — الوزن الفني ${q.tech_weight}% والمالي ${100 - q.tech_weight}%.` }],
    });
    const text = String(out.text || '').replace(/^```(?:html)?\s*|\s*```$/g, '').trim();
    if (text.length > 200 && /<h[23]|<p|<ul/.test(text)) { html = text; mode = 'ai'; model = out.model; note = 'مسودة مولّدة بالذكاء الاصطناعي — راجعها وعدّلها قبل النشر'; }
    else throw new Error('empty draft');
  } catch (e) {
    if (!e.local) note = 'تعذّر الوصول إلى نموذج الذكاء الاصطناعي — استُخدم القالب المحلي المعتمد';
    html = templateSpec(q, pr);
  }
  const banner = `<p><em>${esc(note)}</em></p>`;
  const title = `نطاق العمل — ${q.number} — ${pr.title}`;
  let docId = q.spec_doc_id;
  const existing = docId ? one('SELECT id FROM documents WHERE id=? AND owner_id=? AND deleted_at IS NULL', docId, user.id) : null;
  if (existing) saveDocument(user, docId, { title, content_html: banner + html, reason: 'ai_draft' });
  else docId = createDocument(user, { title, kind: 'report', content_html: banner + html }).result.id;
  setSpec(user, id, { doc_id: docId, mode: mode === 'ai' ? 'ai' : 'template' });
  return { doc_id: docId, mode, model, note };
}

// ---------------- (c) evaluation analysis ----------------
const cmp = (v) => `${v < 0 ? 'أقل' : 'أعلى'} بـ ${Math.abs(v)}%`;
function localNarrative(f, ev, q) {
  const lines = [];
  const bids = f.bids;
  lines.push(`حُلّل ${bids.length === 1 ? 'عرض واحد' : bids.length === 2 ? 'عرضان' : `${bids.length} عروض`} بأسماء مقنّعة (المبالغ والأسماء لا تغادر النظام).`);
  const top = bids.find((b) => b.bid_id === ev.top);
  if (top) lines.push(`الأعلى في الدرجة المركبة: «${top.label}» بدرجة ${top.combined} (فني ${top.tech} × ${q.tech_weight}% + مالي ${top.fin} × ${100 - q.tech_weight}%).`);
  else lines.push('لم تكتمل الدرجات الفنية لكل الأعضاء بعد، لذلك لا يوجد ترتيب مركّب نهائي.');
  for (const b of bids) {
    const parts = [];
    const has = (code) => b.flags.some((x) => x.code === code);
    if (b.complete && b.dev_est != null) parts.push(`الإجمالي ${cmp(b.dev_est)} من التقدير${has('low_vs_estimate') || has('high_vs_estimate') ? ' (غير اعتيادي)' : ''}`);
    if (b.dev_peers != null && (has('low_vs_peers') || has('high_vs_peers'))) parts.push(`و${cmp(b.dev_peers)} من وسيط العروض الأخرى (غير اعتيادي)`);
    for (const x of b.flags.filter((y) => y.code === 'missing_items' || y.code === 'below_tech_min')) parts.push(x.ar);
    const byLine = new Map();
    for (const x of b.flags.filter((y) => y.severity === 'info')) { if (!byLine.has(x.line_no)) byLine.set(x.line_no, []); byLine.get(x.line_no).push(x.code); }
    for (const [ln, codes] of byLine) {
      const l = f.lines.find((z) => z.line_no === ln); const p = l?.prices.find((z) => z.bid_id === b.bid_id);
      const seg = [];
      if (codes.some((c) => c.endsWith('estimate')) && p?.dev_est != null) seg.push(`${cmp(p.dev_est)} من التقدير`);
      if (codes.some((c) => c.endsWith('peers')) && p?.dev_peers != null) seg.push(`${cmp(p.dev_peers)} من العروض الأخرى`);
      parts.push(`سعر البند ${ln} ${seg.join(' و')}`);
    }
    for (const x of b.flags.filter((y) => y.severity === 'crit')) parts.push(`${x.ar} — لا تجوز الترسية قبل معالجتها`);
    lines.push(`«${b.label}»: ${parts.join('؛ ') || 'لا ملاحظات'}.`);
  }
  if (bids.some((b) => b.flags.some((x) => x.code.includes('low_vs')))) lines.push('للأسعار المنخفضة بشكل غير اعتيادي: يُوصى بطلب إيضاح مكتوب وتأكيد القدرة على التنفيذ بالسعر المعروض قبل التوصية.');
  if (f.recusals.length) lines.push(`${f.recusals.length === 1 ? 'تنحّى عضو واحد' : `تنحّى ${f.recusals.length} أعضاء`} عن اللجنة بسبب تضارب مصالح، واستُبعدت درجاته من الاحتساب.`);
  lines.push('هذا تحليل مساند؛ القرار للجنة التقييم.');
  return lines.join('\n');
}
export async function runAnalysis(user, id) {
  const q = await analysable(user, id);
  const f = findings(q);
  const ev = evaluation(q);
  let text; let mode = 'local'; let model = null;
  // Masked, minimal payload: labels, percentages, flags and scores only.
  const masked = {
    weights: { technical: q.tech_weight, financial: 100 - q.tech_weight, pass_mark: q.min_tech },
    bids: f.bids.map((b) => ({ bid: b.label, complete: b.complete, total_vs_estimate_pct: b.dev_est, total_vs_other_bids_pct: b.dev_peers, technical: b.tech, financial: b.fin, combined: b.combined, rank: b.rank, documents_valid: b.eligible_now, flags: b.flags.map((x) => x.code + (x.line_no ? `@item${x.line_no}` : '')) })),
    items: f.lines.map((l) => ({ item: l.line_no, prices_vs_estimate_pct: l.prices.map((p, i) => ({ bid: f.bids[i]?.label, pct: p.missing ? 'missing' : p.dev_est })) })),
    recused_members: f.recusals.length,
    thresholds: { abnormally_low_pct: -25, abnormally_high_pct: 30 },
  };
  try {
    const out = await complete({
      capability: 'analyze', user, maxTokens: 900,
      system: 'أنت مساعد تحليل لعروض المشتريات الحكومية. البيانات مقنّعة (المورّد أ/ب/ج) ولا تحتوي أسماء أو مبالغ. اكتب بالعربية تحليلاً موجزاً من 4 إلى 8 أسطر: الترتيب المركّب، الأسعار غير الاعتيادية (أقل بأكثر من 25% أو أعلى بأكثر من 30% من التقدير أو من العروض الأخرى)، البنود غير المسعّرة، الوثائق غير السارية، وأثر التنحي. لا توصِ بالترسية على مورد محدد؛ اختم بأن القرار للجنة.',
      messages: [{ role: 'user', content: JSON.stringify(masked) }],
    });
    const t = clean(out.text, 4000);
    if (t.length < 40) throw new Error('empty analysis');
    text = t; mode = 'ai'; model = out.model;
  } catch (e) {
    text = localNarrative(f, ev, q);
    mode = e.local ? 'local' : 'local_error';
  }
  saveAnalysis(user, id, { narrative: text, mode, model });
  return { mode, model, narrative: text };
}
// Used by the demo seed: the deterministic analysis text only.
export function localAnalysisText(id) {
  const q = one('SELECT * FROM procurement_rfqs WHERE id=?', id);
  return localNarrative(findings(q), evaluation(q), q);
}
