// Documents: one persistent document per request, autosave, version history,
// restore, structured edit operations, sharing (confirmed), exports.
import { one, all, run, uid, now, tx, json, audit } from '../db.js';
import * as P from '../policy.js';
import { BadInput } from './work.js';
import { sanitize, blocks, fromBlocks, textOf, esc, htmlToText } from '../lib/html.js';
import { notify } from '../bus.js';

const KINDS = ['report', 'letter', 'plan', 'minutes', 'note', 'summary'];
const AUTOSAVE_WINDOW_MS = 2 * 60 * 1000;

const pub = (d, level) => d && ({ ...d, sources: json(d.sources, []), access: level });

export function listDocuments(user) {
  const s = P.documentScopeSql(user);
  return all(`SELECT d.id,d.title,d.kind,d.owner_id,d.current_version,d.updated_at,d.created_at FROM documents d WHERE ${s.sql} ORDER BY d.updated_at DESC LIMIT 100`, ...s.params);
}

export function getDocument(user, id) {
  const { doc, level } = P.documentAccess(user, id);
  if (!doc) throw new P.NotFound('المستند غير موجود أو غير متاح لك');
  return pub(doc, level);
}

function requireEdit(user, id) {
  const { doc, level } = P.documentAccess(user, id);
  if (!doc) throw new P.NotFound('المستند غير موجود أو غير متاح لك');
  if (level === 'view') throw new P.Forbidden('لديك صلاحية اطلاع فقط على هذا المستند');
  return doc;
}

export function createDocument(user, { title, kind = 'note', content_html = '', sources = [], lang = 'ar' }) {
  const t = String(title || '').trim();
  if (!t) throw new BadInput('عنوان المستند مطلوب', 'title');
  if (!KINDS.includes(kind)) throw new BadInput('نوع مستند غير صالح', 'kind');
  const id = uid('dc_');
  const html = sanitize(content_html);
  tx(() => {
    run('INSERT INTO documents (id,title,kind,owner_id,department_id,content_html,sources,current_version,lang) VALUES (?,?,?,?,?,?,?,1,?)',
      id, t, kind, user.id, user.department_id, html, JSON.stringify(sources), lang);
    run('INSERT INTO document_versions (id,document_id,version,title,content_html,author_id,reason) VALUES (?,?,?,?,?,?,?)',
      uid('dv_'), id, 1, t, html, user.id, 'created');
  });
  audit(user.id, 'document.create', id, { title: t });
  notify([user.id], { type: 'changed', entity: 'document', id });
  return { result: getDocument(user, id), undo: { tool: '_undo_create_document', input: { id } } };
}

// Save content. Autosaves by the same author within a short window are coalesced
// into the current version; every other save creates a new version.
export function saveDocument(user, id, { title, content_html, reason = 'manual', base_version, autosave = false }) {
  const doc = requireEdit(user, id);
  if (base_version != null && Number(base_version) !== doc.current_version) {
    const e = new Error('تم تعديل المستند من مكان آخر؛ حُمّلت أحدث نسخة'); e.status = 409; e.code = 'conflict';
    e.latest = getDocument(user, id); throw e;
  }
  const html = content_html !== undefined ? sanitize(content_html) : doc.content_html;
  const newTitle = title !== undefined ? String(title).trim() || doc.title : doc.title;
  if (html === doc.content_html && newTitle === doc.title) {
    // "Save version" right after an autosave: promote that autosave to a named manual version.
    if (!autosave && reason === 'manual') {
      const lastV = one('SELECT id, reason FROM document_versions WHERE document_id=? ORDER BY version DESC LIMIT 1', id);
      if (lastV?.reason === 'autosave') {
        run("UPDATE document_versions SET reason='manual' WHERE id=?", lastV.id);
        notify(docRecipients(id), { type: 'changed', entity: 'document', id, version: doc.current_version });
        return { result: getDocument(user, id), promoted: true };
      }
    }
    return { result: getDocument(user, id), unchanged: true };
  }
  const last = one('SELECT * FROM document_versions WHERE document_id=? ORDER BY version DESC LIMIT 1', id);
  const coalesce = autosave && last && last.reason === 'autosave' && last.author_id === user.id && Date.now() - Date.parse(last.created_at + (last.created_at.endsWith('Z') ? '' : 'Z')) < AUTOSAVE_WINDOW_MS;
  const prevVersion = doc.current_version;
  tx(() => {
    if (coalesce) {
      run('UPDATE document_versions SET content_html=?, title=? WHERE id=?', html, newTitle, last.id);
      run('UPDATE documents SET content_html=?, title=?, updated_at=? WHERE id=?', html, newTitle, now(), id);
    } else {
      const v = prevVersion + 1;
      run('INSERT INTO document_versions (id,document_id,version,title,content_html,author_id,reason,created_at) VALUES (?,?,?,?,?,?,?,?)',
        uid('dv_'), id, v, newTitle, html, user.id, autosave ? 'autosave' : reason, now());
      run('UPDATE documents SET content_html=?, title=?, current_version=?, updated_at=? WHERE id=?', html, newTitle, v, now(), id);
    }
  });
  const saved = getDocument(user, id);
  if (saved.content_html !== html) throw new Error('فشل التحقق من حفظ المستند');
  notify(docRecipients(id), { type: 'changed', entity: 'document', id, version: saved.current_version });
  return { result: saved, undo: coalesce ? null : { tool: 'restore_document_version', input: { id, version: prevVersion } } };
}

function docRecipients(id) {
  const d = one('SELECT owner_id FROM documents WHERE id=?', id);
  return [d?.owner_id, ...all('SELECT user_id FROM document_shares WHERE document_id=?', id).map((r) => r.user_id)].filter(Boolean);
}

export function listVersions(user, id) {
  getDocument(user, id);
  return all(`SELECT v.version,v.title,v.reason,v.created_at,u.name_ar AS author_ar,u.name_en AS author_en, length(v.content_html) AS size
              FROM document_versions v JOIN users u ON u.id=v.author_id WHERE v.document_id=? ORDER BY v.version DESC`, id);
}
export function getVersion(user, id, version) {
  getDocument(user, id);
  const v = one('SELECT version,title,content_html,reason,created_at FROM document_versions WHERE document_id=? AND version=?', id, version);
  if (!v) throw new P.NotFound('الإصدار غير موجود');
  return v;
}
export function restoreVersion(user, { id, version }) {
  requireEdit(user, id);
  const v = one('SELECT * FROM document_versions WHERE document_id=? AND version=?', id, Number(version));
  if (!v) throw new P.NotFound('الإصدار غير موجود');
  return saveDocument(user, id, { title: v.title, content_html: v.content_html, reason: `restore v${version}` });
}

export function deleteDocument(user, { id }) {
  const { doc, level } = P.documentAccess(user, id);
  if (!doc) throw new P.NotFound();
  if (level !== 'owner') throw new P.Forbidden('فقط مالك المستند يستطيع حذفه');
  run('UPDATE documents SET deleted_at=? WHERE id=?', now(), id);
  audit(user.id, 'document.delete', id, {});
  notify(docRecipients(id), { type: 'changed', entity: 'document', id });
  return { result: { id, title: doc.title, deleted: true } };
}
export function undoCreateDocument(user, { id }) {
  const d = one('SELECT * FROM documents WHERE id=? AND owner_id=? AND deleted_at IS NULL', id, user.id);
  if (!d) throw new P.NotFound();
  run('UPDATE documents SET deleted_at=? WHERE id=?', now(), id);
  notify([user.id], { type: 'changed', entity: 'document', id });
  return { result: { id, undone: true } };
}

// Sharing changes permissions -> always goes through explicit confirmation (see tools).
export function shareDocument(user, { id, user_id, permission = 'view' }) {
  const { doc, level } = P.documentAccess(user, id);
  if (!doc) throw new P.NotFound();
  if (level !== 'owner') throw new P.Forbidden('فقط المالك يستطيع مشاركة المستند');
  if (!['view', 'edit'].includes(permission)) throw new BadInput('صلاحية غير صالحة');
  const target = one('SELECT id,name_ar FROM users WHERE id=? AND active=1', user_id);
  if (!target) throw new BadInput('المستخدم غير موجود');
  run('INSERT INTO document_shares (document_id,user_id,permission) VALUES (?,?,?) ON CONFLICT(document_id,user_id) DO UPDATE SET permission=excluded.permission', id, user_id, permission);
  audit(user.id, 'document.share', id, { user_id, permission });
  notify([user_id, user.id], { type: 'changed', entity: 'document', id });
  return { result: { id, shared_with: target.name_ar, permission } };
}

// ---------------- structured edit operations (deterministic) ----------------
const FORMAL = [
  [/خلّه|خله/g, 'اجعله'], [/خلّيه|خليه/g, 'اجعله'], [/عشان/g, 'من أجل'], [/حق /g, 'الخاص بـ '], [/وايد/g, 'كثيراً'],
  [/زين/g, 'جيد'], [/شي /g, 'شيء '], [/هالـ?/g, 'هذا ال'], [/اللي/g, 'الذي'], [/مب |مو /g, 'ليس '], [/بس /g, 'لكن '],
  [/يبا|يبى|يبغى/g, 'يريد'], [/الحين/g, 'الآن'], [/إحنا|احنا/g, 'نحن'], [/تراه?/g, 'إذ إنّ'], [/ok|OK|أوكي/g, 'موافق'],
];

export function paragraphIndexes(bs) { return bs.map((b, i) => (b.tag === 'p' ? i : -1)).filter((i) => i >= 0); }

export function applyOperation(html, op) {
  const bs = blocks(html);
  const paras = paragraphIndexes(bs);
  const para = (text) => ({ tag: 'p', children: [{ text }] });
  switch (op.type) {
    case 'replace_paragraph': {
      const idx = paras[op.index - 1];
      if (idx === undefined) throw new BadInput(`المستند يحتوي ${paras.length} فقرة فقط`);
      const nb = blocks(op.html ?? `<p>${esc(op.text)}</p>`);
      bs.splice(idx, 1, ...nb);
      return { html: fromBlocks(bs), changed: `الفقرة ${op.index}` };
    }
    case 'shorten_intro': {
      const idx = paras[0];
      if (idx === undefined) throw new BadInput('لا توجد مقدمة لاختصارها');
      const text = textOf(bs[idx]).trim();
      const sentences = text.split(/(?<=[.!؟?。])\s+/).filter(Boolean);
      let short = sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 2))).join(' ');
      if (short.length >= text.length) { const words = text.split(/\s+/); short = words.slice(0, Math.max(8, Math.ceil(words.length / 2))).join(' ') + (words.length > 8 ? '…' : ''); }
      bs[idx] = para(short);
      return { html: fromBlocks(bs), changed: 'المقدمة', before_len: text.length, after_len: short.length };
    }
    case 'formalize': {
      let out = fromBlocks(bs); let n = 0;
      for (const [re, rep] of FORMAL) out = out.replace(re, () => { n++; return rep; });
      return { html: out, changed: `${n} تعبير`, replacements: n };
    }
    case 'add_table': {
      const head = `<tr>${op.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;
      const rows = op.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c ?? '')}</td>`).join('')}</tr>`).join('');
      const nb = [...(op.heading ? blocks(`<h2>${esc(op.heading)}</h2>`) : []), ...blocks(`<table><thead>${head}</thead><tbody>${rows}</tbody></table>`)];
      bs.push(...nb);
      return { html: fromBlocks(bs), changed: 'جدول جديد' };
    }
    case 'append': { bs.push(...blocks(op.html)); return { html: fromBlocks(bs), changed: 'إضافة محتوى' }; }
    case 'replace_all': return { html: sanitize(op.html), changed: 'المستند كاملاً' };
    default: throw new BadInput(`عملية تعديل غير معروفة: ${op.type}`);
  }
}

export function editDocument(user, { id, operation, reason }) {
  const doc = requireEdit(user, id);
  const out = applyOperation(doc.content_html, operation);
  if (out.html === doc.content_html) return { result: { document: getDocument(user, id), changed: out.changed, unchanged: true } };
  const saved = saveDocument(user, id, { content_html: out.html, reason: reason || `assistant: ${operation.type}` });
  return { result: { document: saved.result, changed: out.changed, replacements: out.replacements }, undo: saved.undo };
}

export function documentText(user, id) { return htmlToText(getDocument(user, id).content_html); }
