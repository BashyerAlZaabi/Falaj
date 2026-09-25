// Platform admin: AI Services (providers, routing, usage), Agents, Skills, MCP,
// integrations status and users. Admin rights configure the platform; they
// grant no extra data access and cannot reach Vault.
import { api } from '../api.js';
import { h, icon, modal, toast, confirmDialog } from '../ui.js';
import { L, t, fmtDate, fmtTime } from '../i18n.js';
import { state, emit } from '../state.js';

let tab = 'ai';
export async function renderAdmin(root) {
  const tabs = [['ai', 'AI Services'], ['agents', 'Agents & Skills'], ['mcp', 'MCP'], ['integrations', L('التكاملات', 'Integrations')], ['users', L('المستخدمون', 'Users')]];
  root.append(h('div.toolbar', h('div.tabs', tabs.map(([k, l]) => h(`button${k === tab ? '.on' : ''}`, { onclick: () => { tab = k; window.dispatchEvent(new HashChangeEvent('hashchange')); } }, l)))));
  const body = h('div'); root.append(body);
  if (tab === 'ai') await aiTab(body);
  if (tab === 'agents') await agentsTab(body);
  if (tab === 'mcp') await mcpTab(body);
  if (tab === 'integrations') await integrationsTab(body);
  if (tab === 'users') await usersTab(body);
}

const stChip = (s) => h(`span.chip.tiny${s.state === 'connected' ? '.good' : s.state === 'local' ? '' : s.state === 'configured' ? '.warn' : '.crit'}`, L(s.label_ar, s.label_en));

async function aiTab(root) {
  const d = await api('/api/admin/ai');
  root.append(h('p.small.muted', L('طبقة AI Services المشتركة للمكونات خارج Vault. المفاتيح تُحفظ في متغيرات بيئة الخادم فقط ولا تُعرض هنا.', 'Shared AI Services for components outside Vault. Keys live only in server environment variables.')));
  root.append(h('section.card.size-l', h('div.card-head', h('h4', L('المزوّدون والنماذج', 'Providers & models')), h('button.btn.sm', { onclick: () => editProvider() }, icon('plus'), L('مزوّد', 'Provider'))),
    h('table.tbl', h('thead', h('tr', h('th', L('الاسم', 'Name')), h('th', L('النوع', 'Kind')), h('th', L('النموذج', 'Model')), h('th', L('متغير المفتاح', 'Key env')), h('th', L('الحالة', 'Status')), h('th', ''))),
      h('tbody', d.providers.map((p) => h('tr', h('td', p.name), h('td', p.kind), h('td', p.model || '—'), h('td', p.api_key_env ? h('code', p.api_key_env) : '—'), h('td', stChip(p.status)),
        h('td', p.kind !== 'local' ? [h('button.btn.sm', { onclick: async () => { const r = await api(`/api/admin/ai/providers/${p.id}/test`, { method: 'POST' }); toast(r.ok ? L('الاتصال ناجح', 'Connected') : r.message, { kind: r.ok ? null : 'error' }); emit('data-changed', {}); } }, L('اختبار', 'Test')), h('button.btn.sm.ghost', { onclick: () => editProvider(p) }, t('edit'))] : null)))))));
  const caps = { chat: L('المحادثة وفهم الطلبات', 'Chat & intent'), generate: L('إنشاء المحتوى', 'Content generation'), summarize: L('التلخيص', 'Summarization'), analyze: L('التحليل', 'Analysis'), stt: L('تحويل الكلام لنص', 'Speech-to-text'), tts: L('تحويل النص لكلام', 'Text-to-speech') };
  root.append(h('section.card.size-l', { style: { marginTop: '14px' } }, h('div.card-head', h('h4', L('توجيه القدرات', 'Capability routing'))),
    h('table.tbl', h('tbody', d.capabilities.map((c) => {
      const sel = h('select.field', { style: { maxWidth: '360px' }, onchange: async () => { await api('/api/admin/ai/routing', { method: 'PUT', body: { capability: c, provider_id: sel.value } }); toast(L('حُفظ التوجيه', 'Routing saved')); } }, d.providers.map((p) => h('option', { value: p.id, selected: d.routing[c] === p.id || null }, p.name)));
      const p = d.providers.find((x) => x.id === d.routing[c]);
      return h('tr', h('td', caps[c]), h('td', sel), h('td', p ? stChip(p.status) : '—'));
    }))), h('p.tiny.muted', L('عند عدم اتصال المزوّد الموجَّه، تعمل المنصة بالبديل المحلي وتوضح ذلك للمستخدم.', 'If the routed provider is not connected, the platform falls back to local and says so.'))));
  root.append(h('section.card.size-l', { style: { marginTop: '14px' } }, h('div.card-head', h('h4', L('الاستخدام', 'Usage'))),
    d.usage.length ? h('table.tbl', h('thead', h('tr', h('th', L('القدرة', 'Capability')), h('th', L('المزوّد', 'Provider')), h('th', L('الاستدعاءات', 'Calls')), h('th', L('الناجحة', 'OK')), h('th', 'Tokens in/out'), h('th', L('الأخير', 'Last')))),
      h('tbody', d.usage.map((u) => h('tr', h('td', u.capability), h('td', u.provider_id), h('td', u.calls), h('td', u.ok), h('td', `${u.input_tokens || 0}/${u.output_tokens || 0}`), h('td', `${fmtDate(u.last)} ${fmtTime(u.last)}`))))) : h('div.empty', L('لا استخدام مسجل بعد', 'No usage yet'))));
}

async function editProvider(p = {}) {
  const f = { name: h('input.field', { value: p.name || '' }), kind: h('select.field', ['anthropic', 'openai_compatible'].map((k) => h('option', { value: k, selected: p.kind === k || null }, k))), base_url: h('input.field', { value: p.base_url || '', placeholder: 'https://…' }), model: h('input.field', { value: p.model || '' }), api_key_env: h('input.field', { value: p.api_key_env || '', placeholder: 'MY_PROVIDER_KEY' }) };
  const ok = await modal(L('مزوّد نموذج', 'Model provider'), h('div', Object.entries(f).map(([k, el]) => [h('label.lbl', k), el]), h('p.tiny.muted', L('ضع قيمة المفتاح في متغير البيئة بالاسم أعلاه على الخادم ثم أعد تشغيله.', 'Set the key value in that server environment variable, then restart.'))), [{ label: t('cancel'), value: false }, { label: t('save'), value: true, primary: true }]);
  if (!ok) return;
  try { await api('/api/admin/ai/providers', { method: 'PUT', body: { id: p.id, ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])) } }); emit('data-changed', {}); } catch (e) { toast(e.message, { kind: 'error' }); }
}

async function agentsTab(root) {
  const [agents, skills, cat] = await Promise.all([api('/api/admin/agents'), api('/api/skills'), api('/api/catalog')]);
  root.append(h('section.card.size-l', h('div.card-head', h('h4', 'Agents')), h('table.tbl', h('thead', h('tr', h('th', L('الوكيل', 'Agent')), h('th', L('المهام', 'Purpose')), h('th', L('الأدوات', 'Tools')), h('th', L('الأدوار', 'Roles')), h('th', L('مفعّل', 'On')))),
    h('tbody', agents.map((a) => { const cb = h('input', { type: 'checkbox', checked: a.enabled ? true : null, onchange: async () => { await api(`/api/admin/agents/${a.key}`, { method: 'PUT', body: { enabled: cb.checked } }); toast(L('حُفظ', 'Saved')); } });
      return h('tr', h('td', L(a.name_ar, a.name_en)), h('td.small', L(a.description_ar, a.description_en)), h('td.tiny', a.tools.join(', ')), h('td.small', a.allowed_roles.map((r) => t('role.' + r)).join('، ')), h('td', cb)); })))));
  root.append(h('section.card.size-l', { style: { marginTop: '14px' } }, h('div.card-head', h('h4', 'Skills')), h('table.tbl', h('thead', h('tr', h('th', L('المهارة', 'Skill')), h('th', L('المدخلات', 'Inputs')), h('th', L('المخرجات', 'Outputs')), h('th', L('الاستدعاء', 'Invocation')))),
    h('tbody', skills.map((s) => h('tr', h('td', L(s.name_ar, s.name_en), h('div.tiny.muted', s.description_ar)), h('td.tiny', Object.keys(s.inputs.properties || {}).join(', ') || '—'), h('td.tiny', s.outputs), h('td.tiny', h('code', s.invocation))))))));
  root.append(h('section.card.size-l', { style: { marginTop: '14px' } }, h('div.card-head', h('h4', L('أدوات التنفيذ (MCP)', 'Execution tools (MCP)'))), h('table.tbl', h('tbody', cat.tools.map((x) => h('tr', h('td', h('code', x.name)), h('td.tiny', x.description), h('td', x.destructive ? h('span.chip.tiny.warn', L('يتطلب تأكيداً', 'Needs confirmation')) : x.mutates ? h('span.chip.tiny', L('قابل للتراجع', 'Undoable')) : h('span.chip.tiny.good', L('قراءة', 'Read')))))))));
}

async function mcpTab(root) {
  const out = h('div');
  root.append(h('section.card.size-l', h('h4', L('خادم MCP للمنصة', 'Platform MCP server')),
    h('p.small', L('يربط المساعد والعملاء المصرّح لهم بأدوات المنصة. كل استدعاء يُنفّذ بصلاحيات المستخدم صاحب الرمز، مع التحقق والتأكيد ومنع التكرار. لا توجد أدوات تصل إلى Vault.', 'Connects the assistant and authorised clients to platform tools, under the token owner\'s permissions. No tools reach Vault.')),
    h('div.kv', h('span.muted', 'Endpoint'), h('code', `${location.origin}/mcp`), h('span.muted', 'Transport'), h('span', 'Streamable HTTP (JSON-RPC 2.0)'), h('span.muted', 'Auth'), h('span', 'Authorization: Bearer swp_…')),
    h('button.btn.sm', { style: { marginTop: '10px' }, onclick: async () => { const r = await api('/api/me/tokens', { method: 'POST', body: { label: 'MCP client' } }); out.replaceChildren(h('p.small', L('انسخ الرمز الآن — لن يظهر مجدداً:', 'Copy now — shown once:')), h('code', { style: { wordBreak: 'break-all' } }, r.token)); } }, L('إنشاء رمز شخصي', 'Create personal token')), out,
    h('p.tiny.muted', L('الموافقة على أعمال وكلاء المكتب لا تتم عبر الرموز؛ تتطلب جلسة تفاعلية.', 'Approving Agents Office work is not possible with tokens; it needs an interactive session.'))));
}

async function integrationsTab(root) {
  const d = await api('/api/admin/ai');
  const row = (name, ok, text, note) => h('tr', h('td', name), h('td', h(`span.chip.tiny.${ok === true ? 'good' : ok === false ? 'crit' : 'warn'}`, text)), h('td.small.muted', note || ''));
  root.append(h('section.card.size-l', h('table.tbl', h('thead', h('tr', h('th', L('التكامل', 'Integration')), h('th', L('الحالة', 'Status')), h('th', L('ملاحظات', 'Notes')))), h('tbody',
    row('Vault (FS، مرصاد)', d.vault.reachable, d.vault.reachable ? L('يعمل', 'Reachable') : L('غير متاح', 'Unreachable'), L(`فحص صحة فقط — لا تُقرأ أي بيانات من Vault. الذكاء داخل Vault: ${d.vault.local_ai || '—'}`, 'Health check only — no data is read from Vault.')),
    row('Smart Uploader → مرصاد', d.su.configured && d.vault.reachable, d.su.configured ? (d.vault.reachable ? L('مضبوط', 'Configured') : L('مضبوط لكن Vault غير متاح', 'Configured, Vault down')) : L('غير مضبوط', 'Not configured'), 'SU_SERVICE_TOKEN'),
    row('واجب → FS / مرصاد', null, L('يُدار داخل Vault', 'Managed inside Vault'), L('نقاط استقبال للكتابة فقط داخل Vault؛ حالته لا تُعرض خارج Vault. (محاكاة: npm run wajib:sim)', 'Write-only ingest inside Vault; simulator: npm run wajib:sim')),
    row(L('محرك PDF', 'PDF engine'), d.pdf.ok, d.pdf.ok ? d.pdf.engine : L('غير متاح', 'Missing'), d.pdf.message || ''),
    row(L('الصوت', 'Voice'), null, L('متصفح (Web Speech API)', 'Browser (Web Speech API)'), L('يعتمد على دعم المتصفح؛ يمكن توجيه STT لمزوّد خادمي من AI Services.', 'Depends on browser support; route STT to a server provider in AI Services.')),
    row(L('الخدمة الذاتية للموارد البشرية', 'HR self-service'), false, L('غير متصل', 'Not connected'), L('يحتاج بيانات اتصال النظام المؤسسي.', 'Needs enterprise system connection details.')),
  ))));
}

async function usersTab(root) {
  const [users, depts] = await Promise.all([api('/api/admin/users'), api('/api/admin/departments')]);
  root.append(h('div.toolbar', h('button.btn.primary', { onclick: () => newUser(depts) }, icon('plus'), L('مستخدم جديد', 'New user')), h('button.btn', { onclick: () => newDept(depts) }, icon('plus'), L('إدارة جديدة', 'New department'))));
  root.append(h('section.card.size-l', h('table.tbl', h('thead', h('tr', h('th', L('المستخدم', 'User')), h('th', L('الإدارة', 'Department')), h('th', L('الدور', 'Role')), h('th', ''))),
    h('tbody', users.map((u) => h('tr', h('td', u.name_ar, h('div.tiny.muted', u.username), u.is_demo ? h('span.chip.demo.tiny', t('demo')) : null), h('td', u.dept_ar), h('td', t('role.' + u.role)),
      h('td', h('button.btn.sm', { onclick: () => editUser(u, depts) }, L('تغيير الصلاحيات', 'Change permissions')))))))));
}

async function editUser(u, depts) {
  const role = h('select.field', ['employee', 'manager', 'president'].map((r) => h('option', { value: r, selected: u.role === r || null }, t('role.' + r))));
  const dept = h('select.field', depts.map((d) => h('option', { value: d.id, selected: u.department_id === d.id || null }, d.name_ar)));
  const ok = await modal(L('تغيير الصلاحيات', 'Change permissions'), h('div', h('p.small', u.name_ar), h('label.lbl', L('الدور', 'Role')), role, h('label.lbl', L('الإدارة', 'Department')), dept), [{ label: t('cancel'), value: false }, { label: t('save'), value: true, primary: true }]);
  if (!ok) return;
  if (!(await confirmDialog(L('تأكيد تغيير الصلاحيات', 'Confirm permission change'), L(`سيتغير نطاق وصول ${u.name_ar} فوراً.`, `${u.name_en || u.name_ar}'s access scope changes immediately.`), { danger: true }))) return;
  try { await api(`/api/admin/users/${u.id}`, { method: 'PUT', body: { role: role.value, department_id: dept.value, confirm: true } }); toast(L('تم التحديث', 'Updated')); emit('data-changed', {}); } catch (e) { toast(e.message, { kind: 'error' }); }
}

async function newUser(depts) {
  const f = { username: h('input.field', { autocomplete: 'off' }), name_ar: h('input.field'), name_en: h('input.field'), password: h('input.field', { type: 'password', autocomplete: 'new-password' }) };
  const role = h('select.field', ['employee', 'manager', 'president'].map((r) => h('option', { value: r }, t('role.' + r))));
  const dept = h('select.field', depts.map((d) => h('option', { value: d.id }, d.name_ar)));
  const ok = await modal(L('مستخدم جديد', 'New user'), h('div', h('label.lbl', L('اسم المستخدم', 'Username')), f.username, h('label.lbl', L('الاسم (عربي)', 'Name (Arabic)')), f.name_ar, h('label.lbl', L('الاسم (إنجليزي)', 'Name (English)')), f.name_en, h('label.lbl', L('كلمة المرور المؤقتة', 'Temporary password')), f.password, h('label.lbl', L('الدور', 'Role')), role, h('label.lbl', L('الإدارة', 'Department')), dept), [{ label: t('cancel'), value: false }, { label: t('save'), value: true, primary: true }]);
  if (!ok) return;
  if (!(await confirmDialog(L('منح صلاحيات', 'Grant access'), L('سيحصل المستخدم على صلاحيات الدور والإدارة المحددين.', 'The user will get the selected role and department scope.')))) return;
  try { await api('/api/admin/users', { method: 'POST', body: { ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])), role: role.value, department_id: dept.value, confirm: true } }); toast(L('أُنشئ المستخدم', 'User created')); emit('data-changed', {}); } catch (e) { toast(e.message, { kind: 'error' }); }
}
async function newDept(depts) {
  const ar = h('input.field'); const en = h('input.field');
  const parent = h('select.field', h('option', { value: '' }, '—'), depts.map((d) => h('option', { value: d.id }, d.name_ar)));
  const ok = await modal(L('إدارة جديدة', 'New department'), h('div', h('label.lbl', L('الاسم (عربي)', 'Name (Arabic)')), ar, h('label.lbl', L('الاسم (إنجليزي)', 'Name (English)')), en, h('label.lbl', L('تتبع إدارة', 'Parent department')), parent), [{ label: t('cancel'), value: false }, { label: t('save'), value: true, primary: true }]);
  if (!ok) return;
  try { await api('/api/admin/departments', { method: 'POST', body: { name_ar: ar.value, name_en: en.value, parent_id: parent.value || null } }); emit('data-changed', {}); } catch (e) { toast(e.message, { kind: 'error' }); }
}
