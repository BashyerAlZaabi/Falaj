// Reusable Skills: each has declared inputs/outputs and an invocation path
// (assistant tool `run_skill`, REST POST /api/skills/:key/run, MCP).
// With a connected generation model, content is written by the model from
// permitted platform data; otherwise deterministic templates are used and
// missing facts are left as explicit placeholders (never invented).
import * as W from '../services/work.js';
import * as D from '../services/documents.js';
import { complete, resolve } from './services.js';
import { esc, htmlToText, sanitize, textToHtml } from '../lib/html.js';
import { one } from '../db.js';
import { BadInput } from '../services/work.js';

export const SKILL_DEFS = [
  { key: 'daily_briefing', name_ar: 'ملخص اليوم', name_en: 'Daily briefing', description_ar: 'ملخص للمهام والمواعيد والأولويات والتنبيهات', inputs: { type: 'object', properties: {} }, outputs: 'summary{counts, due_today, overdue, events_today, delayed_projects, needs_action}', invocation: 'run_skill("daily_briefing") | POST /api/skills/daily_briefing/run' },
  { key: 'delayed_projects_report', name_ar: 'تقرير المشاريع المتأخرة', name_en: 'Delayed projects report', description_ar: 'ينشئ تقريراً فعلياً من بيانات المشاريع المتأخرة ضمن نطاقك', inputs: { type: 'object', properties: { title: { type: 'string' } } }, outputs: 'document{id,title}', invocation: 'run_skill("delayed_projects_report")' },
  { key: 'summarize', name_ar: 'تلخيص مستند أو ملف', name_en: 'Summarize', description_ar: 'يلخّص مستنداً أو ملفاً مرفوعاً أو نصاً', inputs: { type: 'object', properties: { document_id: { type: 'string' }, upload_id: { type: 'string' }, text: { type: 'string' }, max_points: { type: 'integer' } } }, outputs: 'summary{points[], method}', invocation: 'run_skill("summarize", {document_id})' },
  { key: 'create_plan', name_ar: 'إنشاء خطة', name_en: 'Create plan', description_ar: 'خطة عمل بمراحل ومسؤوليات ومواعيد', inputs: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, goal: { type: 'string' }, project_id: { type: 'string' } } }, outputs: 'document{id,title}', invocation: 'run_skill("create_plan", {title, goal?, project_id?})' },
  { key: 'meeting_minutes', name_ar: 'محضر اجتماع', name_en: 'Meeting minutes', description_ar: 'محضر اجتماع منظم', inputs: { type: 'object', properties: { title: { type: 'string' }, date: { type: 'string' }, attendees: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, project_id: { type: 'string' } } }, outputs: 'document{id,title}', invocation: 'run_skill("meeting_minutes", {...})' },
  { key: 'draft_letter', name_ar: 'صياغة خطاب', name_en: 'Draft letter', description_ar: 'خطاب رسمي', inputs: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, points: { type: 'string' } } }, outputs: 'document{id,title}', invocation: 'run_skill("draft_letter", {to, subject, points})' },
  { key: 'analyze_file', name_ar: 'تحليل ملف', name_en: 'Analyze file', description_ar: 'تحليل ملف مرفوع (نص، CSV، JSON، Word)', inputs: { type: 'object', required: ['upload_id'], properties: { upload_id: { type: 'string' } } }, outputs: 'analysis{kind, stats, summary}', invocation: 'run_skill("analyze_file", {upload_id})' },
];

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—');
const PH = (s) => `[يُستكمل: ${s}]`;

async function generateHtml(user, instruction, data) {
  const r = resolve('generate');
  if (r.provider.kind === 'local') return null;
  try {
    const out = await complete({
      capability: 'generate', user, maxTokens: 3000,
      system: 'أنت كاتب مؤسسي. اكتب محتوى المستند بصيغة HTML بسيطة فقط (h2,h3,p,ul,ol,li,table,thead,tbody,tr,th,td,strong,em). لا تخترع أرقاماً أو نسباً أو أسماء غير موجودة في البيانات المعطاة؛ ضع [يُستكمل: ...] لأي معلومة ناقصة. اكتب بلغة المستخدم.',
      messages: [{ role: 'user', content: `${instruction}\n\nالبيانات المتاحة (ضمن صلاحيات المستخدم):\n${JSON.stringify(data).slice(0, 12000)}` }],
    });
    const html = sanitize(out.text.replace(/^```html?|```$/gm, ''));
    return html.trim() ? html : null;
  } catch { return null; }
}

function extractive(text, maxPoints = 5) {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!؟?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 15);
  if (sentences.length <= maxPoints) return sentences;
  const stop = new Set('في من على إلى عن أن إن هذا هذه التي الذي مع كما أو و ثم the a an of to in and or is are for on with'.split(' '));
  const freq = {};
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) if (!stop.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
  const scored = sentences.map((s, i) => ({ s, i, score: (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).reduce((a, w) => a + (freq[w] || 0), 0) / Math.sqrt(s.length) }));
  return scored.sort((a, b) => b.score - a.score).slice(0, maxPoints).sort((a, b) => a.i - b.i).map((x) => x.s);
}

export async function runSkill(user, key, input = {}) {
  switch (key) {
    case 'daily_briefing': return { result: W.dailySummary(user) };

    case 'delayed_projects_report': {
      const delayed = W.listProjects(user, { delayed: true });
      const all = W.listProjects(user);
      const title = input.title || `تقرير المشاريع المتأخرة — ${new Date().toISOString().slice(0, 10)}`;
      const data = delayed.map((p) => ({ name: p.name, department: p.dept_ar, owner: p.owner_name_ar, due_date: p.due_date, days_overdue: p.days_overdue, progress: p.progress, progress_updated_at: p.progress_updated_at, open_tasks: p.tasks_total - p.tasks_done, overdue_tasks: p.tasks_overdue }));
      let html = await generateHtml(user, `اكتب تقريراً رسمياً عن المشاريع المتأخرة: مقدمة، ملخص، جدول تفصيلي، ملاحظات وتوصيات مبنية فقط على البيانات. إجمالي المشاريع ضمن النطاق: ${all.length}.`, data);
      const method = html ? 'model' : 'template';
      if (!html) {
        const rows = delayed.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.dept_ar)}</td><td>${esc(p.owner_name_ar || '')}</td><td>${fmtDate(p.due_date)}</td><td>${p.days_overdue}</td><td>${p.progress == null ? 'غير محددة' : p.progress + '%'}</td><td>${p.tasks_total - p.tasks_done} (${p.tasks_overdue} متأخرة)</td></tr>`).join('');
        html = `<h2>المقدمة</h2><p>يعرض هذا التقرير المشاريع التي تجاوزت تاريخ استحقاقها ولم تُغلق بعد، ضمن نطاق صلاحيات ${esc(user.name_ar)}. أُعدّ التقرير في ${new Date().toISOString().slice(0, 10)} من بيانات المنصة مباشرة.</p>
<h2>الملخص</h2><ul><li>إجمالي المشاريع ضمن النطاق: ${all.length}</li><li>المشاريع المتأخرة: ${delayed.length}</li><li>مشاريع متأخرة دون نسبة إنجاز مسجلة: ${delayed.filter((p) => p.progress == null).length}</li></ul>
${delayed.length ? `<h2>تفاصيل المشاريع المتأخرة</h2><table><thead><tr><th>المشروع</th><th>الإدارة</th><th>المسؤول</th><th>تاريخ الاستحقاق</th><th>أيام التأخير</th><th>نسبة الإنجاز</th><th>المهام المفتوحة</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>لا توجد مشاريع متأخرة ضمن نطاقك حالياً.</p>'}
<h2>الملاحظات والتوصيات</h2><p>${PH('توصيات الإدارة بشأن المشاريع المتأخرة')}</p>
<h2>المصادر</h2><p>بيانات المشاريع والمهام في Unified Portal (خارج Vault).</p>`;
      }
      const doc = D.createDocument(user, { title, kind: 'report', content_html: html, sources: [{ type: 'projects', filter: 'delayed', ids: delayed.map((p) => p.id), at: new Date().toISOString() }] });
      return { result: { document: doc.result, delayed_count: delayed.length, method }, undo: doc.undo, open_document: doc.result.id };
    }

    case 'summarize': {
      let text = input.text || '';
      let sourceLabel = 'نص';
      if (input.document_id) { text = D.documentText(user, input.document_id); sourceLabel = 'مستند'; }
      if (input.upload_id) {
        const up = one('SELECT * FROM uploads WHERE id=? AND user_id=?', input.upload_id, user.id);
        if (!up) throw new BadInput('الملف غير موجود');
        text = up.text_content || ''; sourceLabel = up.filename;
      }
      if (!text.trim()) throw new BadInput('لا يوجد نص لتلخيصه');
      const r = resolve('summarize');
      if (r.provider.kind !== 'local') {
        try {
          const out = await complete({ capability: 'summarize', user, system: 'لخّص النص في نقاط موجزة دقيقة بلغة النص، دون إضافة معلومات غير موجودة. أعد كل نقطة في سطر يبدأ بـ "- ".', messages: [{ role: 'user', content: text.slice(0, 30000) }] });
          return { result: { points: out.text.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean), method: 'model', source: sourceLabel } };
        } catch { /* fall back */ }
      }
      return { result: { points: extractive(text, input.max_points || 5), method: 'extractive', source: sourceLabel } };
    }

    case 'create_plan': {
      if (!input.title) throw new BadInput('عنوان الخطة مطلوب');
      let tasks = []; let project = null;
      if (input.project_id) { project = W.getProject(user, input.project_id); tasks = project.tasks; }
      let html = await generateHtml(user, `اكتب خطة عمل بعنوان "${input.title}" تتضمن: الهدف، النطاق، المراحل، جدول المسؤوليات والمواعيد، المخاطر، مؤشرات النجاح. الهدف المعلن: ${input.goal || 'غير محدد'}`, { project: project && { name: project.name, due_date: project.due_date, progress: project.progress }, tasks: tasks.map((t) => ({ title: t.title, assignee: t.assignee_ar, due: t.due_date, status: t.status })) });
      const method = html ? 'model' : 'template';
      if (!html) {
        const rows = tasks.length ? tasks.map((t) => `<tr><td>${esc(t.title)}</td><td>${esc(t.assignee_ar || '')}</td><td>${fmtDate(t.due_date)}</td></tr>`).join('') : `<tr><td>${PH('النشاط')}</td><td>${PH('المسؤول')}</td><td>${PH('الموعد')}</td></tr>`;
        html = `<h2>الهدف</h2><p>${input.goal ? esc(input.goal) : PH('الهدف الرئيسي للخطة')}</p>
<h2>النطاق</h2><p>${project ? `ترتبط الخطة بمشروع «${esc(project.name)}»${project.due_date ? ` المستحق في ${project.due_date}` : ''}.` : PH('نطاق الخطة')}</p>
<h2>المراحل</h2><ol><li>التحضير والتحليل</li><li>التنفيذ</li><li>المتابعة والتقييم</li></ol>
<h2>المسؤوليات والمواعيد</h2><table><thead><tr><th>النشاط</th><th>المسؤول</th><th>الموعد</th></tr></thead><tbody>${rows}</tbody></table>
<h2>المخاطر</h2><p>${PH('المخاطر المتوقعة وخطط المعالجة')}</p>
<h2>مؤشرات النجاح</h2><p>${PH('مؤشرات قابلة للقياس')}</p>`;
      }
      const doc = D.createDocument(user, { title: input.title, kind: 'plan', content_html: html, sources: project ? [{ type: 'project', id: project.id }] : [] });
      return { result: { document: doc.result, method }, undo: doc.undo, open_document: doc.result.id };
    }

    case 'meeting_minutes': {
      const title = input.title || `محضر اجتماع — ${input.date || new Date().toISOString().slice(0, 10)}`;
      let html = input.notes ? await generateHtml(user, `حوّل الملاحظات التالية إلى محضر اجتماع رسمي (البيانات، الحضور، جدول الأعمال، النقاشات، القرارات، جدول المهام والمسؤوليات والمواعيد):\n${input.notes}`, { attendees: input.attendees, date: input.date }) : null;
      const method = html ? 'model' : 'template';
      if (!html) {
        html = `<h2>بيانات الاجتماع</h2><table><tbody><tr><th>التاريخ</th><td>${esc(input.date || PH('التاريخ'))}</td></tr><tr><th>المكان</th><td>${PH('المكان')}</td></tr><tr><th>أعدّه</th><td>${esc(user.name_ar)}</td></tr></tbody></table>
<h2>الحضور</h2>${input.attendees?.length ? `<ul>${input.attendees.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : `<p>${PH('أسماء الحضور')}</p>`}
<h2>جدول الأعمال</h2><ol><li>${PH('البند الأول')}</li></ol>
<h2>النقاشات</h2>${input.notes ? textToHtml(input.notes) : `<p>${PH('ملخص النقاش')}</p>`}
<h2>القرارات</h2><ul><li>${PH('القرار')}</li></ul>
<h2>المهام والمسؤوليات</h2><table><thead><tr><th>المهمة</th><th>المسؤول</th><th>الموعد</th></tr></thead><tbody><tr><td>${PH('المهمة')}</td><td>${PH('المسؤول')}</td><td>${PH('الموعد')}</td></tr></tbody></table>`;
      }
      const doc = D.createDocument(user, { title, kind: 'minutes', content_html: html });
      return { result: { document: doc.result, method }, undo: doc.undo, open_document: doc.result.id };
    }

    case 'draft_letter': {
      const subject = input.subject || PH('الموضوع');
      let html = await generateHtml(user, `اكتب خطاباً رسمياً موجهاً إلى ${input.to || '[يُستكمل: الجهة]'} بموضوع "${subject}". النقاط: ${input.points || 'غير محددة'}. المرسل: ${user.name_ar}، ${user.title_ar || ''}، ${user.dept_ar}.`, {});
      const method = html ? 'model' : 'template';
      if (!html) {
        html = `<p>${esc(input.to ? `السادة/ ${input.to}` : PH('المرسل إليه'))} المحترمين،</p><p>السلام عليكم ورحمة الله وبركاته، وبعد،</p>
<p><strong>الموضوع: ${esc(subject)}</strong></p>
${input.points ? textToHtml(input.points) : `<p>${PH('نص الخطاب')}</p>`}
<p>وتفضلوا بقبول فائق الاحترام والتقدير،،،</p><p>${esc(user.name_ar)}<br>${esc(user.title_ar || '')}<br>${esc(user.dept_ar || '')}</p>`;
      }
      const doc = D.createDocument(user, { title: `خطاب — ${input.subject || 'مسودة'}`, kind: 'letter', content_html: html });
      return { result: { document: doc.result, method }, undo: doc.undo, open_document: doc.result.id };
    }

    case 'analyze_file': {
      const up = one('SELECT * FROM uploads WHERE id=? AND user_id=?', input.upload_id, user.id);
      if (!up) throw new BadInput('الملف غير موجود أو غير متاح لك');
      const text = up.text_content || '';
      const analysis = { filename: up.filename, size: up.size, kind: 'text' };
      if (/\.csv$/i.test(up.filename) || up.mime === 'text/csv') {
        const lines = text.split(/\r?\n/).filter(Boolean);
        const header = lines[0]?.split(',').map((s) => s.trim()) || [];
        const rows = lines.slice(1).map((l) => l.split(','));
        analysis.kind = 'csv'; analysis.rows = rows.length; analysis.columns = header;
        analysis.numeric = header.map((h, i) => {
          const nums = rows.map((r) => parseFloat(r[i])).filter((n) => Number.isFinite(n));
          return nums.length >= rows.length * 0.6 && nums.length ? { column: h, min: Math.min(...nums), max: Math.max(...nums), avg: +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2), count: nums.length } : null;
        }).filter(Boolean);
      } else if (/\.json$/i.test(up.filename)) {
        try { const j = JSON.parse(text); analysis.kind = 'json'; analysis.top_level = Array.isArray(j) ? `array(${j.length})` : Object.keys(j).slice(0, 20); } catch { analysis.kind = 'text'; }
      }
      analysis.words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
      const sum = text.trim() ? await runSkill(user, 'summarize', { upload_id: up.id }) : { result: { points: [] } };
      analysis.summary = sum.result.points; analysis.summary_method = sum.result.method;
      return { result: analysis };
    }
    default: throw new BadInput(`مهارة غير معروفة: ${key}`);
  }
}

export { htmlToText };
