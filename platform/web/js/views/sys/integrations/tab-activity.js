// «سجل النشاط» — my own integration / AI-access changes (audit rows where the
// actor is me) and every use of my calendar link. Nobody else's rows appear.
import { h, icon, L, fmtNum, emptyState } from '../../../sys-kit.js';
import { segmented } from '../../../ui.js';
import { call, stamp, ago, sectionHead } from './common.js';

const POLICY = { allowed: ['متاح', 'allowed'], opt_in: ['بموافقة المستخدم', 'opt-in'], off: ['موقوف', 'off'] };
const Q = (p) => { const q = Number(String(p || '').slice(-1)); return L(`الربع ${['الأول', 'الثاني', 'الثالث', 'الرابع'][q - 1] || ''}`, `Q${q}`); };
const name = (t) => (t ? L(t.ar, t.en) : '—');

// action → [group, icon, tone, text]
function describe(e) {
  const d = e.detail || {};
  switch (e.action) {
    case 'system.ai_access': return ['ai', d.enabled ? 'spark' : 'shield', d.enabled ? 'emph' : '', d.enabled ? L(`سمحت للمساعد بقراءة «${name(e.target)}»`, `Allowed Ask AI to read “${name(e.target)}”`) : L(`أوقفت وصول المساعد إلى «${name(e.target)}»`, `Switched off Ask AI access to “${name(e.target)}”`)];
    case 'integrations.privacy_review': return ['ai', 'badgeCheck', 'good', L(`راجعت ضوابط بياناتك (${Q(e.target)})`, `Reviewed your data controls (${Q(e.target)})`)];
    case 'integrations.feed.create': return ['links', 'calendarPlus', 'good', L('أنشأت رابط تقويم شخصي', 'Created a personal calendar link')];
    case 'integrations.feed.rotate': return ['links', 'refresh', '', L('دوّرت رابط التقويم وأوقفت الرابط السابق', 'Rotated the calendar link and revoked the old one')];
    case 'integrations.feed.update': return ['links', 'sliders', '', L('عدّلت ما يظهر في رابط التقويم', 'Changed what the calendar link shows')];
    case 'integrations.feed.revoke': return ['links', 'unplug', 'crit', L('أوقفت رابط التقويم', 'Revoked the calendar link')];
    case 'integrations.request': return ['links', 'send', '', L(`طلبت تفعيل «${name(e.target)}»`, `Requested “${name(e.target)}”`)];
    case 'integrations.request.withdraw': return ['links', 'undo', '', L(`سحبت طلب تفعيل «${name(e.target)}»`, `Withdrew the request for “${name(e.target)}”`)];
    case 'integrations.request.close': return ['admin', d.resolution === 'done' ? 'circleCheck' : 'circleX', '', L(`أغلقت طلب تفعيل «${name(e.target)}» (${d.resolution === 'done' ? 'نُفّذ' : 'تعذّر'})`, `Closed a request for “${name(e.target)}” (${d.resolution})`)];
    case 'integrations.connector.update': {
      const en = d.to?.enabled !== d.from?.enabled;
      return ['admin', 'cable', '', en ? L(`${d.to?.enabled ? 'فعّلت' : 'عطّلت'} «${name(e.target)}» على مستوى الجهة`, `${d.to?.enabled ? 'Enabled' : 'Disabled'} “${name(e.target)}” entity-wide`) : L(`عدّلت نطاقات بيانات «${name(e.target)}»`, `Changed data scopes of “${name(e.target)}”`)];
    }
    case 'integrations.connector.test': return ['admin', 'activity', d.ok ? 'good' : 'crit', L(`فحصت الوصول إلى «${name(e.target)}»: ${d.ok ? 'متاح' : 'غير متاح'} (${d.message || ''})`, `Tested “${name(e.target)}”: ${d.ok ? 'reachable' : 'unreachable'} (${d.message || ''})`)];
    case 'integrations.access_review': return ['admin', 'clipboardCheck', 'good', L(`اعتمدت مراجعة الصلاحيات (${Q(e.target)})`, `Signed off the access review (${Q(e.target)})`)];
    case 'caps.grant': return ['admin', 'userPlus', '', L(`منحت صلاحية: ${name(e.target)}`, `Granted: ${name(e.target)}`)];
    case 'caps.revoke': return ['admin', 'userX', '', L(`سحبت صلاحية: ${name(e.target)}`, `Revoked: ${name(e.target)}`)];
    case 'domain.ai_policy': return ['admin', 'shield', '', L(`غيّرت سياسة «${name(e.target)}»: ${L(...(POLICY[d.from] || [d.from, d.from]))} ← ${L(...(POLICY[d.to] || [d.to, d.to]))}`, `Changed “${name(e.target)}” policy: ${d.from} → ${d.to}`)];
    default: return ['other', 'circleDot', '', e.action];
  }
}
const OUTCOME = { served: ['جُلب التقويم', 'Feed fetched', 'good', 'circleCheck'], revoked: ['محاولة برابط موقوف — رُفضت', 'Attempt with a revoked link — refused', 'warn', 'shieldX'], disabled: ['رُفض: الروابط موقوفة من المدير', 'Refused: links paused by admin', 'outline', 'ban'] };

let filter = 'all'; // survives soft refreshes of this view

export async function render(root, ctx, env) {
  const data = await env.get('/activity');
  const entries = data.entries.map((e) => ({ ...e, d: describe(e) }));
  const groups = [['all', L('الكل', 'All')], ['ai', L('المساعد والبيانات', 'AI & data')], ['links', L('التقويم والطلبات', 'Calendar & requests')], ...(env.ov.is_admin ? [['admin', L('الإدارة', 'Admin')]] : [])];
  if (!groups.some(([k]) => k === filter)) filter = 'all';
  const listSlot = h('div');
  const draw = () => {
    const rows = entries.filter((e) => filter === 'all' || e.d[0] === filter);
    listSlot.replaceChildren(rows.length ? h('ol.sys-timeline.ic-timeline', rows.map((e) => h(`li${e.d[2] ? '.' + e.d[2] : ''}`,
      h('span.tl-ic', icon(e.d[1])), h('div.grow', h('div.tl-text', e.d[3]), h('div.tl-meta', `${ago(e.at)} · ${stamp(e.at)}`)))))
      : emptyState({ compact: true, icon: 'history', title: L('لا تغييرات بعد', 'No changes yet'), body: L('تظهر هنا كل تغييراتك على وصول المساعد والروابط والطلبات.', 'Your changes to AI access, links and requests appear here.'), actions: [{ label: L('راجع ما يقرؤه المساعد', 'Review what Ask AI reads'), icon: 'spark', onClick: () => { location.hash = '#/sys/integrations/ai'; } }] }));
  };
  draw();

  const hits = data.feed_hits;
  const served = hits.filter((x) => x.outcome === 'served').length;
  const refused = hits.length - served;
  root.append(h('div.ic-act-grid',
    h('section.card.ic-act-main', { 'aria-labelledby': 'ic-act-t' },
      sectionHead(h('span#ic-act-t', L('تغييراتي', 'My changes')), { sub: L('سجل غير قابل للتعديل لما غيّرته أنت فقط.', 'A tamper-proof log of what you changed — yours only.'), count: entries.length }),
      h('div.ic-act-filter', segmented(groups, filter, (v) => { filter = v; draw(); }, { label: L('تصفية السجل', 'Filter the log') })),
      listSlot),
    h('section.card.ic-act-side', { 'aria-labelledby': 'ic-hits-t' },
      sectionHead(h('span#ic-hits-t', L('استخدامات رابط تقويمك', 'Uses of your calendar link')), { sub: L('كل مرة يجلب فيها تطبيق تقويمك من الرابط. إن رأيت تطبيقاً لا تعرفه فدوّر الرابط.', 'Every fetch by a calendar app. If you see an app you don’t recognise, rotate the link.') }),
      hits.length ? [
        h('div.ic-hit-stats', h('div', h('strong.num.tabular', fmtNum(served)), h('span', L('جلب ناجح', 'fetches'))), h('div', h('strong.num.tabular', fmtNum(refused)), h('span', L('محاولات مرفوضة', 'refused')))),
        h('ul.list.separated.ic-hits', hits.slice(0, 30).map((x) => {
          const [ar, en, tone, ic] = OUTCOME[x.outcome] || OUTCOME.served;
          return h('li', h(`span.ic-hit-ic.${tone}`, { 'aria-hidden': 'true' }, icon(ic)),
            h('div.grow', h('div.title', h('bdi', x.client || L('تطبيق غير معروف', 'Unknown app'))), h('div.meta', `${L(ar, en)} · …${x.token_hint}`)),
            h('span.tiny.faint', { title: stamp(x.at) }, ago(x.at)));
        }))]
        : emptyState({ compact: true, icon: 'calendar', title: L('لم يُستخدم رابط تقويمك بعد', 'Your calendar link hasn’t been used yet'), body: L('بعد إضافة الرابط إلى تطبيق التقويم ستظهر هنا كل عملية جلب.', 'Once you add the link to a calendar app, every fetch shows here.'), actions: [{ label: L('ربط تقويمي', 'Connect my calendar'), icon: 'calendarPlus', onClick: () => { location.hash = '#/sys/integrations/apps/ics'; } }] }))));
}
