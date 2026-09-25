// «الذكاء الاصطناعي والبيانات» — the data-boundaries hero map plus, per system
// and data domain, what Ask AI can and cannot read, the user's opt-in switches,
// and the quarterly privacy check-up.
import { h, icon, L, fmtNum, toast, confirmDialog, state, act } from '../../../sys-kit.js';
import { call, classificationChip, aiState, aiStateChip, toolsText, setPrefs, sectionHead, nOf, stamp, CLASS_LABEL } from './common.js';

const LANES = ['internal', 'confidential', 'restricted'];
const STATE_ICON = { on: 'spark', optin: 'circleDashed', locked: 'lockKeyhole', off: 'shieldBan' };

export async function render(root, ctx, env) {
  const data = await env.get('/ai');
  root.append(hero(data, ctx));
  const optional = data.systems.filter((s) => s.optional);
  const fixed = data.systems.filter((s) => !s.optional);
  root.append(h('div.ic-ai-grid',
    h('div.ic-ai-main',
      optional.length ? h('section.card.ic-ai-card', { 'aria-labelledby': 'ic-ai-opt' },
        sectionHead(h('span#ic-ai-opt', L('تحتاج قرارك', 'Your decision')), { sub: L('بيانات سرية لا يقرؤها المساعد إلا إذا سمحت بذلك لكل نظام. يعمل المساعد دائماً ضمن صلاحياتك فقط.', 'Confidential data Ask AI reads only if you allow it per system. The assistant always works within your own permissions.'), count: optional.length }),
        h('div.ic-ai-systems', optional.map((s) => systemRow(s, env)))) : null,
      h('section.card.ic-ai-card', { 'aria-labelledby': 'ic-ai-fixed' },
        sectionHead(h('span#ic-ai-fixed', L('تحددها سياسة الجهة', 'Set by the entity’s policy')), { sub: L('نطاقات متاحة للمساعد لكل المصرّح لهم، أو مقفلة لا تُفتح لأحد.', 'Domains open to Ask AI for everyone authorised, or locked for everyone.'), count: fixed.length }),
        h('div.ic-ai-systems', fixed.map((s) => systemRow(s, env))))),
    h('aside.ic-ai-side', reviewCard(data.review, env), whereCard(), whoSeesCard())));
}

// ------------------------------------------------------------------ hero map
function hero(data, ctx) {
  const c = data.counts;
  const core = { key: 'core.work', system_ar: 'منصة العمل', system_en: 'Work platform', name_ar: 'مشاريعي ومهامي ومستنداتي ومواعيدي', name_en: 'My projects, tasks, documents & appointments', icon: 'folder', classification: 'internal', ai_policy: 'allowed', accessible: true, ai_active: true, core: true };
  const lanes = LANES.map((cls) => ({ cls, items: [...(cls === 'internal' ? [core] : []), ...data.map.filter((d) => d.classification === cls)] }));

  const orb = h('div.ic-core', { role: 'img', 'aria-label': L('المساعد الذكي وعملاء MCP', 'Ask AI and MCP clients') },
    h('span.ic-orb', { 'aria-hidden': 'true' }, h('span.ic-orb-ring'), icon('spark')),
    h('div.ic-core-text', h('strong', L('المساعد الذكي و MCP', 'Ask AI & MCP')),
      h('span', state.me?.assistant?.mode === 'model' ? L(`نموذج متصل: ${state.me.assistant.provider}`, `Model: ${state.me.assistant.provider}`) : L('يعمل بالفهم المحلي — لا نموذج خارجي', 'Local rules — no external model'))));

  const laneEls = lanes.map((l) => {
    const mine = l.items.filter((d) => d.accessible && !d.core);
    const on = mine.filter((d) => d.ai_active).length;
    const status = l.cls === 'internal' ? L(`يقرأ ${fmtNum(on)} من ${fmtNum(mine.length)}`, `Reads ${on} of ${mine.length}`)
      : l.cls === 'confidential' ? L(`بموافقتك · ${fmtNum(on)} مفعّل`, `Opt-in · ${on} on`)
        : L('مقفل عن المساعد', 'Locked from Ask AI');
    const head = h('header.ic-lane-head', h('span.ic-lane-title', icon(l.cls === 'internal' ? 'building' : l.cls === 'confidential' ? 'lock' : 'lockKeyhole'), L(...CLASS_LABEL[l.cls])), h('span.ic-lane-status', status));
    return { cls: l.cls, head, el: h(`section.ic-lane.${l.cls}`, { 'aria-label': L(`نطاقات ${CLASS_LABEL[l.cls][0]}`, `${CLASS_LABEL[l.cls][1]} domains`) }, head,
      h('ul.ic-dlist', l.items.map((d) => domainNode(d)))), on };
  });

  const zoneHead = (ic, title, sub) => h('header.ic-zone-head', h('span.ic-zone-ic', { 'aria-hidden': 'true' }, icon(ic)), h('div', h('strong', title), h('span', sub)));
  const node = (cls, ic, title, sub) => h(`div.ic-node.${cls}`, h('span.ic-node-ic', { 'aria-hidden': 'true' }, icon(ic)), h('div.ic-node-text', h('strong', title), sub ? h('span', sub) : null));
  const barrier = (text) => h('p.ic-barrier', h('span.ic-barrier-ic', { 'aria-hidden': 'true' }, icon('ban')), h('span', text));

  // external parties → their portals only
  const pVendors = node('party', 'handshake', L('مقدمو الخدمات', 'Service providers'), L('حساب منفصل لكل مورد', 'One account per supplier'));
  const qVendors = node('portal', 'store', L('بوابة مقدمي الخدمات', 'Supplier portal'), L('عروضه وعقوده وطلباته فقط', 'Only its own bids, contracts, requests'));
  const pAuditor = node('party', 'searchCheck', L('المدقق الخارجي', 'External auditor'), L('جهة تدقيق معتمدة', 'Approved audit firm'));
  const qAuditor = node('portal', 'fileSearch', L('بوابة طلبات التدقيق', 'Audit requests portal'), L('الطلبات الموجّهة له فقط', 'Only requests addressed to it'));
  const ext = h('section.ic-zone.ext', { 'aria-label': L('الجهات الخارجية', 'External parties') },
    zoneHead('globe', L('الجهات الخارجية', 'External parties'), L('هويات منفصلة لكل جهة', 'Separate identity per organisation')),
    h('div.ic-flow', pVendors, qVendors), h('div.ic-flow', pAuditor, qAuditor),
    barrier(L('لا مساعد ذكي ولا MCP ولا Vault ولا بيانات الإدارات', 'No Ask AI, MCP, Vault or departmental data')));

  // Vault: isolated, inbound-only
  const fs = node('store', 'landmark', 'FS', L('النظام المالي', 'Finance system'));
  const marsad = node('store', 'radar', L('مرصاد', 'Marsad'), L('منصة الرصد', 'Monitoring'));
  const wajib = node('source', 'building', L('واجب', 'Wajib'), L('نظام حكومي مصدر', 'Government source system'));
  const su = node('source', 'fileUp', 'Smart Uploader', L('ملفات الموظفين', 'Staff uploads'));
  const vault = h('section.ic-zone.vault', { 'aria-label': L('Vault — بيئة معزولة', 'Vault — isolated environment') },
    zoneHead('lockKeyhole', L('Vault — بيئة معزولة', 'Vault — isolated'), L('قاعدة وأصل وذكاء داخلي منفصل', 'Own database, origin and in-house AI')),
    h('div.ic-vault-box', h('div.ic-pair', fs, marsad)),
    h('p.ic-inbound', icon('chevronUp'), L('إلى الداخل فقط', 'Inbound only')),
    h('div.ic-pair', wajib, su),
    barrier(L('لا مسار قراءة: لا يصل إليه المساعد أو MCP أو مدير المنصة', 'No read path: not Ask AI, MCP or the platform admin')));

  const portal = h('section.ic-zone.portal', { 'aria-label': L('البوابة الموحدة — خارج Vault', 'Unified Portal — outside Vault') },
    zoneHead('layers', L('البوابة الموحدة — خارج Vault', 'Unified Portal — outside Vault'), L('نطاقات البيانات حسب التصنيف', 'Data domains by classification')),
    orb, h('div.ic-lanes', laneEls.map((l) => l.el)));

  const svg = wiresSvg();
  const map = h('div.ic-map', ext, portal, vault, svg);
  const confOn = laneEls[1].on > 0;
  map._wires = [
    [orb, laneEls[0].head, 'flow', 'lane'], [orb, laneEls[1].head, `optin${confOn ? '.live' : ''}`, 'lane'], [orb, laneEls[2].head, 'blocked', 'lane'],
    [pVendors, qVendors, 'ext'], [pAuditor, qAuditor, 'ext'],
    [wajib, fs, 'inbound'], [wajib, marsad, 'inbound'], [su, marsad, 'inbound'],
  ];
  mountWires(map);

  const pill = (value, label, cls) => h(`div.ic-metric.${cls}`, h('strong.num.tabular', fmtNum(value)), h('span', label));
  const legend = h('ul.ic-legend', { 'aria-label': L('مفتاح الخريطة', 'Map legend') },
    h('li.flow', h('i', { 'aria-hidden': 'true' }), L('يقرؤه المساعد', 'Ask AI reads')),
    h('li.optin', h('i', { 'aria-hidden': 'true' }), L('بموافقتك', 'Your opt-in')),
    h('li.blocked', h('i', { 'aria-hidden': 'true' }), L('مقفل', 'Locked')),
    h('li.inbound', h('i', { 'aria-hidden': 'true' }), L('إلى الداخل فقط', 'Inbound only')));
  return h(`section.ic-hero${ctx.soft ? '' : '.enter-anim'}`, { 'aria-labelledby': 'ic-hero-title' },
    h('div.ic-hero-head',
      h('div.ic-hero-titles', h('span.ic-hero-eyebrow', icon('shield'), L('حدود البيانات', 'Data boundaries')),
        h('h2#ic-hero-title', L('أين تذهب بياناتك — وأين لا تذهب أبداً', 'Where your data goes — and where it never goes')),
        h('p', L('كل خط هنا قاعدة تُطبَّق في الخادم: ما يقرؤه المساعد، وما تفعّله أنت، وما يبقى مقفلاً للجميع.', 'Every line here is a rule enforced on the server: what Ask AI reads, what you switch on, and what stays locked for everyone.'))),
      h('div.ic-hero-side',
        h('div.ic-metrics', pill(c.readable, L(`من ${nOf(c.domains, 'domain')} يقرؤها المساعد`, `of ${c.domains} domains readable`), 'on'),
          pill(c.opt_in_on, L('مفعّلة بموافقتك', 'opted in by you'), 'optin'), pill(c.locked, L('مقفلة دائماً', 'always locked'), 'locked')),
        data.review.done_at ? null : h('button.btn.ic-hero-cta', { type: 'button', onclick: () => {
          const card = document.querySelector('.ic-review'); card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          setTimeout(() => card?.querySelector('.btn.primary')?.focus({ preventScroll: true }), 400);
        } }, icon('badgeCheck'), L('ابدأ مراجعة الربع — دقيقة واحدة', 'Start this quarter’s check-up — one minute')))),
    map, legend);
}

function domainNode(d) {
  const st = d.accessible ? aiState(d) : 'na';
  const tip = !d.accessible ? L('نظام غير متاح لدورك', 'System not available to your role')
    : st === 'on' ? L('يقرؤه المساعد ضمن صلاحياتك', 'Ask AI reads it within your permissions')
      : st === 'optin' ? L('لا يقرؤه المساعد إلا بموافقتك', 'Ask AI reads it only with your opt-in')
        : L('لا يقرؤه المساعد أبداً', 'Ask AI never reads it');
  return h(`li.ic-dnode.${st}${d.core ? '.core' : ''}`, { title: tip },
    h('span.ic-dn-ic', { 'aria-hidden': 'true' }, icon(d.icon || 'database')),
    h('span.ic-dn-text', h('span.ic-dn-sys', L(d.system_ar, d.system_en)), h('span.ic-dn-name', L(d.name_ar, d.name_en))),
    h('span.ic-dn-state', { 'aria-label': tip }, icon(st === 'na' ? 'minus' : STATE_ICON[st])));
}

// ------------------------------------------------------------------ connectors (SVG overlay)
let wireSeq = 0;
function wiresSvg() {
  const NS = 'http://www.w3.org/2000/svg';
  const id = `icw${++wireSeq}${Math.random().toString(36).slice(2, 6)}`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ic-wires'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.dataset.id = id;
  const defs = document.createElementNS(NS, 'defs');
  for (const kind of ['flow', 'optin', 'ext', 'inbound']) {
    const m = document.createElementNS(NS, 'marker');
    for (const [k, v] of Object.entries({ id: `${id}-${kind}`, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' })) m.setAttribute(k, v);
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M1,1 L9,5 L1,9 z'); p.setAttribute('class', `ic-ah ${kind}`);
    m.append(p); defs.append(m);
  }
  svg.append(defs, document.createElementNS(NS, 'g'));
  return svg;
}
function mountWires(map) {
  const svg = map.querySelector('svg.ic-wires');
  const NS = 'http://www.w3.org/2000/svg';
  const draw = () => {
    if (!map.isConnected) return;
    const box = map.getBoundingClientRect();
    if (!box.width) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
    const g = svg.querySelector('g'); g.replaceChildren();
    // When the lanes stack (narrow screens) only the first lane is wired: lines
    // must never run across the domain cards below it.
    const heads = map._wires.filter((w) => w[3] === 'lane').map((w) => w[1]);
    const tops = heads.map((el) => el.getBoundingClientRect().top);
    const stacked = Math.max(...tops) - Math.min(...tops) > 8;
    for (const [from, to, cls, group] of map._wires) {
      if (group === 'lane' && stacked && to !== heads[0]) continue;
      const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect();
      if (!a.width || !b.width) continue;
      const kind = cls.split('.')[0];
      const down = b.top + b.height / 2 > a.top + a.height / 2;
      const x1 = a.left + a.width / 2 - box.left; const x2 = b.left + b.width / 2 - box.left;
      const y1 = (down ? a.bottom : a.top) - box.top; const y2 = (down ? b.top : b.bottom) - box.top;
      const gap = kind === 'blocked' ? 0 : 3;
      const ya = y1 + (down ? 2 : -2); const yb = y2 + (down ? -gap : gap);
      const my = (ya + yb) / 2;
      const d = `M${x1.toFixed(1)},${ya.toFixed(1)} C${x1.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${yb.toFixed(1)}`;
      const base = document.createElementNS(NS, 'path');
      base.setAttribute('d', d); base.setAttribute('class', `ic-wire ${cls.replace('.', ' ')}`);
      if (kind !== 'blocked') base.setAttribute('marker-end', `url(#${svg.dataset.id}-${kind})`);
      g.append(base);
      if (kind === 'flow' || kind === 'inbound' || cls.includes('live')) {
        const pulse = document.createElementNS(NS, 'path');
        pulse.setAttribute('d', d); pulse.setAttribute('class', `ic-pulse ${kind}`);
        g.append(pulse);
      }
      if (kind === 'blocked') {
        // a stop mark where the connection is cut
        const cx = (x1 + x2) / 2; const cy = my;
        const stop = document.createElementNS(NS, 'g'); stop.setAttribute('class', 'ic-stop');
        const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', '9');
        const l1 = document.createElementNS(NS, 'path'); l1.setAttribute('d', `M${cx - 3.5},${cy - 3.5} L${cx + 3.5},${cy + 3.5} M${cx + 3.5},${cy - 3.5} L${cx - 3.5},${cy + 3.5}`);
        stop.append(c, l1); g.append(stop);
      }
    }
  };
  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
  const ro = new ResizeObserver(() => { if (!map.isConnected && map._drawn) { ro.disconnect(); return; } map._drawn = true; schedule(); });
  ro.observe(map);
  document.fonts?.ready?.then(schedule);
}

// ------------------------------------------------------------------ per-system list
function systemRow(s, env) {
  const optin = s.domains.filter((d) => d.ai_policy === 'opt_in');
  let control = null;
  if (s.optional) {
    const id = `ic-ai-${s.key}`;
    const sw = h('input.switch', { type: 'checkbox', id, checked: s.ai_enabled || null, onchange: async (e) => {
      const want = e.target.checked;
      if (want) {
        const names = optin.map((d) => `«${L(d.name_ar, d.name_en)}»`).join(L(' و', ', '));
        const ok = await confirmDialog(L(`السماح للمساعد بقراءة ${s.name_ar}؟`, `Allow Ask AI to read ${s.name_en}?`),
          L(`سيتمكن المساعد الذكي وعملاء MCP المرتبطون بحسابك من قراءة ${names} ضمن صلاحياتك فقط، ولن يرى ما لا تراه أنت. يُسجَّل هذا التغيير ويمكنك إيقافه في أي وقت.`,
            `Ask AI and MCP clients linked to your account will be able to read ${names} within your own permissions only — never anything you cannot see. The change is logged and you can switch it off at any time.`),
          { confirmLabel: L('السماح', 'Allow') });
        if (!ok) { e.target.checked = false; return; }
      }
      e.target.disabled = true;
      try {
        await setPrefs(s.key, { ai_enabled: want });
        toast(want ? L(`يستطيع المساعد الآن قراءة ${s.name_ar} ضمن صلاحياتك`, `Ask AI can now read ${s.name_en} within your permissions`) : L(`أُوقف وصول المساعد إلى ${s.name_ar}`, `Ask AI access to ${s.name_en} switched off`));
        await env.refresh();
      } catch (err) { e.target.checked = !want; e.target.disabled = false; toast(err.message, { kind: 'error' }); }
    } });
    control = h('label.ic-ai-toggle', { for: id }, h('span', L('السماح للمساعد', 'Allow Ask AI')), sw);
  }
  return h(`article.ic-ai-sys${s.optional ? '.optional' : ''}`, { 'data-system': s.key },
    h('header.ic-ai-sys-head',
      h('span.ic-sys-icon.sm', { 'aria-hidden': 'true' }, icon(s.icon)),
      h('div.grow', h('h3.ic-ai-sys-name', h('a', { href: `#/sys/${s.key}` }, L(s.name_ar, s.name_en))), h('div.ic-sys-chips', classificationChip(s.classification))),
      control),
    h('ul.ic-ai-domains', s.domains.map((d) => {
      const st = aiState(d);
      return h(`li.${st}`,
        h('span.ic-ai-dot', { 'aria-hidden': 'true' }, icon(STATE_ICON[st])),
        h('div.grow', h('div.ic-ai-dname', L(d.name_ar, d.name_en), classificationChip(d.classification)),
          h('div.ic-ai-dmeta', st === 'locked' || st === 'off' ? L(d.note_ar || 'لا يقرؤه المساعد ولا عملاء MCP مطلقاً.', d.note_en || 'Never read by Ask AI or MCP clients.') : st === 'optin' ? L('لا يقرؤه المساعد إلا إذا سمحت بذلك.', 'Ask AI reads it only if you allow it.') : toolsText(d.tools))),
        aiStateChip(d));
    })));
}

// ------------------------------------------------------------------ side cards
function reviewCard(review, env) {
  const q = Number(String(review.period).slice(-1));
  const qAr = ['الأول', 'الثاني', 'الثالث', 'الرابع'][q - 1];
  if (review.done_at) {
    return h('section.card.ic-review.done', { 'aria-labelledby': 'ic-rev-t' },
      h('span.ic-review-badge', { 'aria-hidden': 'true' }, icon('badgeCheck')),
      h('span.eyebrow', L(`مراجعة الربع ${qAr}`, `Q${q} check-up`), review.demo ? h('span.chip.demo.tiny', L('تجريبي', 'Demo')) : null),
      h('h3#ic-rev-t', L('راجعت ضوابط بياناتك لهذا الربع', 'You reviewed your data controls this quarter')),
      h('p.muted', L(`في ${stamp(review.done_at)}. نذكّرك بالمراجعة القادمة مع بداية الربع التالي.`, `On ${stamp(review.done_at)}. We’ll remind you at the start of next quarter.`)),
      h('a.btn.sm.ghost', { href: '#/sys/integrations/activity' }, icon('history'), L('سجل نشاطي', 'My activity')));
  }
  const btn = h('button.btn.primary.block', { type: 'button', onclick: async () => {
    const r = await act(btn, () => call('/ai/review', { method: 'POST', body: {} }), { success: L('سُجّلت مراجعتك — شكراً لحرصك على بياناتك (+10 نقاط تميّز)', 'Check-up recorded — thank you (+10 excellence points)') });
    if (r) await env.refresh();
  } }, icon('circleCheck'), L('أكّدت مراجعة ضوابطي', 'I’ve reviewed my controls'));
  return h('section.card.ic-review', { 'aria-labelledby': 'ic-rev-t' },
    h('span.eyebrow', L(`مراجعة الربع ${qAr}`, `Q${q} check-up`)),
    h('h3#ic-rev-t', L('خذ دقيقة لمراجعة ما يقرؤه المساعد', 'Take a minute to review what Ask AI reads')),
    h('ol.ic-steps',
      h('li', L('تأكد من الأنظمة التي سمحت للمساعد بقراءتها.', 'Check the systems you allowed Ask AI to read.')),
      h('li', L('أوقف ما لم تعد تحتاجه.', 'Switch off what you no longer need.')),
      h('li', L('أكّد المراجعة لتُسجَّل في سجل نشاطك.', 'Confirm the check-up so it is logged.'))),
    btn,
    h('p.ic-points', icon('sparkle'), L('+10 نقاط تميّز مرة كل ربع — تقديراً لحماية البيانات', '+10 excellence points once a quarter — for protecting data')),
    review.last_at ? h('p.tiny.faint', L(`آخر مراجعة: ${stamp(review.last_at)}`, `Last check-up: ${stamp(review.last_at)}`)) : null);
}
function whereCard() {
  const a = state.me?.assistant || {};
  const local = a.mode !== 'model';
  return h('section.card.ic-where', { 'aria-labelledby': 'ic-where-t' },
    h('div.ic-where-head', h('span.ic-glyph', { 'aria-hidden': 'true' }, icon(local ? 'shield' : 'network')), h('h3#ic-where-t', L('أين تُعالج طلباتك؟', 'Where are your requests processed?'))),
    h('p', local
      ? L('يعمل المساعد حالياً بالفهم المحلي داخل المنصة؛ لا تُرسل بياناتك إلى أي نموذج خارجي.', 'Ask AI currently runs on local rules inside the platform; none of your data is sent to an external model.')
      : L(`يعمل المساعد عبر «${a.provider}». لا يُرسل إليه إلا ما تسمح به السياسات أعلاه، ولا يُرسل أي نطاق مقفل.`, `Ask AI runs through “${a.provider}”. Only what the policies above allow is sent, and never a locked domain.`)),
    h('p.tiny.faint', L('بيانات Vault (FS ومرصاد) تُعالج داخل Vault فقط.', 'Vault data (FS and Marsad) is processed inside Vault only.')));
}
function whoSeesCard() {
  const row = (cls, text) => h('li', classificationChip(cls), h('span', text));
  return h('section.card.ic-who', { 'aria-labelledby': 'ic-who-t' },
    h('h3#ic-who-t', L('من يرى ماذا؟', 'Who sees what?')),
    h('ul.ic-who-list',
      row('internal', L('زملاؤك المعنيون حسب النظام ونطاق إدارتهم.', 'Relevant colleagues, by system and department scope.')),
      row('confidential', L('أنت ومديرك المباشر والجهة المختصة.', 'You, your line manager and the specialist unit.')),
      row('restricted', L('أنت والجهة المختصة فقط، ويُسجَّل كل اطلاع.', 'You and the specialist unit only; every view is logged.'))),
    h('p.tiny.faint', L('مدير المنصة يضبط الإعدادات فقط ولا يرى بيانات الأنظمة.', 'The platform admin configures settings only and never sees system data.')));
}
