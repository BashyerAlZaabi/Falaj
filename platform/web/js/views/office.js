// Agents Office — build agents that prepare your recurring work. Every run
// produces a proposal; nothing executes until you review and approve it.
import { api, rid } from '../api.js';
import { h, icon, modal, toast, confirmDialog } from '../ui.js';
import { L, t, fmtDate, fmtTime } from '../i18n.js';
import { state, emit } from '../state.js';
import { undo } from '../widgets.js';
import * as Editor from '../editor.js';
import * as Chat from '../chat.js';

const DAYS = [['الأحد', 'Sunday'], ['الإثنين', 'Monday'], ['الثلاثاء', 'Tuesday'], ['الأربعاء', 'Wednesday'], ['الخميس', 'Thursday'], ['الجمعة', 'Friday'], ['السبت', 'Saturday']];
export const schedText = (s) => (!s || s.type === 'manual' ? L('تشغيل يدوي', 'Manual') : s.type === 'daily' ? L(`يومياً ${s.time}`, `Daily ${s.time}`) : s.type === 'weekdays' ? L(`أيام العمل ${s.time}`, `Weekdays ${s.time}`) : L(`كل ${DAYS[s.day][0]} ${s.time}`, `Every ${DAYS[s.day][1]} ${s.time}`));
const RUN_STATUS = { awaiting_review: ['بانتظار مراجعتك', 'Awaiting review', 'warn'], completed: ['نُفّذ', 'Completed', 'good'], partially_completed: ['نُفّذ جزئياً', 'Partially done', 'warn'], failed: ['تعذّر', 'Failed', 'crit'], rejected: ['مرفوض', 'Rejected', ''], nothing_to_do: ['لا شيء للتنفيذ', 'Nothing to do', ''], skipped: ['لم يُحدَّد شيء', 'Nothing selected', ''], cancelled: ['أُلغي', 'Cancelled', ''], preparing: ['قيد التحضير', 'Preparing', ''], executing: ['قيد التنفيذ', 'Executing', 'warn'] };
const runChip = (s) => { const [a, e, c] = RUN_STATUS[s] || [s, s, '']; return h(`span.chip.tiny${c ? '.' + c : ''}`, L(a, e)); };
const EDITABLE = { create_task: ['title', 'priority', 'due_date'], update_task: ['priority'], create_document: ['title'] };

export async function renderOffice(root) {
  const [agents, pending, history, templates] = await Promise.all([api('/api/office/agents'), api('/api/office/runs?status=awaiting_review'), api('/api/office/runs'), api('/api/office/templates')]);
  root.append(h('div.greet',
    h('div', h('h1', L('مكتب الوكلاء', 'Agents Office')), h('div.small.muted', L('ابنِ وكلاء يجهّزون أعمالك المتكررة. يعمل الوكيل بصلاحياتك فقط، ويعرض ما جهّزه عليك، ولا يُنفَّذ أي إجراء إلا بعد مراجعتك وموافقتك.', 'Build agents that prepare your recurring work. They act within your permissions and nothing runs until you review and approve.'))),
    h('div.toolbar', { style: { marginBottom: 0 } },
      h('button.btn.primary', { onclick: () => builder(templates) }, icon('plus'), L('وكيل جديد', 'New agent')),
      h('button.btn', { onclick: () => Chat.focus(L('ابنِ وكيلاً ', 'Build an agent that ')) }, icon('chat'), L('ابنِه بالمحادثة', 'Build by chat')))));

  // ---- pending reviews ----
  root.append(h('div.section', `${L('بانتظار مراجعتك', 'Awaiting your review')} (${pending.length})`));
  if (!pending.length) root.append(h('section.card.size-l', h('div.empty', L('لا توجد أعمال بانتظار المراجعة.', 'Nothing awaiting review.'))));
  for (const r of pending) root.append(reviewCard(r));

  // ---- my agents ----
  root.append(h('div.section', `${L('وكلائي', 'My agents')} (${agents.length})`));
  if (!agents.length) {
    root.append(h('section.card.size-l', h('div.empty', L('لا يوجد وكلاء بعد. ابدأ بقالب جاهز:', 'No agents yet. Start from a template:')),
      h('div.options', { style: { justifyContent: 'center' } }, Object.entries(templates).filter(([k]) => k !== 'custom').map(([k, v]) => h('button.btn.sm', { onclick: () => builder(templates, { template: k }) }, L(v.name_ar, v.name_en))))));
  } else {
    root.append(h('div.grid', agents.map((a) => agentCard(a, templates))));
  }

  // ---- history ----
  const done = history.filter((r) => r.status !== 'awaiting_review');
  if (done.length) {
    root.append(h('div.section', L('سجل التشغيل', 'Run history')));
    root.append(h('section.card.size-l', h('ul.list', done.slice(0, 15).map((r) => h('li', { style: { alignItems: 'flex-start', flexDirection: 'column' } },
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', width: '100%' } }, h('strong.grow', r.agent_name), runChip(r.status), h('span.tiny.muted', `${fmtDate(r.created_at)} ${fmtTime(r.created_at)} · ${r.trigger === 'schedule' ? L('مجدول', 'Scheduled') : L('يدوي', 'Manual')}`)),
      r.error ? h('div.small', { style: { color: 'var(--crit)' } }, r.error) : r.summary ? h('div.tiny.muted', r.summary) : null,
      r.proposal.filter((i) => i.status !== 'proposed').length ? h('ul.steps', r.proposal.map((i) => h('li', i.status === 'done' ? '✓' : i.status === 'failed' ? '✗' : '–', ' ', i.summary, i.edited ? h('span.chip.tiny', L('معدّل', 'edited')) : null, i.error ? h('span.muted', ` — ${i.error}`) : null,
        i.status === 'done' && i.open_document ? h('button.btn.sm.ghost', { onclick: () => Editor.open(i.open_document) }, icon('doc')) : null,
        i.status === 'done' && i.undoable && i.actionId ? h('button.btn.sm.ghost', { onclick: (e) => { e.target.closest('button').disabled = true; undo(i.actionId); } }, icon('undo'), t('undo')) : null))) : null)))));
  }
}

function reviewCard(r) {
  const decisions = new Map(r.proposal.map((i) => [i.id, { id: i.id, selected: true, edits: {} }]));
  const countLbl = h('span');
  const updateCount = () => { const n = [...decisions.values()].filter((d) => d.selected).length; countLbl.textContent = `${L('موافقة وتنفيذ المحدد', 'Approve & run selected')} (${n})`; approveBtn.disabled = false; };
  const approveBtn = h('button.btn.primary', { onclick: async () => {
    const n = [...decisions.values()].filter((d) => d.selected).length;
    if (!n) { toast(L('لم تحدد أي إجراء', 'Nothing selected'), { kind: 'error' }); return; }
    approveBtn.disabled = true;
    try {
      const res = await api(`/api/office/runs/${r.id}/approve`, { method: 'POST', body: { decisions: [...decisions.values()] } });
      const ok = res.proposal.filter((i) => i.status === 'done').length; const bad = res.proposal.filter((i) => i.status === 'failed').length;
      toast(bad ? L(`نُفّذ ${ok} وتعذّر ${bad}`, `${ok} done, ${bad} failed`) : L(`تم تنفيذ ${ok} إجراء`, `${ok} actions done`), { kind: bad ? 'error' : null });
      const docItem = res.proposal.find((i) => i.status === 'done' && i.open_document);
      if (docItem) Editor.open(docItem.open_document);
      emit('data-changed', { entity: 'office' });
    } catch (e) { toast(e.message, { kind: 'error' }); approveBtn.disabled = false; }
  } }, icon('check'), countLbl);
  const card = h('section.card.size-l', { style: { borderColor: 'var(--warn)', marginBottom: '12px' } },
    h('div.card-head', h('h4', r.agent_name), runChip(r.status), h('span.tiny.muted', `${fmtDate(r.created_at)} ${fmtTime(r.created_at)} · ${r.trigger === 'schedule' ? L('مجدول', 'Scheduled') : L('يدوي', 'Manual')}`)),
    r.summary ? h('div.small.muted', { style: { marginBottom: '8px' } }, r.summary) : null,
    h('ul.list', r.proposal.map((it) => {
      const d = decisions.get(it.id);
      const cb = h('input', { type: 'checkbox', checked: true, 'aria-label': it.summary, onchange: () => { d.selected = cb.checked; row.style.opacity = cb.checked ? 1 : 0.5; updateCount(); } });
      const edits = (EDITABLE[it.tool] || []).filter((f) => it.input[f] !== undefined).map((f) => {
        const lbl = { title: L('العنوان', 'Title'), priority: L('الأولوية', 'Priority'), due_date: L('الاستحقاق', 'Due') }[f];
        const el = f === 'priority' ? h('select.field', ['low', 'medium', 'high', 'urgent'].map((p) => h('option', { value: p, selected: it.input[f] === p || null }, { low: L('منخفضة', 'Low'), medium: L('متوسطة', 'Medium'), high: L('عالية', 'High'), urgent: L('عاجلة', 'Urgent') }[p])))
          : h('input.field', { type: f === 'due_date' ? 'date' : 'text', value: it.input[f] });
        el.style.padding = '4px 8px'; el.style.maxWidth = f === 'title' ? '320px' : '160px';
        el.onchange = () => { d.edits[f] = el.value; };
        return h('label.tiny', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', marginInlineEnd: '10px' } }, lbl, el);
      });
      const prev = it.preview ? h('div.doc-body.preview.hidden', { html: it.preview, style: { maxHeight: '320px', border: '1px solid var(--stroke)', borderRadius: '12px', marginTop: '6px' } }) : null;
      const row = h('li', { style: { flexDirection: 'column', alignItems: 'stretch' } },
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, cb, h('div.grow.small', it.summary), prev ? h('button.btn.sm.ghost', { onclick: () => prev.classList.toggle('hidden') }, icon('eye'), L('معاينة', 'Preview')) : null),
        edits.length ? h('div', { style: { marginTop: '6px', paddingInlineStart: '26px' } }, edits) : null, prev);
      return row;
    })),
    h('div.toolbar', { style: { marginTop: '12px', marginBottom: 0 } }, approveBtn,
      h('button.btn', { onclick: async () => { if (!(await confirmDialog(L('رفض المقترح', 'Reject proposal'), L('لن يُنفَّذ أي من هذه الإجراءات.', 'None of these actions will run.')))) return; await api(`/api/office/runs/${r.id}/reject`, { method: 'POST' }); emit('data-changed', { entity: 'office' }); } }, icon('x'), L('رفض', 'Reject')),
      h('span.tiny.muted', L('لن يُنفَّذ إلا ما تحدده. يمكنك تعديل الحقول قبل الموافقة، والتراجع بعد التنفيذ.', 'Only selected items run. Edit fields before approving; undo afterwards.'))));
  updateCount();
  return card;
}

function agentCard(a, templates) {
  const tpl = templates[a.template];
  const toggle = h('input', { type: 'checkbox', checked: a.enabled || null, 'aria-label': L('مفعّل', 'Enabled'), onchange: async () => { await api(`/api/office/agents/${a.id}`, { method: 'PUT', body: { enabled: toggle.checked } }); emit('data-changed', { entity: 'office' }); } });
  return h('section.card.size-m',
    h('div.card-head', h('h4', a.name), a.pending_runs ? h('span.chip.tiny.warn', `${a.pending_runs} ${L('بانتظار المراجعة', 'to review')}`) : null, h('label.tiny', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, toggle, a.enabled ? L('مفعّل', 'On') : L('موقوف', 'Paused'))),
    h('div.small.muted', a.description),
    h('div.kv', { style: { marginTop: '8px' } },
      h('span.muted', L('القالب', 'Template')), h('span', L(tpl?.name_ar, tpl?.name_en)),
      h('span.muted', L('الجدول', 'Schedule')), h('span', schedText(a.schedule)),
      h('span.muted', L('التشغيل القادم', 'Next run')), h('span', a.enabled && a.next_run_at ? `${fmtDate(a.next_run_at)} ${fmtTime(a.next_run_at)}` : '—'),
      h('span.muted', L('آخر تشغيل', 'Last run')), h('span', a.last_run_at ? `${fmtDate(a.last_run_at)} ${fmtTime(a.last_run_at)}` : '—'),
      a.config?.title ? h('span.muted', L('المهمة', 'Task')) : null, a.config?.title ? h('span', a.config.title) : null),
    h('div.toolbar', { style: { marginTop: '12px', marginBottom: 0 } },
      h('button.btn.sm.primary', { onclick: async (e) => {
        const b = e.target.closest('button'); b.disabled = true;
        try { const r = await api(`/api/office/agents/${a.id}/run`, { method: 'POST' }); toast(r.status === 'awaiting_review' ? L(`جهّز ${r.proposal.length} إجراء بانتظار مراجعتك`, `${r.proposal.length} actions ready for review`) : r.status === 'failed' ? r.error : (r.summary || L('لا شيء للتنفيذ', 'Nothing to do')), { kind: r.status === 'failed' ? 'error' : null }); emit('data-changed', { entity: 'office' }); }
        catch (err) { toast(err.message, { kind: 'error' }); } finally { b.disabled = false; }
      } }, icon('spark'), L('حضّر الآن', 'Prepare now')),
      h('button.btn.sm', { onclick: () => builder(templates, a) }, t('edit')),
      h('button.btn.sm.ghost', { onclick: async () => { if (!(await confirmDialog(L('حذف الوكيل', 'Delete agent'), L(`سيُحذف «${a.name}» وتُلغى مقترحاته المعلقة.`, `"${a.name}" will be deleted and pending proposals cancelled.`), { danger: true }))) return; await api(`/api/office/agents/${a.id}?confirm=1`, { method: 'DELETE' }); emit('data-changed', { entity: 'office' }); } }, icon('trash'))));
}

export async function builder(templates, existing = null) {
  const isEdit = !!existing?.id;
  const [projects, users] = await Promise.all([api('/api/projects').catch(() => []), api('/api/users/assignable').catch(() => [])]);
  const tplSel = h('select.field', { disabled: isEdit || null }, Object.entries(templates).map(([k, v]) => h('option', { value: k, selected: (existing?.template || 'daily_briefing') === k || null }, L(v.name_ar, v.name_en))));
  const name = h('input.field', { value: existing?.name || '' , placeholder: L('اسم الوكيل', 'Agent name') });
  const desc = h('div.small.muted');
  const cfgBox = h('div');
  const cfgInputs = {};
  const drawCfg = () => {
    const tpl = templates[tplSel.value];
    desc.textContent = tpl.description_ar;
    cfgBox.replaceChildren();
    for (const k of Object.keys(cfgInputs)) delete cfgInputs[k];
    for (const [k, spec] of Object.entries(tpl.config)) {
      const cur = existing?.config?.[k] ?? spec.default ?? '';
      let el;
      if (spec.type === 'enum') el = h('select.field', spec.values.map((v) => h('option', { value: v, selected: cur === v || null }, { mine: L('مهامي', 'Mine'), team: L('مهام الفريق', 'Team'), low: L('منخفضة', 'Low'), medium: L('متوسطة', 'Medium'), high: L('عالية', 'High'), urgent: L('عاجلة', 'Urgent') }[v] || v)));
      else if (spec.type === 'project') el = h('select.field', h('option', { value: '' }, '—'), projects.map((p) => h('option', { value: p.id, selected: cur === p.id || null }, p.name)));
      else if (spec.type === 'user') el = h('select.field', h('option', { value: '' }, L('أنا', 'Me')), users.filter((u) => u.id !== state.me.user.id).map((u) => h('option', { value: u.id, selected: cur === u.id || null }, L(u.name_ar, u.name_en))));
      else if (spec.type === 'text') el = h('textarea.field', { rows: 4 }, cur);
      else el = h('input.field', { type: spec.type === 'int' ? 'number' : 'text', value: cur });
      cfgInputs[k] = { el, spec };
      cfgBox.append(h('label.lbl', spec.label_ar + (spec.required ? ' *' : '')), el);
    }
    if (tplSel.value === 'custom' && state.me.assistant.mode === 'local') cfgBox.append(h('div.chip.warn', { style: { marginTop: '8px' } }, L('يتطلب خدمة نموذج لغوي متصلة؛ غير متاحة حالياً.', 'Requires a connected language model; not available now.')));
    if (!isEdit && !name.value) name.placeholder = L(tpl.name_ar, tpl.name_en);
  };
  tplSel.onchange = drawCfg;
  const sc = existing?.schedule || { type: 'daily', time: '07:00', day: 0 };
  const sType = h('select.field', [['manual', L('يدوي فقط', 'Manual only')], ['daily', L('يومياً', 'Daily')], ['weekdays', L('أيام العمل (الأحد–الخميس)', 'Weekdays (Sun–Thu)')], ['weekly', L('أسبوعياً', 'Weekly')]].map(([v, l]) => h('option', { value: v, selected: sc.type === v || null }, l)));
  const sTime = h('input.field', { type: 'time', value: sc.time || '07:00' });
  const sDay = h('select.field', DAYS.map((d, i) => h('option', { value: i, selected: sc.day === i || null }, L(d[0], d[1]))));
  const dayWrap = h('div', h('label.lbl', L('اليوم', 'Day')), sDay);
  const syncSched = () => { dayWrap.style.display = sType.value === 'weekly' ? '' : 'none'; sTime.disabled = sType.value === 'manual'; };
  sType.onchange = syncSched;
  drawCfg(); syncSched();
  const body = h('div',
    h('label.lbl', L('القالب', 'Template')), tplSel, desc,
    h('label.lbl', L('الاسم', 'Name')), name, cfgBox,
    h('div.section', L('متى يجهّز العمل؟', 'When does it prepare work?')), sType, h('label.lbl', L('الوقت', 'Time')), sTime, dayWrap,
    h('p.tiny.muted', { style: { marginTop: '12px' } }, L('🔒 الوكيل يعمل بصلاحياتك فقط، لا يستطيع الحذف أو المشاركة أو تغيير الصلاحيات، ولا يصل إلى Vault. كل ما يجهّزه ينتظر موافقتك.', '🔒 The agent acts within your permissions only, cannot delete/share/change permissions, cannot reach Vault, and waits for your approval.')));
  const ok = await modal(isEdit ? L('تعديل الوكيل', 'Edit agent') : L('وكيل جديد', 'New agent'), body, [{ label: t('cancel'), value: false }, { label: isEdit ? t('save') : L('بناء الوكيل', 'Build agent'), value: true, primary: true }]);
  if (!ok) return;
  const config = {};
  for (const [k, { el, spec }] of Object.entries(cfgInputs)) { const v = el.value; if (v !== '') config[k] = spec.type === 'int' ? Number(v) : v; }
  const schedule = { type: sType.value, time: sTime.value || '07:00', day: Number(sDay.value), tz_offset: new Date().getTimezoneOffset() };
  try {
    if (isEdit) { await api(`/api/office/agents/${existing.id}`, { method: 'PUT', body: { name: name.value || existing.name, config, schedule } }); toast(L('حُفظ الوكيل', 'Agent saved')); }
    else {
      const r = await api('/api/office/agents', { method: 'POST', body: { name: name.value || undefined, template: tplSel.value, config, schedule }, headers: { 'x-request-id': rid() } });
      if (r.status !== 'ok') throw new Error(r.error);
      toast(L('بُني الوكيل. جرّب «حضّر الآن» لمراجعة أول مقترح.', 'Agent built. Try "Prepare now" to review its first proposal.'));
    }
    emit('data-changed', { entity: 'office' });
  } catch (e) { toast(e.body?.error || e.body?.message || e.message, { kind: 'error' }); }
}
