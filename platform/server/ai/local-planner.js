// Local (rule-based) understanding for Arabic & English requests.
// Used when no language model is connected, and always as a safe fallback.
// It maps a request to explicit tool steps; it never guesses values: when a
// required value (project, percentage, title, time…) is missing or ambiguous
// it asks one specific question instead.
import { accessibleSystems } from '../systems/registry.js';
import * as W from '../services/work.js';
import * as B from '../services/dashboard.js';
import { one, all } from '../db.js';
import { assignableUsers } from '../policy.js';
import * as O from '../services/office.js';
import { resolve as resolveAI } from './services.js';

const TASHKEEL = /[ً-ْـٰ]/g;
export function norm(s) {
  return String(s || '').replace(TASHKEEL, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).toLowerCase();
}
const digits = (s) => String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const stripAl = (w) => w.replace(/^(وال|بال|لل|فال|كال|ال)/, '');

const VERBS = ['حدث', 'ابن', 'اضف', 'انشي', 'انشئ', 'اعرض', 'اكتب', 'جهز', 'احذف', 'غير', 'حول', 'لخص', 'ابحث', 'افتح', 'عدل', 'اختصر', 'رتب', 'اعد', 'صغ', 'علم', 'استعد', 'نزل', 'صدر', 'شارك', 'حضر'];

export function splitClauses(text) {
  const verbAlt = VERBS.join('|');
  const parts = String(text).split(new RegExp(`\\s*[،,؛;\\n]\\s*(?:و(?=\\S))?|\\s+ثم\\s+|\\s+and then\\s+|(?<=\\S)\\s+و(?=(?:${verbAlt}))`, 'u'));
  const out = [];
  for (const p of parts) {
    const t = p?.trim();
    if (!t) continue;
    // Re-attach fragments that are not standalone requests (e.g. list items after a comma)
    if (out.length && !looksLikeRequest(t)) out[out.length - 1] += `، ${t}`;
    else out.push(t);
  }
  return out.length ? out : [String(text)];
}
function looksLikeRequest(t) {
  const n = norm(t).replace(/^و/, '');
  return new RegExp(`^(${VERBS.join('|')}|ما|كم|هل|من|متي|اين|show|create|add|update|delete|remove|make|write|summari|search|find|what|how|list|set|change|move|export|restore|undo|تراجع|ابحث|اريد|اعطني|عطني|ابغى|ابي|ممكن|لو سمحت|please|مهام|المهام|مواعيد|المشاريع)`).test(n) || /\d+\s*[%٪]/.test(t);
}

// ---------------- date & time ----------------
const DAY_NAMES = { 'الاحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الاربعاء': 3, 'الخميس': 4, 'الجمعه': 5, 'السبت': 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const iso = (d) => d.toISOString().slice(0, 10);
export function parseDate(text) {
  const n = norm(text);
  let m = n.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = n.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/);
  if (m) { const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date().getUTCFullYear()); return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const d = new Date(); d.setUTCHours(12, 0, 0, 0);
  if (/بعد غد|after tomorrow/.test(n)) { d.setUTCDate(d.getUTCDate() + 2); return iso(d); }
  if (/غدا|بكره|بكرة|tomorrow/.test(n)) { d.setUTCDate(d.getUTCDate() + 1); return iso(d); }
  if (/اليوم|today/.test(n) && /(موعد|استحقاق|بتاريخ|due|اليوم الساعه|تنتهي)/.test(n)) return iso(d);
  m = n.match(/بعد (\d+|يوم|يومين|اسبوع|اسبوعين|شهر) ?(يوم|ايام|اسبوع|اسابيع|شهر)?|in (\d+) (day|week)s?/);
  if (m) {
    const word = m[1]; let k = parseInt(word, 10); const unit = m[2] || m[4] || word;
    if (Number.isNaN(k)) k = /يومين|اسبوعين/.test(word) ? 2 : 1;
    const days = /اسبوع|اسابيع|week/.test(unit) ? k * 7 : /شهر/.test(unit) ? k * 30 : k;
    d.setUTCDate(d.getUTCDate() + days); return iso(d);
  }
  if (/الاسبوع (القادم|الجاي)|next week/.test(n)) { d.setUTCDate(d.getUTCDate() + 7); return iso(d); }
  if (/نهايه الشهر|end of (the )?month/.test(n)) { const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)); return iso(e); }
  for (const [name, dow] of Object.entries(DAY_NAMES)) {
    if (new RegExp(`(^|\\s|يوم )${name}(\\s|$)`).test(n)) { const diff = (dow - d.getUTCDay() + 7) % 7 || 7; d.setUTCDate(d.getUTCDate() + diff); return iso(d); }
  }
  return null;
}
// Local wall-clock date+time -> UTC ISO using the client's timezone offset (minutes, JS convention).
export function localToIso(date, time, tzOffset = -240) {
  const [y, mo, d] = date.split('-').map(Number); const [h, mi] = time.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) + (Number.isFinite(+tzOffset) ? +tzOffset : -240) * 60e3).toISOString();
}
export function parseTime(text) {
  const n = norm(text);
  let m = n.match(/(?:الساعه\s*)?(\d{1,2})[:.](\d{2})\s*(صباحا|مساء|ص|م|am|pm)?/);
  let h, mi = 0, suf;
  if (m) { h = +m[1]; mi = +m[2]; suf = m[3]; }
  else { m = n.match(/(?:الساعه|at)\s*(\d{1,2})\s*(صباحا|مساء|ظهرا|عصرا|ص|م|am|pm)?|(\d{1,2})\s*(am|pm)/); if (!m) return null; h = +(m[1] || m[3]); suf = m[2] || m[4]; }
  if (/مساء|م$|pm|عصرا/.test(suf || '') && h < 12) h += 12;
  if (/ظهرا/.test(suf || '') && h < 11) h += 12;
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

function parsePercent(text) {
  const t = digits(text);
  const m = t.match(/(\d{1,3})\s*(?:%|٪|بالمئه|بالمائه|بالمية|في المئه|percent)/) || norm(t).match(/(?:الي|إلى|to|=|نسبه|تقدم|انجاز)\s*(\d{1,3})\b/);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return Number.isInteger(v) ? v : null;
}

const ORDINALS = { 'الاولي': 1, 'الاول': 1, 'الثانيه': 2, 'الثاني': 2, 'الثالثه': 3, 'الثالث': 3, 'الرابعه': 4, 'الرابع': 4, 'الخامسه': 5, 'الخامس': 5, 'الاخيره': -1, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };

// ---------------- entity resolution ----------------
function matchByName(items, text, getName) {
  const n = norm(text);
  const hits = [];
  for (const it of items) {
    const name = norm(getName(it)).trim();
    if (!name) continue;
    if (n.includes(name)) { hits.push({ it, score: name.length + 100 }); continue; }
    const words = name.split(/\s+/).map(stripAl).filter((w) => w.length > 2 && !['مشروع', 'project', 'مهمه', 'task'].includes(w));
    if (!words.length) continue;
    const tw = new Set(n.split(/\s+/).map(stripAl));
    const k = words.filter((w) => tw.has(w)).length;
    if (k && k >= Math.ceil(words.length * 0.6)) hits.push({ it, score: k * 10 + name.length / 100 });
  }
  hits.sort((a, b) => b.score - a.score);
  if (!hits.length) return { matches: [] };
  const top = hits[0].score;
  return { matches: hits.filter((h) => h.score === top).map((h) => h.it), all: hits.map((h) => h.it) };
}

const THIS_PROJECT = /(هذا المشروع|المشروع المحدد|المشروع المفتوح|المشروع الحالي|هالمشروع|this project|current project|selected project)/;
const THIS_DOC = /(هذا المستند|المستند المفتوح|المستند الحالي|الملف المفتوح|التقرير|الخطه|المحضر|الخطاب|المستند|this document|the document|open document|it\b)/;

function resolveProject(user, text, ctx) {
  const n = norm(text);
  if (THIS_PROJECT.test(n)) {
    const id = ctx.ui.selectedProjectId || ctx.conv.lastProjectId;
    return id ? { id } : { ask: 'أي مشروع تقصد؟ لم أجد مشروعاً محدداً في الواجهة أو في المحادثة.', options: projectOptions(user) };
  }
  const projects = W.listProjects(user);
  const { matches } = matchByName(projects, text, (p) => p.name);
  if (matches.length === 1) return { id: matches[0].id, name: matches[0].name };
  if (matches.length > 1) return { ask: 'وجدت أكثر من مشروع مطابق، أيها تقصد؟', options: matches.slice(0, 6).map((p) => ({ label: p.name, value: p.name })) };
  if (/(المشروع|project)(?!\S)/.test(n) && (ctx.ui.selectedProjectId || ctx.conv.lastProjectId)) return { id: ctx.ui.selectedProjectId || ctx.conv.lastProjectId };
  return { ask: 'أي مشروع تقصد؟', options: projectOptions(user) };
}
const projectOptions = (user) => W.listProjects(user).filter((p) => p.status === 'active').slice(0, 6).map((p) => ({ label: p.name, value: p.name }));

function resolveDocument(ctx, n) {
  const id = ctx.ui.openDocumentId || ctx.conv.lastDocumentId;
  if (id) return { id };
  return { ask: 'أي مستند تقصد؟ افتح المستند في مساحة التحرير أو اذكر اسمه.' };
}

function resolveWidget(user, n, type) {
  const d = B.getDashboard(user);
  const list = d.layout.filter((w) => !type || w.type === type);
  return { widget: list[0] || null, all: d.layout };
}

const WIDGET_WORDS = [
  [/(موشر|kpi)/, null],
  [/(المشاريع المتاخره|المتاخره|delayed)/, { type: 'projects', filters: { delayed: true }, title: 'المشاريع المتأخرة' }],
  [/(انجاز|منجز).*(الاسبوع)|this week|week/, { type: 'week_progress', title: 'إنجاز هذا الأسبوع' }],
  [/(المهام|مهامي|مهام|tasks)/, { type: 'tasks', filters: { mine: true, open: true }, title: 'مهامي' }],
  [/(المواعيد|مواعيد|الاجتماعات|events|calendar)/, { type: 'events' }],
  [/(التنبيهات|تنبيهات|alerts)/, { type: 'alerts' }],
  [/(المستندات|مستندات|documents)/, { type: 'documents' }],
  [/(المشاريع|مشاريع|projects)/, { type: 'projects', title: 'المشاريع' }],
  [/(ملخص|summary)/, { type: 'summary', size: 'l' }],
];
const KPI_WORDS = [
  [/(متوسط|معدل).*(انجاز|تقدم)|avg/, 'avg_progress'], [/(نسبه).*(المهام)|task completion/, 'task_completion'],
  [/(متاخر).*(مهام)|(مهام).*(متاخر)|overdue/, 'overdue_tasks'], [/(متاخر)/, 'delayed_projects'], [/(نشط)/, 'active_projects'],
];

function widgetSpec(n) { for (const [re, spec] of WIDGET_WORDS) if (re.test(n)) return spec ? { ...spec } : null; return null; }

// ---------------- main ----------------
// Returns { steps: [ {tool,input,label} | {ask, options, pending} | {say} ] }
export function plan(user, text, ctx) {
  const steps = [];
  // 1) Continue a pending clarification if the message answers it.
  if (ctx.conv.pending && !startsNewCommand(text)) {
    const cont = continuePending(user, text, ctx);
    if (cont) return { steps: cont, consumedPending: true };
  }
  // Several "project N%" pairs in one progress message are handled as a whole.
  const nt = norm(text);
  if (/(تقدم|انجاز|نسبه|progress)/.test(nt) && (digits(text).match(/\d{1,3}\s*[%٪]/g) || []).length >= 2) {
    const pairs = multiProgress(user, text);
    if (pairs.length >= 2) return { steps: pairs.map((pr) => ({ tool: 'update_project', input: { id: pr.id, progress: pr.progress }, label: `تحديث تقدم «${pr.name}» إلى ${pr.progress}%` })) };
  }
  for (const clause of splitClauses(text)) steps.push(...planClause(user, clause, ctx));
  return { steps };
}

function startsNewCommand(text) {
  const n = norm(text).replace(/^و/, '');
  return new RegExp(`^(${VERBS.join('|')}|show|create|add|update|delete|write|summari|search|تراجع|undo)`).test(n) && n.split(/\s+/).length > 2;
}

function continuePending(user, text, ctx) {
  const p = ctx.conv.pending;
  const input = { ...p.input };
  const n = norm(text);
  if (/^(الغ|الغاء|لا|cancel|no|توقف)/.test(n)) return [{ say: 'تم إلغاء الطلب المعلّق.', clearPending: true }];
  switch (p.missing) {
    case 'project_id': {
      const r = resolveProject(user, text, { ...ctx, ui: {}, conv: {} });
      if (!r.id) return [{ ask: r.ask, options: r.options, pending: p }];
      input[p.field || 'project_id'] = r.id;
      const next = nextMissing(p.tool, input);
      if (next) return [{ ask: next.ask, options: next.options, pending: { ...p, input, missing: next.missing, field: next.field } }];
      return [{ tool: p.tool, input, label: p.label, clearPending: true }];
    }
    case 'progress': {
      const v = parsePercent(text) ?? (/^\s*\d{1,3}\s*$/.test(digits(text)) ? parseInt(digits(text), 10) : null);
      if (v == null || v > 100) return [{ ask: 'ما نسبة الإنجاز المطلوبة (من 0 إلى 100)؟', pending: p }];
      input.progress = v;
      return [{ tool: p.tool, input, label: p.label, clearPending: true }];
    }
    case 'progress_multi': {
      const pairs = multiProgress(user, text);
      if (!pairs.length) return null;
      return pairs.map((pr) => ({ tool: 'update_project', input: { id: pr.id, progress: pr.progress }, label: `تحديث تقدم «${pr.name}» إلى ${pr.progress}%`, clearPending: true }));
    }
    case 'title': input[p.field || 'title'] = text.trim(); return [{ tool: p.tool, input, label: p.label, clearPending: true }];
    case 'paragraph_text': input.operation = { ...input.operation, text: text.trim() }; return [{ tool: p.tool, input, label: p.label, clearPending: true }];
    case 'starts_at': {
      const date = parseDate(text) || (p.date ?? null); const time = parseTime(text);
      if (!date || !time) return [{ ask: 'حدّد التاريخ والوقت، مثال: «غداً الساعة 10 صباحاً».', pending: { ...p, date: date || p.date } }];
      input.starts_at = localToIso(date, time, ctx.ui.tzOffset);
      return [{ tool: p.tool, input, label: p.label, clearPending: true, localWhen: `${date} ${time}` }];
    }
    case 'widget_order': {
      const spec = widgetSpec(n);
      const d = B.getDashboard(user);
      const w = spec && d.layout.find((x) => x.type === spec.type && (!spec.filters?.delayed || x.filters?.delayed));
      if (!w) return [{ ask: 'لم أحدد العنصر. اذكر اسم البطاقة (مثل: المهام، المواعيد، المشاريع المتأخرة) وموقعها (أولاً/أخيراً).', pending: p }];
      return [reorderStep(d, w, /(اخير|اسفل|نهايه|last|bottom)/.test(n))];
    }
    default: return null;
  }
}

function nextMissing(tool, input) {
  if (tool === 'update_project' && input.progress === undefined && input.status === undefined) return { missing: 'progress', ask: 'ما نسبة الإنجاز الجديدة؟' };
  return null;
}

function reorderStep(d, w, toEnd) {
  const ids = d.layout.map((x) => x.id).filter((id) => id !== w.id);
  const order = toEnd ? [...ids, w.id] : [w.id, ...ids];
  return { tool: 'reorder_widgets', input: { order }, label: `نقل «${w.title || B.WIDGET_TYPES[w.type].label_ar}» ${toEnd ? 'إلى النهاية' : 'إلى الأعلى'}`, clearPending: true };
}

function planClause(user, clause, ctx) {
  const n = norm(clause).replace(/^و(?=\S)/, '').trim();
  const en = /^[\x00-\x7F]+$/.test(clause);

  // --- Vault boundary ---
  if (/(مرصاد|vault|فولت|marsad|\bfs\b|النظام المالي|واجب|wajib)/i.test(n)) {
    return [{ say: 'بيانات FS ومرصاد موجودة داخل Vault ولا يستطيع المساعد خارج Vault قراءتها أو تلخيصها أو نقلها. افتح التطبيق من «تطبيقاتي» ليُعرض ويُعالج داخل بيئة Vault المصرّح بها.', vault: true }];
  }
  // --- undo ---
  if (/^(تراجع|الغ اخر|undo)/.test(n)) return [{ undoLast: true }];

  // --- greetings / help ---
  if (/^(مرحبا|السلام عليكم|اهلا|hi|hello|hey|صباح الخير|مساء الخير)(?:\s|$)/.test(n) && n.split(/\s+/).length <= 4) return [{ say: 'أهلاً بك! أستطيع عرض ملخص يومك، وإنشاء المهام والمشاريع وتحديثها، وتخصيص الداشبورد، وإعداد المستندات وتعديلها. بماذا أبدأ؟' }];
  if (/^(ماذا تستطيع|ساعدني|مساعده|help|what can you do)/.test(n)) return [{ help: true }];

  // --- achievements / gamification ---
  if (/(نقاطي|نقاط التميز|نقاط|مستواي|مستوى|انجازاتي|شاراتي|شارات|سلسلتي|xp|level|achievements|badges|quests|تحديات اليوم|مهام اليوم الخاصه)/.test(n) && !/(مشروع|project)/.test(n)) {
    return [{ tool: 'get_my_achievements', input: {}, label: 'قراءة إنجازاتي', render: 'achievements' }];
  }

  // --- enterprise systems (each system contributes its own intents) ---
  for (const sys of accessibleSystems(user)) {
    for (const it of sys.intents || []) {
      try {
        if (!it.test(n, clause)) continue;
        const steps = it.plan(user, clause, ctx, { norm, parseDate, parseTime, digits, matchByName });
        if (steps?.length) return steps;
      } catch (e) { console.error(`[planner] ${sys.key} intent failed:`, e.message); }
    }
  }

  // --- Agents Office ---
  const office = officeIntent(user, clause, n, ctx);
  if (office) return office;

  // --- restore ---
  if (/(استعد|استرجع|ارجع|restore|revert)/.test(n) && /(اصدار|نسخه|version)/.test(n) && !/(داشبورد|لوحه|dashboard)/.test(n)) {
    const d = resolveDocument(ctx, n);
    if (!d.id) return [{ ask: d.ask }];
    const doc = one('SELECT current_version FROM documents WHERE id=?', d.id);
    const m = digits(clause).match(/(\d+)/);
    const version = m ? parseInt(m[1], 10) : (doc?.current_version || 2) - 1;
    if (version < 1) return [{ say: 'لا يوجد إصدار سابق لهذا المستند.' }];
    return [{ tool: 'restore_document_version', input: { id: d.id, version }, label: `استعادة الإصدار ${version}` }];
  }
  if (/(استعد|استرجع|ارجع|restore|reset|اعد ضبط)/.test(n) && /(داشبورد|الداشبورد|اللوحه|الاعدادات|التخصيص|الترتيب|dashboard|layout)/.test(n)) {
    return [{ tool: 'restore_dashboard', input: /(الافتراضي|default|reset|اعد ضبط)/.test(n) ? { reset: true } : {}, label: 'استعادة إعدادات الداشبورد السابقة' }];
  }

  // --- export ---
  if (/(word|وورد|docx|pdf|بي دي اف)/.test(n) && /(حول|صدر|نزل|تنزيل|حمل|export|download|convert|اجعله|ملف|مستند)/.test(n)) {
    const d = resolveDocument(ctx, n);
    if (!d.id) return [{ ask: d.ask }];
    const out = [];
    if (/(word|وورد|docx)/.test(n)) out.push({ tool: 'export_document', input: { id: d.id, format: 'docx' }, label: 'تجهيز ملف Word' });
    if (/(pdf|بي دي اف)/.test(n)) out.push({ tool: 'export_document', input: { id: d.id, format: 'pdf' }, label: 'تجهيز ملف PDF' });
    return out;
  }

  // --- document edits (need an open/recent document) ---
  const docEdit = docEditIntent(clause, n);
  if (docEdit) {
    const d = resolveDocument(ctx, n);
    if (!d.id) return [{ ask: d.ask }];
    return [docEdit(d.id, user, ctx)].flat();
  }

  // --- daily summary ---
  if (/(ملخص|موجز|خلاصه).*(اليوم|يوم|يومي)|daily (summary|brief)|summary of (my |the )?day|brief me|(ما|وش|ايش) (عندي|لدي) اليوم|يومي اليوم/.test(n)) {
    return [{ tool: 'get_daily_summary', input: {}, label: 'إعداد ملخص اليوم', render: 'summary' }];
  }

  // --- reports ---
  if (/(تقرير|report)/.test(n) && /(متاخر|متعثر|delayed|late|overdue)/.test(n)) {
    return [{ tool: 'run_skill', input: { key: 'delayed_projects_report', input: {} }, label: 'بناء تقرير المشاريع المتأخرة' }];
  }

  // --- week achievement ---
  if (/(انجاز|منجز|انجزت|done|completed|achievement).*(الاسبوع|week)/.test(n) && !/(اضف|add).*(مهمه|task)/.test(n)) {
    const d = B.getDashboard(user);
    const existing = d.layout.find((w) => w.type === 'week_progress');
    return [
      ...(existing ? [] : [{ tool: 'add_widget', input: { type: 'week_progress', title: 'إنجاز هذا الأسبوع', view: 'bar', position: 1 }, label: 'إضافة بطاقة إنجاز الأسبوع' }]),
      { tool: 'list_tasks', input: { status: 'done' }, label: 'قراءة المهام المنجزة', render: 'week_done' },
    ];
  }

  // --- progress: update vs display ---
  if (/(تقدم|انجاز|نسبه|progress|completion)/.test(n)) {
    const pct = parsePercent(clause);
    const isUpdate = /(حدث|غير|اجعل|عدل|ضع|اضبط|ارفع|سجل|update|set|change|make|mark)/.test(n);
    const plural = /(المشاريع|مشاريع|projects)/.test(n);
    if (isUpdate && plural && pct == null) {
      return [{ tool: 'list_projects', input: { status: 'active' }, label: 'مراجعة تقدم المشاريع', render: 'progress_review', setPending: { tool: 'update_project', input: {}, missing: 'progress_multi' } }];
    }
    if (isUpdate && plural && pct != null) {
      // Multiple "name N%" pairs in one message
      const pairs = multiProgress(user, clause);
      if (pairs.length) return pairs.map((pr) => ({ tool: 'update_project', input: { id: pr.id, progress: pr.progress }, label: `تحديث تقدم «${pr.name}» إلى ${pr.progress}%` }));
    }
    if (isUpdate) {
      const r = resolveProject(user, clause, ctx);
      if (pct != null && pct > 100) return [{ say: 'نسبة الإنجاز يجب أن تكون بين 0 و100.' }];
      if (!r.id) return [{ ask: r.ask, options: r.options, pending: { tool: 'update_project', input: pct != null ? { progress: pct } : {}, missing: 'project_id', field: 'id', label: 'تحديث تقدم المشروع' } }];
      if (pct == null) {
        const p = one('SELECT name,progress FROM projects WHERE id=?', r.id);
        return [{ ask: `ما نسبة الإنجاز الجديدة لمشروع «${p?.name}»؟ النسبة الحالية ${p?.progress == null ? 'غير محددة' : p.progress + '%'}.`, pending: { tool: 'update_project', input: { id: r.id }, missing: 'progress', label: 'تحديث تقدم المشروع' } }];
      }
      return [{ tool: 'update_project', input: { id: r.id, progress: pct }, label: `تحديث نسبة الإنجاز إلى ${pct}%` }];
    }
    if (!plural && (THIS_PROJECT.test(n) || /(مشروع|project)/.test(n))) {
      const r = resolveProject(user, clause, ctx);
      if (r.id) return [{ tool: 'get_project', input: { id: r.id }, label: 'قراءة تقدم المشروع', render: 'project_progress' }];
      return [{ ask: r.ask, options: r.options }];
    }
  }

  // --- widgets ---
  if (/(حول|اعرض|غير|اجعل|convert|show|turn|change)/.test(n) && /(رسم|مخطط|chart|graph|دايري|اعمده|bar|donut|pie|جدول|table|قائمه|list|بطاقات|cards)/.test(n)) {
    const spec = widgetSpec(n) || { type: 'tasks' };
    const view = /(دايري|donut|pie)/.test(n) ? 'donut' : /(جدول|table)/.test(n) ? 'table' : /(قائمه|list)/.test(n) ? (spec.type === 'projects' ? 'cards' : 'list') : /(بطاقات|cards)/.test(n) ? 'cards' : 'bar';
    const { widget } = resolveWidget(user, n, spec.type);
    const target = ctx.ui.selectedWidgetId ? B.getDashboard(user).layout.find((w) => w.id === ctx.ui.selectedWidgetId && w.type === spec.type) || widget : widget;
    if (target) return [{ tool: 'update_widget', input: { id: target.id, view }, label: `تغيير عرض «${target.title || B.WIDGET_TYPES[target.type].label_ar}» إلى ${viewAr(view)}` }];
    return [{ tool: 'add_widget', input: { ...spec, view }, label: `إضافة ${B.WIDGET_TYPES[spec.type].label_ar} بعرض ${viewAr(view)}` }];
  }
  if (/(رتب|ترتيب|reorder|arrange|انقل|move)/.test(n) || (/(ضع|اجعل)/.test(n) && /(اولا|في الاعلي|الاول|اخيرا|في الاسفل|top|first|bottom|last)/.test(n))) {
    const spec = widgetSpec(n.replace(/(ترتيب|رتب)/, ''));
    const d = B.getDashboard(user);
    const w = spec && d.layout.find((x) => x.type === spec.type && (!spec.filters?.delayed || x.filters?.delayed));
    const hasPos = /(اولا|في الاعلي|الاول|البدايه|اخيرا|في الاسفل|النهايه|top|first|bottom|last)/.test(n);
    if (w && hasPos) return [reorderStep(d, w, /(اخير|اسفل|نهايه|last|bottom)/.test(n))];
    return [{ ask: 'أي عنصر تريد نقله، وإلى أين؟ مثال: «ضع المهام أولاً». يمكنك أيضاً سحب البطاقات مباشرة في وضع الترتيب.', options: d.layout.slice(0, 6).map((x) => ({ label: `${x.title || B.WIDGET_TYPES[x.type].label_ar} أولاً`, value: `ضع ${x.title || B.WIDGET_TYPES[x.type].label_ar} أولاً` })), pending: { tool: 'reorder_widgets', input: {}, missing: 'widget_order' }, arrange: true }];
  }
  if (/(احذف|ازل|اخف|شيل|remove|hide|delete)/.test(n) && /(بطاقه|عنصر|ويدجت|widget|card|من الداشبورد|من اللوحه)/.test(n)) {
    const spec = widgetSpec(n);
    const d = B.getDashboard(user);
    const w = (ctx.ui.selectedWidgetId && d.layout.find((x) => x.id === ctx.ui.selectedWidgetId)) || (spec && d.layout.find((x) => x.type === spec.type && (!spec.filters?.delayed || x.filters?.delayed)));
    if (!w) return [{ ask: 'أي بطاقة تريد إزالتها من الداشبورد؟', options: d.layout.map((x) => ({ label: x.title || B.WIDGET_TYPES[x.type].label_ar, value: `أزل بطاقة ${x.title || B.WIDGET_TYPES[x.type].label_ar}` })) }];
    return [{ tool: 'remove_widget', input: { id: w.id }, label: `إزالة بطاقة «${w.title || B.WIDGET_TYPES[w.type].label_ar}» (يمكن التراجع)` }];
  }
  if (/(اضف|add|ضيف|اظهر|ثبت|pin)/.test(n) && /(بطاقه|عنصر|ويدجت|widget|card|موشر|kpi|للداشبورد|الي الداشبورد|رسم)/.test(n)) {
    if (/(موشر|kpi)/.test(n)) {
      const metric = KPI_WORDS.find(([re]) => re.test(n))?.[1];
      if (!metric) return [{ ask: 'أي مؤشر تريد إضافته؟', options: [['avg_progress', 'متوسط الإنجاز'], ['delayed_projects', 'المشاريع المتأخرة'], ['task_completion', 'نسبة إنجاز المهام'], ['overdue_tasks', 'المهام المتأخرة']].map(([, l]) => ({ label: l, value: `أضف مؤشر ${l}` })) }];
      return [{ tool: 'add_widget', input: { type: 'kpi', filters: { metric }, size: 's', position: 0 }, label: 'إضافة مؤشر' }];
    }
    const spec = widgetSpec(n);
    if (!spec) return [{ ask: 'ما نوع البطاقة المطلوبة؟', options: ['المشاريع المتأخرة', 'مهامي', 'المواعيد', 'إنجاز هذا الأسبوع', 'التنبيهات'].map((l) => ({ label: l, value: `أضف بطاقة ${l}` })) }];
    if (/(رسم|chart)/.test(n) && ['tasks', 'projects'].includes(spec.type)) spec.view = 'bar';
    return [{ tool: 'add_widget', input: { ...spec, position: 1 }, label: `إضافة بطاقة «${spec.title || B.WIDGET_TYPES[spec.type].label_ar}»` }];
  }

  // --- delete (confirmation enforced by executor) ---
  if (/^(احذف|امسح|delete|remove)/.test(n) && /(مشروع|project|مهمه|task|مستند|document)/.test(n)) {
    if (/(مشروع|project)/.test(n)) { const r = resolveProject(user, clause, ctx); return r.id ? [{ tool: 'delete_project', input: { id: r.id }, label: 'حذف المشروع' }] : [{ ask: r.ask, options: r.options }]; }
    if (/(مهمه|task)/.test(n)) { const t = resolveTask(user, clause, ctx); return t.id ? [{ tool: 'delete_task', input: { id: t.id }, label: 'حذف المهمة' }] : [{ ask: t.ask, options: t.options }]; }
    const d = resolveDocument(ctx, n); return d.id ? [{ tool: 'delete_document', input: { id: d.id }, label: 'حذف المستند' }] : [{ ask: d.ask }];
  }
  if (/(شارك|share)/.test(n) && /(مستند|document|تقرير|المستند)/.test(n)) {
    const d = resolveDocument(ctx, n);
    if (!d.id) return [{ ask: d.ask }];
    const { matches } = matchByName(all('SELECT id,name_ar,name_en FROM users WHERE active=1 AND id!=?', user.id), clause, (u) => u.name_ar);
    if (matches.length !== 1) return [{ ask: 'مع من تريد مشاركة المستند؟ اذكر الاسم الكامل.' }];
    return [{ tool: 'share_document', input: { id: d.id, user_id: matches[0].id, permission: /(تحرير|تعديل|edit)/.test(n) ? 'edit' : 'view' }, label: 'مشاركة المستند' }];
  }

  // --- create project ---
  if (/(انشي|انشئ|اضف|اعمل|سو|create|new|add)/.test(n) && /(مشروع|project)/.test(n) && !/(مهمه|task)/.test(n)) {
    const name = extractName(clause, /(?:مشروع(?:اً|ا)?|project)\s*(?:جديد(?:اً|ا)?|new)?\s*(?:باسم|بعنوان|اسمه|named|called|:)?\s*[«"“']?([^«»"”'،,]+?)[»"”']?(?:\s+(?:بتاريخ|ينتهي|موعده|تاريخ|due|ب?استحقاق|في\s+\d|بنسبه)|$)/i);
    if (!name) return [{ ask: 'ما اسم المشروع الجديد؟', pending: { tool: 'create_project', input: {}, missing: 'title', field: 'name', label: 'إنشاء مشروع' } }];
    const input = { name };
    const due = parseDate(clause); if (due) input.due_date = due;
    const pct = parsePercent(clause); if (pct != null && /(نسبه|انجاز|تقدم)/.test(n)) input.progress = pct;
    return [{ tool: 'create_project', input, label: `إنشاء مشروع «${name}»` }];
  }

  // --- create task ---
  if (/(انشي|انشئ|اضف|ضيف|سجل|create|add|new)/.test(n) && /(مهمه|task)/.test(n)) {
    let title = extractName(clause, /(?:مهم(?:ة|ه)|task)\s*(?:جديد(?:ة|ه)|new)?\s*(?:بعنوان|باسم|اسمها|:|called|named)?\s*[«"“']?(.+?)[»"”']?(?=\s+(?:في|ضمن|ل|الي|إلى|لـ|بتاريخ|تنتهي|موعدها|قبل|بأولويه|باولويه|اولويه|عاجله|for|in|to|by|due|priority|tomorrow|today|next)(?:\s|$)|\s+(?:غدا|غداً|بكره|بكرة|اليوم)(?:\s|$)|[،,]|$)/i);
    const input = {};
    // project
    const n2 = norm(clause);
    if (THIS_PROJECT.test(n2) || /(للمشروع|في المشروع|ضمن المشروع)/.test(n2)) {
      const id = ctx.ui.selectedProjectId || ctx.conv.lastProjectId; if (id) input.project_id = id;
    } else if (/(مشروع|project)/.test(n2)) {
      const r = resolveProject(user, clause.split(/(?:مشروع|project)/i).slice(1).join(' '), ctx);
      if (r.id) input.project_id = r.id; else return [{ ask: r.ask, options: r.options }];
    }
    // assignee
    const people = assignableUsers(user);
    const m = matchByName(people.filter((p) => p.id !== user.id), clause, (p) => p.name_ar);
    const m2 = m.matches.length ? m : matchByName(people.filter((p) => p.id !== user.id), clause, (p) => p.name_en);
    if (m2.matches.length === 1) input.assignee_id = m2.matches[0].id;
    else if (/(الي|إلى|لـ|assign|اسند)/.test(n2) && m2.matches.length > 1) return [{ ask: 'لمن تريد إسناد المهمة؟', options: m2.matches.map((p) => ({ label: p.name_ar, value: p.name_ar })) }];
    const due = parseDate(clause); if (due) input.due_date = due;
    if (/(عاجل|urgent)/.test(n2)) input.priority = 'urgent'; else if (/(عالي|مهم جدا|high)/.test(n2)) input.priority = 'high'; else if (/(منخفض|low)/.test(n2)) input.priority = 'low';
    if (title) {
      // strip trailing names/projects that leaked into the title
      for (const p of people) title = title.replace(new RegExp(`\\s*(?:ل|لـ|الى|إلى)?\\s*${p.name_ar}.*$`), '');
      title = title.replace(/\s*(?:لهذا المشروع|للمشروع|في المشروع).*$/, '').trim();
    }
    if (!title || title.length < 2) return [{ ask: 'ما عنوان المهمة؟', pending: { tool: 'create_task', input, missing: 'title', label: 'إنشاء مهمة' } }];
    input.title = title;
    return [{ tool: 'create_task', input, label: `إنشاء مهمة «${title}»` }];
  }

  // --- complete task ---
  if (/(انجزت|انهيت|اكملت|خلصت|علم|اغلق|mark|complete|finish)/.test(n) && (/(مهمه|task|منجزه|done|مكتمله)/.test(n) || /^(انجزت|انهيت|اكملت|خلصت)/.test(n))) {
    const t = resolveTask(user, clause, ctx);
    if (!t.id) return [{ ask: t.ask, options: t.options }];
    return [{ tool: 'update_task', input: { id: t.id, status: 'done' }, label: 'تعليم المهمة كمنجزة' }];
  }

  // --- event ---
  if (/(اضف|انشي|انشئ|احجز|حدد|سجل|add|schedule|book)/.test(n) && /(موعد|اجتماع|meeting|appointment)/.test(n)) {
    const title = extractName(clause, /(?:موعد(?:اً|ا)?|اجتماع(?:اً|ا)?|meeting|appointment)\s*(?:بعنوان|باسم|:|مع|with)?\s*(.+?)(?=\s+(?:غدا|غداً|بكره|بكرة|اليوم|يوم|الساعه|الساعة|بعد|في|on|at|tomorrow|today)(?:\s|$)|$)/i) || (/(اجتماع|meeting)/.test(n) ? 'اجتماع' : 'موعد');
    const date = parseDate(clause); const time = parseTime(clause);
    const input = { title: /(مع|with)/.test(n) && !title.startsWith('اجتماع') ? `اجتماع مع ${title}` : title };
    if (!date || !time) return [{ ask: !date ? 'في أي يوم وأي ساعة؟' : 'في أي ساعة؟', pending: { tool: 'create_event', input, missing: 'starts_at', date, label: 'إضافة موعد' } }];
    input.starts_at = localToIso(date, time, ctx.ui.tzOffset);
    return [{ tool: 'create_event', input, label: `إضافة موعد «${input.title}»`, localWhen: `${date} ${time}` }];
  }

  // --- documents: generation ---
  if (/(اكتب|انشي|انشئ|جهز|اعد|صغ|ابن|حضر|سو|write|draft|create|prepare|make)/.test(n)) {
    if (/(محضر|minutes)/.test(n)) {
      const notes = clause.includes(':') ? clause.slice(clause.indexOf(':') + 1).trim() : undefined;
      return [{ tool: 'run_skill', input: { key: 'meeting_minutes', input: { notes, date: parseDate(clause) || undefined } }, label: 'إعداد محضر اجتماع' }];
    }
    if (/(خطه|plan)/.test(n)) {
      const title = extractName(clause, /(?:خط(?:ة|ه)|plan)\s*(?:عمل)?\s*(?:ل|لـ|for|بعنوان|:)?\s*(.+)$/i) || 'خطة عمل';
      const input = { title: /^خطة/.test(title) ? title : `خطة ${title}` };
      const r = /(مشروع|project)/.test(n) ? resolveProject(user, clause, ctx) : {};
      if (r.id) input.project_id = r.id;
      return [{ tool: 'run_skill', input: { key: 'create_plan', input }, label: 'إعداد خطة' }];
    }
    if (/(خطاب|letter|رساله رسميه|مراسله)/.test(n)) {
      const to = extractName(clause, /(?:الي|إلى|to|لـ)\s+(.+?)(?=\s+(?:بخصوص|بشان|بشأن|عن|حول|regarding|about)(?:\s|$)|$)/i);
      const subject = extractName(clause, /(?:بخصوص|بشان|بشأن|حول|عن|regarding|about)\s+(.+)$/i);
      return [{ tool: 'run_skill', input: { key: 'draft_letter', input: { to: to || undefined, subject: subject || undefined } }, label: 'صياغة خطاب' }];
    }
    if (/(تقرير|report)/.test(n)) return [{ ask: 'عن أي موضوع تريد التقرير؟ مثال: «تقرير عن المشاريع المتأخرة» أو «تقرير عن مشروع …».', options: [{ label: 'تقرير المشاريع المتأخرة', value: 'ابنِ تقريراً عن المشاريع المتأخرة' }] }];
    if (/(رساله|بريد|ايميل|email|message|تغريده|فقره|نص|اعلان|تهنئه|شكر)/.test(n)) return [{ shortText: clause }];
  }

  // --- summarize / analyze ---
  if (/(لخص|تلخيص|summari[sz]e|اختصر لي)/.test(n)) {
    if (ctx.ui.lastUploadId && /(ملف|المرفق|file|attachment)/.test(n)) return [{ tool: 'run_skill', input: { key: 'summarize', input: { upload_id: ctx.ui.lastUploadId } }, label: 'تلخيص الملف', render: 'summary_points' }];
    const d = ctx.ui.openDocumentId || ctx.conv.lastDocumentId;
    if (d) return [{ tool: 'run_skill', input: { key: 'summarize', input: { document_id: d } }, label: 'تلخيص المستند', render: 'summary_points' }];
    if (ctx.ui.lastUploadId) return [{ tool: 'run_skill', input: { key: 'summarize', input: { upload_id: ctx.ui.lastUploadId } }, label: 'تلخيص الملف', render: 'summary_points' }];
    return [{ ask: 'ماذا تريد أن ألخّص؟ افتح مستنداً أو ارفع ملفاً.' }];
  }
  if (/(حلل|تحليل|analy[sz]e)/.test(n) && ctx.ui.lastUploadId) return [{ tool: 'run_skill', input: { key: 'analyze_file', input: { upload_id: ctx.ui.lastUploadId } }, label: 'تحليل الملف', render: 'analysis' }];

  // --- search ---
  const sm = clause.match(/(?:ابحث|بحث|فتش|search|find)\s+(?:عن|for)?\s*(.+)$/i);
  if (sm) return [{ tool: 'search_workspace', input: { q: sm[1].replace(/[«»"“”]/g, '').trim() }, label: 'البحث في مساحة العمل', render: 'search' }];

  // --- listings ---
  if (/(المشاريع المتاخره|مشاريع متاخره|delayed projects)/.test(n)) return [{ tool: 'list_projects', input: { delayed: true }, label: 'عرض المشاريع المتأخرة', render: 'projects' }];
  if (/(مهامي|my tasks|المهام المتاخره|مهام متاخره|overdue)/.test(n)) return [{ tool: 'list_tasks', input: /(متاخر|overdue)/.test(n) ? { mine: true, overdue: true } : { mine: true }, label: 'عرض المهام', render: 'tasks' }];
  if (/(مواعيدي|مواعيد|اجتماعاتي|جدولي|my (meetings|schedule|appointments))/.test(n)) return [{ tool: 'list_events', input: {}, label: 'عرض المواعيد', render: 'events' }];
  if (/(مشاريعي|المشاريع|my projects|projects)/.test(n)) return [{ tool: 'list_projects', input: {}, label: 'عرض المشاريع', render: 'projects' }];
  if (/(الموشرات|موشرات|kpi|اداء)/.test(n)) return [{ tool: 'get_kpis', input: {}, label: 'قراءة المؤشرات', render: 'kpis' }];

  // project reference alone -> show project
  const pr = matchByName(W.listProjects(user), clause, (p) => p.name).matches;
  if (pr.length === 1) return [{ tool: 'get_project', input: { id: pr[0].id }, label: 'عرض المشروع', render: 'project_progress' }];

  return [{ unknown: clause }];
}

function viewAr(v) { return { bar: 'رسم بياني بالأعمدة', donut: 'رسم دائري', table: 'جدول', list: 'قائمة', cards: 'بطاقات' }[v] || v; }

function extractName(text, re) {
  const m = String(text).match(re);
  if (!m) return null;
  const v = (m[1] || '').replace(/^[\s:«"“']+|[\s»"”'.]+$/g, '').trim();
  return v.length >= 2 ? v : null;
}

function multiProgress(user, clause) {
  const projects = W.listProjects(user);
  const out = [];
  const t = digits(clause);
  const nt = norm(t);
  for (const p of projects) {
    let nm = norm(p.name);
    let idx = nt.indexOf(nm);
    if (idx < 0) {
      // allow a distinctive leading part of the name (e.g. "البوابة" for "البوابة الموحدة")
      const words = nm.split(/\s+/);
      for (let k = words.length - 1; k >= 1 && idx < 0; k--) { const part = words.slice(0, k).join(' '); if (part.length >= 4 && projects.filter((q) => norm(q.name).startsWith(part)).length === 1) { idx = nt.indexOf(part); if (idx >= 0) nm = part; } }
    }
    if (idx < 0) continue;
    const after = nt.slice(idx + nm.length, idx + nm.length + 30);
    const m = after.match(/(\d{1,3})\s*(%|٪)?/);
    if (m && +m[1] <= 100) out.push({ id: p.id, name: p.name, progress: +m[1] });
  }
  return out;
}

function resolveTask(user, clause, ctx) {
  const tasks = W.listTasks(user, { limit: 1000 }).filter((t) => t.status !== 'done' || /(احذف|delete)/.test(norm(clause)));
  const { matches } = matchByName(tasks, clause, (t) => t.title);
  if (matches.length === 1) return { id: matches[0].id };
  if (/(هذه المهمه|المهمه المحدده|this task)/.test(norm(clause)) && (ctx.ui.selectedTaskId || ctx.conv.lastTaskId)) return { id: ctx.ui.selectedTaskId || ctx.conv.lastTaskId };
  return { ask: matches.length > 1 ? 'أي مهمة تقصد؟' : 'لم أجد المهمة. أي مهمة تقصد؟', options: (matches.length ? matches : tasks.filter((t) => t.assignee_id === user.id)).slice(0, 6).map((t) => ({ label: t.title, value: t.title })) };
}

function docEditIntent(clause, n) {
  if (/(اختصر|قصر|shorten).*(المقدمه|المقدمة|intro)/.test(n)) return (id) => ({ tool: 'edit_document', input: { id, operation: { type: 'shorten_intro' } }, label: 'اختصار المقدمة' });
  if (/(رسمي|رسميه|formal)/.test(n) && /(صياغه|اكتب|خل|اجعل|حول|make|rewrite|بصياغه|اسلوب|نبره|tone)/.test(n)) return (id) => ({ tool: 'edit_document', input: { id, operation: { type: 'formalize' } }, label: 'تحويل الصياغة إلى رسمية', formal: true });
  if (/(جدول|table)/.test(n) && /(مسؤوليات|المسؤوليات|مسووليات|المسووليات|مواعيد|responsibil|deadlines)/.test(n)) return (id, user) => responsibilitiesTable(id, user);
  const pm = n.match(/(?:الفقره|paragraph)\s+(الاولي|الاول|الثانيه|الثاني|الثالثه|الثالث|الرابعه|الرابع|الخامسه|الخامس|الاخيره|first|second|third|fourth|fifth|last|\d+)/);
  if (pm && /(عدل|غير|اعد|اكتب|استبدل|edit|change|rewrite|replace|فقط)/.test(n)) {
    const index = ORDINALS[pm[1]] ?? parseInt(pm[1], 10);
    const m = clause.match(/(?:إلى|الى|لتصبح|ليصبح|to|:)\s*[«"“]?(.{3,}?)[»"”]?\s*$/);
    return (id) => {
      const idx = index === -1 ? lastParagraphIndex(id) : index;
      if (m && !/فقط\s*$/.test(m[1])) return { tool: 'edit_document', input: { id, operation: { type: 'replace_paragraph', index: idx, text: m[1].trim() } }, label: `تعديل الفقرة ${idx} فقط` };
      return { ask: `ما التعديل المطلوب على الفقرة ${idx}؟ اكتب النص الجديد وسأستبدل هذه الفقرة فقط.`, pending: { tool: 'edit_document', input: { id, operation: { type: 'replace_paragraph', index: idx } }, missing: 'paragraph_text', label: `تعديل الفقرة ${idx}` }, rewriteParagraph: { id, index: idx, instruction: clause } };
    };
  }
  if (/(اضف|add|ادرج|insert)/.test(n) && /(فقره|قسم|section|paragraph|خاتمه|توصيات)/.test(n) && /(:)/.test(clause)) {
    const body = clause.slice(clause.indexOf(':') + 1).trim();
    return (id) => ({ tool: 'edit_document', input: { id, operation: { type: 'append', html: `<p>${body.replace(/</g, '&lt;')}</p>` } }, label: 'إضافة فقرة' });
  }
  return null;
}

function lastParagraphIndex(id) {
  const d = one('SELECT content_html FROM documents WHERE id=?', id);
  return ((d?.content_html || '').match(/<p>/g) || []).length || 1;
}

function responsibilitiesTable(docId, user) {
  const doc = one('SELECT sources FROM documents WHERE id=?', docId);
  const sources = JSON.parse(doc?.sources || '[]');
  const projectIds = sources.flatMap((s) => (s.type === 'project' ? [s.id] : s.ids || []));
  let rows = [];
  for (const pid of projectIds) {
    try {
      const p = W.getProject(user, pid);
      rows.push(...p.tasks.filter((t) => t.status !== 'done').map((t) => [t.title, t.assignee_ar || '', t.due_date || 'غير محدد', p.name]));
    } catch { /* not visible anymore */ }
  }
  const headers = ['المسؤولية', 'المسؤول', 'الموعد', 'المشروع'];
  if (!rows.length) rows = [['[يُستكمل: المسؤولية]', '[يُستكمل: المسؤول]', '[يُستكمل: الموعد]', '—']];
  return { tool: 'edit_document', input: { id: docId, operation: { type: 'add_table', heading: 'المسؤوليات والمواعيد', headers, rows: rows.slice(0, 40) } }, label: 'إضافة جدول المسؤوليات والمواعيد', filledFromData: rows[0][0] !== '[يُستكمل: المسؤولية]' };
}


// ---------------- Agents Office intents ----------------
const DAYS_ORDER = ['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعه', 'السبت'];
export function parseSchedule(n, tzOffset) {
  const time = parseTime(n);
  const base = { tz_offset: Number.isFinite(+tzOffset) ? +tzOffset : -240 };
  if (/(ايام العمل|ايام الدوام|weekdays|workdays)/.test(n)) return { ...base, type: 'weekdays', time: time || '07:00', explicitTime: !!time };
  const dayIdx = DAYS_ORDER.findIndex((d) => new RegExp(`(كل|يوم) ?(ال)?${d.replace(/^ال/, '')}`).test(n));
  if (dayIdx >= 0 || /(اسبوعيا|كل اسبوع|weekly|every week)/.test(n)) return { ...base, type: 'weekly', day: dayIdx >= 0 ? dayIdx : 0, time: time || '07:00', explicitTime: !!time, explicitDay: dayIdx >= 0 };
  if (/(كل صباح|يوميا|كل يوم|يومي|daily|every (day|morning))/.test(n)) return { ...base, type: 'daily', time: time || (/(صباح|morning)/.test(n) ? '07:00' : '07:00'), explicitTime: !!time };
  return null;
}
const SCHED_AR = (s) => (!s || s.type === 'manual' ? 'تشغيل يدوي' : s.type === 'daily' ? `يومياً الساعة ${s.time}` : s.type === 'weekdays' ? `أيام العمل الساعة ${s.time}` : `كل ${['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'][s.day]} الساعة ${s.time}`);
export { SCHED_AR };

function officeIntent(user, clause, n, ctx) {
  const isAgent = /(وكيل|وكلاء|agent)/.test(n);
  // "make it daily at 7" right after creating/running an agent
  if (ctx.conv.lastOfficeAgentId && /^(اجعله|خله|خليه|جدوله|غير موعده|شغله|make it|schedule it)/.test(n)) {
    const sched = parseSchedule(n, ctx.ui.tzOffset);
    if (/(اوقفه|ايقاف|pause|disable)/.test(n)) return [{ tool: 'schedule_office_agent', input: { id: ctx.conv.lastOfficeAgentId, enabled: false }, label: 'إيقاف الوكيل مؤقتاً' }];
    if (sched) return [{ tool: 'schedule_office_agent', input: { id: ctx.conv.lastOfficeAgentId, schedule: { type: sched.type, time: sched.time, day: sched.day, tz_offset: sched.tz_offset }, enabled: true }, label: `جدولة الوكيل ${SCHED_AR(sched)}` }];
  }
  if (!isAgent && !/(بانتظار|تنتظر|تحتاج).*(موافقتي|مراجعتي)/.test(n)) return null;
  if (/(بانتظار|تنتظر|تحتاج).*(موافق|مراجع)|pending (approval|review)/.test(n)) return [{ tool: 'list_office_runs', input: { status: 'awaiting_review' }, label: 'أعمال الوكلاء بانتظار المراجعة', render: 'office_runs' }];
  if (/(شغل|نفذ|run|start)/.test(n) && isAgent) {
    const agents = O.listAgents(user);
    let { matches } = matchByName(agents, clause, (a) => a.name);
    if (matches.length !== 1) ({ matches } = matchByName(agents, clause, (a) => a.name.split(' — ')[0]));
    const a = matches.length === 1 ? matches[0] : agents.length === 1 ? agents[0] : null;
    if (!a) return [{ ask: agents.length ? 'أي وكيل تريد تشغيله؟' : 'لا يوجد لديك وكلاء بعد. قل مثلاً: «ابنِ وكيلاً يجهّز ملخص اليوم كل صباح».', options: agents.slice(0, 6).map((x) => ({ label: x.name, value: `شغّل وكيل ${x.name}` })) }];
    return [{ tool: 'run_office_agent', input: { id: a.id }, label: `تشغيل الوكيل «${a.name}» لتحضير العمل` }];
  }
  if (!/(ابن|انشي|انشئ|اضف|ضيف|سو|اعمل|جهز لي وكيل|ابغي وكيل|اريد وكيل|build|create|make|add)/.test(n)) return null;
  let template = null; const config = {};
  const createsTask = /(ينشي|ينشئ|يضيف|يسجل|creates?|adds?) ?(لي )?(مهمه|task)/.test(n);
  if (createsTask) template = 'recurring_task_pending';
  else if (/(ملخص|موجز|summary|brief)/.test(n)) template = 'daily_briefing';
  else if (/(تقرير|report)/.test(n) && /(متاخر|delayed)/.test(n)) template = 'delayed_report';
  else if (/(متاخر|تصعيد|overdue|escalat)/.test(n) && /(مهام|المهام|tasks)/.test(n)) { template = 'overdue_escalation'; config.scope = /(الفريق|فريقي|الاداره|team)/.test(n) && user.role !== 'employee' ? 'team' : 'mine'; }
  else if (/(نسب|نسبه|تقدم|انجاز|progress)/.test(n)) { template = 'progress_followup'; const m = digits(clause).match(/(\d+)\s*(?:يوم|ايام|days)/); if (m) config.stale_days = +m[1]; }
  else if (/(خطه|plan)/.test(n) && /(اسبوع|week)/.test(n)) template = 'weekly_plan';
  if (template === 'recurring_task_pending' || (!template && /(مهمه|task)/.test(n))) {
    template = null;
    const title = extractName(clause, /(?:مهم(?:ة|ه)|task)\s*(?:بعنوان|اسمها|:)?\s*[«"“']?(.+?)[»"”']?(?=\s+(?:كل|يومي|أسبوعي|اسبوعي|ايام|أيام|الساعة|الساعه|every|daily|weekly)|[،,]|$)/i);
    if (!title) return [{ ask: 'ما عنوان المهمة التي يكررها الوكيل؟ مثال: «ابنِ وكيلاً ينشئ مهمة رفع التقرير الأسبوعي كل خميس».' }];
    template = 'recurring_task'; config.title = title;
    if (/(عاجل|urgent)/.test(n)) config.priority = 'urgent'; else if (/(عالي|high)/.test(n)) config.priority = 'high';
  } else if (!template && resolveAI('chat').provider.kind !== 'local') { template = 'custom'; config.instructions = clause; }
  if (!template) {
    return [{ ask: 'ما العمل الذي تريد أن يحضّره الوكيل بشكل متكرر؟ (يعمل الوكيل ثم ينتظر مراجعتك وموافقتك قبل التنفيذ)', options: [
      { label: 'ملخص يومي', value: 'ابنِ وكيلاً يجهّز ملخص اليوم كل صباح الساعة 7' },
      { label: 'تقرير المشاريع المتأخرة أسبوعياً', value: 'ابنِ وكيلاً يجهّز تقرير المشاريع المتأخرة كل أحد الساعة 8' },
      { label: 'متابعة المهام المتأخرة', value: 'ابنِ وكيلاً لمتابعة المهام المتأخرة أيام العمل الساعة 9' },
      { label: 'متابعة تحديث النسب', value: 'ابنِ وكيلاً لمتابعة تحديث نسب الإنجاز كل أسبوع' },
      { label: 'خطة الأسبوع', value: 'ابنِ وكيلاً يجهّز خطة الأسبوع كل أحد الساعة 7' },
    ] }];
  }
  const sched = parseSchedule(n, ctx.ui.tzOffset);
  const schedule = sched ? { type: sched.type, time: sched.time, day: sched.day, tz_offset: sched.tz_offset } : { type: 'manual', tz_offset: ctx.ui.tzOffset };
  const nameMatch = extractName(clause, /(?:باسم|اسمه|named|called)\s*[«"“']?(.+?)[»"”']?(?=\s|$)/i);
  const name = nameMatch || O.TEMPLATES[template].name_ar + (config.title ? ` — ${config.title}` : '');
  return [{ tool: 'create_office_agent', input: { name, template, config, schedule }, label: `بناء الوكيل «${name}» (${SCHED_AR(schedule)})`, officeNoSchedule: !sched, officeDefaultTime: sched && !sched.explicitTime }];
}
