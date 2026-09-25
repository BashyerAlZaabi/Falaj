// Strategic Performance — الأداء الاستراتيجي.
// Active plan → pillars → strategic objectives → KPIs (targets, actuals per
// period, SPMO validation) → initiatives (linked projects, milestones).
// Transparent to all staff; managed by the SPMO (strategy.admin); KPI owners
// report actuals; nobody validates their own submission.
import { defineSystem } from './registry.js';
import {
  isStaff, hasCap, wrap, check, requireConfirm, S, str, num, int, bool, arr, date, all, round,
} from './kit.js';
import * as C from './strategy/core.js';
import { seed as seedDemo } from './strategy/seed.js';

const { KEY, ADMIN_CAP } = C;

// Contract used by goals, ideas and performance.
export function objectivesBrief() { return C.objectivesBriefData(); }

// ---------------------------------------------------------------- validation schemas
const STATUS_ENUM = { enum: C.STATUS };
const ACTUAL_BODY = S({ period: str('YYYY-MM or YYYY-Qn', { maxLength: 8 }), value: num('value'), note: str('note', { maxLength: 1000 }) }, ['value']);
const REVIEW_BODY = S({ decision: str('validate|return', { enum: ['validate', 'return'] }), comment: str('comment', { maxLength: 1000 }) }, ['decision']);
const PLAN_BODY = S({ title_ar: str('', { maxLength: 200 }), title_en: str('', { maxLength: 200 }), vision_ar: str('', { maxLength: 1000 }), vision_en: str('', { maxLength: 1000 }), start_year: int('', { minimum: 2000, maximum: 2100 }), end_year: int('', { minimum: 2000, maximum: 2100 }) });
const PILLAR_BODY = S({ code: str('', { maxLength: 24 }), title_ar: str('', { maxLength: 200 }), title_en: str('', { maxLength: 200 }), description_ar: str('', { maxLength: 1000 }), description_en: str('', { maxLength: 1000 }), weight: num('', { minimum: 0.01, maximum: 100 }), sort: int('', { minimum: 0, maximum: 999 }) });
const OBJ_BODY = S({ pillar_id: str(), code: str('', { maxLength: 24 }), title_ar: str('', { maxLength: 300 }), title_en: str('', { maxLength: 300 }), description_ar: str('', { maxLength: 2000 }), description_en: str('', { maxLength: 2000 }), owner_dept_id: str(), weight: num('', { minimum: 0.01, maximum: 100 }), sort: int('', { minimum: 0, maximum: 999 }) });
const TARGET = S({ year: int('', { minimum: 2000, maximum: 2100 }), target: num() }, ['year', 'target']);
const KPI_BODY = S({
  objective_id: str(), code: str('', { maxLength: 24 }), name_ar: str('', { maxLength: 300 }), name_en: str('', { maxLength: 300 }), definition_ar: str('', { maxLength: 2000 }), definition_en: str('', { maxLength: 2000 }),
  formula_ar: str('', { maxLength: 1000 }), unit_ar: str('', { maxLength: 30 }), unit_en: str('', { maxLength: 30 }), direction: str('', { enum: ['higher', 'lower'] }), measure: str('', { enum: ['level', 'cumulative'] }),
  frequency: str('', { enum: ['monthly', 'quarterly'] }), baseline: num(), baseline_year: int('', { minimum: 2000, maximum: 2100 }), decimals: int('', { minimum: 0, maximum: 3 }), min_value: num(), max_value: num(),
  owner_dept_id: str(), owner_user_id: str(), data_source_ar: str('', { maxLength: 300 }), data_source_en: str('', { maxLength: 300 }), weight: num('', { minimum: 0.01, maximum: 100 }), targets: arr(TARGET, { maxItems: 12 }),
});
const INIT_BODY = S({
  objective_id: str(), code: str('', { maxLength: 24 }), title_ar: str('', { maxLength: 300 }), title_en: str('', { maxLength: 300 }), description_ar: str('', { maxLength: 2000 }), description_en: str('', { maxLength: 2000 }),
  owner_dept_id: str(), owner_user_id: str(), project_id: str(), status: str('', { enum: ['planned', 'in_progress', 'at_risk', 'on_hold', 'completed', 'cancelled'] }),
  progress: int('', { minimum: 0, maximum: 100 }), start_date: date(), end_date: date(),
});
const MS_BODY = S({ title_ar: str('', { maxLength: 300 }), title_en: str('', { maxLength: 300 }), due_date: date() });
const CONFIRM = S({ confirm: bool() });
const LINK_BODY = S({ project_id: str() });
const TOGGLE_BODY = S({ done: bool() });

// ---------------------------------------------------------------- routes
function routes(r) {
  r.get('/summary', wrap((req) => C.summary(req.user)));
  r.get('/map', wrap((req) => C.getMap(req.user)));
  r.get('/kpis', wrap((req) => C.listKpis(req.user, { status: C.STATUS.includes(req.query.status) ? req.query.status : undefined, department_id: req.query.dept || undefined, pillar_id: req.query.pillar || undefined, objective_id: req.query.objective || undefined, q: req.query.q || undefined, mine: req.query.mine === '1' })));
  r.get('/kpis/:id', wrap((req) => C.getKpi(req.user, req.params.id)));
  r.post('/kpis/:id/actuals', wrap((req) => C.submitActual(req.user, req.params.id, check(ACTUAL_BODY, req.body)).result));
  r.post('/actuals/:id/review', wrap((req) => C.reviewActual(req.user, req.params.id, check(REVIEW_BODY, req.body))));
  r.get('/objectives/:id', wrap((req) => C.getObjective(req.user, req.params.id)));
  r.get('/initiatives', wrap((req) => C.listInitiatives(req.user, { status: req.query.status || undefined, department_id: req.query.dept || undefined, q: req.query.q || undefined })));
  r.get('/initiatives/:id', wrap((req) => C.getInitiative(req.user, req.params.id)));
  r.post('/initiatives/:id/milestones/:mid/toggle', wrap((req) => C.toggleMilestone(req.user, req.params.id, req.params.mid, check(TOGGLE_BODY, req.body).done)));
  r.put('/initiatives/:id/project', wrap((req) => C.linkProject(req.user, req.params.id, check(LINK_BODY, req.body).project_id || null)));
  r.get('/updates', wrap((req) => C.updatesFor(req.user)));

  // ---- administration (strategy.admin; deletions need explicit confirmation)
  r.get('/admin', wrap((req) => C.adminData(req.user)));
  r.put('/admin/plan', wrap((req) => C.savePlan(req.user, check(PLAN_BODY, req.body))));
  r.post('/admin/pillars', wrap((req) => C.savePillar(req.user, null, check(PILLAR_BODY, req.body))));
  r.put('/admin/pillars/:id', wrap((req) => C.savePillar(req.user, req.params.id, check(PILLAR_BODY, req.body))));
  r.post('/admin/pillars/:id/delete', wrap((req) => { check(CONFIRM, req.body); guard(req); requireConfirm(req.body, 'حذف المحور يتطلب تأكيداً صريحاً'); return C.deletePillar(req.user, req.params.id); }));
  r.post('/admin/objectives', wrap((req) => C.saveObjective(req.user, null, check(OBJ_BODY, req.body))));
  r.put('/admin/objectives/:id', wrap((req) => C.saveObjective(req.user, req.params.id, check(OBJ_BODY, req.body))));
  r.post('/admin/objectives/:id/delete', wrap((req) => { check(CONFIRM, req.body); guard(req); requireConfirm(req.body, 'حذف الهدف يتطلب تأكيداً صريحاً'); return C.deleteObjective(req.user, req.params.id); }));
  r.post('/admin/kpis', wrap((req) => C.saveKpi(req.user, null, check(KPI_BODY, req.body))));
  r.put('/admin/kpis/:id', wrap((req) => C.saveKpi(req.user, req.params.id, check(KPI_BODY, req.body))));
  r.post('/admin/kpis/:id/delete', wrap((req) => { check(CONFIRM, req.body); guard(req); requireConfirm(req.body, 'حذف المؤشر يتطلب تأكيداً صريحاً'); return C.deleteKpi(req.user, req.params.id); }));
  r.post('/admin/kpis/:id/archive', wrap((req) => { check(CONFIRM, req.body); guard(req); requireConfirm(req.body, 'أرشفة المؤشر تتطلب تأكيداً صريحاً'); return C.setKpiActive(req.user, req.params.id, false); }));
  r.post('/admin/kpis/:id/restore', wrap((req) => C.setKpiActive(req.user, req.params.id, true)));
  r.post('/admin/initiatives', wrap((req) => C.saveInitiative(req.user, null, check(INIT_BODY, req.body))));
  r.put('/admin/initiatives/:id', wrap((req) => C.saveInitiative(req.user, req.params.id, check(INIT_BODY, req.body))));
  r.post('/admin/initiatives/:id/delete', wrap((req) => { check(CONFIRM, req.body); guard(req); requireConfirm(req.body, 'حذف المبادرة يتطلب تأكيداً صريحاً'); return C.deleteInitiative(req.user, req.params.id); }));
  r.post('/admin/initiatives/:id/milestones', wrap((req) => C.saveMilestone(req.user, req.params.id, null, check(MS_BODY, req.body))));
  r.put('/admin/initiatives/:id/milestones/:mid', wrap((req) => C.saveMilestone(req.user, req.params.id, req.params.mid, check(MS_BODY, req.body))));
  r.post('/admin/initiatives/:id/milestones/:mid/delete', wrap((req) => { check(CONFIRM, req.body); guard(req); requireConfirm(req.body, 'حذف المرحلة يتطلب تأكيداً صريحاً'); return C.deleteMilestone(req.user, req.params.id, req.params.mid); }));
}
// Capability before the confirmation prompt: a non-admin gets 403, never a 428 dialog.
function guard(req) { if (!hasCap(req.user, ADMIN_CAP)) { const e = new Error('هذا الإجراء يتطلب صلاحية إدارة الخطة الاستراتيجية'); e.status = 403; e.code = 'forbidden'; throw e; } }

// ---------------------------------------------------------------- Ask AI tools
const n1 = (v, d = 1) => (v == null ? '—' : String(round(v, d)));
const pctTxt = (v) => (v == null ? '—' : `${round(v, 0)}%`);
const statusAr = (s) => C.STATUS_AR[s] || s;
function resolveKpi(user, text) {
  const s = C.snapshot();
  const t = String(text || '').trim();
  const direct = s.kpis.find((k) => k.id === t || k.code.toLowerCase() === t.toLowerCase());
  if (direct) return direct;
  const norm = (x) => String(x || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').toLowerCase();
  const words = norm(t).split(/\s+/).map((w) => w.replace(/^(ال|وال|بال|لل)/, '')).filter((w) => w.length > 2);
  const pool = s.kpis.filter((k) => C.isKpiOwner(user, k));
  const score = (k) => { const n = norm(`${k.name_ar} ${k.name_en} ${k.code}`); return words.filter((w) => n.includes(w)).length; };
  const ranked = (pool.length ? pool : s.kpis).map((k) => ({ k, sc: score(k) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc);
  if (!ranked.length) { const e = new Error(`لم أجد مؤشراً مطابقاً لـ«${t}». ${pool.length ? `مؤشراتك: ${pool.map((k) => `${k.code} ${k.name_ar}`).join('، ')}` : ''}`); e.status = 400; e.code = 'bad_input'; throw e; }
  const top = ranked.filter((x) => x.sc === ranked[0].sc);
  if (top.length > 1) { const e = new Error(`وجدت أكثر من مؤشر مطابق: ${top.map((x) => `${x.k.code} ${x.k.name_ar}`).join('، ')}. حدّد رمز المؤشر.`); e.status = 400; e.code = 'bad_input'; throw e; }
  return top[0].k;
}

const tools = [
  {
    name: 'strategy_overview', domain: 'strategy.plan',
    description: 'Status of the active strategic plan: overall attainment, each pillar and strategic objective with RAG status (on_track ≥95% of target, at_risk 80–95%, off_track <80%, no_data = not reported; missing values are never treated as zero), KPI counts by status and the off-track KPIs.',
    input_schema: S({}),
    handler: (user) => {
      const m = C.getMap(user);
      const k = C.listKpis(user, { status: 'off_track' }).rows;
      return { result: { plan: m.plan, overall: m.overall, counts: m.counts, kpi_total: m.kpi_total, pillars: m.pillars.map((p) => ({ code: p.code, title_ar: p.title_ar, status: p.status, attainment: p.attainment, objectives: p.objectives.map((o) => ({ code: o.code, title_ar: o.title_ar, dept_ar: o.dept_ar, status: o.status, attainment: o.attainment })) })), off_track: k.map((x) => ({ code: x.code, name_ar: x.name_ar, dept_ar: x.dept_ar, attainment: x.attainment, period_ar: x.period_ar })) } };
    },
    format: (r) => r.plan ? `**${r.plan.title_ar}** — نسبة التحقق الإجمالية ${pctTxt(r.overall.attainment)} (${statusAr(r.overall.status)})\n${r.pillars.map((p) => `– ${p.code} ${p.title_ar}: ${pctTxt(p.attainment)} · ${statusAr(p.status)}`).join('\n')}\nالمؤشرات (${r.kpi_total}): على المسار ${r.counts.on_track} · معرّض للخطر ${r.counts.at_risk} · خارج المسار ${r.counts.off_track} · لم يُرصد ${r.counts.no_data}${r.off_track.length ? `\n\n**خارج المسار:**\n${r.off_track.map((x) => `– ${x.code} ${x.name_ar} (${x.dept_ar}): ${pctTxt(x.attainment)} — ${x.period_ar}`).join('\n')}` : ''}` : 'لا توجد خطة استراتيجية نشطة حالياً.',
  },
  {
    name: 'strategy_kpis', domain: 'strategy.plan',
    description: 'List strategic KPIs of the active plan with latest reported period, value, target, attainment and RAG status. Filters: status (on_track|at_risk|off_track|no_data), department_id, objective (code like SO-1.1), q (text), mine (KPIs the user owns).',
    input_schema: S({ status: str('RAG status', STATUS_ENUM), department_id: str('owner department id'), objective: str('objective code or id'), q: str('text search', { maxLength: 100 }), mine: bool('only KPIs I own'), limit: int('max rows', { minimum: 1, maximum: 50 }) }),
    handler: (user, i) => {
      const r = C.listKpis(user, { status: i.status, department_id: i.department_id, objective_id: i.objective, q: i.q, mine: i.mine });
      return { result: { filter: i.status || null, total: r.rows.length, rows: r.rows.slice(0, i.limit || 20).map((k) => ({ id: k.id, code: k.code, name_ar: k.name_ar, dept_ar: k.dept_ar, unit_ar: k.unit_ar, period_ar: k.period_ar, value: k.value, target: k.target, attainment: k.attainment, status: k.status, pending: k.pending, stale: k.stale, can_submit: k.can_submit })) } };
    },
    format: (r) => (r.rows.length ? `${r.filter ? `المؤشرات «${statusAr(r.filter)}»` : 'المؤشرات'} (${r.total}):\n${r.rows.map((k) => `– ${k.code} ${k.name_ar} — ${k.dept_ar}: ${k.value == null ? 'لم يُرصد' : `${n1(k.value)} ${k.unit_ar} مقابل مستهدف ${n1(k.target)} (${pctTxt(k.attainment)})`}${k.period_ar ? ` · ${k.period_ar}` : ''}${k.pending ? ' · بانتظار الاعتماد' : ''}${k.stale ? ' · متأخر الرصد' : ''}`).join('\n')}` : r.filter ? `لا توجد مؤشرات بحالة «${statusAr(r.filter)}» حالياً.` : 'لا توجد مؤشرات مطابقة.'),
  },
  {
    name: 'strategy_submit_actual', domain: 'strategy.plan', mutates: true,
    description: 'Submit the actual value of a strategic KPI for a closed period. Only the KPI owner (named owner or manager of the owner department) may submit; the SPMO then validates it. kpi: KPI code (e.g. KPI-1.2.2), id or name. period defaults to the latest closed period (YYYY-MM monthly, YYYY-Qn quarterly). Never invent the value — use exactly what the user stated.',
    input_schema: S({ kpi: str('KPI code, id or name', { maxLength: 200 }), value: num('actual value stated by the user'), period: str('YYYY-MM or YYYY-Qn (optional)', { maxLength: 8 }), note: str('note', { maxLength: 1000 }) }, ['kpi', 'value']),
    handler: (user, i) => { const k = resolveKpi(user, i.kpi); return C.submitActual(user, k.id, { period: i.period, value: i.value, note: i.note }); },
    format: (r) => `${r.resubmitted ? 'أُعيد رصد' : 'رُصدت'} قيمة المؤشر ${r.code} «${r.name_ar}» لفترة ${r.period_ar}: ${r.value_text} ${r.unit_ar}${r.on_time ? ' — في الموعد' : ' — بعد انتهاء مهلة الرصد'}. القيمة الآن بانتظار اعتماد إدارة المشاريع الاستراتيجية.`,
  },
  { name: 'strategy_undo_actual', internal: true, domain: 'strategy.plan', mutates: true, input_schema: S({ id: str('') }, ['id']), handler: (user, i) => C.withdrawActual(user, i.id) },
];

// ---------------------------------------------------------------- local-planner intents
const AR_MONTHS = { 'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'مايو': 5, 'يونيو': 6, 'يوليو': 7, 'اغسطس': 8, 'سبتمبر': 9, 'اكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12 };
const AR_Q = { 'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4 };
const WRITE_VERBS = /(^|\s)(اكتب|جهز|صغ|اعد|انشي|انشئ|حدث|غير|اجعل|ضع|اضف|احذف)(\s|$)/;
const intents = [
  {
    // «وضع الخطة الاستراتيجية» / «كيف أداء الاستراتيجية؟»
    test: (n) => /(الخطه الاستراتيجيه|الاستراتيجيه|strategic plan|strategy)/.test(n) && /(وضع|حاله|ملخص|اداء|نظره|كيف|اين وصل|مستوي تحقق|status|overview)/.test(n) && !WRITE_VERBS.test(n) && !/(موشر|kpi)/.test(n),
    plan: () => [{ tool: 'strategy_overview', input: {}, label: 'قراءة وضع الخطة الاستراتيجية' }],
  },
  {
    // «المؤشرات المتعثرة» / «المؤشرات المعرضة للخطر»
    test: (n) => /(موشر|موشرات|kpis?)/.test(n) && /(متعثر|خارج المسار|الحمراء|حمراء|متاخره|معرض|للخطر|off.?track|at risk)/.test(n) && !/(^|\s)(اضف|ضع|ثبت|احذف|ازل)(\s|$)|بطاقه|داشبورد|dashboard|widget/.test(n),
    plan: (user, clause, ctx, { norm }) => {
      const n = norm(clause);
      return [{ tool: 'strategy_kpis', input: { status: /(معرض|للخطر|at risk)/.test(n) ? 'at_risk' : 'off_track' }, label: 'قراءة المؤشرات المتعثرة' }];
    },
  },
  {
    // «أدخل قيمة مؤشر زمن إنجاز المعاملة = 3.8» (optionally «لشهر أغسطس» / «للربع الثاني»)
    test: (n) => /(ادخل|سجل|ارصد|رصد|حدث)\s+(لي\s+)?(قيمه\s+)?(ال)?موشر/.test(n) && /\d/.test(n),
    plan: (user, clause, ctx, { norm, digits }) => {
      const t = digits(clause);
      const m = t.match(/[=:]\s*(-?\d+(?:[.,٫]\d+)?)/) || t.match(/(?:الي|إلى|يساوي|بقيمه|قيمته)\s*(-?\d+(?:[.,٫]\d+)?)/) || t.match(/(-?\d+(?:[.,٫]\d+)?)\s*[%٪]?\s*$/);
      if (!m) return [{ ask: 'ما القيمة التي تريد رصدها؟ مثال: «أدخل قيمة مؤشر زمن إنجاز المعاملة = 3.8».' }];
      const value = Number(m[1].replace(/[,٫]/, '.'));
      const n = norm(t);
      let namePart = n.slice(0, n.search(/[=:]/) > 0 ? n.search(/[=:]/) : n.length).replace(/^.*?موشر\s*/, '').replace(/(لشهر|لفتره|للربع|عن شهر|عن الربع).*$/, '').replace(/-?\d+(?:[.,]\d+)?\s*[%٪]?\s*$/, '').trim();
      namePart = namePart.replace(/\s+(الي|يساوي|بقيمه)$/, '').trim();
      const code = clause.match(/KPI-[\d.]+/i)?.[0];
      let period;
      const mon = Object.entries(AR_MONTHS).find(([k]) => n.includes(k));
      const q = n.match(/الربع\s+(الاول|الثاني|الثالث|الرابع)/);
      const yr = t.match(/\b(20\d\d)\b/)?.[1];
      const y = yr || new Date().getUTCFullYear();
      if (mon) period = `${y}-${String(mon[1]).padStart(2, '0')}`;
      else if (q) period = `${y}-Q${AR_Q[q[1]]}`;
      const input = { kpi: code || namePart, value };
      if (period) input.period = period;
      if (!input.kpi) return [{ ask: 'لأي مؤشر؟ اذكر اسم المؤشر أو رمزه، مثال: «أدخل قيمة مؤشر KPI-1.2.2 = 76».' }];
      return [{ tool: 'strategy_submit_actual', input, label: `رصد قيمة مؤشر = ${value}` }];
    },
  },
];

// ---------------------------------------------------------------- Home workspace
function workspace(user) {
  if (!isStaff(user)) return [];
  const s = C.snapshot();
  if (!s.plan) return [];
  const cards = [];
  const href = (tab, id) => `#/sys/strategy/${tab}${id ? `/${id}` : ''}`;
  if (C.isAdmin(user)) {
    const q = C.validationQueue(user, s);
    const actionable = q.filter((x) => !x.own);
    cards.push({
      title_ar: 'قيم بانتظار اعتمادك', title_en: 'Actuals awaiting your validation', value: actionable.length, unit_ar: actionable.length === 1 ? 'قيمة' : 'قيم', unit_en: 'values',
      tone: actionable.length ? 'warn' : 'good', hint_ar: actionable.length ? 'راجع القيم المرصودة واعتمدها أو أعدها لمالكها' : 'لا قيم تنتظرك الآن', hint_en: actionable.length ? 'Review submitted values: validate or return them' : 'Nothing waiting for you',
      href: href('updates'), items: actionable.slice(0, 3).map((x) => ({ title: `${x.code} · ${x.name_ar}`, meta_ar: x.period_ar, meta_en: x.period_en, href: href('kpis', x.kpi_id) })),
      cta: { label_ar: 'راجع الآن', label_en: 'Review now', href: href('updates') },
    });
    const off = s.kpis.filter((k) => k.state.status === 'off_track');
    cards.push({
      title_ar: 'مؤشرات خارج المسار', title_en: 'Off-track KPIs', value: off.length, unit_ar: 'مؤشر', unit_en: 'KPIs', tone: off.length ? 'crit' : 'good',
      hint_ar: `من ${s.kpis.length} مؤشراً في الخطة النشطة`, hint_en: `of ${s.kpis.length} KPIs in the active plan`, href: href('kpis'),
      items: off.slice(0, 3).map((k) => ({ title: `${k.code} · ${k.name_ar}`, meta_ar: `${round(k.state.attainment, 0)}%`, meta_en: `${round(k.state.attainment, 0)}%`, href: href('kpis', k.id) })),
      cta: { label_ar: 'بطاقة الأداء', label_en: 'Scorecard', href: href('kpis') },
    });
  }
  const owned = s.kpis.filter((k) => C.isKpiOwner(user, k));
  const due = C.ownerDueItems(user, owned, s);
  if (due.length) {
    const late = due.filter((d) => d.state !== 'due').length;
    cards.push({
      title_ar: 'قيم مؤشرات مطلوبة منك', title_en: 'KPI actuals due from you', value: due.length, unit_ar: due.length === 1 ? 'قيمة' : 'قيم', unit_en: 'values', tone: late ? 'crit' : 'warn',
      hint_ar: late ? `${late} منها متأخرة أو مُعادة للتصحيح` : `مهلة الرصد ${C.REPORT_DAYS} يوماً بعد نهاية الفترة`, hint_en: late ? `${late} overdue or returned` : `Due ${C.REPORT_DAYS} days after period end`,
      href: href('updates'), items: due.slice(0, 3).map((d) => ({ title: `${d.code} · ${d.name_ar}`, meta_ar: d.state === 'returned' ? 'مُعادة' : d.period_ar, meta_en: d.state === 'returned' ? 'Returned' : d.period_en, href: href('updates') })),
      cta: { label_ar: 'أدخل القيم', label_en: 'Enter values', href: href('updates') },
    });
  }
  if (user.role === 'president' || (user.role === 'manager' && !C.isAdmin(user))) {
    const mineObj = user.role === 'president' ? s.objectives : s.objectives.filter((o) => o.owner_dept_id === user.department_id);
    if (mineObj.length) {
      const r = user.role === 'president' ? s.overall : C.rollup(mineObj.map((o) => ({ attainment: o.attainment, weight: o.weight })));
      const tone = { on_track: 'good', at_risk: 'warn', off_track: 'crit' }[r.status] || null;
      cards.push({
        title_ar: user.role === 'president' ? 'وضع الخطة الاستراتيجية' : 'أهداف إدارتي الاستراتيجية', title_en: user.role === 'president' ? 'Strategic plan status' : 'My department’s objectives',
        value: r.attainment == null ? '—' : `${round(r.attainment, 0)}%`, unit_ar: C.STATUS_AR[r.status], unit_en: C.STATUS_EN[r.status], tone,
        hint_ar: `${mineObj.length} ${mineObj.length > 10 ? 'هدفاً' : 'أهداف'} · ${mineObj.filter((o) => o.status === 'on_track').length} على المسار`, hint_en: `${mineObj.length} objectives · ${mineObj.filter((o) => o.status === 'on_track').length} on track`,
        href: href('map'), items: mineObj.filter((o) => o.status !== 'on_track').slice(0, 3).map((o) => ({ title: `${o.code} · ${o.title_ar}`, meta_ar: C.STATUS_AR[o.status], meta_en: C.STATUS_EN[o.status], href: href('map', o.id) })),
        cta: { label_ar: 'الخريطة الاستراتيجية', label_en: 'Strategy map', href: href('map') },
      });
    }
  }
  return cards.slice(0, 3);
}

// ---------------------------------------------------------------- excellence points (derived)
const gameRules = [{ key: 'strategy_actual_on_time', points: 8, ar: 'رصد قيمة مؤشر استراتيجي تملكه في موعدها', en: 'Report a strategic KPI you own on time' }];
function gameEvents(userId) {
  const out = [];
  for (const a of all(`SELECT a.id, a.period, a.first_submitted_at, k.code, k.frequency FROM strategy_actuals a JOIN strategy_kpis k ON k.id=a.kpi_id
      WHERE a.submitted_by=? AND a.status IN ('submitted','validated')`, userId)) {
    const p = C.parsePeriod(a.frequency, a.period);
    if (!p || String(a.first_submitted_at).slice(0, 10) > p.due) continue;
    out.push({ kind: 'strategy_actual_on_time', points: 8, at: a.first_submitted_at, ref: `${a.code} · ${p.label_ar}`, id: `strategy:actual:${a.id}` });
  }
  return out;
}

defineSystem({
  key: KEY,
  name_ar: 'الأداء الاستراتيجي', name_en: 'Strategic Performance',
  description_ar: 'الأهداف الاستراتيجية ومؤشراتها ومبادراتها — تديرها إدارة المشاريع الاستراتيجية',
  description_en: 'Strategic objectives, KPIs and initiatives — managed by the Strategic Projects office',
  icon: 'compass', category: 'strategy',
  access: (u) => isStaff(u),
  defaultPinned: (u) => hasCap(u, 'strategy.admin') || u.role !== 'employee',
  caps: [
    { cap: 'strategy.admin', ar: 'إدارة الخطة الاستراتيجية والمؤشرات (إدارة المشاريع الاستراتيجية)', en: 'Manage the strategic plan and KPIs (SPMO)' },
  ],
  domains: [
    { key: 'strategy.plan', name_ar: 'الخطة الاستراتيجية والمؤشرات', name_en: 'Strategic plan and KPIs', classification: 'internal', ai: 'allowed' },
  ],
  schema: C.schema,
  seed: seedDemo,
  routes,
  tools,
  intents,
  workspace,
  gameRules,
  gameEvents,
  agent: {
    name_ar: 'مساعد الأداء الاستراتيجي', name_en: 'Strategy assistant',
    description_ar: 'يعرض وضع الخطة الاستراتيجية ومؤشراتها ويرصد قيم المؤشرات لمالكيها',
    description_en: 'Shows the strategic plan status and KPIs and records KPI actuals for their owners',
    instructions: 'اعرض أرقام الخطة كما يعيدها النظام دون تقدير. القيمة غير المرصودة «لم يُرصد» وليست صفراً. لا ترصد قيمة مؤشر إلا بالقيمة التي ذكرها المستخدم حرفياً، ولمالك المؤشر فقط.',
  },
});
