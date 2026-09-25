// Ideas — tab painters: «بنك الأفكار» (hero, next step, trending, gallery),
// «أفكاري» (journey), «التحديات» (challenges + detail) and «اللجنة» (queue board
// and scoring matrix). Each returns a DOM node built from scoped API data.
import { h, icon, L, fmtNum, fmtDate, emptyState, errorState, filterBar, statRow, statTile, board, dataTable, whoChip } from '../../../sys-kit.js';
import { segmented } from '../../../ui.js';
import { call, S, CAT, ST, STEPS, WEIGHTS, CRIT, stepIndex, chip, catChip, demoChip, ideaCard, num, compactMoney, daysLabel, ideasLabel } from './ui.js';
import { scoreDialog, decisionDialog } from './forms.js';

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
const secHead = (title, sub, ...extra) => h('div.ideas-sec-head', h('div.grow', h('h2.ideas-sec-title', ...(Array.isArray(title) ? title : [title])), sub ? h('p.ideas-sec-sub', sub) : null), ...extra);

// ================= bank =================
export async function bank(app, ovP) {
  const f = S.bank;
  const [ov, list] = await Promise.all([ovP, call(`/ideas?${qs(f)}`)]);
  const gallery = h('div.idea-gallery', { 'aria-live': 'polite' });
  const countEl = h('span.ideas-count.tabular');
  const draw = (items) => {
    countEl.textContent = ideasLabel(items.length);
    const filtered = f.q || f.category || f.status || f.campaign;
    gallery.replaceChildren(items.length ? h('div.idea-grid', items.map((i) => ideaCard(i, { open: app.open, href: app.href })))
      : emptyState({ icon: filtered ? 'search' : 'lightbulb', title: filtered ? L('لا توجد أفكار مطابقة', 'No matching ideas') : L('بنك الأفكار بانتظار أول فكرة', 'The bank awaits its first idea'),
        body: filtered ? L('جرّب كلمات أخرى أو أزل بعض عوامل التصفية.', 'Try other words or clear some filters.') : L('كن أول من يشارك بفكرة لتحسين العمل.', 'Be the first to share an improvement.'),
        actions: filtered ? [{ label: L('مسح التصفية', 'Clear filters'), onClick: () => { Object.assign(f, { q: '', category: '', status: '', campaign: '' }); app.rerender(); } }] : [{ label: L('قدّم فكرة', 'Submit an idea'), primary: true, icon: 'plus', onClick: () => app.newIdea() }] }));
  };
  draw(list);
  const reload = async () => {
    gallery.setAttribute('aria-busy', 'true');
    try { draw(await call(`/ideas?${qs(f)}`)); } catch (e) { gallery.replaceChildren(errorState(e, reload)); }
    gallery.removeAttribute('aria-busy');
  };
  const opt = (v, label) => ({ value: v, label });
  const filters = filterBar({
    search: { placeholder: L('ابحث في الأفكار: عنوان، مشكلة، حل، رقم مرجعي…', 'Search ideas: title, problem, solution, reference…'), value: f.q, onInput: (v) => { f.q = v.trim(); reload(); } },
    selects: [
      { label: L('الفئة', 'Category'), value: f.category, options: [opt('', L('كل الفئات', 'All categories')), ...Object.entries(CAT).map(([k, c]) => opt(k, L(c[0], c[1])))], onChange: (v) => { f.category = v; reload(); } },
      { label: L('المرحلة', 'Stage'), value: f.status, options: [opt('', L('كل المراحل', 'All stages')), ...['submitted', 'screening', 'evaluation', 'needs_info', 'approved', 'in_implementation', 'implemented', 'rejected'].map((k) => opt(k, L(ST[k][0], ST[k][1])))], onChange: (v) => { f.status = v; reload(); } },
      { label: L('التحدي', 'Challenge'), value: f.campaign, options: [opt('', L('كل التحديات', 'All challenges')), ...ov.campaigns.map((c) => opt(c.id, L(c.title_ar, c.title_en)))], onChange: (v) => { f.campaign = v; reload(); } },
    ],
    extra: [segmented([['trending', L('الأكثر تداولاً', 'Trending')], ['newest', L('الأحدث', 'Newest')], ['votes', L('الأكثر دعماً', 'Most votes')]], f.sort, (v) => { f.sort = v; reload(); }, { label: L('الترتيب', 'Sort') })],
  });
  filters.querySelector('input[type=search]')?.setAttribute('data-keep', 'ideas-q');
  return h('div.ideas-bank',
    hero(app, ov),
    nextBanner(app, ov.next),
    ov.trending.length ? h('section.ideas-trending', { 'aria-labelledby': 'ideas-trend-h' },
      secHead([icon('flame'), h('span#ideas-trend-h', L('الأكثر تداولاً الآن', 'Trending now'))], L('بحسب دعم الزملاء والنقاش خلال آخر أسبوعين', 'By colleague votes and discussion over the last two weeks')),
      h('div.trend-grid', ov.trending.map((i, n) => ideaCard(i, { open: app.open, href: app.href, rank: n + 1 })))) : null,
    h('div.bank-layout',
      h('section.bank-main', { 'aria-labelledby': 'ideas-all-h' }, secHead(h('span#ideas-all-h', L('كل الأفكار', 'All ideas')), null, countEl), filters, gallery,
        list.some((i) => i.is_demo) ? h('p.ideas-demo-note', demoChip(true), L('بعض الأفكار والتعليقات بيانات تجريبية للعرض.', 'Some ideas and comments are demo data.')) : null),
      side(app, ov)));
}
// One primary action per screen: the hero owns it unless the next step is a distinct duty.
const DUTY = ['needs_info', 'committee', 'sponsor', 'draft'];
function hero(app, ov) {
  const s = ov.stats;
  const heroPrimary = !DUTY.includes(ov.next?.kind);
  const metric = (value, label, ic, tone) => h(`div.hm${tone ? '.' + tone : ''}`, h('span.hm-ic', icon(ic)), h('div.hm-v', value), h('div.hm-l', label));
  return h('section.ideas-hero', { 'aria-labelledby': 'ideas-hero-h' },
    h('div.hero-glow', { 'aria-hidden': 'true' }),
    h('div.hero-copy',
      h('span.hero-eyebrow', icon('sparkle'), L('منصة الابتكار المؤسسي', 'Institutional innovation')),
      h('h2.hero-title#ideas-hero-h', L('كل تحسين كبير يبدأ بفكرة', 'Every big improvement starts with an idea')),
      h('p.hero-sub', L('شارك بفكرتك لتبسيط إجراء أو تحسين خدمة. تُقيّمها لجنة مختصة بمعايير معلنة، وتتحول الأفكار المعتمدة إلى مشاريع يُقاس أثرها.', 'Share an idea to simplify a procedure or improve a service. A dedicated committee evaluates it on published criteria, and approved ideas become projects with measured impact.')),
      h('div.hero-actions',
        h(`button.btn.lg${heroPrimary ? '.primary' : ''}`, { type: 'button', onclick: () => app.newIdea() }, icon('plus'), L('قدّم فكرتك', 'Submit your idea')),
        h('a.btn.lg.ghost', { href: '#/sys/ideas/challenges' }, icon('flag'), L('التحديات المفتوحة', 'Open challenges'), ov.campaigns.length ? h('span.hero-badge.tabular', fmtNum(ov.campaigns.length)) : null)),
      h('p.hero-foot', icon('usersRound'), L(`بمشاركة ${fmtNum(s.participants)} من الزملاء في مختلف الإدارات`, `${fmtNum(s.participants)} colleagues across departments have taken part`))),
    h('div.hero-metrics',
      metric(num(s.total), L('فكرة في البنك', 'ideas in the bank'), 'lightbulb'),
      metric(num(s.pipeline), L('قيد المراجعة الآن', 'under review now'), 'scale'),
      metric(num(s.adopted + s.implemented), L('اعتُمدت للتنفيذ', 'adopted'), 'badgeCheck', 'good'),
      metric(h('span', compactMoney(s.realized_saving)), L('وفر محقق سنوياً', 'realised annual saving'), 'coins', 'emph')));
}
function nextBanner(app, n) {
  if (!n) return null;
  const IC = { needs_info: 'help', committee: 'scale', sponsor: 'rocket', draft: 'pencil', challenge: 'flag', submit: 'lightbulb' };
  const primary = (label, onclick) => h('button.btn.tertiary', { type: 'button', onclick }, icon('plus'), label);
  const acts = n.kind === 'challenge' ? [h('a.btn.ghost', { href: n.href }, L('تفاصيل التحدي', 'Challenge details')), primary(L(n.cta_ar, n.cta_en), () => app.newIdea({ campaignId: n.campaign_id }))]
    : n.href ? [h(`a.btn${DUTY.includes(n.kind) ? '.primary' : '.tertiary'}`, { href: n.href }, L(n.cta_ar, n.cta_en), icon('chevron', 'flip-rtl'))]
      : [primary(L(n.cta_ar, n.cta_en), () => app.newIdea())];
  return h(`div.ideas-next${n.tone ? '.' + n.tone : ''}`, { role: 'status' },
    h('span.nx-ic', icon(IC[n.kind] || 'arrowRight')),
    h('div.grow', h('div.nx-eyebrow', L('خطوتك التالية', 'Your next step')), h('div.nx-text', L(n.ar, n.en))),
    h('div.nx-acts', acts));
}
function side(app, ov) {
  const camps = ov.campaigns;
  const maxD = Math.max(1, ...ov.departments.map((d) => d.ideas));
  return h('aside.bank-side',
    h('section.card.side-card', h('div.card-head', h('h3.card-title', L('التحديات المفتوحة', 'Open challenges')), h('a.btn.sm.ghost', { href: '#/sys/ideas/challenges' }, L('الكل', 'All'))),
      camps.length ? h('ul.mini-ch', camps.map((c) => h('li', h('a', { href: `#/sys/ideas/challenges/${c.id}` },
        h('div.mc-top', h('span.mc-t', L(c.title_ar, c.title_en)), h(`span.mc-d.tabular${c.days_left <= 7 ? '.soon' : ''}`, daysLabel(c.days_left))),
        h('div.progress', { role: 'progressbar', 'aria-valuenow': c.elapsed_pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L('المدة المنقضية', 'Time elapsed') }, h('i', { style: { width: `${c.elapsed_pct}%` } })),
        h('div.mc-meta', ideasLabel(c.stats.ideas), ' · ', L(`${fmtNum(c.stats.participants)} مشاركاً`, `${fmtNum(c.stats.participants)} participants`)))))) : h('p.tiny.faint', L('لا توجد تحديات مفتوحة الآن.', 'No open challenges right now.'))),
    h('section.card.side-card', h('div.card-head', h('h3.card-title', L('الإدارات الأكثر ابتكاراً', 'Most innovative departments'))),
      ov.departments.length ? h('ol.dept-rank', ov.departments.map((d, i) => h('li', h('span.dr-n.tabular', String(i + 1)), h('div.grow', h('div.dr-name', L(d.name_ar, d.name_en)),
        h('div.dr-bar', h('i', { style: { width: `${(d.ideas / maxD) * 100}%` } }), h('b', { style: { width: `${(d.adopted / maxD) * 100}%` } }))),
      h('span.dr-v.tabular', { 'data-tip': L(`${d.adopted} معتمدة من ${d.ideas}`, `${d.adopted} adopted of ${d.ideas}`) }, h('strong', fmtNum(d.adopted)), h('small', `/${fmtNum(d.ideas)}`))))) : h('p.tiny.faint', L('لا توجد بيانات بعد.', 'No data yet.')),
      h('p.tiny.faint.side-note', L('معتمدة / مقدّمة — تُحتسب الأفكار المعلنة فقط؛ الأفكار مجهولة المقدّم لا تدخل في أي ترتيب.', 'Adopted / submitted — public ideas only; anonymous ideas never enter any ranking.'))),
    h('section.card.side-card.how', h('div.card-head', h('h3.card-title', L('كيف تعمل؟', 'How it works'))),
      h('ol.how-steps', [
        ['send', L('تقدّم فكرتك — باسمك أو دون إظهاره للزملاء', 'Submit — with your name or hidden from colleagues')],
        ['scanSearch', L('تفرزها اللجنة للتحقق من اكتمالها وعدم تكرارها', 'The committee screens for completeness and duplicates')],
        ['scale', L('تقييم مستقل بأربعة معايير موزونة', 'Independent scoring on four weighted criteria')],
        ['badgeCheck', L('قرار مع ملاحظات وراعٍ للتنفيذ', 'A decision with feedback and a sponsor')],
        ['rocket', L('مشروع تنفيذ وقياس للأثر المحقق', 'An implementation project and measured benefits')],
      ].map(([ic, t]) => h('li', h('span.hs-ic', icon(ic)), h('span', t)))),
      h('div.how-points', icon('award'), h('span', L('نقاط التميّز: +٥ عند التقديم (مرة يومياً) · +٢٠ عند الاعتماد · +٤٠ عند التنفيذ', 'Excellence points: +5 on submission (once a day) · +20 when approved · +40 when implemented')))));
}

// ================= mine =================
const NEXT = {
  draft: ['أكمل المسودة وأرسلها للجنة', 'Finish the draft and send it'], submitted: ['بانتظار بدء الفرز', 'Waiting for screening'], screening: ['اللجنة تفرز الفكرة', 'The committee is screening it'],
  evaluation: ['قيد تقييم أعضاء اللجنة', 'Committee members are scoring it'], needs_info: ['اللجنة تنتظر معلومات منك', 'The committee needs information from you'],
  approved: ['معتمدة — بانتظار بدء التنفيذ', 'Approved — waiting for implementation'], in_implementation: ['قيد التنفيذ في مشروع', 'Being implemented in a project'],
  implemented: ['نُفّذت وتحقق أثرها — شكراً لك', 'Implemented with realised benefits — thank you'], rejected: ['لم تُعتمد — اطّلع على ملاحظات اللجنة', 'Not approved — read the committee feedback'], withdrawn: ['سحبتَ هذه الفكرة', 'You withdrew this idea'],
};
export async function mine(app, ovP) {
  const [ov, m] = await Promise.all([ovP, call('/mine')]);
  const st = m.stats;
  const tiles = statRow([
    statTile({ label: L('أفكار مقدّمة', 'Submitted'), value: st.total, icon: 'send' }),
    statTile({ label: L('قيد المراجعة', 'Under review'), value: st.in_progress, icon: 'scale', tone: st.needs_info ? 'warn' : null, hint: st.needs_info ? L(`${fmtNum(st.needs_info)} بحاجة لمعلومات منك`, `${st.needs_info} need your input`) : null }),
    statTile({ label: L('معتمدة', 'Adopted'), value: st.adopted, icon: 'badgeCheck', tone: st.adopted ? 'good' : null, hint: L(`${fmtNum(st.implemented)} مُنفّذة`, `${st.implemented} implemented`) }),
    statTile({ label: L('دعم الزملاء', 'Colleague votes'), value: st.votes, icon: 'thumbsUp' }),
    statTile({ label: L('نقاط التميّز من الأفكار', 'Excellence points from ideas'), value: st.points, icon: 'award', tone: 'emph', href: '#/achievements', hint: L('محسوبة من القرارات الفعلية', 'Derived from real decisions') }),
  ]);
  if (!m.ideas.length) {
    return h('div.ideas-mine', tiles, h('section.card', emptyState({ icon: 'lightbulb', title: L('لم تقدّم أي فكرة بعد', 'You have not submitted an idea yet'), body: L('أفضل الأفكار تأتي ممن يعرف العمل عن قرب. شاركنا ما يمكن تبسيطه أو تحسينه — يمكنك إخفاء اسمك عن الزملاء.', 'The best ideas come from those closest to the work. Share what could be simpler or better — you can hide your name from colleagues.'), actions: [{ label: L('قدّم فكرتك الأولى', 'Submit your first idea'), primary: true, icon: 'plus', onClick: () => app.newIdea() }] })),
      m.following.length ? followingSec(app, m.following) : null);
  }
  const act = m.ideas.filter((i) => (i.status === 'needs_info' || i.status === 'draft') && i.is_author);
  const rest = m.ideas.filter((i) => !act.includes(i));
  return h('div.ideas-mine', tiles,
    act.length ? h('section.mine-sec', secHead([icon('bell'), h('span', L('بانتظارك', 'Waiting for you'))], L('أكمل هذه الأفكار لتصل إلى اللجنة أو تتابع مسارها', 'Complete these to reach the committee or continue')), h('div.mine-list', act.map((i) => mineRow(app, i, true)))) : null,
    rest.length ? h('section.mine-sec', secHead(L('رحلة أفكاري', 'My ideas journey'), L('كل فكرة ومرحلتها الحالية والخطوة التالية', 'Each idea, its stage and what happens next')), h('div.mine-list', rest.map((i) => mineRow(app, i, false)))) : null,
    m.following.length ? followingSec(app, m.following) : null,
    nudge(app, ov),
    [...m.ideas, ...m.following].some((i) => i.is_demo) ? h('p.ideas-demo-note', demoChip(true), L('بعض الأفكار بيانات تجريبية للعرض.', 'Some ideas are demo data.')) : null);
}
function nudge(app, ov) {
  return h('section.mine-nudge', h('span.mn-ic', icon('sparkle')),
    h('div.grow', h('div.mn-t', L('لديك فكرة أخرى؟', 'Got another idea?')), h('div.mn-s', ov.campaigns.length ? L('التحديات المفتوحة الآن تبحث عن أفكار مثل أفكارك:', 'Open challenges are looking for ideas like yours:') : L('الأفكار الصغيرة التي توفر دقائق يومياً تصنع فرقاً كبيراً.', 'Small ideas that save minutes a day add up.')),
      ov.campaigns.length ? h('div.mn-chips', ov.campaigns.map((c) => h('button.chip.mn-chip', { type: 'button', onclick: () => app.newIdea({ campaignId: c.id }) }, icon('flag'), L(c.title_ar, c.title_en), h('span.tabular', ` · ${daysLabel(c.days_left)}`)))) : null),
    h('button.btn.tertiary', { type: 'button', onclick: () => app.newIdea() }, icon('plus'), L('قدّم فكرة', 'Submit an idea')));
}
function followingSec(app, list) {
  return h('section.mine-sec', secHead([icon('bell'), h('span', L('أفكار أتابعها', 'Ideas I follow'))], L('تصلك تحديثاتها فوراً عند تغيّر مرحلتها', 'You get live updates when they move')), h('div.idea-grid', list.map((i) => ideaCard(i, { open: app.open, href: app.href }))));
}
function mineRow(app, i, action) {
  const idx = stepIndex(i);
  const failed = ['rejected', 'withdrawn'].includes(i.status);
  return h(`article.mine-row${action ? '.act' : ''}`, { 'data-cat': i.category },
    h('div.mr-main',
      h('div.mr-chips', catChip(i.category), chip(i.status), !i.is_author ? h('span.chip.tiny.outline', icon('usersRound'), L('شريك في الفكرة', 'Co-author')) : null, i.author_hidden ? h('span.chip.tiny.outline', icon('eyeOff'), L('مخفية الاسم', 'Name hidden')) : null),
      h('h3.mr-title', h('a', { href: app.href(i.id), onclick: (e) => { e.preventDefault(); app.open(i.id); } }, i.title)),
      h('ol.mr-track', { 'aria-label': L(`المرحلة ${Math.min(idx + 1, STEPS.length)} من ${STEPS.length}`, `Stage ${Math.min(idx + 1, STEPS.length)} of ${STEPS.length}`) }, STEPS.map((s, n) => h(`li.${n < idx ? 'done' : n === idx ? (failed ? 'failed' : 'current') : 'todo'}`, { title: L(s.ar, s.en) }, h('span.sr-only', L(s.ar, s.en))))),
      h('p.mr-next', icon(action ? 'arrowRight' : 'info', 'flip-rtl'), L(...NEXT[i.status]))),
    h('div.mr-side',
      h('div.mr-stats', h('span', icon('thumbsUp'), num(i.votes)), h('span', icon('messageSquare'), num(i.comments)), h('span.faint', fmtDate(i.updated_at))),
      h(`button.btn.sm${action ? '.primary' : ''}`, { type: 'button', onclick: () => app.open(i.id) }, action ? (i.status === 'draft' ? L('أكمل المسودة', 'Finish draft') : L('استكمل المعلومات', 'Provide info')) : L('فتح', 'Open'))));
}

// ================= challenges =================
export async function challenges(app, ovP, campId) {
  if (campId) return challengeDetail(app, ovP, campId);
  const [, list] = await Promise.all([ovP, call('/campaigns')]);
  const committee = app.committee;
  return h('div.ideas-challenges',
    secHead(L('تحديات الابتكار', 'Innovation challenges'), L('أسئلة محددة بمواعيد نهائية تطرحها الجهة — شارك بفكرتك قبل الإغلاق', 'Focused questions with deadlines — share your idea before they close'),
      committee ? h('button.btn.tertiary', { type: 'button', onclick: () => app.newChallenge() }, icon('plus'), L('تحدٍ جديد', 'New challenge')) : null),
    list.length ? h('div.chal-grid', list.map((c) => chalCard(app, c))) : h('section.card', emptyState({ icon: 'flag', title: L('لا توجد تحديات بعد', 'No challenges yet'), body: committee ? L('أطلق أول تحدٍ لتوجيه أفكار الموظفين نحو أولوية محددة.', 'Launch the first challenge to focus ideas on a priority.') : L('ستظهر هنا التحديات التي تطلقها لجنة الأفكار.', 'Challenges launched by the committee appear here.'), actions: committee ? [{ label: L('تحدٍ جديد', 'New challenge'), primary: true, onClick: () => app.newChallenge() }] : [] })));
}
const STATE = { active: ['مفتوح للمشاركة', 'Open', 'good', 'circlePlay'], upcoming: ['يبدأ قريباً', 'Starting soon', 'info', 'calendarClock'], closed: ['مغلق', 'Closed', 'outline', 'lock'] };
function chalCard(app, c, { wide = false } = {}) {
  const s = STATE[c.state];
  return h(`article.chal-card.${c.state}${wide ? '.wide' : ''}`,
    h('div.ch-glow', { 'aria-hidden': 'true' }),
    h('div.ch-top', h(`span.chip.tiny.${s[2]}`, icon(s[3]), L(s[0], s[1])), demoChip(c.is_demo), h('span.grow'),
      c.state === 'active' ? h('div.ch-days', h('span.ch-dn.tabular', fmtNum(c.days_left)), h('span.ch-dl', c.days_left === 1 ? L('يوم متبقٍ', 'day left') : L('يوماً متبقياً', 'days left'))) : null),
    h('h3.ch-title', wide ? L(c.title_ar, c.title_en) : h('a', { href: `#/sys/ideas/challenges/${c.id}` }, L(c.title_ar, c.title_en))),
    h('p.ch-desc', L(c.description_ar, c.description_en)),
    h('div.ch-time', h('div.progress', { role: 'progressbar', 'aria-valuenow': c.elapsed_pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L('المدة المنقضية من التحدي', 'Challenge time elapsed') }, h('i', { style: { width: `${c.elapsed_pct}%` } })),
      h('div.ch-dates', h('span', L('بدأ', 'Started'), ' ', fmtDate(c.starts_on)), h('span', L('يُغلق', 'Closes'), ' ', fmtDate(c.ends_on)))),
    h('div.ch-stats',
      h('div', h('strong.tabular', fmtNum(c.stats.ideas)), h('span', L('فكرة', 'ideas'))),
      h('div', h('strong.tabular', fmtNum(c.stats.participants)), h('span', L('مشاركاً', 'participants'))),
      h('div', h('strong.tabular', fmtNum(c.stats.adopted)), h('span', L('معتمدة', 'adopted')))),
    c.objective || c.sponsor ? h('div.ch-meta', c.objective ? h('span.chip.tiny.navy', icon('target'), L(c.objective.title_ar, c.objective.title_en)) : null, c.sponsor ? h('span.ch-sponsor', h('span.tiny.faint', L('الراعي', 'Sponsor')), whoChip(c.sponsor)) : null) : null,
    h('div.ch-actions',
      c.state === 'active' ? h('button.btn.primary', { type: 'button', onclick: () => app.newIdea({ campaignId: c.id }) }, icon('plus'), L('شارك بفكرة', 'Share an idea')) : null,
      !wide ? h('a.btn', { href: `#/sys/ideas/challenges/${c.id}` }, L('استعرض الأفكار', 'Browse ideas'), h('span.count.tabular', fmtNum(c.stats.ideas))) : null));
}
async function challengeDetail(app, ovP, id) {
  const [, c] = await Promise.all([ovP, call(`/campaigns/${id}`)]);
  return h('div.ideas-challenge',
    h('a.back-link', { href: '#/sys/ideas/challenges' }, icon('chevronL', 'flip-rtl'), L('كل التحديات', 'All challenges')),
    chalCard(app, c, { wide: true }),
    secHead(L('أفكار التحدي', 'Ideas in this challenge'), L('مرتبة حسب التداول — ادعم ما يعجبك أو شارك بفكرة جديدة', 'Ranked by trend — vote for what you like or add yours'), h('span.ideas-count.tabular', ideasLabel(c.ideas.length))),
    c.ideas.length ? h('div.idea-grid', c.ideas.map((i) => ideaCard(i, { open: app.open, href: app.href })))
      : h('section.card', emptyState({ icon: 'lightbulb', title: L('لا توجد أفكار في هذا التحدي بعد', 'No ideas in this challenge yet'), body: c.state === 'active' ? L('كن أول من يشارك — الأفكار المبكرة تحظى بدعم أكبر.', 'Be first — early ideas get more support.') : null, actions: c.state === 'active' ? [{ label: L('شارك بفكرة', 'Share an idea'), primary: true, icon: 'plus', onClick: () => app.newIdea({ campaignId: c.id }) }] : [] })));
}

// ================= committee =================
const COLS = [
  { key: 'submitted', ar: 'جديدة', en: 'New', tone: 'info' },
  { key: 'screening', ar: 'قيد الفرز', en: 'Screening', tone: 'info' },
  { key: 'evaluation', ar: 'قيد التقييم', en: 'Evaluation', tone: 'emph' },
  { key: 'needs_info', ar: 'بانتظار مقدّم الفكرة', en: 'Waiting for author', tone: 'warn' },
];
export async function committee(app, ovP) {
  if (!app.committee) {
    await ovP;
    return h('section.card', emptyState({ icon: 'lock', title: L('هذه المساحة للجنة تقييم الأفكار', 'This space is for the ideas committee'), body: L('يمنح مدير المنصة صلاحية «لجنة تقييم الأفكار» لأعضاء اللجنة المعتمدين فقط.', 'The platform admin grants the committee capability to appointed members only.'), actions: [{ label: L('العودة لبنك الأفكار', 'Back to the bank'), onClick: () => { location.hash = '#/sys/ideas/bank'; } }] }));
  }
  const [, q] = await Promise.all([ovP, call('/committee')]);
  const s = q.stats;
  const tiles = statRow([
    statTile({ label: L('جديدة للفرز', 'New to screen'), value: s.new, icon: 'inbox', tone: s.new ? 'emph' : null }),
    statTile({ label: L('قيد الفرز', 'Screening'), value: s.screening, icon: 'scanSearch' }),
    statTile({ label: L('بانتظار تقييمك', 'Need your score'), value: s.to_score, icon: 'star', tone: s.to_score ? 'warn' : 'good' }),
    statTile({ label: L('جاهزة للقرار', 'Ready to decide'), value: s.ready, icon: 'gavel', tone: s.ready ? 'emph' : null, hint: L(`الحد الأدنى ${q.min_scores} تقييمات`, `Min. ${q.min_scores} scores`) }),
    statTile({ label: L('بانتظار التنفيذ', 'Awaiting implementation'), value: s.approved, icon: 'rocket', hint: L(`${fmtNum(s.in_implementation)} قيد التنفيذ`, `${s.in_implementation} in progress`) }),
  ]);
  const body = h('div.cm-body');
  const after = q.items.filter((i) => ['approved', 'in_implementation'].includes(i.status));
  const draw = () => body.replaceChildren(S.committeeView === 'matrix' ? matrix(app, q) : h('div.cm-board', board(COLS, q.items, { columnOf: (i) => i.status, renderCard: (i) => cmCard(app, i), emptyText: L('لا شيء هنا', 'Nothing here') })),
    S.committeeView === 'matrix' || !after.length ? null : h('section.cm-after', secHead([icon('rocket'), h('span', L('متابعة ما بعد القرار', 'After the decision'))], L('أفكار معتمدة يقودها رعاة التنفيذ — تابع بدء التنفيذ وتسجيل الأثر', 'Approved ideas led by their sponsors — follow the start and the realised benefits')),
      h('ul.cm-after-list', after.map((i) => h('li', h('button', { type: 'button', 'data-cat': i.category, onclick: () => app.open(i.id) }, chip(i.status), h('span.ca-t', i.title), i.sponsor ? h('span.ca-s', L(`الراعي: ${i.sponsor.name_ar}`, `Sponsor: ${i.sponsor.name_en}`)) : null))))));
  draw();
  const seg = segmented([['board', L('لوحة سير العمل', 'Workflow board')], ['matrix', L('مصفوفة التقييم', 'Scoring matrix')]], S.committeeView, (v) => { S.committeeView = v; draw(); }, { label: L('طريقة العرض', 'View') });
  return h('div.ideas-committee', tiles,
    h('div.cm-bar', seg, h('span.grow'), h('span.cm-rules', icon('shieldAlert'), L('فصل المهام: لا تفرز ولا تقيّم ولا تقرر في فكرة أنت من مقدّميها · التقييم مستقل حتى تحفظ تقييمك', 'Segregation of duties: never screen, score or decide on your own idea · scoring is blind until you save yours'))),
    body,
    h('div.cm-legend', h('span.lbl', L('معايير التقييم وأوزانها', 'Criteria and weights')), Object.keys(WEIGHTS).map((k) => h('span.chip.tiny.outline', L(CRIT[k][0], CRIT[k][1]), ' ', h('b.tabular', `${fmtNum(WEIGHTS[k] * 100)}%`)))));
}
function cmCard(app, i) {
  const badges = [];
  if (i.conflict) badges.push(h('span.chip.tiny.warn', icon('shieldAlert'), L('تعارض مصالح', 'Conflict')));
  if (i.status === 'evaluation' && !i.conflict) badges.push(i.my_score ? h('span.chip.tiny.good', icon('check'), L(`تقييمي ${fmtNum(i.my_score.weighted)}`, `Mine ${i.my_score.weighted}`)) : h('span.chip.tiny.warn', icon('star'), L('بانتظار تقييمك', 'Needs your score')));
  if (i.status === 'evaluation') badges.push(h(`span.chip.tiny.${i.ready ? 'purple' : 'outline'}`, icon(i.ready ? 'gavel' : 'usersRound'), `${fmtNum(i.n_scores)}/${fmtNum(2)}`));
  if (i.author_hidden && !i.author) badges.push(h('span.chip.tiny.outline', icon('eyeOff'), L('مجهول', 'Anonymous')));
  return h('button.board-card.cm-card', { type: 'button', 'data-cat': i.category, onclick: () => app.open(i.id) },
    h('span.bc-title', i.title),
    h('span.bc-meta', h('span.num', i.ref), catChip(i.category), i.waiting_days > 0 ? h('span', icon('clock'), L(`منذ ${daysLabel(i.waiting_days)}`, `${daysLabel(i.waiting_days)} ago`)) : null),
    badges.length ? h('span.bc-meta', badges) : null,
    i.sponsor && ['approved', 'in_implementation'].includes(i.status) ? h('span.bc-meta', h('span.tiny.faint', L('الراعي', 'Sponsor')), L(i.sponsor.name_ar, i.sponsor.name_en)) : null);
}
function matrix(app, q) {
  const rows = q.items.filter((i) => i.status === 'evaluation');
  const pill = (v) => (v == null ? h('span.faint', '—') : h('span.sc-pill', { 'data-v': v }, h('b.num', fmtNum(v))));
  const act = (i) => {
    if (i.conflict) return h('span.chip.tiny.warn', icon('shieldAlert'), L('تعارض', 'Conflict'));
    return h('div.row', h(`button.btn.sm${i.my_score ? '' : '.primary'}`, { type: 'button', onclick: async (e) => { e.stopPropagation(); const d = await call(`/ideas/${i.id}`).catch(() => null); if (d && (await scoreDialog(d).catch(() => null))) app.rerender(); } }, icon('star'), i.my_score ? L('تعديل', 'Edit') : L('قيّم', 'Score')),
      i.ready ? h('button.btn.sm.tertiary', { type: 'button', onclick: async (e) => { e.stopPropagation(); const d = await call(`/ideas/${i.id}`).catch(() => null); if (d && (await decisionDialog(d).catch(() => null))) app.rerender(); } }, icon('gavel'), L('قرار', 'Decide')) : null);
  };
  return h('section.card.cm-matrix',
    dataTable({
      caption: L('مصفوفة تقييم الأفكار', 'Ideas scoring matrix'),
      columns: [
        { key: 'title', label: L('الفكرة', 'Idea'), render: (i) => h('div.mx-title', h('strong', i.title), h('div.tiny.faint', h('span.num', i.ref), ' · ', L(CAT[i.category][0], CAT[i.category][1]))), sort: (i) => i.title },
        ...Object.keys(WEIGHTS).map((k) => ({ key: k, label: L(CRIT[k][0], CRIT[k][1]), num: true, render: (i) => pill(i.my_score?.[k]), sort: (i) => i.my_score?.[k] ?? null })),
        { key: 'mine', label: L('تقييمي', 'Mine'), num: true, render: (i) => (i.my_score ? h('strong.num.tabular', fmtNum(i.my_score.weighted)) : h('span.faint', '—')), sort: (i) => i.my_score?.weighted ?? null },
        { key: 'agg', label: L('متوسط اللجنة', 'Committee avg'), num: true, render: (i) => (i.aggregate ? h('span.num.tabular', `${fmtNum(i.aggregate.pct)}%`) : h('span.faint', { 'data-tip': L('يظهر بعد تقييمك', 'Shown after you score') }, i.conflict ? '—' : L('مخفي', 'Blind'))), sort: (i) => i.aggregate?.pct ?? null },
        { key: 'n', label: L('المقيّمون', 'Scores'), num: true, render: (i) => h(`span.chip.tiny.${i.ready ? 'purple' : 'outline'}`, `${fmtNum(i.n_scores)}/${fmtNum(q.min_scores)}`), sort: (i) => i.n_scores },
        { key: 'act', label: L('الإجراء', 'Action'), render: act },
      ],
      rows, onRow: (i) => app.open(i.id), sortKey: 'n', sortDir: 'desc',
      empty: emptyState({ compact: true, icon: 'scale', title: L('لا توجد أفكار قيد التقييم', 'No ideas in evaluation'), body: L('تظهر هنا الأفكار بعد إحالتها من الفرز.', 'Ideas appear here once referred from screening.') }),
    }));
}
