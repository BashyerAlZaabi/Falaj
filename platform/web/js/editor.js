// Document inspector: a calm, paper-like writing surface next to Ask AI.
// Edit/preview, autosave with a live saved state, version history (preview /
// one-step restore), DOCX/PDF export, sources, conflict recovery, realtime
// updates and a desktop focus mode. The same document is kept across all edits;
// every save goes through the server's version rules (base_version → 409).
import { api, rid } from './api.js';
import { h, $, icon, toast, modal, confirmDialog, menu, segmented, skeleton, errorState, isMac, debounce } from './ui.js';
import { t, L, fmtDate, fmtTime, fmtNum, getLang } from './i18n.js';
import { state, on, emit } from './state.js';
import { undo as undoAction } from './work-items.js';

// ---------- shared document metadata (also used by the documents library) ----------
export const KINDS = {
  report: { ar: 'تقرير', en: 'Report', par: 'تقارير', pen: 'Reports', icon: 'chartBar' },
  plan: { ar: 'خطة', en: 'Plan', par: 'خطط', pen: 'Plans', icon: 'listChecks' },
  minutes: { ar: 'محضر', en: 'Minutes', par: 'محاضر', pen: 'Minutes', icon: 'people' },
  letter: { ar: 'خطاب', en: 'Letter', par: 'خطابات', pen: 'Letters', icon: 'mail' },
  summary: { ar: 'ملخص', en: 'Summary', par: 'ملخصات', pen: 'Summaries', icon: 'sparkle' },
  note: { ar: 'ملاحظة', en: 'Note', par: 'ملاحظات', pen: 'Notes', icon: 'pencil' },
};
export const kindMeta = (k) => KINDS[k] || { ar: k || 'مستند', en: k || 'Document', par: k, pen: k, icon: 'fileText' };
export const kindLabel = (k) => { const m = kindMeta(k); return L(m.ar, m.en); };
export const kindGlyph = (k, size = '') => h(`span.doc-glyph${size ? '.' + size : ''}`, { 'data-kind': k, 'aria-hidden': 'true' }, icon(kindMeta(k).icon));

const parseTs = (s) => new Date(s.length === 10 ? `${s}T12:00:00Z` : s.endsWith('Z') || s.includes('+') ? s : `${s.replace(' ', 'T')}Z`);
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (s) => Math.round((dayStart(new Date()) - dayStart(parseTs(s))) / 864e5);
// "اليوم، 12:45" · "أمس، 09:10" · "الاثنين، 14:02" · "12 سبتمبر"
export function whenText(s) {
  if (!s) return '—';
  const n = daysAgo(s); const time = fmtTime(s);
  if (n === 0) return L(`اليوم، ${time}`, `Today, ${time}`);
  if (n === 1) return L(`أمس، ${time}`, `Yesterday, ${time}`);
  if (n > 1 && n < 7) return `${parseTs(s).toLocaleDateString(getLang() === 'ar' ? 'ar-AE' : 'en-GB', { weekday: 'long' })}${L('، ', ', ')}${time}`;
  const d = parseTs(s);
  return `${fmtDate(s)}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}
export const fullDate = (s) => (s ? `${fmtDate(s)} ${parseTs(s).getFullYear()} · ${fmtTime(s)}` : '');
const dayLabel = (s) => { const n = daysAgo(s); return n === 0 ? L('اليوم', 'Today') : n === 1 ? L('أمس', 'Yesterday') : `${fmtDate(s)} ${parseTs(s).getFullYear()}`; };

// ---------- module state ----------
let doc = null; let dirty = false; let preview = false; let saveTimer = null; let inflight = null;
let changedSinceVersion = false; let versionsOpen = false; let focusMode = false; let openSeq = 0; let lastSavedAt = null;
const panel = () => $('#editor');
const q = (sel) => panel().querySelector(sel);
const canEdit = () => doc && doc.access !== 'view';
export const currentTitle = () => doc?.title;

export function init() {
  on('document-changed', async (ev) => {
    if (!doc || ev?.id !== doc.id) return;
    if (inflight) await inflight; // our own save may echo back before its response
    if (!doc || ev.id !== doc.id) return;
    if (ev.version && ev.version <= doc.current_version) return;
    if (dirty) {
      showBanner({ kind: 'info', ic: 'refresh', text: L('وصل إصدار أحدث من هذا المستند (من Ask AI أو جهاز آخر).', 'A newer version of this document arrived (from Ask AI or another device).'),
        actions: [{ label: L('تحميل الأحدث', 'Load latest'), primary: true, run: () => open(doc.id, { force: true, discard: true }) }, { label: L('متابعة التحرير', 'Keep editing'), run: () => {} }] });
      return;
    }
    await open(doc.id, { force: true, silent: true });
    const paper = q('.ed-paper'); if (paper) { paper.classList.remove('flash'); void paper.offsetWidth; paper.classList.add('flash'); }
  });
  document.addEventListener('selectionchange', syncToolbar);
  window.addEventListener('beforeunload', (e) => { if (doc && (dirty || inflight)) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) flush(); });
}

// ---------- open / close ----------
export async function open(id, { force = false, silent = false, focus = false, discard = false } = {}) {
  if (!id) return;
  const same = doc?.id === id;
  if (doc && !same && !discard && (dirty || inflight)) {
    const ok = await flush();
    if (!ok && dirty) { saveFailedBanner(() => open(id, { force, silent, focus })); return; }
  }
  const seq = ++openSeq;
  if (!same && !silent) {
    clearTimeout(saveTimer);
    doc = null; dirty = false; state.openDocumentId = id;
    reveal(true); renderLoading();
  }
  let d;
  try { d = await api(`/api/documents/${id}`); } catch (e) {
    if (seq !== openSeq) return;
    if (e.status === 404 && (same || silent)) {
      toast(L('لم يعد هذا المستند متاحاً — ربما حُذف أو أُلغي إنشاؤه.', 'This document is no longer available — it may have been deleted.'), { kind: 'info' });
      close({ discard: true });
      return;
    }
    if (!same && !silent) { renderError(e, () => open(id, { force, focus })); return; }
    toast(e.message, { kind: 'error' });
    return;
  }
  if (seq !== openSeq) return;
  if (!same) { changedSinceVersion = false; preview = false; }
  const prevVersion = doc?.current_version;
  doc = d; dirty = false; state.openDocumentId = id; lastSavedAt = d.updated_at;
  reveal(!silent);
  if (!same || force || d.current_version !== prevVersion) render({ focus }); else if (focus) focusEditor();
  emit('document-open', { id });
  import('./chat.js').then((c) => c.refreshContext());
}

function reveal(showTab) {
  panel().classList.remove('collapsed'); document.body.classList.add('editor-open');
  if (showTab && window.innerWidth <= 900) import('./app.js').then((m) => m.setTab('doc'));
}

export async function close({ discard = false } = {}) {
  if (doc && !discard && (dirty || inflight)) {
    const ok = await flush();
    if (!ok && dirty) { saveFailedBanner(() => close()); return false; }
  }
  const id = doc?.id || state.openDocumentId;
  const hadFocus = panel().contains(document.activeElement);
  clearTimeout(saveTimer); ++openSeq;
  doc = null; dirty = false; versionsOpen = false; focusMode = false; state.openDocumentId = null;
  panel().classList.add('collapsed'); document.body.classList.remove('editor-open', 'editor-focus'); panel().replaceChildren();
  if (window.innerWidth <= 900) import('./app.js').then((m) => m.setTab('home'));
  emit('document-open', { id: null });
  import('./chat.js').then((c) => c.refreshContext());
  if (hadFocus) {
    const row = id && document.querySelector(`tr[data-doc-id="${CSS.escape(id)}"] .doc-name`);
    (row || $('#view'))?.focus({ preventScroll: true });
  }
  return true;
}

function saveFailedBanner(retry) {
  showBanner({ kind: 'warn', ic: 'circleAlert', text: L('تعذّر حفظ آخر تعديلاتك، لذلك أبقينا المستند مفتوحاً حتى لا تضيع.', "Your latest edits couldn't be saved, so the document stays open."),
    actions: [{ label: L('إعادة المحاولة', 'Try again'), primary: true, run: retry }, { label: L('إغلاق دون حفظ', 'Close without saving'), run: () => close({ discard: true }) }] });
}

// ---------- rendering ----------
const closeButton = () => h('button.icon-btn', { type: 'button', 'aria-label': t('close'), onclick: () => close() }, icon('x'));

function renderLoading() {
  panel().replaceChildren(h('div.ed-root', { 'aria-busy': 'true' },
    h('div.panel-head.ed-head', closeButton(), h('h3.ed-crumb', h('span.sk.ed-sk-crumb'))),
    h('div.ed-main', h('div.ed-scroll', h('div.ed-paper', h('div.sk.sk-title'), skeleton('card'), skeleton('card'))))));
}

function renderError(e, retry) {
  panel().replaceChildren(h('div.ed-root',
    h('div.panel-head.ed-head', closeButton(), h('h3.ed-crumb', L('المستند', 'Document'))),
    h('div.ed-main', h('div.ed-scroll', h('div.ed-paper.ed-paper-state', errorState(e, retry))))));
}

function render({ focus = false } = {}) {
  const editable = canEdit();
  const isPreview = preview || !editable;
  const k = kindMeta(doc.kind);
  const prevScroll = q('.ed-scroll')?.scrollTop || 0;

  // header: close · kind · edit/preview · history · focus mode
  const mode = editable
    ? segmented([['edit', L('تحرير', 'Edit')], ['preview', L('معاينة', 'Preview')]], preview ? 'preview' : 'edit', (v) => setPreview(v === 'preview'), { label: L('وضع العرض', 'View mode') })
    : h('span.chip.tiny', { title: L('لديك صلاحية اطلاع فقط على هذا المستند', 'You have view-only access to this document') }, icon('lock'), L('اطلاع فقط', 'View only'));
  mode.classList.add('ed-mode');
  const head = h('div.panel-head.ed-head',
    closeButton(),
    h('h3.ed-crumb', kindGlyph(doc.kind, 'sm'), h('span.truncate', L(k.ar, k.en))),
    mode,
    h(`button.icon-btn.ed-hist${versionsOpen ? '.active' : ''}`, { type: 'button', title: L('سجل الإصدارات', 'Version history'), 'aria-expanded': String(versionsOpen), 'aria-controls': 'versions', onclick: toggleVersions }, icon('history')),
    h('button.icon-btn.ed-focus-btn', { type: 'button', 'aria-pressed': String(focusMode), 'aria-label': L('وضع التركيز', 'Focus mode'), onclick: toggleFocus }, icon(focusMode ? 'shrink' : 'expand')));

  // status bar: saved state · version · words … Ask AI · save version · export
  const bar = h('div.ed-bar',
    h('div.ed-state',
      h('span#doc-save.ed-save', { role: 'status', 'aria-live': 'polite' }),
      h('button.btn.sm.tertiary.ed-retry.hidden', { type: 'button', onclick: () => flush() }, icon('refresh'), L('إعادة المحاولة', 'Retry')),
      h('span.ed-ver.num', { title: L('الإصدار الحالي', 'Current version') }, `v${doc.current_version}`),
      h('span.ed-words')),
    h('div.ed-actions',
      editable ? h('button.btn.sm.ed-ai', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': L('اطلب من Ask AI تعديل المستند', 'Ask AI to edit this document'), onclick: (e) => aiMenu(e.currentTarget) }, icon('spark'), h('span.ed-ai-label', 'Ask AI')) : null,
      editable ? h('button.btn.sm.ed-version-btn#doc-version', { type: 'button', onclick: saveVersion, 'aria-keyshortcuts': isMac ? 'Meta+S' : 'Control+S' }, icon('fileCheck'), L('حفظ إصدار', 'Save version')) : null,
      h('div.ed-export', { role: 'group', 'aria-label': L('تصدير', 'Export') },
        h('a.btn.sm', { href: `/api/documents/${doc.id}/export.docx`, download: '', onclick: flushBeforeExport, 'aria-label': L('تنزيل بصيغة Word ‏(.docx)', 'Download as Word (.docx)') }, icon('download'), 'Word'),
        h('a.btn.sm', { href: `/api/documents/${doc.id}/export.pdf`, download: '', onclick: flushBeforeExport, 'aria-label': L('تنزيل بصيغة PDF', 'Download as PDF') }, 'PDF'))));

  // the page
  const body = h('div.doc-body', { contenteditable: String(!isPreview), spellcheck: 'true', dir: 'auto', role: 'textbox', 'aria-multiline': 'true', 'aria-readonly': String(isPreview), 'aria-label': L('متن المستند', 'Document body'), 'data-placeholder': L('ابدأ الكتابة هنا…', 'Start writing…'), html: doc.content_html });
  if (isPreview) body.classList.add('preview');
  body.addEventListener('input', () => { markDirty(); countWords(); });
  const title = h('input.doc-title', { value: doc.title, dir: 'auto', 'aria-label': L('عنوان المستند', 'Document title'), placeholder: L('عنوان المستند', 'Document title'), maxlength: 200, disabled: !editable || null, readonly: isPreview || null, autocomplete: 'off',
    oninput: markDirty, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!isPreview) body.focus(); } } });
  const meta = h('div.ed-meta', h('span', { title: fullDate(doc.updated_at) }, `${L('آخر تعديل', 'Updated')} ${whenText(doc.updated_at)}`));
  const sources = doc.sources?.length ? h('div.doc-sources', icon('database'), h('span', `${L('مبني على بيانات', 'Built from')}:`), doc.sources.map((s) => h('span.chip.tiny', { title: s.at ? fullDate(s.at) : null }, h('bdi', sourceLabel(s))))) : null;
  const paper = h('article.ed-paper', { 'aria-label': doc.title }, meta, title, sources, body);

  const scroller = h('div.ed-scroll', h('div.ed-banners'), !isPreview ? toolbar(body) : null, paper);
  const root = h(`div.ed-root${isPreview ? '.is-preview' : ''}`, { onkeydown: onRootKey },
    head, h('div.ed-main', bar, h('div.ed-stage', scroller, h('div.ed-scrim.hidden', { 'aria-hidden': 'true', onclick: () => hideVersions() }), versionsPane())));
  panel().replaceChildren(root);
  scroller.scrollTop = prevScroll;
  setStatus('saved');
  syncVersionBtn(); countWords(true); syncFocus();
  if (versionsOpen) { q('#versions').classList.remove('hidden'); q('.ed-scrim').classList.remove('hidden'); loadVersions(); }
  if (focus) focusEditor();
}

function focusEditor() {
  const body = q('.doc-body');
  if (body?.isContentEditable) body.focus({ preventScroll: true }); else q('.ed-head .icon-btn')?.focus();
}

function onRootKey(e) {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (canEdit()) saveVersion(); return; }
  if (e.key === 'Escape' && focusMode && !e.defaultPrevented) { e.preventDefault(); toggleFocus(); }
}

async function setPreview(v) {
  if (v === preview) return;
  if (!(await flush())) { // keep unsaved edits on screen rather than re-rendering over them
    q('.ed-mode')?.querySelectorAll('button').forEach((b) => { const on = (b.dataset.v === 'preview') === preview; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    toast(L('تعذّر حفظ تعديلاتك، لذلك بقيت في وضع التحرير. أعد المحاولة ثم بدّل الوضع.', "Your edits couldn't be saved, so you're still editing. Retry, then switch."), { kind: 'error' });
    return;
  }
  preview = v; render();
}

// ---------- formatting toolbar ----------
function toolbar(body) {
  const mod = isMac ? '⌘' : 'Ctrl+';
  const run = (fn) => (e) => { e.preventDefault(); body.focus(); fn(); markDirty(); countWords(); syncToolbar(); };
  const cmd = (c, v) => run(() => document.execCommand(c, false, v));
  const btn = (ic, label, key, onclick, st) => h('button.icon-btn', { type: 'button', 'aria-label': label, 'data-tip': key ? `${label} ${key}` : label, 'data-tip-pos': 'bottom', 'data-state': st || null, 'aria-pressed': st ? 'false' : null, 'aria-keyshortcuts': key ? key.replace('⌘', 'Meta+').replace('Ctrl+', 'Control+') : null, onmousedown: (e) => e.preventDefault(), onclick }, icon(ic));
  const table = run(() => document.execCommand('insertHTML', false, `<table><thead><tr><th>${L('العمود 1', 'Column 1')}</th><th>${L('العمود 2', 'Column 2')}</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table><p></p>`));
  return h('div.doc-toolbar', { role: 'toolbar', 'aria-label': L('تنسيق النص', 'Text formatting') },
    btn('h', L('عنوان', 'Heading'), null, cmd('formatBlock', 'h2'), 'h2'),
    btn('paragraph', L('فقرة', 'Paragraph'), null, cmd('formatBlock', 'p'), 'p'),
    h('span.tb-sep', { 'aria-hidden': 'true' }),
    btn('bold', L('غامق', 'Bold'), `${mod}B`, cmd('bold'), 'bold'),
    btn('italic', L('مائل', 'Italic'), `${mod}I`, cmd('italic'), 'italic'),
    btn('ul', L('قائمة نقطية', 'Bulleted list'), null, cmd('insertUnorderedList'), 'ul'),
    h('span.tb-sep', { 'aria-hidden': 'true' }),
    btn('table', L('إدراج جدول', 'Insert table'), null, table));
}

const cmdState = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
function syncToolbar() {
  if (!doc) return;
  const tb = q('.doc-toolbar'); const body = q('.doc-body');
  if (!tb || !body) return;
  const sel = document.getSelection();
  if (!sel?.rangeCount || !body.contains(sel.anchorNode)) return;
  let block = ''; try { block = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch { /* unsupported */ }
  const st = { bold: cmdState('bold'), italic: cmdState('italic'), ul: cmdState('insertUnorderedList'), h2: block === 'h2', p: block === 'p' };
  tb.querySelectorAll('[data-state]').forEach((b) => b.setAttribute('aria-pressed', String(!!st[b.dataset.state])));
}

// ---------- Ask AI on this document ----------
function aiMenu(anchor) {
  const ask = (text) => async () => { await flush(); const c = await import('./chat.js'); c.send(text); };
  menu(anchor, [
    { title: L('اطلب من Ask AI على هذا المستند', 'Ask AI to work on this document') },
    { label: L('اختصر المقدمة', 'Shorten the introduction'), icon: 'minus', onClick: ask(L('اختصر المقدمة', 'Shorten the introduction')) },
    { label: L('اجعل الصياغة رسمية', 'Make the tone formal'), icon: 'wand', onClick: ask(L('اجعل الصياغة رسمية', 'Make the tone formal')) },
    { label: L('أضف جدولاً للمسؤوليات والمواعيد', 'Add a responsibilities & deadlines table'), icon: 'table', onClick: ask(L('أضف جدولاً للمسؤوليات والمواعيد', 'Add a responsibilities and deadlines table')) },
    { sep: true },
    { label: L('طلب آخر…', 'Something else…'), icon: 'chat', onClick: async () => { await flush(); const c = await import('./chat.js'); c.focus(); } },
  ], { width: 290 });
}

// ---------- sources ----------
const SRC = { projects: ['المشاريع', 'Projects'], project: ['مشروع مرتبط', 'Linked project'], tasks: ['المهام', 'Tasks'], task: ['مهمة', 'Task'], events: ['المواعيد', 'Appointments'], alerts: ['التنبيهات', 'Alerts'], documents: ['المستندات', 'Documents'], upload: ['ملف مرفوع', 'Uploaded file'] };
const FILTER = { delayed: ['المتأخرة', 'Delayed'], overdue: ['المتأخرة', 'Overdue'], active: ['النشطة', 'Active'], week: ['هذا الأسبوع', "This week's"], today: ['اليوم', "Today's"] };
function sourceLabel(s) {
  const base = SRC[s.type]; const f = s.filter ? FILTER[s.filter] : null;
  const name = getLang() === 'en'
    ? (f ? `${f[1]} ${(base?.[1] || s.type).toLowerCase()}` : base?.[1] || s.type) + (s.filter && !f ? ` (${s.filter})` : '')
    : `${base?.[0] || s.type}${f ? ` ${f[0]}` : s.filter ? ` (${s.filter})` : ''}`;
  return s.ids?.length != null ? `${name} (${fmtNum(s.ids.length)})` : name;
}

// ---------- saving ----------
const STATUS = {
  saved: ['circleCheck', () => L('محفوظ', 'Saved')],
  dirty: ['circleDot', () => L('تعديلات غير محفوظة…', 'Unsaved changes…')],
  saving: [null, () => L('جارٍ الحفظ…', 'Saving…')],
  error: ['circleAlert', () => L('تعذّر الحفظ', 'Save failed')],
};
function setStatus(s, detail = '') {
  const el = q('#doc-save'); if (!el) return;
  const [ic, text] = STATUS[s];
  el.dataset.state = s;
  el.replaceChildren(ic ? icon(ic, 'sm') : h('span.spinner', { 'aria-hidden': 'true' }), text());
  el.title = s === 'saved' && lastSavedAt ? L(`آخر حفظ ${fmtTime(lastSavedAt)} — يُحفظ كل تعديل تلقائياً`, `Last saved ${fmtTime(lastSavedAt)} — every edit saves automatically`) : s === 'error' ? detail : '';
  q('.ed-retry')?.classList.toggle('hidden', s !== 'error');
}

function syncVersionBtn() {
  const b = q('#doc-version'); if (!b) return;
  b.disabled = !changedSinceVersion;
  b.title = changedSinceVersion ? L(`احفظ نقطة رجوع مسمّاة في السجل (${isMac ? '⌘' : 'Ctrl+'}S)`, `Save a restore point in the history (${isMac ? '⌘' : 'Ctrl+'}S)`) : L('لا تعديلات منذ آخر إصدار', 'No edits since the last version');
}

const countWords = (() => {
  const run = () => {
    const el = q('.ed-words'); const body = q('.doc-body'); if (!el || !body) return;
    const n = (body.innerText.match(/\S+/g) || []).length;
    el.textContent = getLang() === 'en' ? `${fmtNum(n)} ${n === 1 ? 'word' : 'words'}` : n === 1 ? 'كلمة واحدة' : n === 2 ? 'كلمتان' : n > 2 && n < 11 ? `${fmtNum(n)} كلمات` : `${fmtNum(n)} كلمة`;
  };
  const later = debounce(run, 350);
  return (now = false) => (now ? run() : later());
})();

function markDirty() {
  if (!doc) return;
  dirty = true; changedSinceVersion = true;
  setStatus('dirty'); syncVersionBtn(); schedule();
}

function flushBeforeExport(e) { const href = e.currentTarget.href; if (dirty || inflight) { e.preventDefault(); flush().then((ok) => { if (ok) location.href = href; }); } }

function schedule() { clearTimeout(saveTimer); saveTimer = setTimeout(() => flush(), 1200); }

// Resolves true when everything is saved (or nothing needed saving), false on failure.
export async function flush({ version = false } = {}) {
  clearTimeout(saveTimer);
  while (inflight) await inflight;
  if (!doc) return true;
  if (!dirty && !version) return true;
  inflight = persist(version).finally(() => { inflight = null; });
  return inflight;
}

async function persist(version) {
  const cur = doc;
  const body = q('.doc-body'); const title = q('.doc-title');
  if (!body || !title) return true;
  const sentHtml = body.innerHTML; const sentTitle = title.value;
  dirty = false; // edits typed while saving mark it dirty again
  setStatus('saving');
  try {
    const saved = await api(`/api/documents/${cur.id}`, { method: 'PUT', body: { title: sentTitle, content_html: sentHtml, base_version: cur.current_version, autosave: !version } });
    if (doc?.id !== cur.id) return true;
    const before = doc.current_version;
    doc = saved; lastSavedAt = new Date().toISOString();
    setStatus(dirty ? 'dirty' : 'saved');
    const v = q('.ed-ver'); if (v) v.textContent = `v${doc.current_version}`;
    if (version) {
      changedSinceVersion = false; syncVersionBtn();
      toast(saved.current_version !== before
        ? L(`حُفظ الإصدار v${doc.current_version} — تجده في سجل الإصدارات`, `Saved version v${doc.current_version} — find it in Version history`)
        : L(`تعديلاتك محفوظة تلقائياً في الإصدار v${doc.current_version}`, `Your edits are already autosaved in v${doc.current_version}`));
    }
    if (versionsOpen) loadVersions();
    if (sentTitle !== cur.title) import('./chat.js').then((c) => c.refreshContext());
    if (dirty) schedule();
    return true;
  } catch (e) {
    if (doc?.id !== cur.id) return false;
    if (e.status === 409 && e.body?.latest) { conflict(e.body.latest, sentHtml, sentTitle); return true; }
    dirty = true;
    setStatus('error', e.message);
    return false;
  }
}

function saveVersion() { if (canEdit()) flush({ version: true }); }

// Edited elsewhere while we were typing: load the latest, keep the user's
// version at hand and let them decide (history keeps both either way).
function conflict(latest, mineHtml, mineTitle) {
  doc = latest; dirty = false; lastSavedAt = latest.updated_at;
  render();
  showBanner({ kind: 'warn', ic: 'alert', text: L(`عُدّل هذا المستند من مكان آخر، فحمّلنا أحدث نسخة (v${latest.current_version}). تعديلاتك الأخيرة ما زالت محفوظة هنا مؤقتاً.`, `This document was edited elsewhere, so the latest version (v${latest.current_version}) is loaded. Your latest edits are kept here for now.`),
    actions: [
      { label: L('استخدام نسختي', 'Use my version'), primary: true, run: () => {
        const b = q('.doc-body'); const tt = q('.doc-title'); if (!b || !tt) return;
        b.innerHTML = mineHtml; tt.value = mineTitle; markDirty(); countWords(true);
        toast(L('أُعيدت تعديلاتك وستُحفظ كإصدار جديد فوق الأحدث — يبقى السجل كاملاً.', 'Your edits are back and will be saved as a new version on top — history keeps everything.'), { kind: 'info' });
      } },
      { label: L('الإبقاء على الأحدث', 'Keep the latest'), run: () => {} },
    ] });
}

function showBanner({ kind = 'info', ic = 'info', text, actions = [] }) {
  const box = q('.ed-banners'); if (!box) return;
  const b = h(`div.banner.ed-banner${kind === 'warn' ? '.warn' : ''}`, { role: kind === 'warn' ? 'alert' : 'status' },
    icon(ic, 'sm'), h('span.grow', text),
    actions.length ? h('span.ed-banner-actions', actions.map((a) => h(`button.btn.sm${a.primary ? '.primary' : '.ghost'}`, { type: 'button', onclick: () => { b.remove(); a.run(); } }, a.label))) : null);
  box.replaceChildren(b);
  q('.ed-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- focus mode (desktop) ----------
function syncFocus() {
  document.body.classList.toggle('editor-focus', !!doc && focusMode);
  const b = q('.ed-focus-btn'); if (!b) return;
  b.setAttribute('aria-pressed', String(focusMode));
  b.title = focusMode ? L('إنهاء وضع التركيز (Esc)', 'Exit focus mode (Esc)') : L('وضع التركيز — مساحة كتابة أوسع', 'Focus mode — a wider writing space');
  b.replaceChildren(icon(focusMode ? 'shrink' : 'expand'));
}
function toggleFocus() { focusMode = !focusMode; syncFocus(); }

// ---------- version history ----------
const OPS = { shorten_intro: ['اختصار المقدمة', 'shortened intro'], formalize: ['صياغة رسمية', 'formal tone'], add_table: ['جدول', 'table'], append: ['إضافة', 'addition'], replace_paragraph: ['تعديل فقرة', 'paragraph edit'], replace_all: ['إعادة صياغة', 'rewrite'] };
function reasonInfo(r = '') {
  if (r === 'created') return { label: L('إنشاء', 'Created'), ic: 'sparkle', cls: 'key' };
  if (r === 'autosave') return { label: L('حفظ تلقائي', 'Autosave'), ic: 'clock', cls: 'auto' };
  if (r === 'manual') return { label: L('إصدار محفوظ', 'Saved version'), ic: 'fileCheck', cls: 'key' };
  const rs = /^restore v(\d+)$/.exec(r);
  if (rs) return { label: L(`استعادة الإصدار ${rs[1]}`, `Restored version ${rs[1]}`), ic: 'undo', cls: 'key' };
  const ai = /^assistant: (\w+)$/.exec(r);
  if (ai) { const op = OPS[ai[1]]; return { label: L(`تعديل المساعد: ${op?.[0] || ai[1]}`, `Ask AI: ${op?.[1] || ai[1]}`), ic: 'spark', cls: 'ai' }; }
  return { label: r || '—', ic: 'history', cls: 'key' };
}

function versionsPane() {
  return h('aside#versions.ed-versions.hidden', { 'aria-label': L('سجل الإصدارات', 'Version history'), onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); hideVersions(); } } },
    h('div.ver-head', icon('history'), h('h4', L('سجل الإصدارات', 'Version history')), h('span.ver-count.num'),
      h('button.icon-btn', { type: 'button', 'aria-label': L('إغلاق السجل', 'Close history'), onclick: () => hideVersions() }, icon('x'))),
    h('p.ver-hint', L('كل حفظ يُنشئ إصداراً يمكنك معاينته أو استعادته. الاستعادة تُضيف إصداراً جديداً ولا تحذف شيئاً.', 'Every save creates a version you can preview or restore. Restoring adds a new version — nothing is deleted.')),
    h('div.ver-body'));
}

async function toggleVersions() {
  if (versionsOpen) { hideVersions(); return; }
  versionsOpen = true;
  const btn = q('.ed-hist'); btn?.classList.add('active'); btn?.setAttribute('aria-expanded', 'true');
  q('#versions')?.classList.remove('hidden'); q('.ed-scrim')?.classList.remove('hidden');
  await flush();
  await loadVersions();
  q('#versions .ver-row .icon-btn, #versions .ver-head .icon-btn')?.focus({ preventScroll: true });
}
function hideVersions() {
  versionsOpen = false;
  q('#versions')?.classList.add('hidden'); q('.ed-scrim')?.classList.add('hidden');
  const btn = q('.ed-hist'); btn?.classList.remove('active'); btn?.setAttribute('aria-expanded', 'false'); btn?.focus();
}

async function loadVersions() {
  const box = q('#versions .ver-body'); if (!box || !doc) return;
  const id = doc.id;
  if (!box.querySelector('.ver-row')) box.replaceChildren(skeleton('list', 5));
  let vs;
  try { vs = await api(`/api/documents/${id}/versions`); } catch (e) {
    if (doc?.id === id) box.replaceChildren(errorState(e, () => { box.replaceChildren(); loadVersions(); }));
    return;
  }
  if (doc?.id !== id || !box.isConnected) return;
  const n = vs.length;
  q('#versions .ver-count').textContent = getLang() === 'en' ? `${fmtNum(n)} ${n === 1 ? 'version' : 'versions'}` : n === 1 ? 'إصدار واحد' : n === 2 ? 'إصداران' : n < 11 ? `${fmtNum(n)} إصدارات` : `${fmtNum(n)} إصداراً`;
  const groups = [];
  for (const v of vs) {
    const key = dayLabel(v.created_at);
    if (groups.at(-1)?.key !== key) groups.push({ key, rows: [] });
    groups.at(-1).rows.push(v);
  }
  const editable = canEdit();
  box.replaceChildren(...groups.map((g) => h('section.ver-day', h('h5.ver-day-title', g.key), h('ul.list.ver-list', g.rows.map((v) => {
    const r = reasonInfo(v.reason); const current = v.version === doc.current_version;
    return h(`li.ver-row.${r.cls}${current ? '.current' : ''}`,
      h('span.ver-icon', { 'aria-hidden': 'true' }, icon(current ? 'circleCheck' : r.ic, 'sm')),
      h('div.grow', h('div.ver-title', `v${v.version} · ${r.label}`), h('div.ver-meta', `${L(v.author_ar, v.author_en)} · ${fmtTime(v.created_at)}`)),
      h('button.icon-btn', { type: 'button', 'aria-label': L(`معاينة v${v.version}`, `Preview v${v.version}`), onclick: () => previewVersion(v.version) }, icon('eye')),
      current ? h('span.chip.tiny.good', L('الحالي', 'Current'))
        : editable ? h('button.btn.sm', { type: 'button', 'aria-label': L(`استعادة v${v.version}`, `Restore v${v.version}`), onclick: () => restore(v.version) }, t('restore')) : null);
  })))));
}

async function previewVersion(v) {
  if (!doc) return;
  let r;
  try { r = await api(`/api/documents/${doc.id}/versions/${v}`); } catch (e) { toast(e.message, { kind: 'error' }); return; }
  const canRestore = canEdit() && v !== doc.current_version;
  const res = await modal(L(`معاينة الإصدار v${v}`, `Preview of v${v}`),
    h('div.ver-preview-wrap',
      h('div.ver-preview', h('div.ver-preview-title', { dir: 'auto' }, r.title), h('div.doc-body.preview', { html: r.content_html })),
      canRestore ? h('p.ver-preview-note', icon('info', 'sm'), L(`الاستعادة تُنشئ إصداراً جديداً (v${doc.current_version + 1}) بمحتوى هذا الإصدار، ويبقى السجل كاملاً.`, `Restoring creates a new version (v${doc.current_version + 1}) with this content; history is kept.`)) : null),
    [{ label: t('close'), value: null }, canRestore ? { label: L('استعادة هذا الإصدار', 'Restore this version'), value: 'restore', primary: true, icon: 'undo' } : null].filter(Boolean), { wide: true });
  if (res === 'restore') doRestore(v); // the preview itself is the confirmation step
}

async function restore(v) {
  if (!(await confirmDialog(L(`استعادة الإصدار v${v}؟`, `Restore v${v}?`), L(`سيُضاف محتوى v${v} كإصدار جديد، ويبقى السجل كاملاً — يمكنك التراجع بعدها.`, `v${v} will be added as a new version; history is kept and you can undo.`), { confirmLabel: L('استعادة', 'Restore') }))) return;
  doRestore(v);
}

async function doRestore(v) {
  if (!doc) return;
  await flush();
  const id = doc.id;
  const r = await api('/api/tools/restore_document_version', { method: 'POST', body: { input: { id, version: v }, requestId: rid() } }).catch((e) => e.body);
  if (r?.status !== 'ok') { toast(r?.error || L('تعذّرت الاستعادة', 'Restore failed'), { kind: 'error' }); return; }
  versionsOpen = false; // done with the history: show the restored page
  await open(id, { force: true });
  q('.ed-hist')?.focus({ preventScroll: true });
  const paper = q('.ed-paper'); if (paper) { paper.classList.remove('flash'); void paper.offsetWidth; paper.classList.add('flash'); }
  toast(L(`استُعيد الإصدار v${v} كإصدار جديد (v${doc?.current_version ?? '—'})`, `Restored v${v} as a new version (v${doc?.current_version ?? '—'})`), r.undoable && r.actionId ? { action: t('undo'), onAction: () => undoAction(r.actionId) } : {});
  emit('data-changed', { entity: 'document' });
}
