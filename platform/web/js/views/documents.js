// Documents library (#/documents): search, kind filter, sort, Ask AI templates,
// export, deep links (#/documents/:id) and the «موثّق» badge. Points shown here
// always come from GET /api/game/me — never computed on the client.
import { api } from '../api.js';
import { h, icon, modal, menu, toast, skeleton, emptyState, errorState, segmented, field, debounce } from '../ui.js';
import { L, t, fmtDate, fmtNum } from '../i18n.js';
import { state, on } from '../state.js';
import { runTool, undo } from '../widgets.js';
import { celebrate, current as gameNow } from '../game.js';
import * as Editor from '../editor.js';
import * as Chat from '../chat.js';

const { KINDS, kindMeta, kindLabel, kindGlyph, whenText, fullDate } = Editor;
// Kinds the server's «document» rule rewards (server/services/game.js). The
// point value itself is read from /api/game/me → rules.
const REWARDED = ['report', 'plan', 'minutes', 'letter'];

// view state survives the soft re-renders triggered by realtime updates
const ui = { q: '', kind: 'all', sort: 'updated', dir: 'desc' };
let seen = null; // ids shown last time → spot documents that just appeared
let lastGame = null;
const changedAt = new Map();
on('document-changed', (ev) => { if (ev?.id) changedAt.set(ev.id, Date.now()); });
on('document-open', ({ id } = {}) => {
  document.querySelectorAll('.docs-table tr[data-doc-id]').forEach((tr) => {
    const open = tr.dataset.docId === id;
    tr.classList.toggle('selected', open);
    const name = tr.querySelector('.doc-name');
    if (open) name?.setAttribute('aria-current', 'true'); else name?.removeAttribute('aria-current');
  });
});

const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const docPoints = (g) => { const r = g?.rules?.find((x) => x.key === 'document'); return r && g.today_xp < g.daily_cap ? r.points : null; };
const ptsChip = (n, cls = '') => h(`span.chip.tiny.purple.docs-pts${cls}`, { title: L(`+${n} نقاط تميّز عند الإنشاء`, `+${n} excellence points when created`) }, icon('zap'), h('span.num', `+${fmtNum(n)}`));
const openDoc = (id, e) => Editor.open(id, { focus: e?.detail === 0 }); // keyboard activation → move focus into the editor

// ---------------------------------------------------------------- page
export async function renderDocuments(root, params = [], { soft = false } = {}) {
  const page = h('div.docs-page');
  root.append(page);
  if (params[0] && !soft && state.openDocumentId !== params[0]) Editor.open(params[0]); // deep link
  const load = () => Promise.all([api('/api/documents'), api('/api/game/me').catch(() => null)]);
  const hadFocus = document.activeElement?.id === 'docs-search' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  if (soft) {
    const [docs, g] = await load();
    draw(page, docs, g, { soft: true });
    if (hadFocus) requestAnimationFrame(() => { const i = page.querySelector('#docs-search'); i?.focus({ preventScroll: true }); i?.setSelectionRange(...hadFocus); });
    return;
  }
  draw(page, null, lastGame);
  const go = () => load().then(([docs, g]) => draw(page, docs, g)).catch((e) => {
    page.querySelector('.docs-lib')?.replaceChildren(errorState(e, () => { page.querySelector('.docs-lib')?.replaceChildren(h('div.docs-lib-loading', skeleton('table', 4))); go(); }));
  });
  go();
}

function draw(page, docs, g, { soft = false } = {}) {
  if (g) lastGame = g;
  const pts = docPoints(g);
  const fresh = new Set();
  if (docs && seen) for (const d of docs) if (!seen.has(d.id)) fresh.add(d.id);
  if (docs) seen = new Set(docs.map((d) => d.id));
  const today = g?.heat?.at(-1)?.day;
  const earned = new Map((g?.recent || []).filter((e) => e.entity === 'document' && e.day === today && e.points > 0).map((e) => [e.id, e.points]));

  page.replaceChildren(
    head(docs),
    h('div.docs-top', templates(pts), g ? badge(g) : null),
    library(docs, { fresh, earned }));

  // a document that just appeared and earned points today → a small burst on its chip,
  // unless the sidebar level chip (which celebrates globally) is on screen
  if (soft) {
    const hit = [...fresh].find((id) => earned.has(id));
    const side = document.querySelector('#level-chip-host .level-chip')?.getBoundingClientRect();
    if (hit && (!side || side.width === 0)) requestAnimationFrame(() => celebrate(page.querySelector(`tr[data-doc-id="${CSS.escape(hit)}"] .docs-pts`)));
  }
}

function head(docs) {
  return h('header.page-head.docs-head',
    h('div.docs-head-text',
      h('span.eyebrow', L('مكتبة المستندات', 'Document library')),
      h('h1', L('المستندات', 'Documents'), docs ? h('span.docs-count.num', fmtNum(docs.length)) : null),
      h('p.sub', L('تقاريرك وخططك ومحاضرك وخطاباتك في مكان واحد — تُحفظ تلقائياً بإصدارات، وتُصدَّر إلى Word وPDF بنقرة.', 'Your reports, plans, minutes and letters in one place — autosaved with versions, exported to Word and PDF in a click.'))),
    h('div.actions', h('button.btn.primary.lg', { type: 'button', onclick: () => newDoc() }, icon('filePlus'), L('مستند جديد', 'New document'))));
}

// ---------------------------------------------------------------- Ask AI templates
const TEMPLATES = [
  { key: 'delayed', kind: 'report', ar: 'تقرير المشاريع المتأخرة', en: 'Delayed projects report', sub_ar: 'يُنشأ فوراً من بيانات مشاريعك', sub_en: 'Built instantly from your project data', busy_ar: 'جارٍ إنشاء التقرير…', busy_en: 'Building the report…',
    prompt: () => L('ابنِ تقريراً عن المشاريع المتأخرة', 'Build a report on delayed projects') },
  { key: 'plan', kind: 'plan', ar: 'خطة عمل…', en: 'Work plan…', sub_ar: 'حدّد الموضوع ويكتب Ask AI المسودة', sub_en: 'Name the topic; Ask AI drafts it',
    title_ar: 'خطة عمل بمساعدة Ask AI', title_en: 'Work plan with Ask AI',
    fields: [{ ar: 'موضوع الخطة', en: 'What is the plan for?', ph_ar: 'مثال: إطلاق خدمة التجديد الإلكتروني خلال الربع القادم', ph_en: 'e.g. launching e-renewal next quarter', helper_ar: 'اختياري — اتركه فارغاً لخطة عمل عامة.', helper_en: 'Optional — leave empty for a general work plan.' }],
    build: ([topic]) => (topic ? L(`اكتب خطة ${topic}`, `Write a plan for ${topic}`) : L('اكتب خطة عمل', 'Write a work plan')) },
  { key: 'minutes', kind: 'minutes', ar: 'محضر اجتماع…', en: 'Meeting minutes…', sub_ar: 'ألصق ملاحظاتك ليصوغها محضراً رسمياً', sub_en: 'Paste your notes; get formal minutes',
    title_ar: 'محضر اجتماع بمساعدة Ask AI', title_en: 'Meeting minutes with Ask AI',
    fields: [{ ar: 'ملاحظات الاجتماع', en: 'Meeting notes', multiline: true, ph_ar: 'النقاط التي نوقشت، القرارات، المسؤولون والمواعيد…', ph_en: 'Points discussed, decisions, owners and dates…' }],
    build: ([notes]) => (notes ? L(`جهّز محضر اجتماع: ${notes}`, `Prepare meeting minutes: ${notes}`) : L('جهّز محضر اجتماع', 'Prepare meeting minutes')) },
  { key: 'letter', kind: 'letter', ar: 'خطاب رسمي…', en: 'Official letter…', sub_ar: 'حدّد الجهة والموضوع', sub_en: 'Set the recipient and subject',
    title_ar: 'خطاب رسمي بمساعدة Ask AI', title_en: 'Official letter with Ask AI',
    fields: [{ ar: 'إلى', en: 'To', ph_ar: 'مثال: مدير إدارة الموارد البشرية', ph_en: 'e.g. Director of Human Resources' }, { ar: 'بخصوص', en: 'Regarding', ph_ar: 'مثال: طلب تمديد موعد تسليم المشروع', ph_en: 'e.g. extending the project deadline' }],
    build: ([to, subject]) => L(`اكتب خطاباً${to ? ` إلى ${to}` : ''}${subject ? ` بخصوص ${subject}` : ''}`, `Write a letter${to ? ` to ${to}` : ''}${subject ? ` regarding ${subject}` : ''}`) },
];

function templates(pts) {
  return h('section.docs-ai', { 'aria-labelledby': 'docs-ai-title' },
    h('div.docs-ai-head',
      h('h2#docs-ai-title', icon('spark'), L('ابدأ بمساعدة Ask AI', 'Start with Ask AI')),
      h('p', L('يكتب المسودة من بياناتك الفعلية ثم تُفتح في المحرر لتعدّلها.', 'Drafts from your real data, then opens in the editor for you to refine.'))),
    h('div.docs-tpls', TEMPLATES.map((tp) => {
      const btn = h('button.card.interactive.docs-tpl', { type: 'button', 'data-kind': tp.kind, onclick: () => (tp.fields ? guided(tp) : instant(btn, tp)) },
        h('span.tpl-top', kindGlyph(tp.kind, 'lg'), pts && REWARDED.includes(tp.kind) ? ptsChip(pts) : null),
        h('span.tpl-title', L(tp.ar, tp.en)),
        h('span.tpl-sub', L(tp.sub_ar, tp.sub_en)));
      return btn;
    })));
}

async function instant(btn, tp) {
  if (btn.classList.contains('is-busy')) return;
  const sub = btn.querySelector('.tpl-sub'); const was = sub.textContent;
  btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
  sub.replaceChildren(h('span.spinner', { 'aria-hidden': 'true' }), L(tp.busy_ar, tp.busy_en));
  try { await Chat.send(tp.prompt()); } finally { btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); sub.textContent = was; }
}

async function guided(tp) {
  const controls = tp.fields.map((f) => (f.multiline ? h('textarea.field', { rows: 5, placeholder: L(f.ph_ar, f.ph_en) }) : h('input.field', { placeholder: L(f.ph_ar, f.ph_en), autocomplete: 'off' })));
  const body = h('div.docs-guided',
    h('div.docs-guided-lead', kindGlyph(tp.kind, 'lg'), h('p', L('أعطِ Ask AI التفاصيل التي تعرفها — يكتب المسودة ويفتحها في المحرر، وتبقى كل التعديلات بعدها بيدك.', 'Give Ask AI what you know — it drafts the document and opens it in the editor; every change after that is yours.'))),
    tp.fields.map((f, i) => field(L(f.ar, f.en), controls[i], { helper: f.helper_ar ? L(f.helper_ar, f.helper_en) : null })));
  const ok = await modal(L(tp.title_ar, tp.title_en), body, [{ label: t('cancel'), value: false }, { label: L('اكتب المسودة', 'Draft it'), value: true, primary: true, icon: 'spark' }]);
  if (!ok) return;
  Chat.send(tp.build(controls.map((c) => c.value.trim().replace(/\s+/g, ' '))));
}

// ---------------------------------------------------------------- badge «موثّق»
function badge(g) {
  const b = g.badges?.find((x) => x.key === 'documented');
  if (!b) return null;
  const rule = g.rules?.find((r) => r.key === 'document');
  const left = Math.max(0, b.need - b.have);
  const text = b.earned
    ? L('حصلت على الشارة — استمر في توثيق عملك.', 'Badge earned — keep documenting your work.')
    : left === 1 ? L('مستند واحد يفصلك عن الشارة.', 'One more document to earn it.') : L(`${fmtNum(left)} مستندات تفصلك عن الشارة.`, `${fmtNum(left)} more documents to earn it.`);
  return h(`aside.card.docs-badge${b.earned ? '.earned' : ''}`, { 'aria-labelledby': 'docs-badge-title' },
    h('div.badge-medal', { 'aria-hidden': 'true' }, icon(b.icon || 'fileCheck')),
    h('div.docs-badge-body',
      h('span.eyebrow', b.earned ? L('شارة مكتسبة', 'Badge earned') : L('الشارة التالية', 'Next badge')),
      h('h2#docs-badge-title', L(`«${b.ar}»`, `“${b.en}”`)),
      h('p', text),
      h('div.progress.xp-bar', { role: 'progressbar', 'aria-valuenow': b.progress, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L(`التقدم نحو شارة «${b.ar}»`, `Progress to “${b.en}”`) }, h('i', { style: { width: `${b.progress}%` } })),
      h('div.docs-badge-foot',
        h('span.num.tabular', `${fmtNum(Math.min(b.have, b.need))} / ${fmtNum(b.need)}`),
        rule ? h('span.grow', L(`+${fmtNum(rule.points)} نقاط لكل تقرير أو خطة أو محضر أو خطاب`, `+${fmtNum(rule.points)} pts per report, plan, minutes or letter`)) : null,
        h('a', { href: '#/achievements' }, L('إنجازاتي', 'Achievements')))));
}

// ---------------------------------------------------------------- library
function library(docs, marks) {
  const card = h('section.card.docs-lib', { 'aria-labelledby': 'docs-lib-title' });
  if (!docs) { card.append(h('div.docs-lib-loading', skeleton('table', 4))); return card; }
  if (!docs.length) {
    card.append(emptyState({ icon: 'fileText', title: L('لا مستندات بعد', 'No documents yet'),
      body: L('ابدأ بمستند فارغ، أو اختر قالباً من «ابدأ بمساعدة Ask AI» ليكتب لك المسودة من بياناتك.', 'Start from a blank document, or pick a template under “Start with Ask AI” to get a draft from your data.'),
      actions: [{ label: L('مستند جديد', 'New document'), icon: 'filePlus', primary: true, onClick: () => newDoc() }, { label: L('اطلب من Ask AI', 'Ask Ask AI'), icon: 'spark', tertiary: true, onClick: () => Chat.focus() }] }));
    return card;
  }
  const counts = {}; for (const d of docs) counts[d.kind] = (counts[d.kind] || 0) + 1;
  if (ui.kind !== 'all' && !counts[ui.kind]) ui.kind = 'all';
  const result = h('span.docs-result');
  const slot = h('div.docs-table-slot');
  const search = h('input.field#docs-search', { type: 'search', value: ui.q, placeholder: L('ابحث في العناوين…', 'Search titles…'), 'aria-label': L('ابحث في المستندات', 'Search documents'), autocomplete: 'off',
    oninput: debounce((e) => { ui.q = e.target.value; redraw(); }, 120),
    onkeydown: (e) => { if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.target.value = ''; ui.q = ''; redraw(); } } });
  const sortBtn = h('button.btn.sm.ghost.docs-sort', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => sortMenu(e.currentTarget, redraw) });
  const kinds = segmented([['all', L('الكل', 'All'), fmtNum(docs.length)], ...Object.keys(KINDS).filter((k) => counts[k]).map((k) => [k, L(kindMeta(k).par, kindMeta(k).pen), fmtNum(counts[k])])], ui.kind, (v) => { ui.kind = v; redraw(); }, { label: L('تصفية حسب النوع', 'Filter by type') });
  kinds.classList.add('docs-kinds-filter');

  function redraw() {
    const nq = norm(ui.q.trim());
    const rows = docs.filter((d) => (ui.kind === 'all' || d.kind === ui.kind) && (!nq || norm(d.title).includes(nq) || norm(kindLabel(d.kind)).includes(nq)));
    const dir = ui.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => dir * (ui.sort === 'title' ? a.title.localeCompare(b.title, 'ar') : String(a.updated_at).localeCompare(String(b.updated_at))));
    result.textContent = rows.length === docs.length ? L(`${fmtNum(docs.length)} ${docs.length === 1 ? 'مستند' : docs.length === 2 ? 'مستندان' : docs.length < 11 ? 'مستندات' : 'مستنداً'}`, `${fmtNum(docs.length)} ${docs.length === 1 ? 'document' : 'documents'}`) : L(`${fmtNum(rows.length)} من ${fmtNum(docs.length)}`, `${fmtNum(rows.length)} of ${fmtNum(docs.length)}`);
    sortBtn.replaceChildren(icon('sort', 'sm'), h('span', SORTS.find((s) => s.key === ui.sort && s.dir === ui.dir)?.short()));
    slot.replaceChildren(rows.length ? table(rows, marks, redraw) : emptyState({ compact: true, icon: 'search', title: L('لا نتائج مطابقة', 'No matching documents'),
      body: ui.q.trim() ? L(`لا يوجد مستند عنوانه يطابق «${ui.q.trim()}»${ui.kind !== 'all' ? ` ضمن ${kindMeta(ui.kind).par}` : ''}.`, `No document title matches “${ui.q.trim()}”${ui.kind !== 'all' ? ` in ${kindMeta(ui.kind).pen.toLowerCase()}` : ''}.`) : L('لا مستندات من هذا النوع بعد.', 'No documents of this type yet.'),
      actions: [{ label: L('مسح البحث والتصفية', 'Clear search & filter'), icon: 'x', onClick: () => { ui.q = ''; ui.kind = 'all'; search.value = ''; kinds.querySelector('button[data-v="all"]')?.click(); redraw(); } }] }));
  }
  card.append(
    h('div.docs-lib-head',
      h('h2#docs-lib-title', L('كل المستندات', 'All documents'), result),
      h('div.search-field.docs-search', icon('search'), search),
      sortBtn),
    h('div.docs-filters', kinds),
    slot);
  redraw();
  return card;
}

const SORTS = [
  { key: 'updated', dir: 'desc', label: () => L('آخر تعديل — الأحدث أولاً', 'Last edited — newest first'), short: () => L('الأحدث', 'Newest') },
  { key: 'updated', dir: 'asc', label: () => L('آخر تعديل — الأقدم أولاً', 'Last edited — oldest first'), short: () => L('الأقدم', 'Oldest') },
  { key: 'title', dir: 'asc', label: () => L('العنوان — أ إلى ي', 'Title — A to Z'), short: () => L('أ ← ي', 'A → Z') },
  { key: 'title', dir: 'desc', label: () => L('العنوان — ي إلى أ', 'Title — Z to A'), short: () => L('ي ← أ', 'Z → A') },
];
function sortMenu(anchor, redraw) {
  menu(anchor, [{ title: L('ترتيب حسب', 'Sort by') }, ...SORTS.map((s) => ({ label: s.label(), checked: ui.sort === s.key && ui.dir === s.dir, onClick: () => { ui.sort = s.key; ui.dir = s.dir; redraw(); } }))], { width: 250 });
}

function table(rows, { fresh, earned }, redraw) {
  const sortTh = (key, label, cls, first) => {
    const on = ui.sort === key;
    const act = () => { if (on) ui.dir = ui.dir === 'asc' ? 'desc' : 'asc'; else { ui.sort = key; ui.dir = first; } redraw(); };
    return h(`th.sortable.${cls}`, { scope: 'col', tabindex: 0, 'aria-sort': on ? (ui.dir === 'asc' ? 'ascending' : 'descending') : 'none', onclick: act, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } } },
      label, h('span.sort-ind', icon(on ? (ui.dir === 'asc' ? 'sortUp' : 'sortDown') : 'sort', 'sm')));
  };
  const now = Date.now();
  return h('div.table-wrap.docs-table',
    h('table.tbl',
      h('caption.sr-only', L('المستندات — افتح أي مستند لتحريره في اللوحة الجانبية', 'Documents — open one to edit it in the side panel')),
      h('thead', h('tr',
        sortTh('title', L('العنوان', 'Title'), 'c-title', 'asc'),
        h('th.c-kind', { scope: 'col' }, L('النوع', 'Type')),
        h('th.c-ver', { scope: 'col' }, L('الإصدار', 'Version')),
        sortTh('updated', L('آخر تعديل', 'Last edited'), 'c-date', 'desc'),
        h('th.c-act', { scope: 'col' }, h('span.sr-only', L('إجراءات', 'Actions'))))),
      h('tbody', rows.map((d) => {
        const open = state.openDocumentId === d.id;
        const isNew = fresh.has(d.id);
        const flash = isNew || now - (changedAt.get(d.id) || 0) < 8000;
        const pts = earned.get(d.id);
        return h(`tr.clickable${open ? '.selected' : ''}${flash ? '.is-new' : ''}`, { 'data-doc-id': d.id, onclick: (e) => { if (!e.target.closest('a, button')) openDoc(d.id); } },
          h('td.c-title', h('div.doc-cell', kindGlyph(d.kind),
            h('div.doc-cell-text',
              h('div.doc-line',
                h('button.doc-name', { type: 'button', 'aria-current': open ? 'true' : null, onclick: (e) => openDoc(d.id, e) }, d.title),
                isNew ? h('span.chip.tiny.info', L('جديد', 'New')) : null,
                pts ? ptsChip(pts) : null),
              h('div.doc-sub', `${kindLabel(d.kind)} · v${d.current_version} · ${whenText(d.updated_at)}`)))),
          h('td.c-kind', h('span.chip.tiny', kindLabel(d.kind))),
          h('td.c-ver', h('span.doc-ver.num', `v${d.current_version}`)),
          h('td.c-date', h('time', { datetime: String(d.updated_at || '').replace(' ', 'T'), title: fullDate(d.updated_at) }, whenText(d.updated_at))),
          h('td.c-act', h('div.row-actions',
            h('button.icon-btn.docs-export-btn', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': L(`تصدير «${d.title}»`, `Export “${d.title}”`), onclick: (e) => exportMenu(e.currentTarget, d) }, icon('download')),
            h('button.icon-btn', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': L(`خيارات «${d.title}»`, `Options for “${d.title}”`), onclick: (e) => rowMenu(e.currentTarget, d) }, icon('more')))));
      }))));
}

const exportItems = (d) => [
  { label: 'Word (.docx)', icon: 'fileDown', href: `/api/documents/${d.id}/export.docx` },
  { label: 'PDF', icon: 'fileDown', href: `/api/documents/${d.id}/export.pdf` },
];
function exportMenu(anchor, d) { menu(anchor, [{ title: L('تنزيل نسخة', 'Download a copy') }, ...exportItems(d)], { width: 210 }); }
function rowMenu(anchor, d) {
  menu(anchor, [
    { label: L('فتح في المحرر', 'Open in editor'), icon: 'pencil', onClick: () => openDoc(d.id) },
    { label: L('اسأل Ask AI عن المستند', 'Ask AI about it'), icon: 'spark', onClick: async () => { await Editor.open(d.id); Chat.focus(); } },
    { label: L('نسخ الرابط', 'Copy link'), icon: 'link', onClick: () => copyLink(d) },
    { sep: true },
    { title: L('تنزيل نسخة', 'Download a copy') },
    ...exportItems(d),
  ], { width: 240 });
}
async function copyLink(d) {
  const url = `${location.origin}${location.pathname}#/documents/${d.id}`;
  try { await navigator.clipboard.writeText(url); toast(L(`نُسخ رابط «${d.title}» — يفتحه من لديه صلاحية الوصول فقط`, `Copied the link to “${d.title}” — only people with access can open it`)); }
  catch { toast(L('تعذّر النسخ — انسخ الرابط من شريط العنوان بعد فتح المستند.', "Couldn't copy — open the document and copy the address bar."), { kind: 'error' }); }
}

// ---------------------------------------------------------------- new document
export async function newDoc() {
  const pts = docPoints(lastGame || gameNow());
  let kind = 'report';
  const suggest = (k) => `${kindLabel(k)} — ${fmtDate(new Date().toISOString())} ${new Date().getFullYear()}`;
  const title = h('input.field', { placeholder: suggest(kind), maxlength: 200, autocomplete: 'off' });
  const kinds = h('div.docs-kinds', { role: 'radiogroup', 'aria-label': L('نوع المستند', 'Document type') },
    Object.keys(KINDS).map((k) => h('label.docs-kind', { 'data-kind': k },
      h('input', { type: 'radio', name: 'doc-kind', value: k, checked: k === kind || null, onchange: () => { kind = k; title.placeholder = suggest(k); } }),
      kindGlyph(k, 'sm'), h('span.k-name', kindLabel(k)),
      pts && REWARDED.includes(k) ? ptsChip(pts, '.docs-kind-pts') : null)));
  const ok = await modal(L('مستند جديد', 'New document'),
    h('div.docs-new',
      field(L('العنوان', 'Title'), title, { helper: L('اتركه فارغاً لاستخدام العنوان المقترح.', 'Leave empty to use the suggested title.') }),
      h('div.lbl', { id: 'docs-kind-lbl' }, L('النوع', 'Type')), kinds,
      pts ? h('p.docs-new-note', icon('zap', 'sm'), L(`التقارير والخطط والمحاضر والخطابات تمنحك +${fmtNum(pts)} نقاط تميّز.`, `Reports, plans, minutes and letters earn +${fmtNum(pts)} excellence points.`)) : null),
    [{ label: t('cancel'), value: false }, { label: L('إنشاء وفتح', 'Create & open'), value: true, primary: true }]);
  if (!ok) return;
  const name = title.value.trim() || suggest(kind);
  const r = await runTool('create_document', { title: name, kind, content_html: '<p></p>' }, { quiet: true });
  if (!r?.result?.id) return;
  toast(L(`أُنشئ «${name}» وفُتح في المحرر`, `Created “${name}” — it's open in the editor`), r.undoable && r.actionId ? { action: t('undo'), onAction: () => undo(r.actionId) } : {});
  Editor.open(r.result.id, { focus: true });
}
