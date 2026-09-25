// Document side panel: edit/preview, autosave, version history & restore,
// DOCX/PDF export. The same document is kept across all edits.
import { api, rid } from './api.js';
import { h, $, icon, toast, modal, esc, confirmDialog } from './ui.js';
import { t, L, fmtDate, fmtTime } from './i18n.js';
import { state, on, emit } from './state.js';

let doc = null; let dirty = false; let saving = false; let preview = false; let saveTimer = null;
const panel = () => $('#editor');
export const currentTitle = () => doc?.title;

export function init() {
  on('document-changed', async (ev) => {
    if (!doc || ev.id !== doc.id) return;
    if (ev.version && ev.version === doc.current_version) return;
    if (dirty) { showBanner(L('وصل تحديث جديد للمستند (من المساعد أو جهاز آخر).', 'A newer version arrived.'), L('تحميل', 'Load'), () => open(doc.id, { force: true })); return; }
    await open(doc.id, { force: true, silent: true });
    panel().querySelector('.doc-body')?.classList.add('flash');
  });
}

export async function open(id, { force = false, silent = false } = {}) {
  if (doc && doc.id !== id && dirty) await flush();
  let d;
  try { d = await api(`/api/documents/${id}`); } catch (e) { toast(e.message, { kind: 'error' }); return; }
  const same = doc?.id === id;
  doc = d; dirty = false; state.openDocumentId = id;
  panel().classList.remove('collapsed'); document.body.classList.add('editor-open');
  if (window.innerWidth <= 900 && !silent) import('./app.js').then((m) => m.setTab('doc'));
  if (!same || force) render();
  import('./chat.js').then((c) => c.refreshContext());
}

export function close() {
  if (dirty) flush();
  doc = null; state.openDocumentId = null; panel().classList.add('collapsed'); document.body.classList.remove('editor-open'); panel().replaceChildren();
  if (window.innerWidth <= 900) import('./app.js').then((m) => m.setTab('home'));
  import('./chat.js').then((c) => c.refreshContext());
}

function status(text, cls = '') { const s = panel().querySelector('#doc-save'); if (s) { s.textContent = text; s.className = `chip tiny ${cls}`; } }
function showBanner(text, action, fn) {
  panel().querySelector('.banner')?.remove();
  const b = h('div.banner', text, ' ', action ? h('button.btn.sm', { onclick: () => { b.remove(); fn(); } }, action) : null);
  panel().querySelector('.panel-head').after(b);
}

function render() {
  const canEdit = doc.access !== 'view';
  const body = h('div.doc-body', { contenteditable: String(canEdit && !preview), spellcheck: 'true', dir: 'auto', role: 'textbox', 'aria-multiline': 'true', 'aria-label': doc.title, html: doc.content_html });
  if (preview) body.classList.add('preview');
  body.addEventListener('input', () => { dirty = true; status(L('تعديلات غير محفوظة…', 'Unsaved…'), 'warn'); schedule(); });
  const title = h('input.doc-title', { value: doc.title, 'aria-label': L('عنوان المستند', 'Document title'), disabled: !canEdit || null, oninput: () => { dirty = true; schedule(); } });
  const cmd = (c, v) => () => { document.execCommand(c, false, v); body.focus(); dirty = true; schedule(); };
  const toolbar = h('div.doc-toolbar', canEdit && !preview ? [
    h('button.icon-btn', { title: L('عنوان', 'Heading'), onclick: cmd('formatBlock', 'h2') }, icon('h')),
    h('button.icon-btn', { title: L('فقرة', 'Paragraph'), onclick: cmd('formatBlock', 'p') }, h('span.tiny', '¶')),
    h('button.icon-btn', { title: L('غامق', 'Bold'), onclick: cmd('bold') }, icon('bold')),
    h('button.icon-btn', { title: L('مائل', 'Italic'), onclick: cmd('italic') }, icon('italic')),
    h('button.icon-btn', { title: L('قائمة', 'List'), onclick: cmd('insertUnorderedList') }, icon('ul')),
    h('button.icon-btn', { title: L('جدول', 'Table'), onclick: () => { document.execCommand('insertHTML', false, `<table><thead><tr><th>${L('العمود 1', 'Col 1')}</th><th>${L('العمود 2', 'Col 2')}</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table><p></p>`); dirty = true; schedule(); } }, icon('table')),
    h('span.sep'),
    h('button.btn.sm', { onclick: () => flush({ version: true }) }, icon('check'), L('حفظ إصدار', 'Save version')),
  ] : [], h('span', { style: { flex: 1 } }),
  h('a.btn.sm', { href: `/api/documents/${doc.id}/export.docx`, download: '', onclick: flushBeforeExport }, icon('download'), 'Word'),
  h('a.btn.sm', { href: `/api/documents/${doc.id}/export.pdf`, download: '', onclick: flushBeforeExport }, icon('download'), 'PDF'));
  const sources = doc.sources?.length ? h('div.tiny.muted', `${L('المصادر', 'Sources')}: ${doc.sources.map((s) => `${s.type}${s.filter ? ` (${s.filter})` : ''}${s.ids ? ` ×${s.ids.length}` : ''}`).join('، ')}`) : null;
  panel().replaceChildren(
    h('div.panel-head',
      h('button.icon-btn', { 'aria-label': t('close'), onclick: close }, icon('x')),
      h('h3', L('المستند', 'Document')),
      h('button.icon-btn', { title: preview ? L('تحرير', 'Edit') : L('معاينة', 'Preview'), 'aria-pressed': String(preview), onclick: async () => { await flush(); preview = !preview; render(); } }, icon('eye')),
      h('button.icon-btn', { title: L('سجل الإصدارات', 'Version history'), onclick: toggleVersions }, icon('history'))),
    title,
    h('div.doc-status', h('span#doc-save.chip.tiny.good', L('محفوظ', 'Saved')), h('span', `v${doc.current_version}`), h('span', `${L('آخر تعديل', 'Updated')} ${fmtDate(doc.updated_at)} ${fmtTime(doc.updated_at)}`), doc.access === 'view' ? h('span.chip.tiny', L('اطلاع فقط', 'View only')) : null, sources),
    toolbar, body, h('div.versions.hidden#versions'));
}

function flushBeforeExport(e) { const href = e.currentTarget.href; if (dirty) { e.preventDefault(); flush().then(() => { location.href = href; }); } }

function schedule() { clearTimeout(saveTimer); saveTimer = setTimeout(() => flush(), 1200); }

export async function flush({ version = false } = {}) {
  clearTimeout(saveTimer);
  if (!doc || saving) return;
  if (!dirty && !version) return;
  saving = true; status(L('جارٍ الحفظ…', 'Saving…'), '');
  const body = panel().querySelector('.doc-body'); const title = panel().querySelector('.doc-title');
  try {
    const saved = await api(`/api/documents/${doc.id}`, { method: 'PUT', body: { title: title.value, content_html: body.innerHTML, base_version: doc.current_version, autosave: !version } });
    const wasVersion = saved.current_version !== doc.current_version;
    doc = saved; dirty = false;
    status(L('محفوظ', 'Saved'), 'good');
    panel().querySelector('.doc-status span:nth-child(2)').textContent = `v${doc.current_version}`;
    if (version) toast(wasVersion ? L(`حُفظ الإصدار ${doc.current_version}`, `Saved version ${doc.current_version}`) : L('لا تغييرات جديدة', 'No changes'));
  } catch (e) {
    if (e.status === 409 && e.body?.latest) { doc = e.body.latest; dirty = false; render(); showBanner(L('عُدّل المستند من مكان آخر؛ حُمّلت أحدث نسخة. أعد تطبيق تعديلك الأخير إن لزم.', 'Edited elsewhere — latest version loaded.')); }
    else status(`${L('تعذّر الحفظ', 'Save failed')}: ${e.message}`, 'crit');
  } finally { saving = false; }
}

async function toggleVersions() {
  const box = panel().querySelector('#versions');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  await flush();
  const vs = await api(`/api/documents/${doc.id}/versions`);
  const REASON = { created: L('إنشاء', 'Created'), autosave: L('حفظ تلقائي', 'Autosave'), manual: L('حفظ يدوي', 'Manual save') };
  box.replaceChildren(h('div.small', { style: { fontWeight: 600, marginBottom: '6px' } }, L('سجل الإصدارات', 'Version history')), h('ul.list', vs.map((v) => h('li',
    h('div.grow', h('div.small', `v${v.version} · ${REASON[v.reason] || v.reason}`), h('div.tiny.muted', `${L(v.author_ar, v.author_en)} · ${fmtDate(v.created_at)} ${fmtTime(v.created_at)}`)),
    h('button.btn.sm.ghost', { onclick: () => previewVersion(v.version) }, icon('eye')),
    v.version !== doc.current_version ? h('button.btn.sm', { onclick: () => restore(v.version) }, t('restore')) : h('span.chip.tiny.good', L('الحالي', 'Current'))))));
  box.classList.remove('hidden');
}

async function previewVersion(v) {
  const r = await api(`/api/documents/${doc.id}/versions/${v}`);
  const res = await modal(`${r.title} — v${v}`, h('div.doc-body.preview', { html: r.content_html, style: { maxHeight: '60vh', border: '1px solid var(--stroke)', borderRadius: '12px' } }), [{ label: t('close'), value: null }, { label: t('restore'), value: 'r', primary: true }]);
  if (res) restore(v);
}

async function restore(v) {
  if (!(await confirmDialog(L('استعادة إصدار', 'Restore version'), L(`ستُستعاد نسخة v${v} كإصدار جديد، ويبقى السجل كاملاً.`, `v${v} will be restored as a new version; history is kept.`)))) return;
  const r = await api('/api/tools/restore_document_version', { method: 'POST', body: { input: { id: doc.id, version: v }, requestId: rid() } }).catch((e) => e.body);
  if (r?.status !== 'ok') { toast(r?.error || 'error', { kind: 'error' }); return; }
  toast(L(`استُعيد الإصدار ${v}`, `Restored v${v}`));
  await open(doc.id, { force: true });
  emit('data-changed', { entity: 'document' });
}
