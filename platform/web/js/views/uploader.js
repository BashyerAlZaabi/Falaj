// Smart Uploader (outside Vault) -> Marsad (inside Vault). One direction only:
// the portal forwards the file and keeps just an opaque receipt.
import { api } from '../api.js';
import { h, icon, toast } from '../ui.js';
import { L, fmtDate, fmtTime } from '../i18n.js';

export async function renderUploader(root) {
  const receipts = await api('/api/su/receipts').catch(() => []);
  const input = h('input', { type: 'file', class: 'hidden' });
  const status = h('div.small');
  const drop = h('section.card.size-l', { style: { textAlign: 'center', padding: '36px', borderStyle: 'dashed' } },
    h('div', { style: { fontSize: '40px' } }, '⬆️'),
    h('h3', L('ارفع ملفاً إلى مرصاد', 'Upload a file to Marsad')),
    h('p.small.muted', L('يُسلَّم الملف مباشرة إلى مرصاد داخل Vault (اتجاه واحد). لا تُحفظ نسخة منه خارج Vault ولا يُرسل إلى خدمات الذكاء الاصطناعي المشتركة، ولا يمكن استعراضه من هنا بعد الرفع.', 'The file goes straight into Marsad inside Vault (one-way). No copy is kept outside Vault.')),
    h('button.btn.primary', { onclick: () => input.click() }, icon('upload'), L('اختيار ملف', 'Choose file')), input, status);
  const send = async (f) => {
    status.textContent = L('جارٍ التسليم إلى مرصاد…', 'Delivering to Marsad…');
    try {
      const r = await api('/api/su/upload', { method: 'POST', raw: f, headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(f.name) } });
      status.textContent = `✓ ${r.note} ${L('رقم الإيصال', 'Receipt')}: ${r.receipt}`;
      toast(L('سُلِّم الملف إلى مرصاد', 'Delivered to Marsad'));
    } catch (e) { status.textContent = `✗ ${e.message}`; }
  };
  input.onchange = () => input.files[0] && send(input.files[0]);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; });
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.style.borderColor = ''; e.dataTransfer.files[0] && send(e.dataTransfer.files[0]); });
  root.append(drop);
  root.append(h('div.section', L('إيصالات التسليم (بدون محتوى)', 'Delivery receipts (no content)')));
  root.append(h('section.card.size-l', receipts.length ? h('table.tbl', h('thead', h('tr', h('th', L('الإيصال', 'Receipt')), h('th', L('الحالة', 'Status')), h('th', L('الحجم', 'Size')), h('th', L('الوقت', 'Time')))),
    h('tbody', receipts.map((r) => h('tr', h('td', r.vault_receipt || '—'), h('td', r.status === 'delivered' ? h('span.chip.tiny.good', L('سُلّم', 'Delivered')) : h('span.chip.tiny.crit', L('فشل', 'Failed'))), h('td', `${Math.ceil(r.size / 1024)} KB`), h('td', `${fmtDate(r.created_at)} ${fmtTime(r.created_at)}`)))))
    : h('div.empty', L('لا توجد عمليات رفع', 'No uploads yet'))));
}
