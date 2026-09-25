// Ask AI orchestrator. Stages streamed to the client:
//   understanding -> executing(tool…) -> done | partial | failed | needs_input | needs_confirmation
// Uses a connected model (tool use) when available; otherwise the local planner.
import { accessibleSystems } from '../systems/registry.js';
import { one, all, run, uid, now, json, tx } from '../db.js';
import { resolve, complete } from './services.js';
import { executeTool, undoAction, allowedToolNames, agentForTool } from './executor.js';
import { publicTools, toolByName } from '../mcp/tools.js';
import * as LP from './local-planner.js';
import * as B from '../services/dashboard.js';
import { esc } from '../lib/html.js';

export function getConversation(user, id) {
  const c = one('SELECT * FROM conversations WHERE id=? AND user_id=?', id, user.id);
  if (!c) return null;
  return { ...c, context: json(c.context, {}), messages: all('SELECT id,role,content,meta,created_at FROM messages WHERE conversation_id=? ORDER BY created_at, rowid', id).map((m) => ({ ...m, meta: json(m.meta, {}) })) };
}
export function listConversations(user) {
  return all('SELECT id,title,updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 50', user.id);
}

function addMessage(convId, role, content, meta = {}) {
  const id = uid('m_');
  run('INSERT INTO messages (id,conversation_id,role,content,meta,created_at) VALUES (?,?,?,?,?,?)', id, convId, role, content, JSON.stringify(meta), now());
  run('UPDATE conversations SET updated_at=? WHERE id=?', now(), convId);
  return id;
}

export async function handleMessage(user, body, emit) {
  const message = String(body.message || '').trim();
  const requestId = String(body.requestId || '').slice(0, 80);
  if (!message) return { error: 'الرسالة فارغة' };
  if (!requestId) return { error: 'requestId مطلوب' };

  // ---- idempotency (resends / reconnects never re-run a request) ----
  const prev = one('SELECT * FROM idempotency WHERE user_id=? AND key=?', user.id, requestId);
  if (prev?.status === 'done') { const r = json(prev.response); emit({ stage: 'replayed' }); emit({ stage: 'final', ...r, replayed: true }); return r; }
  if (prev?.status === 'running') { emit({ stage: 'in_progress', message: 'الطلب نفسه قيد التنفيذ بالفعل' }); return { in_progress: true }; }
  run("INSERT INTO idempotency (user_id,key,status) VALUES (?,?,'running')", user.id, requestId);

  try {
    let conv = body.conversationId ? getConversation(user, body.conversationId) : null;
    if (!conv) {
      const id = uid('cv_');
      run('INSERT INTO conversations (id,user_id,title) VALUES (?,?,?)', id, user.id, message.slice(0, 60));
      conv = getConversation(user, id);
    }
    const ui = body.ui || {};
    addMessage(conv.id, 'user', message, { voice: !!body.voice, ui: { view: ui.view, selectedProjectId: ui.selectedProjectId, openDocumentId: ui.openDocumentId }, attachments: body.attachments || [] });
    emit({ stage: 'understanding', conversationId: conv.id });

    const ctx = { ui, conv: conv.context || {}, voice: !!body.voice, conversationId: conv.id, requestId };
    const chat = resolve('chat');
    let out;
    if (chat.provider.kind !== 'local') {
      try { out = await modelLoop(user, message, conv, ctx, emit); }
      catch (e) { out = await localLoop(user, message, ctx, emit); out.notes.push(`تعذّر الاتصال بخدمة النموذج (${e.message.slice(0, 80)})؛ استُخدم الفهم المحلي.`); out.mode = 'local-fallback'; }
    } else {
      out = await localLoop(user, message, ctx, emit);
      if (chat.degraded) out.notes.push('خدمة النموذج اللغوي غير متصلة؛ يعمل المساعد بالفهم المحلي للأوامر.');
    }

    // ---- update conversation context (for "this project", "the document"…) ----
    const newCtx = { ...(conv.context || {}) };
    for (const r of out.results) {
      const res = r.result;
      if (!res) continue;
      if (r.tool.includes('project') && res.id) newCtx.lastProjectId = res.id;
      if (r.tool === 'create_task' && res.id) { newCtx.lastTaskId = res.id; if (res.project_id) newCtx.lastProjectId = res.project_id; }
      if (['allocate_resource', 'decide_allocation'].includes(r.tool) && res.project_id) newCtx.lastProjectId = res.project_id;
      if (r.open_document) newCtx.lastDocumentId = r.open_document;
      if (r.tool === 'create_office_agent' || r.tool === 'schedule_office_agent') newCtx.lastOfficeAgentId = res.id;
      if (r.tool === 'run_office_agent') newCtx.lastOfficeAgentId = res.agent_id;
    }
    if (ui.selectedProjectId) newCtx.lastProjectId = newCtx.lastProjectId || ui.selectedProjectId;
    if (out.pending !== undefined) newCtx.pending = out.pending || undefined;
    run('UPDATE conversations SET context=? WHERE id=?', JSON.stringify(newCtx), conv.id);

    const oks = out.results.filter((r) => r.status === 'ok');
    const fails = out.results.filter((r) => r.status === 'error');
    const confs = out.results.filter((r) => r.status === 'needs_confirmation');
    let status = 'done';
    if (fails.length && oks.length) status = 'partial';
    else if (fails.length) status = 'failed';
    else if (confs.length) status = 'needs_confirmation';
    else if (out.asks.length && !oks.length) status = 'needs_input';

    const final = {
      conversationId: conv.id, status, mode: out.mode, text: out.text, html: out.html || null,
      actions: out.results.filter((r) => r.tool && toolByName.get(r.tool)?.mutates).map((r) => ({ tool: r.tool, label: r.label, status: r.status, error: r.error, actionId: r.actionId, undoable: r.undoable, agent: r.agent })),
      confirmations: confs.map((r) => r.confirmation),
      options: out.options || [], open_document: out.open_document || null, downloads: out.downloads || [], refresh: out.refresh || [],
      arrange: !!out.arrange, notes: out.notes,
    };
    const msgId = addMessage(conv.id, 'assistant', final.text, final);
    final.messageId = msgId;
    run("UPDATE idempotency SET status='done', response=? WHERE user_id=? AND key=?", JSON.stringify(final), user.id, requestId);
    emit({ stage: 'final', ...final });
    return final;
  } catch (e) {
    console.error('[assistant]', e);
    run('DELETE FROM idempotency WHERE user_id=? AND key=?', user.id, requestId);
    const fail = { status: 'failed', text: `تعذّر تنفيذ الطلب: ${e.message}. لم يُنفَّذ أي إجراء إضافي بعد هذا الخطأ.` };
    emit({ stage: 'final', ...fail });
    return fail;
  }
}

// ---------------------------------------------------------------- local
let TZ = -240; // client timezone offset for rendering times (set per request)
const hhmm = (iso) => new Date(Date.parse(iso) - TZ * 60e3).toISOString().slice(11, 16);
const localDT = (iso) => new Date(Date.parse(iso) - TZ * 60e3).toISOString().slice(0, 16).replace('T', ' ');

async function localLoop(user, message, ctx, emit) {
  TZ = Number.isFinite(+ctx.ui.tzOffset) ? +ctx.ui.tzOffset : -240;
  const { steps, consumedPending } = LP.plan(user, message, ctx);
  const results = []; const asks = []; const parts = []; const notes = [];
  let pending = null; void consumedPending; let options = []; let openDoc = null; const downloads = []; let arrange = false;
  for (const s of steps) {
    if (s.clearPending) pending = null;
    if (s.tool) {
      if (s.setPending) pending = s.setPending;
      emit({ stage: 'executing', label: s.label, tool: s.tool });
      const r = await executeTool(user, s.tool, s.input, { conversationId: ctx.conversationId, requestId: ctx.requestId, voice: ctx.voice, source: 'assistant' });
      const rec = { ...r, tool: s.tool, label: s.label };
      results.push(rec);
      emit({ stage: 'step', label: s.label, status: r.status, error: r.error });
      if (r.open_document) openDoc = r.open_document;
      if (r.status === 'ok' && s.tool === 'export_document') downloads.push({ url: r.result.url, format: r.result.format, title: r.result.title });
      parts.push(renderResult(user, s, rec));
    } else if (s.ask) {
      asks.push(s.ask); parts.push(s.ask);
      if (s.options) options = s.options;
      if (s.pending) pending = s.pending;
      if (s.arrange) arrange = true;
      if (s.rewriteParagraph && resolve('generate').provider.kind !== 'local') {
        // With a generation model we can rewrite directly following the instruction.
        const done = await rewriteParagraph(user, s.rewriteParagraph, ctx, emit);
        if (done) { asks.pop(); parts.pop(); results.push(done.rec); parts.push(done.text); pending = null; openDoc = s.rewriteParagraph.id; }
      }
    } else if (s.say) parts.push(s.say);
    else if (s.undoLast) {
      const last = one("SELECT id,tool FROM actions WHERE user_id=? AND conversation_id=? AND status='ok' AND undo IS NOT NULL AND undone_at IS NULL ORDER BY created_at DESC LIMIT 1", user.id, ctx.conversationId);
      if (!last) parts.push('لا يوجد إجراء قابل للتراجع في هذه المحادثة.');
      else {
        emit({ stage: 'executing', label: 'التراجع عن آخر إجراء' });
        const r = await undoAction(user, last.id);
        results.push({ ...r, tool: 'undo', label: 'تراجع' });
        parts.push(r.status === 'ok' ? `تم التراجع عن آخر إجراء (${last.tool}).` : `تعذّر التراجع: ${r.error}`);
      }
    } else if (s.help) parts.push(helpText(user));
    else if (s.shortText) parts.push(shortTextTemplate(s.shortText, user, notes));
    else if (s.unknown) {
      parts.push(`لم أتمكن من تحديد الإجراء المطلوب في: «${s.unknown}». جرّب مثلاً: «جهّز لي ملخص اليوم»، «أضف مهمة …»، «حدّث تقدم مشروع … إلى 60%»، «أضف بطاقة للمشاريع المتأخرة»، «اكتب خطة …».`);
      options = [{ label: 'ملخص اليوم', value: 'جهّز لي ملخص اليوم' }, { label: 'المشاريع المتأخرة', value: 'اعرض المشاريع المتأخرة' }, { label: 'مهامي', value: 'ما هي مهامي؟' }];
    }
  }
  const failed = results.filter((r) => r.status === 'error');
  const ok = results.filter((r) => r.status === 'ok' && toolByName.get(r.tool)?.mutates);
  if (failed.length && ok.length) parts.push(`\nملخص التنفيذ: نُفّذ ${ok.length} إجراء، وتعذّر ${failed.length}: ${failed.map((f) => f.label).join('، ')}.`);
  const refresh = [...new Set(results.filter((r) => r.status === 'ok').map((r) => entityOf(r.tool)).filter(Boolean))];
  return { mode: 'local', text: parts.filter(Boolean).join('\n\n'), results, asks, pending, options, open_document: openDoc, downloads, refresh, notes, arrange };
}

function entityOf(tool) {
  const sys = toolByName.get(tool)?.system;
  if (sys) return `sys:${sys}`;
  if (/allocat|milestone|strategic|portfolio|capacity|assignments/.test(tool)) return 'project';
  if (/widget|dashboard/.test(tool)) return 'dashboard';
  if (/project/.test(tool)) return 'project';
  if (/task/.test(tool)) return 'task';
  if (/document|skill/.test(tool)) return 'document';
  if (/event/.test(tool)) return 'event';
  if (/office/.test(tool)) return 'office';
  return null;
}

async function rewriteParagraph(user, { id, index, instruction }, ctx, emit) {
  try {
    const doc = one('SELECT content_html FROM documents WHERE id=?', id);
    const paras = (doc.content_html.match(/<p>[\s\S]*?<\/p>/g) || []);
    const target = paras[index - 1];
    if (!target) return null;
    emit({ stage: 'executing', label: `إعادة صياغة الفقرة ${index}` });
    const out = await complete({ capability: 'generate', user, system: 'أعد صياغة الفقرة وفق التعليمات فقط. أعد نص الفقرة الجديد فقط دون أي شرح.', messages: [{ role: 'user', content: `التعليمات: ${instruction}\n\nالفقرة:\n${target.replace(/<[^>]+>/g, '')}` }] });
    const r = await executeTool(user, 'edit_document', { id, operation: { type: 'replace_paragraph', index, text: out.text.trim() } }, { conversationId: ctx.conversationId, requestId: ctx.requestId });
    return { rec: { ...r, tool: 'edit_document', label: `تعديل الفقرة ${index}` }, text: r.status === 'ok' ? `عدّلت الفقرة ${index} فقط، وبقيت بقية المستند كما هي (إصدار جديد ${r.result.document.current_version}).` : `تعذّر التعديل: ${r.error}` };
  } catch { return null; }
}

const P_AR = { urgent: 'عاجلة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const S_AR = { todo: 'قيد الانتظار', in_progress: 'قيد التنفيذ', done: 'منجزة' };

function renderResult(user, step, r) {
  if (r.status === 'needs_confirmation') return r.confirmation.reason === 'voice_value' ? '⚠️ قبل التعديل أحتاج تأكيد القيمة التي سمعتها.' : '⚠️ هذا الإجراء يتطلب تأكيدك قبل التنفيذ.';
  if (r.status === 'error') return `تعذّر «${step.label}»: ${r.error}`;
  const res = r.result;
  const rep = r.replayed ? ' (نُفّذ سابقاً لنفس الطلب ولم يُكرَّر)' : '';
  switch (step.render || step.tool) {
    case 'summary': {
      const s = res; const c = s.counts;
      const lines = [`**ملخص يوم ${s.date}** — ${user.name_ar}`,
        `• المهام المفتوحة: ${c.open_tasks} (مستحقة اليوم: ${c.due_today}، متأخرة: ${c.overdue})`,
        `• مواعيد اليوم: ${c.events_today}${s.events_today.length ? ' — ' + s.events_today.map((e) => `${e.title} (${hhmm(e.starts_at)})`).join('، ') : ''}`,
        `• المشاريع ضمن نطاقك: ${c.projects}، المتأخرة منها: ${c.delayed_projects}`,
        `• تنبيهات غير مقروءة: ${c.alerts}`];
      if (s.priorities.length) lines.push(`\n**الأولويات:**\n${s.priorities.map((t) => `– ${t.title} (${P_AR[t.priority]}${t.due_date ? `، ${t.due_date}` : ''})`).join('\n')}`);
      const REASON_AR = { overdue: 'مهمة متأخرة', delayed: 'مشروع متأخر', missing_progress: 'لا توجد نسبة إنجاز مسجلة', review: 'بانتظار مراجعتك', allocation_decision: 'طلب تخصيص بانتظار موافقتك', assigned: 'تكليف جديد', allocation_pending: 'تخصيص لوقتك بانتظار اعتماد مديرك', allocation_new: 'تخصيص جديد لوقتك' };
      if (s.needs_action.length) lines.push(`\n**يحتاج إجراءً:**\n${s.needs_action.slice(0, 8).map((a) => `– ${a.title}: ${REASON_AR[a.reason] || a.reason}${a.by_ar ? ` (من ${a.by_ar})` : ''}`).join('\n')}`);
      lines.push(`\n_المصدر: ${s.source}، ${hhmm(s.generated_at)}_`);
      return lines.join('\n');
    }
    case 'progress_review': {
      const ps = res;
      if (!ps.length) return 'لا توجد مشاريع نشطة ضمن نطاقك.';
      return `لتحديث تقدم المشاريع أحتاج النسب الفعلية منك، ولن أفترض أي نسبة. الوضع الحالي:\n${ps.map((p) => `– ${p.name}: ${p.progress == null ? 'غير محددة' : p.progress + '%'}${p.progress_updated_at ? ` (آخر تحديث ${p.progress_updated_at.slice(0, 10)})` : ''} — المهام المنجزة ${p.tasks_done}/${p.tasks_total}${p.tasks_total ? ` (${Math.round((p.tasks_done / p.tasks_total) * 100)}% حسب المهام، للاسترشاد فقط)` : ''}`).join('\n')}\n\nأرسل النسب بهذا الشكل: «حدّث تقدم المشاريع: ${ps[0].name} 60%، ${ps[1]?.name || '…'} 40%».`;
    }
    case 'project_progress': return `مشروع «${res.name}»: نسبة الإنجاز ${res.progress == null ? 'غير محددة (لم تُسجَّل بعد)' : res.progress + '%'}${res.progress_updated_at ? `، آخر تحديث ${res.progress_updated_at.slice(0, 16).replace('T', ' ')}` : ''}. المهام المنجزة ${res.tasks_done} من ${res.tasks_total}${res.due_date ? `، الاستحقاق ${res.due_date}` : ''}${res.delayed ? ` — متأخر ${res.days_overdue} يوماً` : ''}.`;
    case 'update_project': {
      const before = r.result && r.before;
      const changed = Object.keys(step.input).filter((k) => k !== 'id');
      return `تم تحديث مشروع «${res.name}»: ${changed.map((k) => k === 'progress' ? `نسبة الإنجاز ${res.progress}%` : `${k} = ${res[k]}`).join('، ')}. انعكس التحديث على الداشبورد.${rep}`;
    }
    case 'create_project': return `تم إنشاء مشروع «${res.name}»${res.due_date ? ` بتاريخ استحقاق ${res.due_date}` : ''}${res.progress == null ? '، دون نسبة إنجاز (لم تُحدَّد)' : ''}.${rep}`;
    case 'create_task': return `تمت إضافة المهمة «${res.title}»${res.project_name ? ` في مشروع «${res.project_name}»` : ''}، المسؤول: ${res.assignee_ar}${res.due_date ? `، الاستحقاق ${res.due_date}` : ''}، الأولوية ${P_AR[res.priority]}.${rep}`;
    case 'update_task': return `تم تحديث المهمة «${res.title}» (${S_AR[res.status]}).${rep}`;
    case 'create_event': return `تمت إضافة الموعد «${res.title}» في ${step.localWhen || localDT(res.starts_at)}.${rep}`;
    case 'add_widget': return `أضفت بطاقة «${res.widget.title || B.WIDGET_TYPES[res.widget.type].label_ar}» إلى الداشبورد وحُفظ التخصيص.${rep}`;
    case 'update_widget': return `${step.label}. هذا تغيير في طريقة العرض فقط، والبيانات تُقرأ من المصدر.${rep}`;
    case 'reorder_widgets': return `${step.label}، وحُفظ الترتيب.${rep}`;
    case 'remove_widget': return `${step.label}. لم تُحذف أي بيانات.${rep}`;
    case 'restore_dashboard': return `استعدت إعدادات الداشبورد (الإصدار ${res.dashboard.version}).${rep}`;
    case 'week_done': {
      const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - since.getUTCDay());
      const done = res.filter((t) => t.completed_at && t.completed_at >= since.toISOString());
      return `إنجاز هذا الأسبوع (منذ ${since.toISOString().slice(0, 10)}): ${done.length} مهمة منجزة${done.length ? `:\n${done.slice(0, 8).map((t) => `– ${t.title}`).join('\n')}` : '.'}`;
    }
    case 'run_skill': {
      if (res.document) return `أنشأت «${res.document.title}» وفتحته في مساحة التحرير${res.delayed_count != null ? ` (${res.delayed_count} مشروع متأخر)` : ''}.${res.method === 'template' ? ' بُني المحتوى من بيانات المنصة بقالب منظم؛ المعلومات غير المتوفرة مُعلَّمة بـ [يُستكمل].' : ''}${rep}`;
      return JSON.stringify(res).slice(0, 500);
    }
    case 'summary_points': return `**ملخص ${res.source}:**\n${res.points.map((p) => `– ${p}`).join('\n')}${res.method === 'extractive' ? '\n_(تلخيص استخلاصي محلي — خدمة التلخيص بالنموذج غير متصلة)_' : ''}`;
    case 'analysis': return `**تحليل ${res.filename}** (${res.kind}, ${res.words} كلمة${res.rows != null ? `، ${res.rows} صف، الأعمدة: ${res.columns.join('، ')}` : ''})\n${(res.numeric || []).map((c) => `– ${c.column}: أدنى ${c.min}، أعلى ${c.max}، متوسط ${c.avg}`).join('\n')}${res.summary?.length ? `\n\nأبرز ما ورد:\n${res.summary.map((p) => `– ${p}`).join('\n')}` : ''}`;
    case 'edit_document': {
      if (res.unchanged) return step.formal ? 'لم أجد تعابير عامية لتحويلها. الصياغة الرسمية الكاملة تتطلب خدمة توليد متصلة.' : 'لم يتغير المستند.';
      return `${step.label}: تم على نفس المستند (الإصدار ${res.document.current_version}).${step.formal ? ` استُبدل ${res.replacements} تعبيراً. (تحويل محلي محدود؛ الصياغة الكاملة تتطلب خدمة التوليد)` : ''}${step.filledFromData === false ? ' لم أجد مهاماً مرتبطة بمصادر المستند، فأضفت صفاً للاستكمال.' : ''}${rep}`;
    }
    case 'achievements': {
      const g = res;
      const q = g.quests.map((x) => `${x.done ? '✓' : '○'} ${x.ar}`).join('\n');
      const earned = g.badges.filter((b) => b.earned).map((b) => b.ar);
      return `**نقاط التميّز: ${g.xp}** — المستوى ${g.level.n} «${g.level.ar}»${g.level.to ? ` (${g.level.to - g.xp} نقطة للمستوى التالي «${g.level.next_ar}»)` : ''}\nاليوم: +${g.today_xp} · هذا الأسبوع: +${g.week_xp} · السلسلة: ${g.streak.current} يوم عمل\n\n**مهام اليوم:**\n${q}\n\n**الشارات:** ${earned.length ? earned.join('، ') : 'لا شارات بعد — أنجز مهمة في موعدها لتبدأ.'}\n_النقاط محسوبة من عملك الفعلي في المنصة._`;
    }
    case 'create_office_agent': {
      const sc = LP.SCHED_AR(res.schedule);
      return `بنيت الوكيل «${res.name}» في مكتب الوكلاء (${sc}). سيجهّز العمل ثم ينتظر مراجعتك وموافقتك قبل تنفيذ أي إجراء.${step.officeNoSchedule ? ' لم تحدد موعداً، لذا جعلته للتشغيل اليدوي؛ يمكنك جدولته من المكتب أو قل مثلاً: «اجعله يومياً الساعة 7».' : ''}${step.officeDefaultTime ? ` لم تحدد الساعة فاستخدمت ${res.schedule.time}؛ عدّلها من المكتب إن أردت.` : ''}${rep}`;
    }
    case 'schedule_office_agent': return `تم: الوكيل «${res.name}» ${res.enabled ? `يعمل الآن ${LP.SCHED_AR(res.schedule)}` : 'موقوف مؤقتاً'}${res.next_run_at ? `، التشغيل القادم ${localDT(res.next_run_at)}` : ''}.${rep}`;
    case 'run_office_agent': return res.status === 'awaiting_review' ? `جهّز الوكيل «${res.agent_name}» ${res.proposal.length} إجراء بانتظار مراجعتك في مكتب الوكلاء. لم يُنفَّذ أي شيء بعد.` : res.status === 'nothing_to_do' ? `شغّلت الوكيل «${res.agent_name}»: ${res.summary}` : `تعذّر تشغيل الوكيل: ${res.error}`;
    case 'office_runs': return res.length ? `بانتظار مراجعتك:\n${res.map((r) => `– ${r.agent_name}: ${r.proposal.length} إجراء (${localDT(r.created_at)})`).join('\n')}` : 'لا توجد أعمال وكلاء بانتظار مراجعتك.';
    case 'restore_document_version': return `استعدت الإصدار المطلوب كإصدار جديد (${res.current_version}) دون حذف السجل.${rep}`;
    case 'export_document': return `ملف ${res.format.toUpperCase()} جاهز للتنزيل: «${res.title}».`;
    case 'search': return res.length ? `نتائج البحث (${res.length}):\n${res.slice(0, 12).map((x) => `– [${{ project: 'مشروع', task: 'مهمة', document: 'مستند', event: 'موعد' }[x.type]}] ${x.title}`).join('\n')}` : 'لا توجد نتائج ضمن ما يحق لك الوصول إليه.';
    case 'projects': return res.length ? res.map((p) => `– ${p.name}: ${p.progress == null ? 'غير محددة' : p.progress + '%'}${p.delayed ? ` — متأخر ${p.days_overdue} يوماً` : ''}${p.due_date ? ` (استحقاق ${p.due_date})` : ''}`).join('\n') : 'لا توجد مشاريع مطابقة ضمن نطاقك.';
    case 'tasks': return res.length ? res.slice(0, 15).map((t) => `– ${t.title} — ${S_AR[t.status]}، ${P_AR[t.priority]}${t.due_date ? `، ${t.due_date}` : ''}${t.overdue ? ' ⚠️ متأخرة' : ''}`).join('\n') : 'لا توجد مهام مطابقة.';
    case 'events': return res.length ? res.map((e) => `– ${e.title}: ${localDT(e.starts_at)}${e.location ? ` — ${e.location}` : ''}`).join('\n') : 'لا توجد مواعيد قادمة.';
    case 'kpis': return res.items.map((k) => `– ${k.label_ar}: ${k.value == null ? 'غير متاح' : k.value + (k.unit || '')}${k.note_ar ? ` (${k.note_ar})` : ''}`).join('\n');
    default: {
      // Enterprise system tools format their own results (see server/systems/*).
      const fmt = step.format || toolByName.get(step.tool)?.format;
      if (typeof fmt === 'function') { try { return `${fmt(res, { user, step })}${rep}`; } catch (e) { console.error('[format]', step.tool, e.message); } }
      return `${step.label}: تم.${rep}`;
    }
  }
}

function helpText(user) {
  const systems = accessibleSystems(user).filter((s) => (s.tools || []).length).map((s) => s.name_ar);
  return `أستطيع مساعدتك في:${systems.length ? `\n– الأنظمة المؤسسية المتاحة لك: ${systems.join('، ')} (ضمن صلاحياتك وسياسة البيانات)` : ''}\n– ملخص يومك ومهامك ومواعيدك\n– إنشاء المشاريع والمهام وتحديث التقدم (عندما تحدد القيمة)\n– المحفظة الاستراتيجية: «وضع المحفظة الاستراتيجية»، «ما الذي كُلّفت به؟»، «خصّص سارة 50% لمشروع … حتى …»، «سعة فريقي»\n– تخصيص الداشبورد: إضافة بطاقات، تحويل العرض لرسم، الترتيب، الاستعادة\n– إعداد تقارير وخطط ومحاضر وخطابات وتعديلها وتنزيلها Word/PDF\n– البحث والتلخيص وتحليل الملفات المرفوعة\nلا أصل إلى بيانات FS ومرصاد داخل Vault.`;
}

function shortTextTemplate(clause, user, notes) {
  const n = LP.norm(clause);
  notes.push('خدمة التوليد غير متصلة؛ هذه مسودة من قالب ويمكن تعديلها ونسخها.');
  if (/شكر/.test(n)) return `**مسودة:**\nفريقنا العزيز،\nنشكركم على جهودكم المتميزة في [يُستكمل: العمل/المشروع]، والتي أسهمت في [يُستكمل: النتيجة]. نتطلع لمواصلة هذا التميز.\nمع خالص التقدير،\n${user.name_ar}`;
  if (/تهنئ/.test(n)) return `**مسودة:**\nيسعدني أن أتقدم بخالص التهاني بمناسبة [يُستكمل: المناسبة]، متمنياً مزيداً من التوفيق والنجاح.\n${user.name_ar}`;
  if (/تذكير|reminder/.test(n)) return `**مسودة:**\nتذكير ودي بموعد [يُستكمل: الموضوع] بتاريخ [يُستكمل: التاريخ]. نرجو الاستعداد وإرسال [يُستكمل: المطلوب] قبل الموعد.\n${user.name_ar}`;
  if (/اعلان/.test(n)) return `**مسودة إعلان:**\nيسر ${user.dept_ar} الإعلان عن [يُستكمل: الخبر]، وذلك اعتباراً من [يُستكمل: التاريخ]. للاستفسار يرجى التواصل مع [يُستكمل: جهة الاتصال].`;
  return `**مسودة:**\nالسلام عليكم،\n[يُستكمل: نص الرسالة حول ${esc(clause.replace(/^(اكتب|صغ)\s*(لي)?\s*/, ''))}]\nمع التحية،\n${user.name_ar}`;
}

// ---------------------------------------------------------------- model (tool use)
async function modelLoop(user, message, conv, ctx, emit) {
  const allowed = allowedToolNames(user);
  const tools = publicTools().filter((t) => allowed.has(t.name)).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const ui = ctx.ui;
  const sel = ui.selectedProjectId ? one('SELECT id,name FROM projects WHERE id=?', ui.selectedProjectId) : null;
  const doc = ui.openDocumentId ? one('SELECT id,title,current_version FROM documents WHERE id=?', ui.openDocumentId) : null;
  const system = `أنت «Ask AI»، مساعد منصة العمل الذكية. المستخدم: ${user.name_ar} (${user.role}, ${user.dept_ar}). التاريخ اليوم ${new Date().toISOString().slice(0, 10)}.
القواعد:
- نفّذ الطلبات عبر الأدوات فقط؛ الخادم يتحقق من الصلاحيات. لا تدّعِ نجاح أي إجراء قبل أن تعيد الأداة status ok.
- لا تفترض نسب إنجاز أو تواريخ أو قرارات لم يحددها المستخدم؛ اسأل سؤالاً محدداً واحداً عند نقص معلومة ضرورية.
- ميّز بين تغيير طريقة العرض (update_widget/add_widget) وتعديل بيانات المصدر (update_project/update_task).
- المحفظة الاستراتيجية: لا تفترض نسب التخصيص أو الموظفين أو التواريخ؛ التخصيص يُقترح (allocate_resource) ويعتمده المدير المباشر للموظف (decide_allocation)، ولا يعتمد أحد تخصيص نفسه.
- للمستندات الطويلة (تقرير، خطاب، خطة، محضر) استخدم run_skill أو create_document بمحتوى فعلي، وعند التعديل استخدم edit_document على نفس المستند.
- الحذف والمشاركة وتغيير الصلاحيات تتطلب تأكيد المستخدم (سيعيد الخادم needs_confirmation) — أخبر المستخدم أنها بانتظار تأكيده.
- لا يمكنك الوصول إلى بيانات FS أو مرصاد داخل Vault؛ وجّه المستخدم لفتحها داخل Vault.
- إذا فشل جزء من الطلب، وضّح ما نُفّذ وما لم يُنفّذ ولماذا. أجب بلغة المستخدم وباختصار.
سياق الواجهة: الشاشة=${ui.view || '-'}${sel ? `، المشروع المحدد=«${sel.name}» (${sel.id})` : ''}${doc ? `، المستند المفتوح=«${doc.title}» (${doc.id}, v${doc.current_version})` : ''}${ui.lastUploadId ? `، آخر ملف مرفوع=${ui.lastUploadId}` : ''}${conv.context?.lastProjectId ? `، آخر مشروع في المحادثة=${conv.context.lastProjectId}` : ''}${conv.context?.lastDocumentId ? `، آخر مستند في المحادثة=${conv.context.lastDocumentId}` : ''}${ctx.voice ? '\nالرسالة من إدخال صوتي: القيم المؤثرة المسموعة ستُطلب تأكيدها تلقائياً.' : ''}`;
  const history = conv.messages.slice(-16).filter((m) => m.content).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  // collapse consecutive same-role messages
  const msgs = [];
  for (const m of [...history.slice(0, -1), { role: 'user', content: message }]) {
    if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += `\n${m.content}`; else msgs.push({ ...m });
  }
  if (msgs[0]?.role === 'assistant') msgs.shift();
  const results = []; let openDoc = null; const downloads = [];
  let text = '';
  for (let i = 0; i < 8; i++) {
    const out = await complete({ capability: 'chat', system, messages: msgs, tools, user, maxTokens: 2500 });
    text = out.text || text;
    if (!out.tool_calls.length) break;
    msgs.push({ role: 'assistant', content: out.raw_content });
    const toolResults = [];
    for (const c of out.tool_calls) {
      const label = c.name;
      emit({ stage: 'executing', label, tool: c.name });
      const r = await executeTool(user, c.name, c.input || {}, { conversationId: ctx.conversationId, requestId: ctx.requestId, voice: ctx.voice, source: 'assistant' });
      results.push({ ...r, tool: c.name, label });
      emit({ stage: 'step', label, status: r.status, error: r.error });
      if (r.open_document) openDoc = r.open_document;
      if (r.status === 'ok' && c.name === 'export_document') downloads.push({ url: r.result.url, format: r.result.format, title: r.result.title });
      const payload = r.status === 'ok' ? { status: 'ok', result: r.result } : r.status === 'needs_confirmation' ? { status: 'needs_confirmation', message: 'بانتظار تأكيد المستخدم في الواجهة؛ لم يُنفّذ بعد.', summary: r.confirmation.summary } : { status: 'error', error: r.error };
      toolResults.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(payload).slice(0, 10000), ...(r.status === 'error' ? { is_error: true } : {}) });
    }
    msgs.push({ role: 'user', content: toolResults });
  }
  const refresh = [...new Set(results.filter((r) => r.status === 'ok').map((r) => entityOf(r.tool)).filter(Boolean))];
  return { mode: 'model', text: text || 'تم.', results, asks: [], pending: null, open_document: openDoc, downloads, refresh, notes: [] };
}
