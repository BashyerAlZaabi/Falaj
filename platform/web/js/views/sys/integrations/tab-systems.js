// «أنظمتي» — every system I can open, shown/hidden in the sidebar, with its
// classification and what Ask AI may read; systems I cannot open are listed
// with who grants access (never their data). The filter lives in the hash:
// #/sys/integrations/systems/<all|shown|hidden>.
import { h, icon, L, toast, statRow, statTile, emptyState, fmtNum, go } from '../../../sys-kit.js';
import { segmented } from '../../../ui.js';
import { CATEGORY, CATEGORY_ORDER } from '../../../systems.js';
import { call, classificationChip, setPrefs, sectionHead, aiState } from './common.js';

const FILTERS = ['all', 'shown', 'hidden'];

export async function render(root, ctx, env) {
  const data = await call('/systems');
  const acc = [...data.accessible].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  const pinned = acc.filter((s) => s.pinned).length;
  const aiOn = acc.filter((s) => s.domains.some((d) => d.ai_active)).length;
  const filter = FILTERS.includes(env.sub[0]) ? env.sub[0] : 'all';

  root.append(statRow([
    statTile({ label: L('أنظمة متاحة لك', 'Systems available to you'), value: acc.length, icon: 'grid', hint: L('حسب دورك وصلاحياتك', 'By your role and permissions') }),
    statTile({ label: L('في قائمتك الجانبية', 'In your sidebar'), value: pinned, icon: 'pin', hint: L('الإخفاء لا يلغي صلاحيتك', 'Hiding never removes access') }),
    statTile({ label: L('يقرأ منها المساعد', 'Ask AI can read'), value: aiOn, icon: 'spark', tone: 'emph', href: '#/sys/integrations/ai', hint: L('راجع التفاصيل وغيّرها', 'Review and change') }),
    data.unavailable.length ? statTile({ label: L('غير متاحة لدورك', 'Not available to your role'), value: data.unavailable.length, icon: 'lock', tone: 'sand', hint: L('تُمنح من مدير المنصة', 'Granted by the platform admin') }) : null,
  ]));

  const list = acc.filter((s) => filter === 'all' || (filter === 'shown' ? s.pinned : !s.pinned));
  const seg = segmented([['all', L('الكل', 'All'), fmtNum(acc.length)], ['shown', L('في القائمة', 'In sidebar'), fmtNum(pinned)], ['hidden', L('مخفية', 'Hidden'), fmtNum(acc.length - pinned)]], filter,
    (v) => go(ctx, 'systems', v === 'all' ? null : v), { label: L('تصفية الأنظمة', 'Filter systems') });
  root.append(h('section.ic-systems', { 'aria-labelledby': 'ic-sys-t' },
    sectionHead(h('span#ic-sys-t', L('اختر ما يظهر في قائمتك الجانبية', 'Choose what appears in your sidebar')), {
      sub: L('الأنظمة المخفية تبقى متاحة لك من «تطبيقاتي» أو البحث السريع (Ctrl+K).', 'Hidden systems stay available from My Apps or quick search (Ctrl+K).'),
      actions: [seg],
    }),
    list.length ? h('div.ic-sys-grid', list.map((s) => systemCard(s, env))) : emptyState({ compact: true, icon: 'grid', title: filter === 'hidden' ? L('لا أنظمة مخفية', 'No hidden systems') : L('لا أنظمة في قائمتك', 'Nothing in your sidebar'), body: L('بدّل المفتاح في أي بطاقة لإظهارها أو إخفائها.', 'Flip the switch on any card to show or hide it.'), actions: [{ label: L('عرض الكل', 'Show all'), onClick: () => go(ctx, 'systems') }] })));

  if (data.unavailable.length) {
    const admins = data.admins.map((a) => L(a.name_ar, a.name_en)).join(L('، ', ', '));
    root.append(h('section.ic-unavailable', { 'aria-labelledby': 'ic-cat-locked' },
      sectionHead(h('span#ic-cat-locked', L('غير متاحة لدورك', 'Not available to your role')), { count: data.unavailable.length, sub: L('لا تُعرض أي بيانات من هذه الأنظمة. إن احتجت الوصول لعملك فاطلبه من مديرك ثم من مدير المنصة.', 'No data from these systems is shown. If your work needs access, ask your manager, then the platform admin.') }),
      h('div.ic-sys-grid', data.unavailable.map((s) => h('article.ic-sys-card.locked', { 'aria-label': L(s.name_ar, s.name_en) },
        h('div.ic-sys-head', h('span.ic-sys-icon.muted', { 'aria-hidden': 'true' }, icon(s.icon)),
          h('div.grow', h('span.ic-sys-cat', L(...(CATEGORY[s.category] || [s.category, s.category]))), h('h4.ic-sys-name', L(s.name_ar, s.name_en)), h('div.ic-sys-chips', h('span.chip.tiny.outline', icon('lock'), L('غير متاح لدورك', 'Not available to your role'))))),
        h('p.ic-sys-desc', L(s.description_ar, s.description_en)),
        h('dl.ic-grant',
          h('dt', L('لمن يُتاح', 'Who gets it')), h('dd', L(s.who_ar, s.who_en)),
          h('dt', L('من يمنح الوصول', 'Who grants access')), h('dd', admins ? L(`مدير المنصة: ${admins}`, `Platform admin: ${admins}`) : L('مدير المنصة', 'The platform admin'))))))));
  }
  if (!acc.length) root.append(emptyState({ icon: 'grid', title: L('لا أنظمة متاحة لحسابك بعد', 'No systems available to your account yet'), body: L('تواصل مع مدير المنصة لمنحك الصلاحيات المناسبة.', 'Contact the platform admin for the right permissions.') }));
}

function aiSummary(s) {
  const states = s.domains.map(aiState);
  const on = states.filter((x) => x === 'on').length;
  const optin = states.filter((x) => x === 'optin').length;
  const link = (tone, ic, text, tip) => h(`a.chip.tiny.${tone}.ic-ai-link`, { href: '#/sys/integrations/ai', 'data-tip': tip || null }, icon(ic), text);
  if (!s.domains.length) return h('span.chip.tiny.outline', icon('shield'), L('لا بيانات للمساعد', 'No AI data'));
  if (on === s.domains.length) return link('info', 'spark', L('يقرؤه المساعد', 'Ask AI can read'));
  if (on) return link('info', 'spark', L(`يقرأ ${fmtNum(on)} من ${fmtNum(s.domains.length)}`, `Reads ${on} of ${s.domains.length}`), L('بقية النطاقات بموافقتك أو مقفلة', 'The rest are opt-in or locked'));
  if (optin) return link('outline', 'shield', L('بموافقتك — غير مفعّل', 'Opt-in — off'), L('لا يقرؤه المساعد إلا إذا سمحت بذلك', 'Ask AI reads it only if you allow it'));
  return link('purple', 'lockKeyhole', L('مقفل عن المساعد', 'Locked from Ask AI'));
}

function systemCard(s, env) {
  const id = `ic-pin-${s.key}`;
  const sw = h('input.switch', { type: 'checkbox', id, checked: s.pinned || null, onchange: async (e) => {
    const want = e.target.checked; e.target.disabled = true;
    try {
      await setPrefs(s.key, { pinned: want });
      toast(want ? L(`أُضيف «${s.name_ar}» إلى قائمتك الجانبية`, `“${s.name_en}” added to your sidebar`) : L(`أُخفي «${s.name_ar}» من القائمة — يبقى متاحاً من «تطبيقاتي»`, `“${s.name_en}” hidden from the sidebar — still in My Apps`));
      await env.refresh(); // counts and the filter stay in step
      document.getElementById(id)?.focus({ preventScroll: true });
    } catch (err) { e.target.checked = !want; e.target.disabled = false; toast(err.message, { kind: 'error' }); }
  } });
  const card = h(`article.ic-sys-card${s.pinned ? '.pinned' : ''}`, { 'data-system': s.key },
    h('div.ic-sys-head',
      h('span.ic-sys-icon', { 'aria-hidden': 'true' }, icon(s.icon)),
      h('div.grow',
        h('span.ic-sys-cat', L(...(CATEGORY[s.category] || [s.category, s.category]))),
        h('h4.ic-sys-name', h('a', { href: s.route }, L(s.name_ar, s.name_en))),
        h('div.ic-sys-chips', classificationChip(s.classification), s.external ? h('span.chip.tiny.outline', { 'data-tip': L('يضم بوابة لجهات خارجية ترى سجلاتها فقط', 'Has a portal where external parties see only their own records') }, icon('globe'), L('بوابة خارجية', 'External portal')) : null))),
    h('p.ic-sys-desc', L(s.description_ar, s.description_en)),
    h('div.ic-sys-foot',
      aiSummary(s),
      h('label.ic-pin', { for: id }, h('span', L('إظهار في القائمة الجانبية', 'Show in sidebar')), sw)));
  return card;
}
