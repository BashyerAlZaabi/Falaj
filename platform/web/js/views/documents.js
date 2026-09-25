import { api } from '../api.js';
import { h, icon, modal } from '../ui.js';
import { L, t, fmtDate, fmtTime } from '../i18n.js';
import { runTool } from '../widgets.js';
import * as Editor from '../editor.js';
import * as Chat from '../chat.js';

const KINDS = { report: ['تقرير', 'Report'], letter: ['خطاب', 'Letter'], plan: ['خطة', 'Plan'], minutes: ['محضر', 'Minutes'], note: ['ملاحظة', 'Note'], summary: ['ملخص', 'Summary'] };

export async function renderDocuments(root) {
  const docs = await api('/api/documents');
  root.append(h('div.toolbar',
    h('button.btn.primary', { onclick: newDoc }, icon('plus'), L('مستند جديد', 'New document')),
    h('button.btn', { onclick: () => Chat.send(L('ابنِ تقريراً عن المشاريع المتأخرة', 'Build a report on delayed projects')) }, icon('spark'), L('تقرير المشاريع المتأخرة', 'Delayed projects report')),
    h('button.btn', { onclick: () => Chat.focus(L('اكتب خطة ', 'Write a plan ')) }, icon('spark'), L('خطة', 'Plan')),
    h('button.btn', { onclick: () => Chat.focus(L('جهّز محضر اجتماع: ', 'Prepare meeting minutes: ')) }, icon('spark'), L('محضر اجتماع', 'Minutes')),
    h('button.btn', { onclick: () => Chat.focus(L('اكتب خطاباً إلى ', 'Write a letter to ')) }, icon('spark'), L('خطاب', 'Letter'))));
  root.append(h('section.card.size-l', docs.length ? h('table.tbl', h('thead', h('tr', h('th', L('العنوان', 'Title')), h('th', L('النوع', 'Type')), h('th', L('الإصدار', 'Version')), h('th', L('آخر تعديل', 'Updated')), h('th', ''))),
    h('tbody', docs.map((d) => h('tr.clickable', { onclick: (e) => { if (!e.target.closest('a')) Editor.open(d.id); } }, h('td', d.title), h('td', L(...KINDS[d.kind])), h('td', `v${d.current_version}`), h('td', `${fmtDate(d.updated_at)} ${fmtTime(d.updated_at)}`),
      h('td', h('a.btn.sm.ghost', { href: `/api/documents/${d.id}/export.docx`, download: '' }, 'DOCX'), h('a.btn.sm.ghost', { href: `/api/documents/${d.id}/export.pdf`, download: '' }, 'PDF'))))))
    : h('div.empty', L('لا مستندات بعد. اطلب من المساعد إعداد تقرير أو خطة أو محضر.', 'No documents yet. Ask the assistant for a report, plan or minutes.'))));
}

export async function newDoc() {
  const title = h('input.field'); const kind = h('select.field', Object.entries(KINDS).map(([k, v]) => h('option', { value: k }, L(...v))));
  const ok = await modal(L('مستند جديد', 'New document'), h('div', h('label.lbl', L('العنوان', 'Title')), title, h('label.lbl', L('النوع', 'Type')), kind), [{ label: t('cancel'), value: false }, { label: L('إنشاء', 'Create'), value: true, primary: true }]);
  if (!ok) return;
  const r = await runTool('create_document', { title: title.value, kind: kind.value, content_html: '<p></p>' });
  if (r) Editor.open(r.result.id);
}
