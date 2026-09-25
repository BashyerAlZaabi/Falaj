// Admin-only tabs of the Integration & Control Center (platform admin =
// configuration only; none of these screens shows any system data):
//   «الصلاحيات»      users × system capabilities matrix, quarterly access review
//   «سياسات البيانات» AI policy per data domain (locked domains cannot change)
//   «الموصلات»        organisation-level connector switch, data scopes, activation requests
import { h, icon, L, fmtNum, toast, confirmDialog, modal, act, emptyState, statRow, statTile, avatar, go, api, debounce } from '../../../sys-kit.js';
import { segmented } from '../../../ui.js';
import { call, classificationChip, statusChip, directionChip, domainChip, sectionHead, stamp, ago, nOf, POLICY } from './common.js';

export async function render(root, ctx, env) {
  if (env.tab === 'access') return renderAccess(root, ctx, env);
  if (env.tab === 'policies') return renderPolicies(root, ctx, env);
  return renderConnectors(root, ctx, env);
}

const adminNote = () => h('div.callout.ic-admin-note', icon('info'), h('span', L('صلاحية مدير المنصة للإعداد فقط: لا تفتح هذه الصفحات أي بيانات من الأنظمة، وكل تغيير يتطلب تأكيداً ويُسجَّل.', 'Platform admin rights are for configuration only: these pages open no system data, and every change needs confirmation and is logged.')));

// ================================================================== permissions
const ui = { q: '' };
async function renderAccess(root, ctx, env) {
  const m = await env.get('/admin/matrix');
  const sysKey = m.systems.some((s) => s.key === env.sub[0]) ? env.sub[0] : 'all';
  const deptKey = m.departments.some((d) => d.id === env.sub[1]) ? env.sub[1] : 'all';
  const systems = sysKey === 'all' ? m.systems : m.systems.filter((s) => s.key === sysKey);
  const caps = systems.flatMap((s) => s.caps.map((c) => ({ ...c, system: s })));
  const granted = new Set(m.grants.map((g) => `${g.user_id}|${g.cap}`));
  const allCapKeys = new Set(m.systems.flatMap((s) => s.caps.map((c) => c.cap)));
  const grants = m.grants.filter((g) => allCapKeys.has(g.cap));
  const holders = new Set(grants.map((g) => g.user_id)).size;
  const extUsers = new Set(m.users.filter((u) => u.user_type === 'external').map((u) => u.id));

  root.append(adminNote());
  const counts = { grants: grants.length, holders, external: grants.filter((g) => extUsers.has(g.user_id)).length };
  root.append(accessReviewCard(m.review, counts, env));

  // filters (kept in the hash: #/sys/integrations/access/<system>/<department>)
  const sysSel = h('select.field.sm', { 'aria-label': L('النظام', 'System'), onchange: (e) => go(ctx, 'access', e.target.value, deptKey) },
    h('option', { value: 'all' }, L('كل الأنظمة', 'All systems')), m.systems.map((s) => h('option', { value: s.key, selected: s.key === sysKey || null }, L(s.name_ar, s.name_en))));
  const deptSel = h('select.field.sm', { 'aria-label': L('الإدارة', 'Department'), onchange: (e) => go(ctx, 'access', sysKey, e.target.value) },
    h('option', { value: 'all' }, L('كل الإدارات والجهات', 'All departments & organisations')),
    h('optgroup', { label: L('إدارات الجهة', 'Departments') }, m.departments.filter((d) => !d.is_external).map((d) => h('option', { value: d.id, selected: d.id === deptKey || null }, L(d.name_ar, d.name_en)))),
    h('optgroup', { label: L('جهات خارجية', 'External organisations') }, m.departments.filter((d) => d.is_external).map((d) => h('option', { value: d.id, selected: d.id === deptKey || null }, L(d.name_ar, d.name_en)))));
  const search = h('input.field', { type: 'search', value: ui.q, placeholder: L('ابحث بالاسم…', 'Search by name…'), 'aria-label': L('ابحث في المستخدمين', 'Search users'), oninput: debounce((e) => { ui.q = e.target.value; draw(); }, 150) });
  const slot = h('div.ic-matrix-slot');
  const resultNote = h('span.ic-result', { role: 'status', 'aria-live': 'polite' });

  const draw = () => {
    const q = ui.q.trim().toLowerCase();
    const users = m.users.filter((u) => (deptKey === 'all' || u.department_id === deptKey) && (!q || `${u.name_ar} ${u.name_en} ${u.username}`.toLowerCase().includes(q)));
    resultNote.textContent = L(`${nOf(users.length, 'user')} · ${nOf(caps.length, 'grant')}`, `${users.length} users · ${caps.length} capabilities`);
    if (!users.length) { slot.replaceChildren(emptyState({ compact: true, icon: 'search', title: L('لا مستخدمين مطابقين', 'No matching users'), body: L('غيّر البحث أو الإدارة.', 'Change the search or department.') })); return; }
    const byDept = new Map();
    for (const u of users) { if (!byDept.has(u.department_id)) byDept.set(u.department_id, []); byDept.get(u.department_id).push(u); }
    const multi = systems.length > 1;
    const thead = h('thead',
      multi ? h('tr.ic-mx-sys', h('th.ic-mx-corner', { scope: 'col', rowspan: 2 }, L('المستخدم', 'User')), systems.map((s) => h('th', { scope: 'colgroup', colspan: s.caps.length }, h('span.ic-mx-sysname', icon(s.icon), L(s.name_ar, s.name_en))))) : null,
      h('tr', multi ? null : h('th.ic-mx-corner', { scope: 'col' }, L('المستخدم', 'User')), caps.map((c) => h(`th.ic-mx-cap${c.external ? '.ext' : ''}`, { scope: 'col', title: c.cap }, h('span', L(c.ar, c.en)), c.external ? h('span.ic-mx-ext', icon('globe'), L('خارجي', 'External')) : null))));
    const rows = [];
    for (const [deptId, list] of byDept) {
      const d = m.departments.find((x) => x.id === deptId);
      rows.push(h('tr.ic-mx-group', h('th', { scope: 'rowgroup', colspan: caps.length + 1 }, h('span', d?.is_external ? icon('globe') : icon('building'), L(d?.name_ar || '', d?.name_en || '')), h('span.ic-count.num.tabular', fmtNum(list.length)))));
      for (const u of list) {
        rows.push(h('tr', h('th.ic-mx-user', { scope: 'row' },
          h('div.ic-mx-who', avatar(u.name_ar), h('div', h('span.ic-mx-name', L(u.name_ar, u.name_en)), h('span.ic-mx-title', L(u.title_ar || '', u.title_en || u.title_ar || '')))),
          u.is_admin ? h('span.chip.tiny.navy', icon('settings'), L('مدير المنصة', 'Admin')) : null),
        caps.map((c) => h('td', cell(u, c, granted.has(`${u.id}|${c.cap}`), m.me, env)))));
      }
    }
    slot.replaceChildren(h('div.ic-matrix-wrap', { tabindex: 0, role: 'region', 'aria-label': L('مصفوفة الصلاحيات', 'Capability matrix') }, h('table.ic-matrix', h('caption.sr-only', L('المستخدمون وصلاحيات الأنظمة', 'Users and system capabilities')), thead, h('tbody', rows))));
  };
  draw();

  root.append(h('section.card.ic-matrix-card', { 'aria-labelledby': 'ic-mx-t' },
    sectionHead(h('span#ic-mx-t', L('مصفوفة الصلاحيات', 'Capability matrix')), { sub: L('اضغط خلية لمنح الصلاحية أو سحبها. الأدوار العامة تبقى من «إدارة المنصة»؛ هنا صلاحيات الأنظمة الدقيقة فقط.', 'Click a cell to grant or revoke. Broad roles stay in Platform admin; this is for fine-grained system capabilities.') }),
    h('div.sys-filters.ic-mx-filters', h('label.search-field', icon('search'), search), sysSel, deptSel, resultNote),
    h('ul.ic-mx-legend', { 'aria-label': L('مفتاح المصفوفة', 'Matrix legend') },
      h('li', h('span.ic-cell.on.demo', icon('check')), L('ممنوحة', 'Granted')), h('li', h('span.ic-cell.demo', h('i')), L('غير ممنوحة', 'Not granted')),
      h('li', h('span.ic-cell.na.demo', icon('minus')), L('لا تنطبق على نوع الحساب', 'Not for this account type')), h('li', h('span.ic-cell.self.demo', icon('lock')), L('صلاحياتك — يعدّلها مدير آخر (فصل المهام)', 'Yours — another admin changes them (segregation of duties)'))),
    slot));
}
function cell(u, c, on, me, env) {
  const who = L(u.name_ar, u.name_en); const what = L(c.ar, c.en);
  if (!!c.external !== (u.user_type === 'external')) return h('span.ic-cell.na', { title: c.external ? L('للحسابات الخارجية فقط', 'External accounts only') : L('لا تُمنح لحساب خارجي', 'Not for external accounts'), 'aria-label': L(`${what} — لا تنطبق على ${who}`, `${what} — not applicable to ${who}`) }, icon('minus'));
  if (u.id === me) return h(`span.ic-cell.self${on ? '.on' : ''}`, { title: L('لا يمكنك تعديل صلاحياتك بنفسك', 'You cannot change your own capabilities'), 'aria-label': L(`${what} — ${on ? 'ممنوحة' : 'غير ممنوحة'} (صلاحياتك)`, `${what} — ${on ? 'granted' : 'not granted'} (yours)`) }, icon(on ? 'check' : 'lock'));
  const btn = h(`button.ic-cell${on ? '.on' : ''}`, { type: 'button', 'aria-pressed': String(on), 'aria-label': L(`${on ? 'سحب' : 'منح'} «${what}» ${on ? 'من' : 'إلى'} ${who}`, `${on ? 'Revoke' : 'Grant'} “${what}” ${on ? 'from' : 'to'} ${who}`), onclick: async () => {
    const ok = await confirmDialog(on ? L('سحب صلاحية؟', 'Revoke capability?') : L('منح صلاحية؟', 'Grant capability?'),
      on ? L(`سحب «${what}» من ${who} (${L(u.dept_ar, u.dept_en)}). سيفقد الوصول المرتبط بها فوراً، ويصله إشعار، ويُسجَّل التغيير.`, `Revoke “${what}” from ${who} (${u.dept_en}). Access tied to it ends immediately; they are notified and the change is logged.`)
        : L(`منح «${what}» إلى ${who} (${L(u.dept_ar, u.dept_en)}). امنح الصلاحية بقدر حاجة العمل فقط. يصله إشعار ويُسجَّل التغيير.`, `Grant “${what}” to ${who} (${u.dept_en}). Grant only what the job needs. They are notified and the change is logged.`),
      { danger: on, confirmLabel: on ? L('سحب الصلاحية', 'Revoke') : L('منح الصلاحية', 'Grant') });
    if (!ok) return;
    const r = await act(btn, () => call('/admin/caps', { method: 'PUT', body: { user_id: u.id, cap: c.cap, grant: !on, confirm: true } }), { success: on ? L(`سُحبت «${what}» من ${who}`, `Revoked “${what}” from ${who}`) : L(`مُنحت «${what}» إلى ${who}`, `Granted “${what}” to ${who}`) });
    if (r) await env.refresh();
  } }, on ? icon('check') : h('i'));
  return btn;
}
function govMetrics(counts) {
  const m = (ic, value, label, hint) => h('div.ic-gov-metric', h('span.ic-glyph.sm', { 'aria-hidden': 'true' }, icon(ic)), h('div', h('strong.num.tabular', fmtNum(value)), h('span', label), hint ? h('span.tiny.faint', hint) : null));
  return h('div.ic-gov-metrics',
    m('key', counts.grants, L('صلاحيات ممنوحة', 'Grants')),
    m('people', counts.holders, L('أصحاب صلاحيات', 'Holders')),
    m('globe', counts.external, L('لحسابات خارجية', 'External accounts'), L('بواباتها فقط', 'Their portals only')));
}
function accessReviewCard(review, counts, env) {
  const q = Number(String(review.period).slice(-1));
  const qAr = ['الأول', 'الثاني', 'الثالث', 'الرابع'][q - 1];
  if (review.done_at) {
    return h('section.card.ic-gov.done', h('div.ic-gov-main', h('span.ic-review-badge', { 'aria-hidden': 'true' }, icon('clipboardCheck')),
      h('span.eyebrow', L(`مراجعة الربع ${qAr}`, `Q${q} access review`)), h('h3', L('اعتُمدت مراجعة الصلاحيات لهذا الربع', 'This quarter’s access review is signed off')),
      h('p.muted', L(`${stamp(review.done_at)}${review.by ? ` · ${review.by.name_ar}` : ''}`, `${stamp(review.done_at)}${review.by ? ` · ${review.by.name_en}` : ''}`))), govMetrics(counts));
  }
  const btn = h('button.btn.primary', { type: 'button', onclick: async () => {
    const note = h('textarea.field', { rows: 2, maxlength: 500, id: 'ic-ar-note', placeholder: L('ملاحظات المراجعة (اختياري)', 'Review notes (optional)') });
    const ok = await modal(L('اعتماد مراجعة الصلاحيات', 'Sign off the access review'), h('div.ic-req-dialog',
      h('p.muted', L(`تأكد أن كل صلاحية من ${nOf(counts.grants, 'grant')} ما زالت مطلوبة لعمل صاحبها، وأن حسابات الجهات الخارجية (${fmtNum(counts.external)}) مقتصرة على بواباتها. تُحفظ لقطة من الأرقام الحالية مع اعتمادك.`, `Confirm each of the ${counts.grants} grants is still needed, and that external accounts (${counts.external}) are limited to their portals. A snapshot of the current numbers is saved with your sign-off.`)),
      h('label.lbl', { for: 'ic-ar-note' }, L('ملاحظات', 'Notes')), note),
    [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('اعتماد المراجعة', 'Sign off'), value: true, primary: true }]);
    if (!ok) return;
    const r = await act(btn, () => call('/admin/access-review', { method: 'POST', body: { confirm: true, note: note.value.trim() || undefined } }), { success: L('اعتُمدت مراجعة الصلاحيات (+25 نقطة تميّز)', 'Access review signed off (+25 excellence points)') });
    if (r) await env.refresh();
  } }, icon('clipboardCheck'), L('اعتماد مراجعة هذا الربع', 'Sign off this quarter'));
  return h('section.card.ic-gov', h('div.ic-gov-main',
    h('span.eyebrow', L(`مراجعة الربع ${qAr}`, `Q${q} access review`)),
    h('h3', L('مراجعة الصلاحيات الدورية مستحقة', 'The periodic access review is due')),
    h('p.muted', review.last_at ? L(`آخر اعتماد: ${stamp(review.last_at)}${review.by ? ` · ${review.by.name_ar}` : ''}. راجع المصفوفة أدناه ثم اعتمد.`, `Last sign-off: ${stamp(review.last_at)}${review.by ? ` · ${review.by.name_en}` : ''}. Review the matrix below, then sign off.`) : L('لم تُعتمد أي مراجعة بعد.', 'No review signed off yet.')),
    h('div.ic-gov-cta', btn, h('p.ic-points', icon('sparkle'), L('+25 نقطة تميّز مرة كل ربع', '+25 excellence points once a quarter')))), govMetrics(counts));
}

// ================================================================== data policies
async function renderPolicies(root, ctx, env) {
  const rows = await env.get('/admin/domains');
  const n = (p) => rows.filter((d) => d.ai_policy === p && !d.ai_locked).length;
  root.append(adminNote());
  root.append(statRow([
    statTile({ label: L('متاح للمساعد', 'Available to Ask AI'), value: n('allowed'), icon: 'spark', tone: 'emph' }),
    statTile({ label: L('بموافقة المستخدم', 'User opt-in'), value: n('opt_in'), icon: 'shield' }),
    statTile({ label: L('موقوف', 'Off'), value: n('off'), icon: 'shieldBan' }),
    statTile({ label: L('مقفل دائماً', 'Always locked'), value: rows.filter((d) => d.ai_locked).length, icon: 'lockKeyhole', tone: 'sand', hint: L('لا يُفتح لأحد', 'Never opened') }),
  ]));
  const bySystem = new Map();
  for (const d of rows) { if (!bySystem.has(d.system)) bySystem.set(d.system, []); bySystem.get(d.system).push(d); }
  const table = h('table.tbl.ic-policy-table',
    h('caption.sr-only', L('سياسات وصول المساعد إلى نطاقات البيانات', 'Ask AI policies per data domain')),
    h('thead', h('tr', h('th', { scope: 'col' }, L('نطاق البيانات', 'Data domain')), h('th', { scope: 'col' }, L('التصنيف', 'Classification')), h('th', { scope: 'col' }, L('أدوات المساعد', 'Assistant tools')), h('th', { scope: 'col' }, L('السياسة', 'Policy')), h('th', { scope: 'col' }, L('آخر تغيير', 'Last change')))),
    h('tbody', [...bySystem].flatMap(([, list]) => [
      h('tr.ic-mx-group', h('th', { scope: 'rowgroup', colspan: 5 }, h('span', icon(list[0].icon), L(list[0].system_ar, list[0].system_en)))),
      ...list.map((d) => policyRow(d, env)),
    ])));
  root.append(h('section.card.ic-policy-card', { 'aria-labelledby': 'ic-pol-t' },
    sectionHead(h('span#ic-pol-t', L('ما يقرؤه المساعد وعملاء MCP', 'What Ask AI and MCP clients may read')), { sub: L('«بموافقة المستخدم» يعني أن كل موظف يقرر لنفسه من «الذكاء الاصطناعي والبيانات». النطاقات المقفلة محمية في الشيفرة ولا تتغير من هنا.', '“User opt-in” means each employee decides for themselves under “AI & data”. Locked domains are protected in code and cannot change here.') }),
    h('div.table-wrap', table)));
}
function policyRow(d, env) {
  let control;
  if (d.ai_locked) control = h('div.ic-locked', h('span.chip.purple', icon('lockKeyhole'), L('مقفل دائماً', 'Always locked')), d.note_ar ? h('span.tiny.faint', L(d.note_ar, d.note_en || d.note_ar)) : null);
  else {
    control = h('div.ic-policy-ctl', segmented([['allowed', L(...POLICY.allowed)], ['opt_in', L(...POLICY.opt_in)], ['off', L(...POLICY.off)]], d.ai_policy, async (v) => {
      if (v === d.ai_policy) return;
      const impact = v === 'off' ? L('سيتوقف المساعد وعملاء MCP عن قراءة هذا النطاق لكل المستخدمين فوراً.', 'Ask AI and MCP clients stop reading this domain for everyone, immediately.')
        : v === 'opt_in' ? L('لن يقرأ المساعد هذا النطاق إلا لمن يفعّله بنفسه.', 'Ask AI reads this domain only for people who switch it on themselves.')
          : L('سيقرأ المساعد هذا النطاق لكل المستخدمين المصرّح لهم دون حاجة لموافقتهم، ضمن صلاحيات كل منهم.', 'Ask AI reads this domain for every authorised user without their opt-in, within each one’s permissions.');
      const opted = d.ai_policy === 'opt_in' && d.opted_in ? L(` فعّله حالياً: ${d.opted_in === '<3' ? 'أقل من 3 مستخدمين' : nOf(d.opted_in, 'user')}.`, ` Currently on for: ${d.opted_in === '<3' ? 'fewer than 3 users' : `${d.opted_in} users`}.`) : '';
      const warn = v === 'allowed' && d.classification !== 'internal' ? L(' تنبيه: هذا النطاق مصنف «سري».', ' Warning: this domain is classified “confidential”.') : '';
      const ok = await confirmDialog(L(`تغيير سياسة «${d.name_ar}»؟`, `Change the “${d.name_en}” policy?`), `${impact}${opted}${warn}`, { danger: v === 'allowed' && d.classification !== 'internal', confirmLabel: L('تغيير السياسة', 'Change policy') });
      if (!ok) { await env.refresh(); return; }
      try { await api(`/api/admin/domains/${encodeURIComponent(d.key)}`, { method: 'PUT', body: { ai_policy: v, confirm: true } }); toast(L(`حُدّثت سياسة «${d.name_ar}»`, `“${d.name_en}” policy updated`)); }
      catch (e) { toast(e.message, { kind: 'error' }); }
      await env.refresh();
    }, { label: L(`سياسة ${d.name_ar}`, `${d.name_en} policy`) }),
    d.ai_policy === 'opt_in' ? h('span.tiny.faint', L(`فعّله: ${d.opted_in === '<3' ? 'أقل من 3' : fmtNum(d.opted_in || 0)}`, `On for: ${d.opted_in === '<3' ? 'fewer than 3' : d.opted_in || 0}`)) : null);
  }
  const tools = d.tools.read || d.tools.write ? L(`${fmtNum(d.tools.read)} قراءة · ${fmtNum(d.tools.write)} تعديل`, `${d.tools.read} read · ${d.tools.write} write`) : L('لا أدوات', 'None');
  return h('tr', { 'data-domain': d.key },
    h('td', { 'data-label': L('نطاق البيانات', 'Data domain') }, h('div.ic-pol-name', L(d.name_ar, d.name_en)), h('code.ic-pol-key', { dir: 'ltr' }, d.key)),
    h('td', { 'data-label': L('التصنيف', 'Classification') }, classificationChip(d.classification)),
    h('td', { 'data-label': L('أدوات المساعد', 'Assistant tools') }, h('span.tiny', tools)),
    h('td', { 'data-label': L('السياسة', 'Policy') }, control),
    h('td', { 'data-label': L('آخر تغيير', 'Last change') }, d.updated_at ? h('span.tiny.faint', `${ago(d.updated_at)}${d.updated_by ? ` · ${L(d.updated_by.name_ar, d.updated_by.name_en)}` : ''}`) : h('span.tiny.faint', L('الإعداد الافتراضي', 'Default'))));
}

// ================================================================== connectors
async function renderConnectors(root, ctx, env) {
  const list = await env.get('/admin/connectors');
  const open = list.reduce((a, c) => a + c.requests.length, 0);
  root.append(adminNote());
  root.append(statRow([
    statTile({ label: L('طلبات تفعيل مفتوحة', 'Open activation requests'), value: open, icon: 'inbox', tone: open ? 'warn' : null }),
    statTile({ label: L('مفعّل للجهة', 'Enabled entity-wide'), value: list.filter((c) => c.enabled).length, icon: 'plug' }),
    statTile({ label: L('يحتاج إعداد', 'Needs setup'), value: list.filter((c) => c.status === 'needs_setup').length, icon: 'settings', hint: L('متغيرات بيئة ناقصة', 'Missing environment variables') }),
    statTile({ label: L('روابط تقويم فعّالة', 'Active calendar links'), value: list.find((c) => c.key === 'ics')?.active_feeds ?? 0, icon: 'calendarDays', hint: L('عدد إجمالي فقط', 'Total count only') }),
  ]));
  const sorted = [...list].sort((a, b) => b.requests.length - a.requests.length);
  root.append(h('div.ic-aconn-list', sorted.map((c) => adminConnectorCard(c, env))));
}
function adminConnectorCard(c, env) {
  const id = `ic-en-${c.key}`;
  const sw = h('input.switch', { type: 'checkbox', id, checked: c.enabled || null, onchange: async (e) => {
    const want = e.target.checked;
    const ok = await confirmDialog(want ? L(`تفعيل «${c.name_ar}» للجهة؟`, `Enable “${c.name_en}” entity-wide?`) : L(`تعطيل «${c.name_ar}» للجهة؟`, `Disable “${c.name_en}” entity-wide?`),
      want ? L('يصبح الموصل متاحاً وفق نطاقات البيانات المعتمدة. التغيير يُسجَّل.', 'The connector becomes available within its approved data scopes. The change is logged.')
        : c.key === 'ics' ? L(`ستتوقف كل روابط التقويم الفعّالة (${fmtNum(c.active_feeds || 0)}) فوراً حتى إعادة التفعيل، دون حذفها.`, `All active calendar links (${c.active_feeds || 0}) stop immediately until re-enabled; they are not deleted.`)
          : L('يتوقف الموصل لكل المستخدمين حتى إعادة التفعيل. التغيير يُسجَّل.', 'The connector stops for everyone until re-enabled. The change is logged.'),
      { danger: !want, confirmLabel: want ? L('تفعيل', 'Enable') : L('تعطيل', 'Disable') });
    if (!ok) { e.target.checked = !want; return; }
    e.target.disabled = true;
    try { await call(`/admin/connectors/${c.key}`, { method: 'PUT', body: { enabled: want, confirm: true } }); toast(want ? L(`فُعّل «${c.name_ar}»`, `“${c.name_en}” enabled`) : L(`عُطّل «${c.name_ar}»`, `“${c.name_en}” disabled`)); await env.refresh(); }
    catch (err) { e.target.checked = !want; e.target.disabled = false; toast(err.message, { kind: 'error' }); }
  } });
  const missing = c.env.filter((x) => !x.present);
  const test = c.testable ? h('button.btn.sm', { type: 'button', disabled: missing.length ? true : null, title: missing.length ? L('أكمل المتغيرات أولاً', 'Complete the variables first') : null, onclick: async () => {
    const r = await act(test, () => call(`/admin/connectors/${c.key}/test`, { method: 'POST', body: {} }));
    if (r) { toast(r.ok ? L(`يمكن الوصول إلى الخادم (${r.message}) — فحص شبكي فقط`, `Server reachable (${r.message}) — network check only`) : L(`تعذّر الوصول: ${r.message}`, `Unreachable: ${r.message}`), { kind: r.ok ? 'success' : 'error' }); await env.refresh(); }
  } }, icon('activity'), L('فحص الوصول', 'Reachability test')) : null;

  const scopesCol = h('div.ic-aconn-col',
    h('h4', L('نطاقات البيانات', 'Data scopes')),
    h('div.ic-chip-row', c.domains.filter((d) => d.selected || d.protected || d.masked).map((d) => domainChip(d))),
    c.fixed_scopes ? h('p.tiny.faint', L('ثابتة بالتصميم: الاجتماعات السرية تظهر «مشغول» فقط.', 'Fixed by design: confidential meetings show as “busy” only.'))
      : h('button.btn.sm.ghost', { type: 'button', onclick: () => scopesDialog(c, env) }, icon('sliders'), L('تعديل النطاقات', 'Edit scopes')));
  const setupCol = h('div.ic-aconn-col',
    h('h4', L('الإعداد', 'Setup')),
    c.env.length ? h('ul.ic-env', c.env.map((e) => h('li', h('code', { dir: 'ltr' }, e.name), e.present ? h('span.chip.tiny.good', icon('check'), L('موجود', 'Set')) : h('span.chip.tiny.warn', icon('minus'), L('ناقص', 'Missing')))))
      : h('p.tiny', L('لا يحتاج إعداداً — يعمل داخل المنصة.', 'No setup needed — runs inside the platform.')),
    c.last_test ? h(`p.tiny.ic-test.${c.last_test.ok ? 'ok' : 'bad'}`, icon(c.last_test.ok ? 'circleCheck' : 'circleX'), L(`آخر فحص ${ago(c.last_test.at)}: ${c.last_test.ok ? 'متاح' : 'غير متاح'} (${c.last_test.message})`, `Last test ${ago(c.last_test.at)}: ${c.last_test.ok ? 'reachable' : 'unreachable'} (${c.last_test.message})`)) : null,
    test,
    c.key === 'ics' ? h('p.tiny.faint', L(`روابط فعّالة: ${fmtNum(c.active_feeds || 0)} (عدد فقط — لا تُعرض الروابط)`, `Active links: ${c.active_feeds || 0} (count only — links are never shown)`)) : null);
  const reqCol = h('div.ic-aconn-col',
    h('h4', L('طلبات التفعيل', 'Activation requests'), c.requests.length ? h('span.ic-count.num.tabular', fmtNum(c.requests.length)) : null),
    c.requests.length ? h('ul.ic-areqs', c.requests.map((r) => h('li',
      h('div.ic-areq-who', avatar(r.user?.name_ar || '?'), h('div.grow', h('strong', L(r.user?.name_ar || '', r.user?.name_en || '')), h('span.tiny.faint', `${L(r.user?.dept_ar || '', r.user?.dept_en || '')} · ${ago(r.created_at)}`)), r.is_demo ? h('span.chip.demo.tiny', L('تجريبي', 'Demo')) : null),
      r.note ? h('p.ic-areq-note', { dir: 'auto' }, r.note) : null,
      h('div.btn-group', h('button.btn.sm.primary', { type: 'button', onclick: () => closeDialog(c, r, 'done', env) }, icon('check'), L('تم التفعيل', 'Mark done')),
        h('button.btn.sm.ghost', { type: 'button', onclick: () => closeDialog(c, r, 'declined', env) }, L('اعتذار مع السبب', 'Decline with reason'))))))
      : h('p.tiny.faint', L('لا طلبات مفتوحة.', 'No open requests.')));

  return h(`article.card.ic-aconn${c.requests.length ? '.has-req' : ''}`, { 'data-connector': c.key, 'aria-labelledby': `ic-ac-${c.key}` },
    h('header.ic-conn-head',
      h('span.ic-conn-icon', { 'aria-hidden': 'true' }, icon(c.icon)),
      h('div.grow', h(`h3#ic-ac-${c.key}.ic-conn-name`, L(c.name_ar, c.name_en)), h('div.ic-conn-sub', h('bdi.ic-conn-vendor', c.vendor), directionChip(c.direction), statusChip(c.status))),
      h('label.ic-pin', { for: id }, h('span', L('مفعّل للجهة', 'Enabled for the entity')), sw)),
    c.updated_at ? h('p.tiny.faint.ic-aconn-upd', L(`آخر تعديل ${ago(c.updated_at)}${c.updated_by ? ` · ${c.updated_by.name_ar}` : ''}`, `Last changed ${ago(c.updated_at)}${c.updated_by ? ` · ${c.updated_by.name_en}` : ''}`)) : null,
    h(`div.ic-aconn-grid${c.requests.length ? '' : '.two'}`, scopesCol, setupCol, c.requests.length ? reqCol : null),
    c.requests.length ? null : h('p.tiny.faint.ic-aconn-noreq', icon('inbox'), L('لا طلبات تفعيل مفتوحة لهذا الموصل.', 'No open activation requests for this connector.')));
}
async function scopesDialog(c, env) {
  const boxes = c.domains.map((d) => {
    const inp = h('input', { type: 'checkbox', value: d.key, checked: d.selected || null, disabled: d.protected || null, id: `ic-sc-${d.key}` });
    return { d, inp, el: h(`label.ic-scope${d.protected ? '.protected' : ''}`, { for: `ic-sc-${d.key}` }, inp, h('div.grow', h('span.ic-scope-name', L(d.name_ar, d.name_en)), h('span.tiny.faint', d.protected ? L('سري للغاية — لا يُربط بأي موصل', 'Restricted — never connectable') : d.core ? L('بيانات المنصة الأساسية', 'Core platform data') : h('code', { dir: 'ltr' }, d.key))), classificationChip(d.classification)) };
  });
  const ok = await modal(L(`نطاقات بيانات «${c.name_ar}»`, `Data scopes of “${c.name_en}”`),
    h('div.ic-scopes', h('p.muted', L('اختر أقل ما يحتاجه الموصل. النطاقات السرية للغاية مقفلة ولا يمكن اختيارها.', 'Choose the least the connector needs. Restricted domains are locked and cannot be selected.')), boxes.map((b) => b.el)),
    [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('حفظ النطاقات', 'Save scopes'), value: true, primary: true }]);
  if (!ok) return;
  const scopes = boxes.filter((b) => b.inp.checked && !b.d.protected).map((b) => b.d.key);
  try { await call(`/admin/connectors/${c.key}`, { method: 'PUT', body: { scopes, confirm: true } }); toast(L('حُفظت نطاقات البيانات', 'Data scopes saved')); await env.refresh(); }
  catch (e) { toast(e.message, { kind: 'error' }); }
}
async function closeDialog(c, r, resolution, env) {
  const note = h('textarea.field', { rows: 3, maxlength: 500, id: 'ic-close-note', placeholder: resolution === 'done' ? L('مثال: فُعّل الموصل واعتُمدت نطاقاته.', 'e.g. Connector enabled and scopes approved.') : L('اذكر السبب والخطوة التالية.', 'Give the reason and the next step.') });
  const ok = await modal(resolution === 'done' ? L('إغلاق الطلب كمنفّذ', 'Close request as done') : L('الاعتذار عن الطلب', 'Decline the request'),
    h('div.ic-req-dialog', h('p.muted', L(`طلب ${r.user?.name_ar || ''} لتفعيل «${c.name_ar}». سيصله ردّك كتنبيه.`, `${r.user?.name_en || ''}’s request for “${c.name_en}”. They receive your reply as an alert.`)),
      h('label.lbl', { for: 'ic-close-note' }, L('الرد', 'Reply')), note),
    [{ label: L('إلغاء', 'Cancel'), value: false }, { label: resolution === 'done' ? L('إغلاق كمنفّذ', 'Close as done') : L('اعتذار', 'Decline'), value: true, primary: resolution === 'done', danger: resolution !== 'done' }]);
  if (!ok) return;
  try { await call(`/admin/requests/${r.id}/close`, { method: 'POST', body: { resolution, note: note.value.trim() || undefined, confirm: true } }); toast(L('أُغلق الطلب وأُبلغ صاحبه', 'Request closed and the requester notified')); await env.refresh(); }
  catch (e) { toast(e.message, { kind: 'error' }); }
}
