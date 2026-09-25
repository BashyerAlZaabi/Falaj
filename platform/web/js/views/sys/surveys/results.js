// Surveys — results dashboard: participation, per-question aggregates (ratings,
// NPS, choices, yes/no), open-text themes with an AI or local summary, department
// segments (≥ 5, with secondary suppression) and the comments access log.
// Authors/overseers get the full view; participants see shared aggregates only.
import { h, icon, L, fmtNum, fmtDate, toast, emptyState, errorState, act, go, sysHeader, card, statRow, statTile, openSheet, confirmDialog, accessLogList } from '../../../sys-kit.js';
import { barChart } from '../../../charts.js';
import { call, MIN_GROUP, typeChip, surveyStatus, anonChip, demoChip, dateLabel, ring, count, countAr, pctText, errMsg } from './common.js';
import { remindSurvey, duplicateSurvey, closeSurveyFlow, privacyCard } from './lists.js';

const answersLabel = (n) => count(n, ['إجابة واحدة', 'إجابتان', 'إجابات', 'إجابة'], ['answer', 'answers']);

export async function renderResults(root, ctx, id) {
  let r;
  try { r = await call(`/surveys/${id}/results`); }
  catch (e) {
    root.append(sysHeader(ctx, { eyebrow: L('نتائج الاستبيان', 'Survey results') }), card(null,
      e.status === 404 ? emptyState({ icon: 'searchCheck', title: L('الاستبيان غير متاح', 'Survey not available'), body: L('قد يكون حُذف أو لا يحق لك الاطلاع عليه.', 'It may have been deleted, or you may not have access.'), actions: [{ label: L('العودة', 'Back'), onClick: () => go(ctx) }] })
        : e.status === 403 ? emptyState({ icon: 'lockKeyhole', title: L('النتائج غير متاحة لك بعد', 'Results are not available to you yet'), body: e.message, actions: [{ label: L('مشاركاتي', 'My responses'), primary: true, onClick: () => go(ctx, 'answered') }] })
          : errorState(e, () => go(ctx, 'results', id))));
    return;
  }
  const s = r.survey;
  const full = r.access === 'full';
  root.append(sysHeader(ctx, {
    eyebrow: L('نتائج الاستبيان', 'Survey results'), title: s.title,
    sub: `${L(s.audience_ar, s.audience_en)} · ${dateLabel(s.opens_on)} – ${dateLabel(s.closes_on)} · ${L(s.author?.dept_ar || '', s.author?.dept_en || '')}`,
    badges: [surveyStatus(s), anonChip(s), demoChip(s), s.share_results ? h('span.chip.tiny.good', icon('share'), L('مُشارَكة مع المشاركين', 'Shared with participants')) : null, s.role === 'overseer' ? h('span.chip.tiny.outline', icon('eye'), L('اطلاع فقط', 'View only')) : null].filter(Boolean),
    actions: full ? headerActions(ctx, s, r) : [h('a.btn.ghost', { href: `#/sys/${ctx.key}/answered` }, icon('arrowLeft', 'flip-rtl'), L('مشاركاتي', 'My responses'))],
  }));
  const p = r.participation;
  if (!full) root.append(h('div.callout.sv-strip', icon('shield'), h('span.grow', L('نتائج مجمّعة شاركها مُعِدّ الاستبيان مع المشاركين — لا تتضمن أي إجابة فردية أو تعليق نصي.', 'Aggregated results shared with participants — no individual answer or comment is included.'))));
  else if (s.status === 'published' && !r.hidden) root.append(h('div.callout.sv-strip', icon('layers'), h('span.grow', L(`تشمل النتائج ${answersLabel(p.released)}. تُضاف الإجابات الجديدة على دفعات من ${MIN_GROUP} حتى لا يُستنتج رأي فرد${p.pending_release ? ` — بانتظار اكتمال الدفعة التالية: ${fmtNum(p.pending_release)}` : ''}.`, `Results include ${p.released} answers. New answers are added in batches of ${MIN_GROUP} so no individual can be inferred${p.pending_release ? ` — ${p.pending_release} waiting for the next batch` : ''}.`))));

  const qs = r.questions || [];
  const nps = qs.find((q) => q.type === 'nps' && !q.suppressed);
  const ratings = qs.filter((q) => q.type === 'rating' && !q.suppressed);
  const avg = ratings.length ? Math.round((10 * ratings.reduce((a, q) => a + q.avg, 0)) / ratings.length) / 10 : null;
  root.append(statRow([
    statTile({ label: L('المشاركون', 'Respondents'), value: `${fmtNum(p.responded)} / ${fmtNum(p.eligible)}`, icon: 'usersRound', hint: L('من المدعوين', 'of those invited') }),
    statTile({ label: L('معدل الاستجابة', 'Response rate'), value: pctText(p.rate), icon: 'percent', tone: p.rate >= 60 ? 'good' : p.rate >= 30 ? 'warn' : 'crit' }),
    avg != null ? statTile({ label: L('متوسط التقييمات', 'Average rating'), value: fmtNum(avg), unit: '/5', icon: 'star', tone: avg >= 4 ? 'good' : avg >= 3 ? 'sand' : 'warn', hint: L(`عبر ${countAr(ratings.length, ['سؤال', 'سؤالين', 'أسئلة', 'سؤالاً'])}`, `across ${ratings.length} questions`) }) : null,
    nps ? statTile({ label: L('صافي نقاط الترويج', 'Net Promoter Score'), value: `${nps.nps > 0 ? '+' : ''}${fmtNum(nps.nps)}`, icon: 'gauge', tone: nps.nps >= 30 ? 'good' : nps.nps >= 0 ? null : 'crit', hint: L(`مروّجون ${pctText(nps.promoters.pct)} · منتقدون ${pctText(nps.detractors.pct)}`, `Promoters ${pctText(nps.promoters.pct)} · detractors ${pctText(nps.detractors.pct)}`) }) : null,
    statTile({ label: s.status === 'closed' ? L('أُغلق في', 'Closed on') : L('المدة المتبقية', 'Time left'), value: s.status === 'closed' ? fmtDate(s.closed_at || s.closes_on) : s.days_left <= 0 ? L('اليوم', 'Today') : fmtNum(s.days_left), unit: s.status === 'closed' || s.days_left <= 0 ? null : L(s.days_left === 1 ? 'يوم' : s.days_left === 2 ? 'يومان' : s.days_left <= 10 ? 'أيام' : 'يوماً', s.days_left === 1 ? 'day' : 'days'), icon: s.status === 'closed' ? 'lock' : 'hourglass', tone: s.status === 'closed' ? null : s.days_left <= 1 ? 'warn' : 'sand' }),
  ]));

  if (r.hidden) {
    root.append(h('section.card.sv-hidden-card',
      ring(Math.min(100, (100 * (p.released || 0)) / MIN_GROUP), { size: 120, stroke: 10, label: `${fmtNum(p.released ?? 0)}/${fmtNum(MIN_GROUP)}`, sub: L('إجابات', 'answers'), tone: 'emph' }),
      h('div', h('h2', L(`النتائج مخفية حتى تبلغ الإجابات ${MIN_GROUP}`, `Results stay hidden until ${MIN_GROUP} answers`)),
        h('p', L('حماية لهوية المشاركين، لا تُعرض أي نتيجة لمجموعة أصغر من خمسة. شجّع المدعوين على المشاركة — التذكير لا يكشف لك من لم يشارك.', 'To protect respondents, nothing is shown for fewer than five. Encourage participation — reminders never reveal who has not answered.')),
        full && r.can?.remind ? h('button.btn.primary', { type: 'button', onclick: () => remindSurvey(s) }, icon('bell'), L('تذكير غير المشاركين', 'Remind non-respondents')) : null)));
    if (full) root.append(participationRow(r));
    return;
  }

  // Highlights + participation trend
  if (full) root.append(participationRow(r));
  else root.append(h('div.sys-grid.two', highlightsCard(r), privacyCard()));

  // Questions grouped by section
  const bySec = new Map((r.sections || []).map((x) => [x.id, []]));
  qs.forEach((q, i) => bySec.get(q.section_id)?.push([q, i]));
  for (const sec of r.sections || []) {
    const list = bySec.get(sec.id) || [];
    if (!list.length) continue;
    root.append(h('div.section', sec.title, h('span.count', questionsCount(list.length))));
    root.append(h('div.sv-rq-grid', list.map(([q, i]) => questionCard(ctx, s, q, i, full))));
  }
  if (full && r.segments) root.append(segmentsCard(r));
  if (full) root.append(h('div.sys-grid.two', deptParticipation(r), accessCard(r)));
}
const questionsCount = (n) => count(n, ['سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالاً'], ['question', 'questions']);

function headerActions(ctx, s, r) {
  const c = r.can || {};
  const out = [];
  if (s.status === 'published') {
    if (c.remind) out.push({ label: L('تذكير غير المشاركين', 'Remind non-respondents'), icon: 'bell', primary: true, onClick: () => remindSurvey(s) });
    else if (s.role === 'author') out.push(h('span.chip.tiny.outline', { 'data-tip': L('يُرسل التذكير مرة واحدة يومياً', 'One reminder per day') }, icon('bell'), L('أُرسل تذكير اليوم', 'Reminded today')));
    if (c.close) out.push({ label: L('إغلاق الاستبيان', 'Close survey'), icon: 'lock', onClick: () => closeSurveyFlow(s) });
  }
  if (s.status === 'closed' && c.share) {
    out.push(s.share_results
      ? { label: L('إيقاف مشاركة النتائج', 'Stop sharing results'), icon: 'eyeOff', onClick: () => toggleShare(s, false) }
      : { label: L('مشاركة النتائج مع المشاركين', 'Share results with participants'), icon: 'share', primary: true, onClick: () => toggleShare(s, true) });
  }
  if (c.participants) out.push({ label: L('قائمة المشاركين', 'Participants'), icon: 'userCheck', onClick: () => participantsSheet(s) });
  if (c.duplicate) out.push({ label: L('نسخ كمسودة', 'Copy as draft'), icon: 'copy', onClick: () => duplicateSurvey(ctx, s) });
  if (s.role === 'author') out.push({ label: L('الأسئلة', 'Questions'), icon: 'listChecks', href: `#/sys/${ctx.key}/build/${s.id}` });
  return out;
}
async function toggleShare(s, on) {
  const ok = await confirmDialog(on ? L('مشاركة النتائج مع المشاركين؟', 'Share results with participants?') : L('إيقاف مشاركة النتائج؟', 'Stop sharing results?'),
    on ? L('سيرى من شارك في الاستبيان النتائج المجمّعة فقط (دون التعليقات النصية أو التحليل حسب الإدارة). يُسجَّل هذا التغيير في سجل التدقيق.', 'Everyone who answered will see the aggregated results only (no comments, no department analysis). This change is audited.')
      : L('لن يتمكن المشاركون من رؤية النتائج بعد الآن. يُسجَّل التغيير في سجل التدقيق.', 'Participants will no longer see the results. The change is audited.'), { confirmLabel: on ? L('مشاركة', 'Share') : L('إيقاف', 'Stop') });
  if (!ok) return;
  await act(null, () => call(`/surveys/${s.id}`, { method: 'PUT', body: { share_results: on, confirm: true } }), { success: on ? L('أصبحت النتائج متاحة للمشاركين', 'Results are now shared') : L('أُوقفت مشاركة النتائج', 'Results are no longer shared') });
}
async function participantsSheet(s) {
  const r = await call(`/surveys/${s.id}/participants`).catch((e) => { toast(errMsg(e), { kind: 'error' }); return null; });
  if (!r) return;
  const row = (p) => h('li', h('span.grow', h('span.title', L(p.name_ar, p.name_en)), h('span.meta', L(p.dept_ar, p.dept_en))), p.responded_on ? h('span.tiny.faint', dateLabel(p.responded_on)) : null);
  openSheet({ title: L('قائمة المشاركين', 'Participants'), subtitle: s.title, badges: [anonChip(s)],
    body: [
      h('div.callout', icon('info'), h('span', L('هذا الاستبيان غير مجهول: تظهر أسماء من شارك لتنسيق المتابعة. لا تُعرض إجابة أي شخص منفردة، ويُسجَّل كل اطلاع على هذه القائمة.', 'This survey is not anonymous: names of those who answered are listed for follow-up. Nobody’s answer is shown individually, and every view of this list is logged.'))),
      h('div.section', L('شاركوا', 'Answered'), h('span.count', fmtNum(r.responded.length))), r.responded.length ? h('ul.list.separated', r.responded.map(row)) : h('p.faint.tiny', L('لا أحد بعد', 'Nobody yet')),
      h('div.section', L('لم يشاركوا بعد', 'Not yet'), h('span.count', fmtNum(r.pending.length))), r.pending.length ? h('ul.list.separated', r.pending.map(row)) : h('p.faint.tiny', L('شارك الجميع', 'Everyone answered')),
      h('div.section', L('سجل الاطلاع', 'Access log')), accessLogList(r.access_log)] });
}

// ---------------------------------------------------------------- participation
function participationRow(r) {
  const p = r.participation;
  const trend = p.by_day?.length ? barChart(p.by_day.map((d) => ({ label: fmtDate(d.date), value: d.cumulative, title: L(`${fmtDate(d.date)}: ${fmtNum(d.cumulative)} مشاركة تراكمية (+${fmtNum(d.n)})`, `${fmtDate(d.date)}: ${d.cumulative} cumulative (+${d.n})`) })), { height: 170, integer: true, label: L('تطور المشاركة التراكمية', 'Cumulative participation'), color: 'var(--series-1)' }) : h('p.faint.tiny', L('لا مشاركات بعد', 'No responses yet'));
  return h('div.sys-grid.main-side',
    card(h('div.card-head', h('h2.card-title', L('تطور المشاركة', 'Participation over time')), h('span.chip.tiny.outline', L('تراكمي', 'Cumulative'))), trend,
      h('p.tiny.faint', L('يعتمد على تاريخ المشاركة فقط — لا علاقة له بمضمون الإجابات.', 'Based on participation dates only — never on answer content.'))),
    r.highlights ? highlightsCard(r) : card(L('أبرز النتائج', 'Highlights'), h('p.faint.tiny', '—')));
}
function highlightsCard(r) {
  const hl = r.highlights || { strengths: [], improve: [] };
  const item = (x, tone) => h(`li.${tone}`, h('span.sv-hl-ic', icon(tone === 'good' ? 'trendUp' : 'trendDown')), h('span.grow', x.text), h('strong.num.tabular', fmtNum(x.avg)), h('small', '/5'));
  // Surveys without rating questions: the leading answer of each choice / yes-no question.
  const tops = (r.questions || []).filter((q) => !q.suppressed && (q.type === 'single' || q.type === 'yesno')).slice(0, 4).map((q) => (q.type === 'yesno'
    ? h('li.good', h('span.sv-hl-ic', icon('thumbsUp')), h('span.grow', q.text), h('strong.num.tabular', pctText(q.yes.pct)), h('small', L('نعم', 'yes')))
    : h('li.good', h('span.sv-hl-ic', icon('crown')), h('span.grow', h('span.sv-hl-q', q.text), h('b', q.top?.label || '—')), h('strong.num.tabular', pctText(q.top?.pct)))));
  return card(h('div.card-head', h('h2.card-title', L('أبرز النتائج', 'Highlights'))),
    hl.strengths.length ? [h('div.sv-hl-label', L('نقاط القوة', 'Strengths')), h('ul.sv-hl', hl.strengths.map((x) => item(x, 'good')))]
      : tops.length ? [h('div.sv-hl-label', L('الإجابات الأعلى', 'Leading answers')), h('ul.sv-hl', tops)] : h('p.faint.tiny', L('لا أسئلة كافية لاستخلاص أبرز النتائج', 'Not enough questions for highlights')),
    hl.improve.length ? [h('div.sv-hl-label', L('فرص التحسين', 'Improvement areas')), h('ul.sv-hl', hl.improve.map((x) => item(x, 'warn')))] : null);
}

// ---------------------------------------------------------------- question cards
function questionCard(ctx, s, q, i, full) {
  const head = h('header.sv-rq-head', h('span.sv-q-num.num', fmtNum(i + 1)),
    h('div.grow', h('div.sv-rq-chips', typeChip(q.type), h('span.tiny.faint', answersLabel(q.n))), h('h3', q.text)));
  if (q.suppressed) return h('article.card.sv-rq.suppressed', head, h('div.sv-suppressed', icon('lockKeyhole'), h('span', L(`أقل من ${MIN_GROUP} — مخفي لحماية الخصوصية`, `Fewer than ${MIN_GROUP} — hidden to protect privacy`))));
  const body = q.type === 'rating' ? ratingBody(q) : q.type === 'nps' ? npsBody(q) : q.type === 'yesno' ? yesNoBody(q) : q.type === 'text' ? textBody(ctx, s, q, full) : choiceBody(q);
  return h(`article.card.sv-rq.${q.type}`, head, body);
}
const bar = (pct, tone = 's1') => h(`div.sv-bar.${tone}`, { role: 'presentation' }, h('i', { style: { width: `${Math.max(0, Math.min(100, pct))}%` } }));
function ratingBody(q) {
  const labels = ['غير راضٍ إطلاقاً', 'غير راضٍ', 'محايد', 'راضٍ', 'راضٍ جداً']; const labelsEn = ['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied'];
  const full = Math.round(q.avg);
  return h('div.sv-rq-rating',
    h('div.sv-big', h('strong.num.tabular', fmtNum(q.avg)), h('small', '/5'),
      h('span.sv-stars-row', { role: 'img', 'aria-label': L(`${q.avg} من 5`, `${q.avg} of 5`) }, [1, 2, 3, 4, 5].map((k) => h(`i${k <= full ? '.on' : ''}`, icon('star'))))),
    h('div.sv-fav', h('span.chip.tiny.good', L(`${pctText(q.favourable)} راضون`, `${pctText(q.favourable)} favourable`)), h('span.chip.tiny.outline', L(`${pctText(q.neutral)} محايد`, `${pctText(q.neutral)} neutral`)), h('span.chip.tiny.warn', L(`${pctText(q.unfavourable)} غير راضين`, `${pctText(q.unfavourable)} unfavourable`))),
    h('ul.sv-dist', [...q.dist].reverse().map((d) => h('li', { 'aria-label': `${d.value}: ${d.pct}%` },
      h('span.sv-dist-l', h('b.num', fmtNum(d.value)), h('span', L(labels[d.value - 1], labelsEn[d.value - 1]))),
      bar(d.pct, d.value >= 4 ? 's1' : d.value === 3 ? 's2' : 's3'),
      h('span.sv-dist-v.num.tabular', pctText(d.pct))))));
}
function npsBody(q) {
  const tone = q.nps >= 30 ? 'good' : q.nps >= 0 ? 'navy' : 'crit';
  const max = Math.max(1, ...q.dist.map((d) => d.count));
  return h('div.sv-rq-nps',
    h('div.sv-big', h(`strong.num.tabular.${tone}`, `${q.nps > 0 ? '+' : ''}${fmtNum(q.nps)}`), h('small', L('صافي نقاط الترويج', 'NPS')), h('span.tiny.faint', L('من ‎-100 إلى ‎+100', 'from −100 to +100'))),
    h('div.sv-stack', { role: 'img', 'aria-label': L(`منتقدون ${q.detractors.pct}%، محايدون ${q.passives.pct}%، مروّجون ${q.promoters.pct}%`, `Detractors ${q.detractors.pct}%, passives ${q.passives.pct}%, promoters ${q.promoters.pct}%`) },
      h('i.s3', { style: { width: `${q.detractors.pct}%` } }), h('i.s2', { style: { width: `${q.passives.pct}%` } }), h('i.s1', { style: { width: `${q.promoters.pct}%` } })),
    h('ul.sv-legend',
      h('li', h('i.s3'), L('منتقدون (0–6)', 'Detractors (0–6)'), h('b.num.tabular', pctText(q.detractors.pct))),
      h('li', h('i.s2'), L('محايدون (7–8)', 'Passives (7–8)'), h('b.num.tabular', pctText(q.passives.pct))),
      h('li', h('i.s1'), L('مروّجون (9–10)', 'Promoters (9–10)'), h('b.num.tabular', pctText(q.promoters.pct)))),
    h('div.sv-cols', { role: 'img', 'aria-label': L('توزيع الدرجات من 0 إلى 10', 'Score distribution 0–10') }, q.dist.map((d) => h('div.sv-col', h('span.sv-col-bar', h('i', { class: d.value <= 6 ? 's3' : d.value <= 8 ? 's2' : 's1', style: { height: `${Math.round((100 * d.count) / max)}%` } })), h('span.num', String(d.value))))));
}
function yesNoBody(q) {
  return h('div.sv-rq-yn',
    h('div.sv-big', h('strong.num.tabular', pctText(q.yes.pct)), h('small', L('أجابوا بنعم', 'said yes'))),
    h('div.sv-stack', { role: 'img', 'aria-label': L(`نعم ${q.yes.pct}%، لا ${q.no.pct}%`, `Yes ${q.yes.pct}%, no ${q.no.pct}%`) }, h('i.s1', { style: { width: `${q.yes.pct}%` } }), h('i.s2', { style: { width: `${q.no.pct}%` } })),
    h('ul.sv-legend', h('li', h('i.s1'), L('نعم', 'Yes'), h('b.num.tabular', `${pctText(q.yes.pct)} · ${fmtNum(q.yes.count)}`)), h('li', h('i.s2'), L('لا', 'No'), h('b.num.tabular', `${pctText(q.no.pct)} · ${fmtNum(q.no.count)}`))));
}
function choiceBody(q) {
  const top = Math.max(...q.options.map((o) => o.count));
  return h('div.sv-rq-choice',
    q.type === 'multi' ? h('p.tiny.faint', L('يمكن اختيار أكثر من خيار؛ النسبة من عدد المجيبين.', 'Multiple answers allowed; % of respondents.')) : null,
    h('ul.sv-dist.choices', [...q.options].sort((a, b) => b.count - a.count).map((o) => h(`li${o.count === top && top > 0 ? '.top' : ''}`,
      h('span.sv-dist-l', h('span', o.label)), bar(o.pct, o.count === top && top > 0 ? 's1' : 's1.soft'), h('span.sv-dist-v.num.tabular', pctText(o.pct)), h('span.sv-dist-c.num.tabular', fmtNum(o.count))))));
}
function textBody(ctx, s, q, full) {
  const box = h('div.sv-rq-text', h('div.sv-summary.loading', h('div.sk.sk-line.w-80'), h('div.sk.sk-line.w-60')));
  call(`/surveys/${s.id}/questions/${q.id}/summary`).then((x) => {
    if (x.hidden) { box.replaceChildren(h('div.sv-suppressed', icon('lockKeyhole'), h('span', L(`أقل من ${MIN_GROUP} — مخفي لحماية الخصوصية`, `Fewer than ${MIN_GROUP} — hidden to protect privacy`)))); return; }
    const a = x.analysis;
    const toneChip = (t) => h(`span.chip.tiny.${t.tone === 'positive' ? 'good' : t.tone === 'negative' ? 'warn' : 'outline'}`, t.tone === 'positive' ? L('إيجابي', 'Positive') : t.tone === 'negative' ? L('للتحسين', 'To improve') : L('متباين', 'Mixed'));
    box.replaceChildren(...[
      h(`div.sv-summary.${x.source}`,
        h('div.sv-summary-label', icon(x.source === 'ai' ? 'spark' : 'sigma'), h('span', L(x.label_ar, x.label_en))),
        h('p', x.ai ? x.ai.text : L(x.local.ar, x.local.en))),
      a.themes.length ? h('ul.sv-themes', a.themes.map((t) => h('li', h('span.sv-theme-n', L(t.ar, t.en)), toneChip(t), bar((100 * t.mentions) / a.n, t.tone === 'negative' ? 's3' : t.tone === 'positive' ? 's1' : 's2'), h('span.num.tabular.sv-dist-v', countAr(t.mentions, ['إشارة', 'إشارتان', 'إشارات', 'إشارة']))))) : h('p.tiny.faint', L('لم يتكرر محور واحد في أكثر من تعليق.', 'No theme recurred in more than one comment.')),
      a.other ? h('p.tiny.faint', L(`${countAr(a.other, ['تعليق واحد', 'تعليقان', 'تعليقات', 'تعليقاً'])} خارج المحاور المتكررة.`, `${a.other} comments outside recurring themes.`)) : null,
      full && a.keywords?.length ? h('div.sv-keywords', h('span.tiny.faint', L('كلمات متكررة (في تعليقين أو أكثر):', 'Recurring words (2+ comments):')), a.keywords.map((k) => h('span.chip.tiny.outline', k.word, h('b.num', ` ${fmtNum(k.count)}`)))) : null,
      full ? h('button.btn.sm.ghost.sv-comments-btn', { type: 'button', onclick: () => commentsSheet(s, q) }, icon('messageSquare'), L(`قراءة التعليقات (${fmtNum(x.n)})`, `Read comments (${x.n})`), h('span.chip.tiny.outline', icon('eye'), L('يُسجَّل الاطلاع', 'Logged'))) : null].filter(Boolean));
  }).catch((e) => box.replaceChildren(errorState(e, () => box.replaceWith(textBody(ctx, s, q, full)))));
  return box;
}
async function commentsSheet(s, q) {
  const ok = await confirmDialog(L('قراءة التعليقات النصية', 'Read comments'), L('تُعرض التعليقات مجمّعة وبترتيب لا يرتبط بوقت الإرسال، دون تاريخ أو إدارة. يُسجَّل اطلاعك في سجل الوصول الظاهر على هذه الصفحة. لا تحاول استنتاج هوية أي مشارك.', 'Comments are pooled, in an order unrelated to submission time, without date or department. Your viewing is recorded in the access log on this page. Do not try to identify anyone.'), { confirmLabel: L('متابعة', 'Continue') });
  if (!ok) return;
  const r = await call(`/surveys/${s.id}/questions/${q.id}/comments`).catch((e) => { toast(errMsg(e), { kind: 'error' }); return null; });
  if (!r) return;
  openSheet({ title: L('التعليقات النصية', 'Comments'), subtitle: q.text, wide: true, badges: [h('span.chip.tiny.warn', icon('lockKeyhole'), L('سري للغاية', 'Restricted')), anonChip(s)],
    body: r.hidden ? h('p', L(`أقل من ${MIN_GROUP} — مخفي لحماية الخصوصية`, `Fewer than ${MIN_GROUP} — hidden`)) : [
      h('div.callout', icon('shield'), h('span', L(`${countAr(r.n, ['تعليق واحد', 'تعليقان', 'تعليقات', 'تعليقاً'])} — بلا أسماء أو تواريخ أو إدارات.`, `${r.n} comments — no names, dates or departments.`))),
      h('ul.sv-comments', r.comments.map((c) => h('li', h('span.sv-quote', { 'aria-hidden': 'true' }, '“'), h('p', c)))),
      h('div.section', L('سجل الاطلاع', 'Access log')), accessLogList(r.access_log)] });
}

// ---------------------------------------------------------------- segments
function segmentsCard(r) {
  const seg = r.segments;
  const qcols = seg.questions;
  const fmt = (q, v) => (v == null ? '—' : q.type === 'rating' ? fmtNum(v) : q.type === 'nps' ? `${v > 0 ? '+' : ''}${fmtNum(v)}` : pctText(v));
  const tint = (q, v) => (v == null ? 0 : q.type === 'rating' ? (v - 1) / 4 : q.type === 'nps' ? (v + 100) / 200 : v / 100);
  const hidden = seg.rows.filter((x) => x.hidden); const shown = seg.rows.filter((x) => !x.hidden);
  const head = h('div.card-head', h('h2.card-title', L('التحليل حسب الإدارة', 'By department')), h('span.chip.tiny.outline', icon('shield'), L(`حد أدنى ${MIN_GROUP} إجابات`, `Minimum ${MIN_GROUP} answers`)));
  if (!qcols.length) return card(head, h('p.faint.tiny', L('لا أسئلة رقمية للتحليل حسب الإدارة.', 'No numeric questions to segment.')));
  const cell = (q, v) => { const td = h('td.num.tabular.sv-heat', fmt(q, v)); td.style.setProperty('--v', tint(q, v).toFixed(2)); return td; };
  const rows = [
    ...shown.map((x) => h('tr', h('th', { scope: 'row' }, L(x.name_ar, x.name_en)), h('td.num.tabular', fmtNum(x.n)), qcols.map((q) => cell(q, x.metrics[q.id])))),
    seg.other ? h('tr.sv-other', h('th', { scope: 'row' }, L('إدارات أخرى (مجمّعة)', 'Other departments (combined)')), h('td.num.tabular', fmtNum(seg.other.n)), qcols.map((q) => cell(q, seg.other.metrics[q.id]))) : null,
    h('tr.sv-total', h('th', { scope: 'row' }, L('الجهة ككل', 'Whole organisation')), h('td.num.tabular', fmtNum(r.responses)), qcols.map((q) => cell(q, seg.overall[q.id]))),
  ];
  return card(head,
    h('div.table-wrap.sv-heat-wrap', h('table.tbl.sv-heat-table', h('caption.sr-only', L('متوسطات الأسئلة حسب الإدارة', 'Question scores by department')),
      h('thead', h('tr', h('th', { scope: 'col' }, L('الإدارة', 'Department')), h('th.num', { scope: 'col' }, L('العدد', 'n')), qcols.map((q, k) => h('th.num', { scope: 'col', 'data-tip': q.text, title: q.text }, L(`س${fmtNum(k + 1)}`, `Q${k + 1}`))))),
      h('tbody', rows))),
    h('ol.sv-qkey', qcols.map((q, k) => h('li', h('b', L(`س${fmtNum(k + 1)}`, `Q${k + 1}`)), h('span', q.text), h('span.tiny.faint', q.type === 'rating' ? L('متوسط /5', 'avg /5') : q.type === 'nps' ? 'NPS' : L('% نعم', '% yes'))))),
    hidden.length ? h('div.sv-hidden-depts',
      h('div.sv-hidden-label', icon('lockKeyhole'), h('strong', L(`أقل من ${MIN_GROUP} — مخفي لحماية الخصوصية`, `Fewer than ${MIN_GROUP} — hidden to protect privacy`))),
      h('div.sv-chips', hidden.map((x) => h('span.chip.tiny.outline', L(x.name_ar, x.name_en))))) : null,
    h('p.tiny.faint', L(seg.note_ar, seg.note_en), ' ', L('وعند وجود مجموعة صغيرة وحيدة يُخفى معها أصغر مجموعة ظاهرة كي لا تُستنتج بالطرح.', 'When a lone small group remains, the smallest visible group is hidden too so it cannot be derived by subtraction.')));
}
function deptParticipation(r) {
  const d = r.participation.by_department || { rows: [] };
  const shown = d.rows.filter((x) => !x.hidden); const hidden = d.rows.filter((x) => x.hidden);
  return card(h('div.card-head', h('h2.card-title', L('المشاركة حسب الإدارة', 'Participation by department'))),
    shown.length ? h('ul.sv-dist.part', shown.map((x) => h('li', h('span.sv-dist-l', h('span', L(x.name_ar, x.name_en))), bar(x.rate, 's1'), h('span.sv-dist-v.num.tabular', pctText(x.rate)), h('span.sv-dist-c.num.tabular', `${fmtNum(x.responded)}/${fmtNum(x.invited)}`)))) : null,
    d.other ? h('p.tiny.faint', L(`إدارات أخرى مجمّعة: ${pctText(d.other.rate)} (${fmtNum(d.other.responded)}/${fmtNum(d.other.invited)})`, `Other departments combined: ${pctText(d.other.rate)} (${d.other.responded}/${d.other.invited})`)) : null,
    hidden.length ? h('div.sv-hidden-depts', h('div.sv-hidden-label', icon('lockKeyhole'), h('strong', L(`مدعوون أقل من ${MIN_GROUP} — مخفي لحماية الخصوصية`, `Fewer than ${MIN_GROUP} invited — hidden`))), h('div.sv-chips', hidden.map((x) => h('span.chip.tiny.outline', `${L(x.name_ar, x.name_en)} · ${fmtNum(x.invited)}`)))) : null);
}
function accessCard(r) {
  return card(h('div.card-head', h('h2.card-title', L('سجل الاطلاع على التعليقات النصية', 'Comments access log')), h('span.chip.tiny.warn', icon('lockKeyhole'), L('سري للغاية', 'Restricted'))),
    h('p.tiny.faint', L('كل اطلاع على التعليقات النصية الحرفية يُسجَّل هنا ويظهر لمُعِدّ الاستبيان ومدير إدارته.', 'Every view of verbatim comments is recorded here, visible to the author and their director.')),
    accessLogList(r.access_log));
}
