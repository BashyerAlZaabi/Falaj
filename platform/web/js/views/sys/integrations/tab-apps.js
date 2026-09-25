// «التطبيقات المرتبطة» — the real personal calendar feed (ICS) and an honest
// catalogue of enterprise connectors: direction, data domains touched (restricted
// ones can never be selected), who uses it, and the true status.
import { h, icon, L, fmtNum, fmtDate, fmtTime, toast, confirmDialog, modal, act, emptyState } from '../../../sys-kit.js';
import { call, statusChip, directionChip, domainChip, sectionHead, ago, stamp, nOf, copyText, STATUS } from './common.js';

const REQ_STATUS = { open: ['قيد المراجعة', 'Under review', 'warn', 'hourglass'], done: ['نُفّذ', 'Done', 'good', 'circleCheck'], declined: ['تعذّر', 'Declined', 'outline', 'circleX'], withdrawn: ['مسحوب', 'Withdrawn', 'outline', 'undo'] };

export async function render(root, ctx, env) {
  const data = await env.get('/connectors');
  const ics = data.connectors.find((c) => c.key === 'ics');
  // Connectors meant for my team (HR → HRMS, Finance/Procurement → ERP) come first.
  const others = data.connectors.filter((c) => c.key !== 'ics').sort((a, b) => Number(b.team) - Number(a.team));
  const focus = env.sub[0];

  root.append(feedCard(ics, env, focus === 'ics'));

  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, others.filter((c) => c.status === k).length]));
  root.append(sectionHead(L('الموصلات المؤسسية', 'Enterprise connectors'), {
    sub: L('حالة كل موصل كما هي فعلاً في هذه البيئة. لا يُعرض موصل «متصل» ما لم يعمل حقاً، ولا تُعرض قيم الإعدادات أبداً — أسماء المتغيرات فقط.', 'Each connector’s real status in this environment. Nothing is shown as “connected” unless it really works, and setting values are never shown — variable names only.'),
    actions: [h('span.chip.warn', icon('settings'), L(`${fmtNum(counts.needs_setup)} يحتاج إعداد`, `${counts.needs_setup} need setup`)),
      counts.configured ? h('span.chip.outline', icon('circleDashed'), L(`${fmtNum(counts.configured)} مُعدّ`, `${counts.configured} configured`)) : null,
      counts.disabled ? h('span.chip.outline', icon('ban'), L(`${fmtNum(counts.disabled)} معطّل`, `${counts.disabled} disabled`)) : null],
  }));
  root.append(h('div.ic-conn-grid', others.map((c) => connectorCard(c, data, env, focus === c.key))));

  const history = data.requests.filter((r) => r.status !== 'open');
  if (history.length) {
    root.append(h('section.card.ic-req-history', { 'aria-labelledby': 'ic-req-h' },
      h('h3#ic-req-h.card-title', L('طلباتي السابقة', 'My past requests')),
      h('ul.list.separated', history.map((r) => {
        const c = data.connectors.find((x) => x.key === r.connector);
        const [ar, en, tone, ic] = REQ_STATUS[r.status];
        return h('li', h('span.ic-glyph.sm', { 'aria-hidden': 'true' }, icon(c?.icon || 'plug')),
          h('div.grow', h('div.title', L(c?.name_ar || r.connector, c?.name_en || r.connector)), h('div.meta', { dir: 'auto' }, [stamp(r.created_at), r.resolution_note].filter(Boolean).join(' · '))),
          r.is_demo ? h('span.chip.demo.tiny', L('تجريبي', 'Demo')) : null,
          h(`span.chip.tiny.${tone}`, icon(ic), L(ar, en)));
      }))));
  }
  if (focus) requestAnimationFrame(() => root.querySelector(`[data-connector="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

// ------------------------------------------------------------------ ICS feed
const OPTS = [
  ['include_meetings', 'الاجتماعات', 'Meetings', 'calendarClock'],
  ['include_events', 'المواعيد', 'Appointments', 'calendar'],
  ['include_tasks', 'مواعيد استحقاق المهام', 'Task due dates', 'listTodo'],
];
function feedCard(c, env, focused) {
  const f = c.feed;
  const disabled = c.status === 'disabled';
  const optsState = { include_meetings: true, include_events: true, include_tasks: true, ...(f?.options || {}) };
  const preview = h('div.ic-preview', { 'aria-live': 'polite' }, h('div.sk.sk-row'), h('div.sk.sk-row'), h('div.sk.sk-row'));
  const loadPreview = async () => {
    const q = OPTS.map(([k]) => `${k.replace('include_', '')}=${optsState[k] ? 1 : 0}`).join('&');
    try { preview.replaceChildren(previewList(await call(`/feed/preview?${q}`))); }
    catch (e) { preview.replaceChildren(h('p.tiny.faint', e.message)); }
  };
  const optionControls = h('fieldset.ic-feed-opts', { disabled: disabled || null },
    h('legend', L('ما الذي يظهر في تقويمك؟', 'What shows in your calendar?')),
    OPTS.map(([k, ar, en, ic]) => h('label.ic-opt', h('input', { type: 'checkbox', checked: optsState[k] || null, onchange: async (e) => {
      const prev = optsState[k]; optsState[k] = e.target.checked;
      if (!OPTS.some(([x]) => optsState[x])) { optsState[k] = prev; e.target.checked = prev; toast(L('اختر مصدراً واحداً على الأقل', 'Pick at least one source'), { kind: 'error' }); return; }
      if (f) {
        try { await call(`/feeds/${f.id}`, { method: 'PUT', body: { [k]: e.target.checked } }); toast(L('حُدّث محتوى رابط تقويمك — يظهر التغيير عند التحديث التالي لتطبيق التقويم', 'Feed updated — your calendar app picks it up on its next refresh')); }
        catch (err) { optsState[k] = prev; e.target.checked = prev; toast(err.message, { kind: 'error' }); return; }
      }
      loadPreview();
    } }), icon(ic), h('span', L(ar, en)))));

  let actions;
  if (disabled) actions = h('div.callout.ic-callout-warn', icon('ban'), h('span', L('أوقف مدير المنصة روابط التقويم مؤقتاً على مستوى الجهة. روابطك محفوظة وستعود للعمل عند إعادة التفعيل.', 'The platform admin has paused calendar links for the entity. Your link is kept and resumes when re-enabled.')));
  else if (!f) {
    const btn = h('button.btn.primary.lg', { type: 'button', onclick: async () => {
      const r = await act(btn, () => call('/feeds', { method: 'POST', body: optsState }));
      if (r) { await showLink(r); await env.refresh(); }
    } }, icon('calendarPlus'), L('إنشاء رابط تقويمي', 'Create my calendar link'));
    actions = h('div.ic-feed-actions', btn, h('span.tiny.faint', L('يظهر الرابط مرة واحدة ويُحفظ مشفّراً؛ يمكنك إيقافه أو تدويره في أي وقت.', 'Shown once and stored hashed; revoke or rotate it any time.')));
  } else {
    const rotate = h('button.btn', { type: 'button', onclick: async () => {
      const ok = await confirmDialog(L('تدوير رابط التقويم؟', 'Rotate your calendar link?'), L('سيتوقف الرابط الحالي فوراً في كل التطبيقات، وستحصل على رابط جديد تضيفه من جديد. استخدم هذا إن شاركت الرابط بالخطأ.', 'The current link stops working everywhere immediately and you get a new one to add again. Use this if the link was shared by mistake.'), { confirmLabel: L('تدوير الرابط', 'Rotate link') });
      if (!ok) return;
      const r = await act(rotate, () => call('/feeds/rotate', { method: 'POST', body: { confirm: true } }));
      if (r) { await showLink(r); await env.refresh(); }
    } }, icon('refresh'), L('تدوير الرابط', 'Rotate link'));
    const revoke = h('button.btn.destructive-soft', { type: 'button', onclick: async () => {
      const ok = await confirmDialog(L('إيقاف رابط التقويم؟', 'Revoke your calendar link?'), L('ستتوقف مزامنة تقويمك فوراً، وستبقى الأحداث القديمة في تطبيق التقويم حتى تحذف الاشتراك منه.', 'Your calendar stops syncing immediately; old events stay in your calendar app until you remove the subscription there.'), { danger: true, confirmLabel: L('إيقاف الرابط', 'Revoke link') });
      if (!ok) return;
      const r = await act(revoke, () => call(`/feeds/${f.id}/revoke`, { method: 'POST', body: { confirm: true } }), { success: L('أُوقف رابط التقويم', 'Calendar link revoked') });
      if (r) await env.refresh();
    } }, icon('unplug'), L('إيقاف الرابط', 'Revoke link'));
    actions = h('div.ic-feed-actions', rotate, revoke);
  }

  const status = f
    ? h('dl.ic-feed-facts',
      h('div', h('dt', L('الرابط', 'Link')), h('dd', h('bdi.ic-mono', `…${f.hint}`), h('span.tiny.faint', L(' · محفوظ مشفّراً', ' · stored hashed')))),
      h('div', h('dt', L('أُنشئ', 'Created')), h('dd', stamp(f.created_at))),
      h('div', h('dt', L('آخر استخدام', 'Last used')), h('dd', f.last_used_at ? h('span', ago(f.last_used_at), h('span.tiny.faint', ` · ${fmtDate(f.last_used_at)} ${fmtTime(f.last_used_at)}`)) : h('span.faint', L('لم يستخدمه أي تطبيق بعد', 'No app has used it yet')))),
      h('div', h('dt', L('مرات الجلب', 'Fetches')), h('dd', f.use_count ? nOf(f.use_count, 'fetch') : '—')))
    : h('ol.ic-steps.ic-feed-steps',
      h('li', h('strong', L('أنشئ الرابط', 'Create the link')), h('span', L('واختر ما يظهر فيه.', 'and choose what it shows.'))),
      h('li', h('strong', L('انسخه إلى تطبيق التقويم', 'Copy it to your calendar app')), h('span', L('Outlook أو Google أو Apple — «إضافة تقويم من الإنترنت».', 'Outlook, Google or Apple — “Add calendar from the internet”.'))),
      h('li', h('strong', L('يتحدّث تلقائياً', 'It updates by itself')), h('span', L('كل 30 دقيقة تقريباً، للقراءة فقط.', 'About every 30 minutes, read-only.'))));

  loadPreview();
  return h(`section.card.ic-feed${focused ? '.focused' : ''}${f ? '.is-on' : ''}`, { 'data-connector': 'ics', 'aria-labelledby': 'ic-feed-t' },
    h('div.ic-feed-main',
      h('header.ic-feed-head',
        h('span.ic-feed-icon', { 'aria-hidden': 'true' }, icon('calendarDays')),
        h('div.grow', h('div.ic-feed-eyebrow', h('span.eyebrow', L('تكامل فعلي يعمل الآن', 'A real, working integration')), statusChip(c.status)), h('h2#ic-feed-t', L(c.name_ar, c.name_en)), h('p.muted', L(c.desc_ar, c.desc_en)))),
      h('div.ic-feed-chips', directionChip(c.direction), ...c.domains.map((d) => domainChip(d))),
      status, optionControls, actions),
    h('div.ic-feed-side',
      h('div.ic-preview-head', h('strong', L('معاينة ما سيظهر', 'Preview of what shows')), h('span.tiny.faint', L('كما يراه تطبيق التقويم', 'As your calendar app sees it'))),
      preview));
}
function previewList(p) {
  if (!p.items.length) return emptyState({ compact: true, icon: 'calendar', title: L('لا شيء قادم خلال 90 يوماً', 'Nothing coming up in 90 days'), body: L('ستظهر هنا اجتماعاتك ومواعيدك ومهامك عند إضافتها.', 'Your meetings, appointments and tasks appear here once added.') });
  const KIND = { meeting: ['calendarClock', 'اجتماع', 'Meeting'], event: ['calendar', 'موعد', 'Appointment'], task: ['listTodo', 'مهمة', 'Task'] };
  return h('div',
    h('ul.ic-prev-list', p.items.slice(0, 7).map((i) => {
      const [ic, ar, en] = KIND[i.kind] || KIND.event;
      const when = i.all_day ? L(`${fmtDate(i.date)} · طوال اليوم`, `${fmtDate(i.date)} · all day`) : `${fmtDate(i.start)} · ${fmtTime(i.start)}`;
      return h(`li${i.masked ? '.masked' : ''}`,
        h('span.ic-prev-ic', { 'aria-hidden': 'true' }, icon(i.masked ? 'lockKeyhole' : ic)),
        h('div.grow', h('div.ic-prev-title', i.summary), h('div.ic-prev-meta', [when, i.location, i.masked ? L('بلا تفاصيل', 'no details') : L(ar, en)].filter(Boolean).join(' · '))));
    })),
    h('p.tiny.faint.ic-prev-foot', p.total > 7 ? L(`و${fmtNum(p.total - 7)} عناصر أخرى`, `and ${p.total - 7} more`) : '',
      !p.meetings_available && p.options.include_meetings ? L(' الاجتماعات من نظام الاجتماعات ستظهر عند تفعيله.', ' Meetings from the Meetings system appear once it is available.') : ''));
}
async function showLink(r) {
  const input = h('input.field.ic-link-input', { type: 'text', readonly: true, value: r.url, dir: 'ltr', 'aria-label': L('رابط التقويم', 'Calendar link'), onfocus: (e) => e.target.select() });
  const guide = h('div.ic-howto',
    h('details', { open: true }, h('summary', 'Microsoft Outlook'), h('p', L('التقويم ← إضافة تقويم ← الاشتراك من الويب ← الصق الرابط.', 'Calendar → Add calendar → Subscribe from web → paste the link.'))),
    h('details', h('summary', 'Google Calendar'), h('p', L('التقويمات الأخرى (+) ← من عنوان URL ← الصق الرابط.', 'Other calendars (+) → From URL → paste the link.'))),
    h('details', h('summary', 'Apple Calendar'), h('p', L('ملف ← اشتراك تقويم جديد ← الصق الرابط، أو افتح رابط webcal أدناه.', 'File → New Calendar Subscription → paste the link, or open the webcal link below.'))));
  const body = h('div.ic-link-dialog',
    h('div.callout.ic-callout-key', icon('key'), h('span', h('strong', L('انسخ الرابط الآن — لن يظهر مجدداً. ', 'Copy the link now — it won’t be shown again. ')), L('من يملك الرابط يرى تقويمك؛ لا تشاركه، وأوقفه إن تسرّب.', 'Anyone with the link sees your calendar; don’t share it, and revoke it if it leaks.'))),
    h('div.ic-link-row', input, h('button.btn.primary', { type: 'button', onclick: () => copyText(r.url, L('نُسخ الرابط — الصقه في تطبيق التقويم', 'Link copied — paste it into your calendar app')) }, icon('copy'), L('نسخ', 'Copy'))),
    h('a.btn.sm.ghost', { href: r.webcal }, icon('calendarPlus'), L('فتح في تطبيق التقويم (webcal)', 'Open in calendar app (webcal)')),
    guide);
  await modal(L('رابط تقويمك جاهز', 'Your calendar link is ready'), body, [{ label: L('تم، نسخته', 'Done, I copied it'), value: true, primary: true }], { initialFocus: 'primary', dismissible: false, closeOnNavigate: true });
}

// ------------------------------------------------------------------ other connectors
function connectorCard(c, data, env, focused) {
  const req = c.my_request;
  let action = null;
  let note = null;
  if (c.status === 'disabled') note = L('أوقفه مدير المنصة على مستوى الجهة.', 'Switched off entity-wide by the platform admin.');
  else if (c.status === 'needs_setup') note = L('ينقصه إعداد من مدير المنصة قبل أن يعمل.', 'Needs setup by the platform admin before it can work.');
  else if (c.status === 'configured') note = L('الإعدادات موجودة، لكن المزامنة غير مفعّلة في هذا الإصدار؛ لا تنتقل أي بيانات.', 'Settings are present, but sync is not active in this release; no data moves.');
  if (data.is_admin) action = h('a.btn.sm.tertiary', { href: '#/sys/integrations/connectors' }, icon('settings'), L('الإعداد في «الموصلات»', 'Set up in Connectors'));
  else if (req) {
    const w = h('button.btn.sm.ghost', { type: 'button', onclick: async () => {
      const ok = await confirmDialog(L('سحب الطلب؟', 'Withdraw request?'), L('سيُغلق طلب التفعيل ولن يُتابعه مدير المنصة.', 'The activation request will be closed and not followed up.'), { confirmLabel: L('سحب الطلب', 'Withdraw') });
      if (!ok) return;
      const r = await act(w, () => call(`/requests/${req.id}/withdraw`, { method: 'POST', body: {} }), { success: L('سُحب الطلب', 'Request withdrawn') });
      if (r) await env.refresh();
    } }, L('سحب', 'Withdraw'));
    action = h('div.ic-req-state', h('span.chip.warn', icon('hourglass'), L(`طلبك قيد المراجعة · ${ago(req.created_at)}`, `Requested · ${ago(req.created_at)}`)), req.is_demo ? h('span.chip.demo.tiny', L('تجريبي', 'Demo')) : null, w);
  } else if (c.eligible && c.status !== 'connected') {
    const b = h('button.btn.sm', { type: 'button', onclick: () => requestDialog(c, env) }, icon('send'), L('اطلب التفعيل', 'Request activation'));
    action = b;
  } else if (!c.eligible) {
    action = h('span.tiny.faint', L(`مخصص لـ${c.who_ar}`, `For ${c.who_en}`));
  }
  const missing = c.env.filter((e) => !e.present);
  return h(`article.card.ic-conn${focused ? '.focused' : ''}`, { 'data-connector': c.key, 'data-status': c.status, 'aria-labelledby': `ic-c-${c.key}` },
    h('header.ic-conn-head',
      h('span.ic-conn-icon', { 'aria-hidden': 'true' }, icon(c.icon)),
      h('div.grow', h(`h3#ic-c-${c.key}.ic-conn-name`, L(c.name_ar, c.name_en)), h('span.ic-conn-vendor', h('bdi', c.vendor))),
      statusChip(c.status)),
    h('p.ic-conn-desc', L(c.desc_ar, c.desc_en)),
    h('div.ic-conn-meta', c.team ? h('span.chip.tiny.purple', icon('star'), L('لفريقك', 'For your team')) : null, directionChip(c.direction), h('span.chip.tiny.outline', icon('people'), L(c.who_ar, c.who_en))),
    h('div.ic-conn-domains', h('span.ic-mini-label', L('البيانات التي يلمسها', 'Data it would touch')), h('div.ic-chip-row', c.domains.map((d) => domainChip(d)))),
    h('ul.ic-flows', L(c.flows_ar, c.flows_en).map((x) => h('li', x))),
    missing.length || c.env.length ? h('details.ic-tech', h('summary', icon('chevron', 'flip-rtl ic-tech-chev'), L('المتطلبات التقنية', 'Technical requirements')),
      h('ul.ic-env', c.env.map((e) => h('li', h('code', { dir: 'ltr' }, e.name), e.present ? h('span.chip.tiny.good', icon('check'), L('موجود', 'Set')) : h('span.chip.tiny.warn', icon('minus'), L('ناقص', 'Missing'))))),
      h('p.tiny.faint', L('تُضبط كمتغيرات بيئة على الخادم؛ لا تُعرض قيمها هنا أبداً.', 'Set as server environment variables; their values are never shown here.'))) : null,
    h('footer.ic-conn-foot', note ? h('p.ic-conn-note', note) : null, action));
}
async function requestDialog(c, env) {
  const ta = h('textarea.field', { rows: 3, maxlength: 500, placeholder: L('مثال: نحتاجه لمزامنة الهيكل التنظيمي قبل دورة التقييم.', 'e.g. We need it to sync the org structure before the appraisal cycle.'), id: 'ic-req-note' });
  const ok = await modal(L(`طلب تفعيل: ${c.name_ar}`, `Request activation: ${c.name_en}`),
    h('div.ic-req-dialog', h('p.muted', L('سيصل طلبك إلى مدير المنصة لإعداد الموصل. لن تنتقل أي بيانات قبل اكتمال الإعداد واعتماد النطاقات.', 'Your request goes to the platform admin to set up the connector. No data moves before setup is complete and scopes are approved.')),
      h('label.lbl', { for: 'ic-req-note' }, L('لماذا تحتاجه؟ (اختياري)', 'Why do you need it? (optional)')), ta),
    [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('إرسال الطلب', 'Send request'), value: true, primary: true }]);
  if (!ok) return;
  try { await call(`/connectors/${c.key}/request`, { method: 'POST', body: { note: ta.value.trim() || undefined } }); toast(L('أُرسل طلبك إلى مدير المنصة', 'Your request was sent to the platform admin')); await env.refresh(); }
  catch (e) { toast(e.message, { kind: 'error' }); }
}
