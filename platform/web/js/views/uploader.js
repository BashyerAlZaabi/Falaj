// Smart Uploader (#/uploader): outside Vault → Marsad inside Vault, one way.
// The portal forwards each file to POST /api/su/upload and keeps only an
// opaque receipt (GET /api/su/receipts). Nothing is previewed, stored or sent
// to AI Services here. Uploads are queued one at a time so a file can never be
// sent twice by accident; the queue survives the soft re-renders of the view.
import { api } from '../api.js';
import { h, icon, toast, skeleton, emptyState, errorState, dataTable } from '../ui.js';
import { L, fmtDate, fmtTime, getLang } from '../i18n.js';
import { state } from '../state.js';
import { bidi, copyText, vaultHref, countText } from './apps.js';

const MAX_BYTES = 20 * 1024 * 1024; // server limit (express.raw 20mb)

// ---- module state (survives soft re-renders) ----
const queue = []; // { id, file, name, size, status: queued|sending|done|failed, pct, receipt, error }
let busy = false;
let blocked = null; // { message } once the server reports the integration is not configured
let seq = 0;
let knownReceipts = null; // ids already shown → highlight new rows
const refs = { page: null, queue: null, choose: null, zone: null, receipts: null, input: null };

const AR_FILES = { zero: 'لا ملفات', one: 'ملف واحد', two: 'ملفان', few: '% ملفات', many: '% ملفاً', other: '% ملف' };
const EN_FILES = ['file', 'files'];

export function fmtBytes(n) {
  const nf = (v, d) => new Intl.NumberFormat(getLang() === 'ar' ? 'ar-AE' : 'en-US', { maximumFractionDigits: d }).format(v);
  if (n == null) return '—';
  if (n < 1024) return L(`${nf(n, 0)} بايت`, `${nf(n, 0)} B`);
  if (n < 1024 * 1024) return L(`${nf(n / 1024, 1)} ك.ب`, `${nf(n / 1024, 1)} KB`);
  return L(`${nf(n / (1024 * 1024), 1)} م.ب`, `${nf(n / (1024 * 1024), 1)} MB`);
}
const marsadApp = () => state.me.apps?.find((a) => a.key === 'marsad');

// ---------------------------------------------------------------- page
export async function renderUploader(root, _params = [], { soft = false } = {}) {
  const page = h('div.su-page');
  root.append(page);
  refs.page = page;

  const input = h('input.hidden', { type: 'file', multiple: true, 'aria-hidden': 'true', tabindex: -1, onchange: () => { enqueue([...input.files]); input.value = ''; } });
  const camera = h('input.hidden', { type: 'file', accept: 'image/*', capture: 'environment', 'aria-hidden': 'true', tabindex: -1, onchange: () => { enqueue([...camera.files]); camera.value = ''; } });
  refs.input = input;
  const choose = h('button.btn.primary.lg.su-choose', { type: 'button', onclick: () => input.click() }, icon('upload'), L('اختيار ملفات', 'Choose files'));
  const snap = h('button.btn.lg.su-camera', { type: 'button', onclick: () => camera.click() }, icon('scanSearch'), L('التقاط صورة', 'Take a photo'));
  refs.choose = choose;

  const zone = h('section.dropzone.su-zone', { 'aria-labelledby': 'su-zone-title', 'aria-describedby': 'su-zone-sub', onclick: (e) => { if (!blocked && !e.target.closest('button, a, input, details')) input.click(); } },
    h('div.su-zone-orb', { 'aria-hidden': 'true' }, icon('fileUp')),
    h('h2#su-zone-title', L('اسحب الملفات إلى هنا أو اخترها من جهازك', 'Drag files here, or choose them from your device')),
    h('p#su-zone-sub.su-zone-sub', L('تُسلَّم مباشرة إلى مرصاد داخل Vault — حتى 20 م.ب لكل ملف.', 'Delivered straight to Marsad inside Vault — up to 20 MB per file.')),
    h('div.su-zone-actions', choose, snap),
    h('div.su-block-slot'),
    input, camera);
  refs.zone = zone;

  const queueEl = h('ul.su-queue', { 'aria-label': L('ملفات قيد التسليم', 'Files being delivered'), 'aria-live': 'polite' });
  refs.queue = queueEl;
  const receiptsCard = h('section.card.su-receipts', { 'aria-labelledby': 'su-rec-title' });
  refs.receipts = receiptsCard;

  page.append(
    head(),
    h('div.su-layout',
      h('div.su-main', zone, queueEl),
      aside()),
    receiptsCard);

  bindDrop(page, zone);
  paintBlocked();
  paintQueue();
  paintBusy();

  const load = () => api('/api/su/receipts');
  if (soft) {
    try { paintReceipts(await load()); } catch (e) { paintReceiptsError(e); }
    return;
  }
  receiptsCard.replaceChildren(receiptsHead(null), h('div.su-rec-loading', skeleton('table', 3)));
  load().then(paintReceipts, paintReceiptsError);
}

function head() {
  return h('header.page-head.su-head',
    h('div.su-titles',
      h('span.eyebrow', L('تغذية Vault · اتجاه واحد', 'Vault feed · one way')),
      h('h1', h('bdi', 'Smart Uploader')),
      h('p.sub',
        h('span', bidi(L('أرسل ملفات العمل إلى مرصاد داخل Vault بأمان.', 'Send work files to Marsad inside Vault, securely.'))), ' ',
        h('span.sub-more', bidi(L('لا نحتفظ بنسخة منها خارج Vault، ولا تمرّ على خدمات الذكاء الاصطناعي المشتركة.', 'No copy is kept outside Vault, and nothing passes through the shared AI Services.'))))),
    h('span.chip.vault.su-scope', icon('lock'), L('اتجاه واحد إلى Vault', 'One way into Vault')));
}

function aside() {
  const m = marsadApp();
  const step = (ic, title, text) => h('li', h('span.su-step-n', { 'aria-hidden': 'true' }, icon(ic)), h('div', h('span.su-step-title', title), h('span.su-step-text', text)));
  return h('aside.card.su-aside', { 'aria-labelledby': 'su-how-title' },
    h('h2#su-how-title.card-title', L('كيف يعمل التسليم', 'How delivery works')),
    h('ol.su-steps',
      step('fileUp', L('اختر الملفات أو اسحبها', 'Pick or drop your files'), L('ملف أو أكثر، حتى 20 م.ب لكل ملف. يُسلَّم كل ملف على حدة.', 'One or more files, up to 20 MB each. Each file is delivered on its own.')),
      step('lock', L('يُسلَّم مباشرة إلى مرصاد', 'Delivered straight to Marsad'), bidi(L('داخل Vault في اتجاه واحد — لا يمكن استعراض الملف من هنا بعد تسليمه.', 'Inside Vault, one way — the file can’t be viewed from here once delivered.'))),
      step('receipt', L('تحتفظ بإيصال فقط', 'You keep a receipt only'), L('يظهر رقم الإيصال في سجل التسليم أدناه، دون أي محتوى.', 'The receipt number appears in the delivery log below — never the content.'))),
    m ? h('a.btn.tertiary.block.su-open-marsad', { href: vaultHref(m), target: '_blank', rel: 'noopener noreferrer' }, icon('ext'), L('فتح مرصاد في Vault', 'Open Marsad in Vault')) : null);
}

// ---------------------------------------------------------------- drag & drop
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
function bindDrop(page, zone) {
  let depth = 0;
  const clear = () => { depth = 0; page.classList.remove('su-dragging'); zone.classList.remove('dragover'); };
  page.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; if (!blocked) { page.classList.add('su-dragging'); zone.classList.add('dragover'); } });
  page.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = blocked ? 'none' : 'copy'; });
  page.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) clear(); });
  page.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); clear(); if (!blocked) enqueue([...e.dataTransfer.files]); });
  page.setAttribute('data-drop', L('أفلت الملفات لتسليمها إلى مرصاد', 'Drop to deliver to Marsad'));
  // a file dropped just outside the page (still inside the workspace) must not open in the browser
  const view = document.getElementById('view');
  if (view && !view.dataset.suDrop) {
    view.dataset.suDrop = '1';
    view.addEventListener('dragover', (e) => { if (hasFiles(e) && refs.page?.isConnected) e.preventDefault(); });
    view.addEventListener('drop', (e) => { if (hasFiles(e) && refs.page?.isConnected && !refs.page.contains(e.target)) { e.preventDefault(); if (!blocked) enqueue([...e.dataTransfer.files]); } });
  }
}

// ---------------------------------------------------------------- queue
function enqueue(files) {
  if (!files.length || blocked) return;
  for (const f of files) {
    const it = { id: `q${++seq}`, file: f, name: f.name || L('ملف بدون اسم', 'Untitled file'), size: f.size, status: 'queued', pct: 0 };
    if (!f.size) Object.assign(it, { status: 'failed', error: L('الملف فارغ — لم يُرسَل.', 'The file is empty — nothing was sent.') });
    else if (f.size > MAX_BYTES) Object.assign(it, { status: 'failed', error: L(`حجمه ${fmtBytes(f.size)} — الحد الأقصى 20 م.ب. لم يُرسَل.`, `It is ${fmtBytes(f.size)} — the limit is 20 MB. Nothing was sent.`) });
    queue.unshift(it);
  }
  // keep the list short: drop the oldest finished rows (never a pending one)
  for (let i = queue.length - 1; queue.length > 12 && i >= 0; i--) if (['done', 'failed'].includes(queue[i].status)) queue.splice(i, 1);
  paintQueue();
  pump();
}

async function pump() {
  if (busy) return;
  busy = true; paintBusy();
  const batch = [];
  for (let it = next(); it; it = next()) {
    it.status = 'sending'; it.pct = 0; paintItem(it);
    try {
      const r = await send(it.file, (p) => { it.pct = p; paintProgress(it); });
      Object.assign(it, { status: 'done', pct: 1, receipt: r.receipt, note: r.note });
      batch.push(it);
    } catch (e) {
      Object.assign(it, { status: 'failed', error: e.message });
      if (e.status === 503 || e.body?.error === 'not_configured') {
        blocked = { message: e.message };
        for (const x of queue) if (x.status === 'queued') Object.assign(x, { status: 'failed', error: e.message });
        paintBlocked();
      }
      toast(bidi(L(`تعذّر تسليم «${it.name}»: ${e.message}`, `Could not deliver “${it.name}”: ${e.message}`)), { kind: 'error', timeout: 7000 });
    }
    paintItem(it);
  }
  busy = false; paintBusy();
  if (batch.length === 1) {
    const [it] = batch;
    toast(bidi(L(`سُلِّم «${it.name}» إلى مرصاد — الإيصال ${it.receipt || '—'}`, `“${it.name}” delivered to Marsad — receipt ${it.receipt || '—'}`)), it.receipt ? { action: L('نسخ الإيصال', 'Copy receipt'), onAction: () => copyText(it.receipt, L('نُسخ رقم الإيصال', 'Receipt number copied')) } : {});
  } else if (batch.length > 1) {
    toast(L(`سُلِّمت ${countText(batch.length, AR_FILES, EN_FILES)} إلى مرصاد`, `${countText(batch.length, AR_FILES, EN_FILES)} delivered to Marsad`));
  }
  refreshReceipts();
}
const next = () => [...queue].reverse().find((x) => x.status === 'queued');

// Same request as before (POST /api/su/upload, raw body, x-filename) — sent with
// XHR only to report upload progress.
function send(file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/su/upload');
    x.withCredentials = true;
    x.setRequestHeader('x-requested-with', 'swp');
    x.setRequestHeader('content-type', 'application/octet-stream');
    x.setRequestHeader('x-filename', encodeURIComponent(file.name));
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => {
      let body = {}; try { body = JSON.parse(x.responseText || '{}'); } catch { body = {}; }
      if (x.status === 401) window.dispatchEvent(new CustomEvent('swp:unauth'));
      if (x.status >= 200 && x.status < 300) return resolve(body);
      const msg = x.status === 413 ? L('الملف أكبر من الحد المسموح (20 م.ب).', 'The file is larger than the 20 MB limit.') : body?.message || body?.error || `HTTP ${x.status}`;
      const err = new Error(msg); err.status = x.status; err.body = body; reject(err);
    };
    x.onerror = () => reject(Object.assign(new Error(L('انقطع الاتصال أثناء الإرسال — لم يُسلَّم الملف.', 'The connection dropped while sending — the file was not delivered.')), { status: 0 }));
    x.send(file);
  });
}

function retry(it) {
  if (busy && it.status === 'sending') return;
  Object.assign(it, { status: 'queued', pct: 0, error: null });
  paintItem(it);
  pump();
}
function dismiss(it) {
  const i = queue.indexOf(it); if (i >= 0) queue.splice(i, 1);
  paintQueue();
  refs.choose?.focus();
}

// ---------------------------------------------------------------- painting
function paintBusy() {
  const b = refs.choose; if (!b?.isConnected) return;
  b.classList.toggle('is-loading', busy); b.disabled = busy || !!blocked;
  b.setAttribute('aria-busy', String(busy));
  refs.zone?.setAttribute('aria-busy', String(busy));
}

function paintBlocked() {
  const zone = refs.zone; if (!zone) return;
  zone.classList.toggle('is-blocked', !!blocked);
  zone.querySelectorAll('button.su-choose, button.su-camera').forEach((b) => { b.disabled = !!blocked || busy; });
  const slot = zone.querySelector('.su-block-slot');
  slot.replaceChildren(...(blocked ? [h('div.su-blocked', { role: 'alert' },
    icon('unplug'),
    h('div.grow', h('strong', L('التسليم متوقف مؤقتاً', 'Delivery is paused')), h('span', bidi(blocked.message)),
      h('span', state.me.user.is_admin ? L('اضبط التكامل من إدارة المنصة ثم أعد المحاولة.', 'Set up the integration in Platform admin, then try again.') : L('تواصل مع مدير المنصة لتفعيل التكامل، ثم أعد المحاولة.', 'Ask the platform admin to enable the integration, then try again.'))),
    h('div.btn-group',
      state.me.user.is_admin ? h('a.btn.sm', { href: '#/admin/integrations' }, icon('settings'), L('التكاملات', 'Integrations')) : null,
      h('button.btn.sm.tertiary', { type: 'button', onclick: () => { blocked = null; paintBlocked(); paintBusy(); refs.choose?.focus(); } }, icon('refresh'), L('إعادة المحاولة', 'Try again'))))] : []));
}

function paintQueue() {
  const el = refs.queue; if (!el) return;
  el.replaceChildren(...queue.map(itemEl));
  el.classList.toggle('hidden', !queue.length);
}
function paintItem(it) {
  const el = refs.queue; if (!el) return;
  const old = el.querySelector(`[data-q="${it.id}"]`);
  if (old) old.replaceWith(itemEl(it)); else paintQueue();
}
function paintProgress(it) {
  const row = refs.queue?.querySelector(`[data-q="${it.id}"]`); if (!row) return;
  const pct = Math.round(it.pct * 100);
  const bar = row.querySelector('.progress'); bar?.setAttribute('aria-valuenow', String(pct));
  const fill = row.querySelector('.progress > i'); if (fill) fill.style.width = `${pct}%`;
  const txt = row.querySelector('.su-q-state'); if (txt) txt.textContent = pct < 100 ? L(`جارٍ الإرسال… ${pct}٪`, `Sending… ${pct}%`) : L('بانتظار إيصال مرصاد…', 'Waiting for Marsad’s receipt…');
}

function itemEl(it) {
  const pct = Math.round((it.pct || 0) * 100);
  const st = {
    queued: ['clock', L('في الانتظار', 'Queued')],
    sending: ['loader', pct < 100 ? L(`جارٍ الإرسال… ${pct}٪`, `Sending… ${pct}%`) : L('بانتظار إيصال مرصاد…', 'Waiting for Marsad’s receipt…')],
    done: ['circleCheck', L('سُلِّم إلى مرصاد', 'Delivered to Marsad')],
    failed: ['circleAlert', L('لم يُسلَّم', 'Not delivered')],
  }[it.status];
  const m = marsadApp();
  return h(`li.su-q.is-${it.status}`, { 'data-q': it.id },
    h('span.su-q-icon', { 'aria-hidden': 'true' }, icon(st[0], it.status === 'sending' ? 'su-spin' : '')),
    h('div.su-q-main',
      h('div.su-q-top', h('span.su-q-name', h('bdi', it.name)), h('span.su-q-size.tabular', fmtBytes(it.size))),
      it.status === 'sending' || it.status === 'queued'
        ? h('div.progress.su-q-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': L(`تقدّم إرسال ${it.name}`, `Upload progress for ${it.name}`) }, h('i', { style: { width: `${pct}%` } }))
        : null,
      h('div.su-q-foot',
        h('span.su-q-state', st[1]),
        it.status === 'done' && it.receipt ? h('span.su-q-receipt', L('الإيصال', 'Receipt'), ' ', h('code.num', it.receipt)) : null,
        it.status === 'failed' && it.error ? h('span.error-text.su-q-error', icon('circleAlert', 'sm'), bidi(it.error)) : null)),
    h('div.su-q-actions',
      it.status === 'done' && it.receipt ? h('button.icon-btn', { type: 'button', 'aria-label': L(`نسخ إيصال ${it.name}`, `Copy receipt for ${it.name}`), 'data-tip': L('نسخ الإيصال', 'Copy receipt'), onclick: () => copyText(it.receipt, L('نُسخ رقم الإيصال', 'Receipt number copied')) }, icon('copy')) : null,
      it.status === 'done' && m ? h('a.icon-btn', { href: vaultHref(m), target: '_blank', rel: 'noopener noreferrer', 'aria-label': L('فتح مرصاد في Vault (نافذة جديدة)', 'Open Marsad in Vault (new window)'), 'data-tip': L('فتح مرصاد', 'Open Marsad') }, icon('ext')) : null,
      it.status === 'failed' && it.file?.size && it.file.size <= MAX_BYTES && !blocked ? h('button.btn.sm.tertiary', { type: 'button', onclick: () => retry(it) }, icon('refresh'), L('إعادة المحاولة', 'Try again')) : null,
      it.status === 'done' || it.status === 'failed' ? h('button.icon-btn', { type: 'button', 'aria-label': L(`إخفاء ${it.name} من القائمة`, `Dismiss ${it.name}`), 'data-tip': L('إخفاء', 'Dismiss'), onclick: () => dismiss(it) }, icon('x')) : null));
}

// ---------------------------------------------------------------- receipts
async function refreshReceipts() {
  try { paintReceipts(await api('/api/su/receipts')); } catch (e) { paintReceiptsError(e); }
}
function paintReceiptsError(e) {
  const card = refs.receipts; if (!card) return;
  card.replaceChildren(receiptsHead(null), errorState(e, () => { card.replaceChildren(receiptsHead(null), h('div.su-rec-loading', skeleton('table', 3))); refreshReceipts(); }));
}
function receiptsHead(list) {
  const ok = list ? list.filter((r) => r.status === 'delivered').length : 0; const bad = list ? list.length - ok : 0;
  return h('div.su-rec-head',
    h('div.su-rec-titles',
      h('h2#su-rec-title.card-title', L('سجل التسليم', 'Delivery log')),
      h('p.card-sub', L('لا نحتفظ بمحتوى الملفات — الإيصال فقط. يُعرض آخر 20 تسليماً.', 'We keep no file content — only the receipt. Showing your last 20 deliveries.'))),
    list?.length ? h('div.su-rec-stats',
      h('span.chip.good', icon('circleCheck'), L(`سُلِّم: ${ok}`, `Delivered: ${ok}`)),
      bad ? h('span.chip.crit', icon('circleX'), L(`تعذّر: ${bad}`, `Failed: ${bad}`)) : null) : null);
}
function paintReceipts(list) {
  const card = refs.receipts; if (!card) return;
  const fresh = new Set(knownReceipts ? list.filter((r) => !knownReceipts.has(r.id)).map((r) => r.id) : []);
  knownReceipts = new Set(list.map((r) => r.id));
  if (!list.length) {
    card.replaceChildren(receiptsHead(list), emptyState({ icon: 'receipt', title: L('لم ترسل ملفات بعد', 'No deliveries yet'),
      body: L('عند تسليم أول ملف يظهر إيصاله هنا — دون أي محتوى.', 'When you deliver your first file, its receipt appears here — never the content.'),
      actions: blocked ? [] : [{ label: L('اختيار ملفات', 'Choose files'), icon: 'upload', tertiary: true, onClick: () => refs.input?.click() }] }));
    return;
  }
  const table = dataTable({
    caption: L('سجل تسليم الملفات إلى مرصاد', 'Files delivered to Marsad'),
    sortKey: 'time', sortDir: 'desc',
    rowAttrs: (r) => ({ 'data-receipt': r.id, class: fresh.has(r.id) ? 'su-row-new' : null }),
    columns: [
      { key: 'receipt', label: L('الإيصال', 'Receipt'), render: (r) => (r.vault_receipt
        ? h('span.su-receipt', h('code.num', r.vault_receipt), h('button.icon-btn.su-copy', { type: 'button', 'aria-label': L(`نسخ الإيصال ${r.vault_receipt}`, `Copy receipt ${r.vault_receipt}`), 'data-tip': L('نسخ', 'Copy'), onclick: () => copyText(r.vault_receipt, L('نُسخ رقم الإيصال', 'Receipt number copied')) }, icon('copy')))
        : h('span.faint', L('لم يصدر إيصال', 'No receipt issued'))) },
      { key: 'status', label: L('الحالة', 'Status'), sort: (r) => r.status, render: (r) => (r.status === 'delivered'
        ? h('span.chip.tiny.good', icon('circleCheck'), L('سُلِّم', 'Delivered'))
        : h('span.chip.tiny.crit', icon('circleX'), L('تعذّر التسليم', 'Failed'))) },
      { key: 'size', label: L('الحجم', 'Size'), num: true, sort: (r) => r.size, render: (r) => h('span.tabular.su-size', fmtBytes(r.size)) },
      { key: 'time', label: L('الوقت', 'Time'), sort: (r) => r.created_at, render: (r) => h('span.su-time', fmtDate(r.created_at), ' · ', fmtTime(r.created_at)) },
    ],
    rows: list,
  });
  card.replaceChildren(receiptsHead(list), table);
}
