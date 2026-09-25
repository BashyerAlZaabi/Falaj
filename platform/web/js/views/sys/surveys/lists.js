// Surveys — list screens: «بانتظاري» (hero), «مشاركاتي», «استبياناتي» (authors),
// «مشاركة فريقي» (managers), and the survey settings dialog (create / edit).
import {
  h, icon, L, fmtNum, toast, modal, confirmDialog, emptyState, dataTable, menu, act, go,
  statRow, statTile, card, openSheet, departments,
} from '../../../sys-kit.js';
import {
  call, MIN_GROUP, surveyStatus, anonChip, demoChip, leftChip, timeLeft, questionsLabel, minutesLabel,
  dateLabel, ring, countAr, pctText, errMsg,
} from './common.js';

// ---------------------------------------------------------------- «بانتظاري»
export async function renderPending(root, ctx, { pending, upcoming, answered }) {
  const shared = answered.filter((s) => s.results_available && s.status === 'closed');
  const main = h('div.sv-main');
  if (!pending.length) {
    main.append(h('section.card.sv-hero.sv-hero-empty',
      h('div.sv-hero-empty-ic', icon('checkCheck')),
      h('h2', L('لا استبيانات بانتظارك', 'Nothing waiting for you')),
      h('p', L('شكراً لمشاركتك. سيصلك تنبيه عند نشر استبيان جديد موجّه إليك.', 'Thank you for taking part. You will be alerted when a new survey is addressed to you.')),
      h('div.btn-group', h('a.btn.tertiary', { href: `#/sys/${ctx.key}/answered` }, icon('clipboardCheck'), L('عرض مشاركاتي', 'View my responses')))));
  } else {
    main.append(hero(ctx, pending[0]));
    if (pending.length > 1) {
      main.append(h('div.section', L('أيضاً بانتظارك', 'Also waiting for you'), h('span.count', fmtNum(pending.length - 1))),
        h('div.sv-cards', pending.slice(1).map((s) => pendingCard(ctx, s))));
    }
  }
  if (upcoming.length) {
    main.append(h('div.section', L('قريباً', 'Coming soon'), h('span.count', L('تُفتح للإجابة في موعدها', 'Open on their start date'))),
      h('ul.list.inset.sv-upcoming', upcoming.map((s) => h('li', h('span.sv-li-ic', icon('calendarClock')), h('span.grow', h('span.title', s.title), h('span.meta', `${L(s.author?.dept_ar, s.author?.dept_en)} · ${L('يُفتح', 'Opens')} ${dateLabel(s.opens_on)}`)), anonChip(s)))));
  }
  const took = answered.length;
  const side = h('aside.sv-side',
    h('section.card.sv-impact',
      h('div.card-head', h('h2.card-title', L('أثر مشاركتك', 'Your contribution'))),
      took ? h('div.sv-impact-row',
        h('div', h('strong.num.tabular', fmtNum(took)), h('span', took === 1 ? L('مشاركة', 'response') : L('مشاركات', 'responses'))),
        h('div.emph', h('strong.num.tabular', `+${fmtNum(took * 3)}`), h('span', L('نقطة تميّز', 'excellence pts'))))
        : h('div.sv-impact-first', h('span.sv-privacy-ic', icon('sparkle')), h('span', L('شارك في أول استبيان لتبدأ رصيدك: +3 نقاط تميّز لكل مشاركة.', 'Answer your first survey to start: +3 excellence points each time.'))),
      h('p.tiny.faint', L('كل مشاركة تمنح 3 نقاط تميّز — تُحتسب مشاركتك فقط، ولا علاقة للنقاط بمضمون إجاباتك.', 'Each response earns 3 excellence points — only your participation counts, never what you answered.'))),
    shared.length ? h('section.card',
      h('div.card-head', h('h2.card-title', L('نتائج شاركتها الجهة', 'Results shared with you'))),
      h('ul.list.sv-linklist', shared.slice(0, 4).map((s) => h('li', h('a', { href: `#/sys/${ctx.key}/results/${s.id}` }, icon('chartBar'), h('span.grow', s.title), icon('chevron', 'flip-rtl')))))) : null,
    privacyCard());
  root.append(h('div.sv-layout', main, side));
}
function hero(ctx, s) {
  const total = Math.max(1, (Date.parse(s.closes_on) - Date.parse(s.opens_on)) / 864e5 + 1);
  const remaining = Math.max(0, s.days_left + 1);
  const urgent = s.days_left <= 1;
  return h(`section.card.sv-hero${urgent ? '.urgent' : ''}`, { 'aria-labelledby': 'sv-hero-title' },
    h('div.sv-hero-body',
      h('div.sv-hero-eyebrow', h('span.chip.tiny.purple', icon('bell'), L('بانتظار مشاركتك', 'Waiting for you')), anonChip(s), h('span.sv-mobile-only', leftChip(s)), demoChip(s)),
      h('h2#sv-hero-title', s.title),
      s.description ? h('p.sv-hero-desc', s.description) : null,
      h('ul.sv-meta',
        h('li', icon('building'), L(s.author?.dept_ar || '', s.author?.dept_en || '')),
        h('li', icon('listChecks'), questionsLabel(s.question_count)),
        h('li', icon('clock'), minutesLabel(s.est_minutes)),
        h('li', icon('usersRound'), L(s.audience_ar, s.audience_en))),
      h('div.sv-hero-actions',
        h('a.btn.primary.lg', { href: `#/sys/${ctx.key}/answer/${s.id}` }, L('ابدأ الإجابة', 'Start answering'), icon('arrowRight', 'flip-rtl')),
        h('span.sv-hero-note', icon(s.anonymous ? 'shield' : 'user'), s.anonymous ? L('لا ترتبط إجاباتك باسمك', 'Your answers are not linked to your name') : L('هذا الاستبيان غير مجهول — ستُبلَّغ بالتفاصيل قبل البدء', 'Not anonymous — details are shown before you start')))),
    h('div.sv-hero-aside',
      ring(Math.round((100 * remaining) / total), { size: 132, stroke: 10, label: s.days_left <= 0 ? L('اليوم', 'Today') : fmtNum(s.days_left), sub: s.days_left <= 0 ? L('آخر يوم', 'last day') : L(s.days_left === 1 ? 'يوم متبقٍ' : s.days_left === 2 ? 'يومان متبقيان' : 'أيام متبقية', s.days_left === 1 ? 'day left' : 'days left'), tone: urgent ? 'warn' : 'emph' }),
      h('span.tiny.faint', L(`يُغلق ${dateLabel(s.closes_on)}`, `Closes ${dateLabel(s.closes_on)}`))));
}
function pendingCard(ctx, s) {
  return h('article.card.interactive.sv-pcard', { role: 'link', tabindex: 0, onclick: () => go(ctx, 'answer', s.id), onkeydown: (e) => { if (e.key === 'Enter') go(ctx, 'answer', s.id); } },
    h('div.sv-pcard-top', leftChip(s), anonChip(s), demoChip(s)),
    h('h3', s.title),
    h('div.sv-pcard-meta', h('span', icon('building'), L(s.author?.dept_ar || '', s.author?.dept_en || '')), h('span', icon('listChecks'), questionsLabel(s.question_count)), h('span', icon('clock'), minutesLabel(s.est_minutes))),
    h('div.sv-pcard-foot', h('span.btn.sm.tertiary', L('أجب الآن', 'Answer now'), icon('chevron', 'flip-rtl'))));
}
export function privacyCard() {
  return h('section.card.sv-privacy',
    h('div.card-head', h('span.sv-privacy-ic', icon('fingerprint')), h('h2.card-title', L('كيف نحمي خصوصيتك', 'How your privacy is protected'))),
    h('ul',
      h('li', icon('eyeOff'), h('span', L('تُحفظ الإجابات دون هويتك، وتُسجَّل مشاركتك في سجل منفصل لا يرتبط بها.', 'Answers are stored without your identity; participation is kept in a separate record never linked to them.'))),
      h('li', icon('usersRound'), h('span', L(`لا تظهر النتائج قبل وصول الإجابات إلى ${MIN_GROUP}، ولا تُفصَّل الإدارات الأقل من ${MIN_GROUP}.`, `No results show before ${MIN_GROUP} responses, and no department under ${MIN_GROUP} is broken out.`))),
      h('li', icon('lockKeyhole'), h('span', L('التعليقات النصية تُعرض للمُعِدّ مجمّعة ودون تاريخ أو إدارة، ولا تُرسل إلى الذكاء الاصطناعي.', 'Comments reach the author pooled, without date or department, and are never sent to AI.')))));
}

// ---------------------------------------------------------------- «مشاركاتي»
export function renderAnswered(root, ctx, list) {
  if (!list.length) {
    root.append(card(null, emptyState({ icon: 'clipboardCheck', title: L('لم تشارك في أي استبيان بعد', 'No responses yet'), body: L('عندما تجيب عن استبيان سيظهر هنا، مع نتائجه المجمّعة إذا شاركها المُعِدّ بعد الإغلاق.', 'Surveys you answer appear here, with their aggregated results if the author shares them after closing.'), actions: [{ label: L('الاستبيانات بانتظاري', 'Surveys waiting for me'), primary: true, onClick: () => go(ctx, 'pending') }] })));
    return;
  }
  const resultsCell = (s) => {
    if (s.results_available) return h('a.btn.sm.tertiary', { href: `#/sys/${ctx.key}/results/${s.id}` }, icon('chartBar'), L('النتائج', 'Results'));
    if (s.status !== 'closed') return h('span.tiny.faint', L('تُتاح بعد الإغلاق إن شاركها المُعِدّ', 'After closing, if shared'));
    return h('span.tiny.faint', s.share_results ? L(`أقل من ${MIN_GROUP} مشاركين`, `Fewer than ${MIN_GROUP}`) : L('لم يشارك المُعِدّ النتائج', 'Not shared by the author'));
  };
  root.append(card(h('div.card-head', h('h2.card-title', L('الاستبيانات التي شاركت فيها', 'Surveys you answered')), h('span.chip.tiny.outline', fmtNum(list.length))),
    dataTable({
      caption: L('مشاركاتي', 'My responses'),
      columns: [
        { key: 'title', label: L('الاستبيان', 'Survey'), sort: (s) => s.title, render: (s) => h('div.sv-cell-title', h('strong', s.title), h('span.tiny.faint', L(s.author?.dept_ar || '', s.author?.dept_en || ''))) },
        { key: 'responded_on', label: L('تاريخ مشاركتك', 'You answered'), sort: (s) => s.responded_on, render: (s) => dateLabel(s.responded_on) },
        { key: 'status', label: L('الحالة', 'Status'), sort: (s) => s.status, render: (s) => surveyStatus(s) },
        { key: 'privacy', label: L('الخصوصية', 'Privacy'), render: (s) => h('div.row-wrap.sv-gap', anonChip(s), demoChip(s)) },
        { key: 'act', label: L('النتائج', 'Results'), render: (s) => h('div.row-wrap.sv-gap', resultsCell(s), !s.anonymous ? h('button.btn.sm.ghost', { type: 'button', onclick: () => myAnswerSheet(s) }, icon('eye'), L('إجابتي', 'My answer')) : null) },
      ],
      rows: list, sortKey: 'responded_on', sortDir: 'desc',
    })));
}
async function myAnswerSheet(s) {
  const [mine, detail] = await Promise.all([call(`/surveys/${s.id}/my-response`), call(`/surveys/${s.id}`)]).catch((e) => { toast(errMsg(e), { kind: 'error' }); return []; });
  if (!mine) return;
  const qs = detail.sections.flatMap((x) => x.questions);
  const show = (q) => {
    const v = mine.answers?.[q.id];
    if (v == null || (Array.isArray(v) && !v.length)) return h('span.faint', L('لم تُجب', 'Not answered'));
    if (q.type === 'single' || q.type === 'multi') return (Array.isArray(v) ? v : [v]).map((id) => q.options.find((o) => o.id === id)?.label).filter(Boolean).join(L('، ', ', '));
    if (q.type === 'yesno') return v ? L('نعم', 'Yes') : L('لا', 'No');
    return String(v);
  };
  openSheet({ title: L('إجابتي', 'My answer'), subtitle: s.title, badges: [anonChip(s)],
    body: [h('div.callout', icon('info'), h('span', L('هذا الاستبيان غير مجهول، لذلك يمكنك مراجعة ما أرسلته. لا يطّلع أحد على إجابتك منفردة؛ النتائج تُعرض مجمّعة.', 'This survey is not anonymous, so you can review what you sent. Nobody sees your answer on its own; results are aggregated.'))),
      h('dl.sys-kv', qs.flatMap((q) => [h('dt', q.text), h('dd', show(q))]))] });
}

// ---------------------------------------------------------------- «استبياناتي»
export function renderMine(root, ctx, { authored, overseen }, pending) {
  const open = authored.filter((s) => s.status === 'published');
  const drafts = authored.filter((s) => s.status === 'draft');
  const closed = authored.filter((s) => s.status === 'closed');
  if (pending.length) {
    root.append(h('div.callout.sv-strip', icon('bell'), h('span.grow', pending.length === 1 ? L(`«${pending[0].title}» بانتظار إجابتك أيضاً`, `“${pending[0].title}” is waiting for your answer too`) : L(`${countAr(pending.length, ['استبيان', 'استبيانان', 'استبيانات', 'استبياناً'])} بانتظار إجابتك`, `${pending.length} surveys are waiting for your answer`)),
      h('a.btn.sm.tertiary', { href: pending.length === 1 ? `#/sys/${ctx.key}/answer/${pending[0].id}` : `#/sys/${ctx.key}/pending` }, L('أجب الآن', 'Answer now'))));
  }
  if (!authored.length && !overseen.length) {
    root.append(card(null, emptyState({ icon: 'clipboardList', title: L('ابدأ أول استبيان', 'Create your first survey'), body: L('اختر قالباً جاهزاً أو ابدأ من الصفر، وحدّد الجمهور، ثم انشره. النتائج مجمّعة وتحمي هوية المشاركين.', 'Start from a template or from scratch, choose the audience and publish. Results are aggregated and protect respondents.'), actions: [{ label: L('استبيان جديد', 'New survey'), icon: 'plus', primary: true, onClick: () => newSurvey(ctx) }] })));
    return;
  }
  const el = open.reduce((a, s) => a + (s.stats?.eligible || 0), 0); const rs = open.reduce((a, s) => a + (s.stats?.responded || 0), 0);
  const total = authored.reduce((a, s) => a + (s.stats?.responded || 0), 0);
  const rate = el ? Math.round((100 * rs) / el) : null;
  root.append(statRow([
    statTile({ label: L('مفتوحة الآن', 'Open now'), value: open.length, icon: 'circlePlay', tone: 'good' }),
    statTile({ label: L('معدل الاستجابة', 'Response rate'), value: rate == null ? null : `${fmtNum(rate)}%`, icon: 'percent', tone: rate == null ? null : rate >= 60 ? 'good' : rate >= 30 ? 'warn' : 'crit', hint: el ? L(`${fmtNum(rs)} من ${fmtNum(el)} مدعواً`, `${rs} of ${el} invited`) : L('لا استبيانات مفتوحة', 'No open surveys') }),
    statTile({ label: L('إجمالي المشاركات', 'Total responses'), value: total, icon: 'usersRound', tone: 'emph' }),
    statTile({ label: L('مسودات', 'Drafts'), value: drafts.length, icon: 'pencil', tone: 'sand' }),
  ]));
  if (open.length) root.append(h('div.section', L('مفتوحة الآن', 'Open now'), h('span.count', fmtNum(open.length))), h(`div.sv-cards${open.length > 1 ? '.two' : '.one'}`, open.map((s) => openCard(ctx, s))));
  if (drafts.length) root.append(h('div.section', L('مسودات', 'Drafts'), h('span.count', fmtNum(drafts.length))), h('div.sv-cards', drafts.map((s) => draftCard(ctx, s))));
  if (closed.length) root.append(h('div.section', L('مغلقة', 'Closed'), h('span.count', fmtNum(closed.length))), card(null, closedTable(ctx, closed)));
  if (overseen.length) {
    root.append(h('div.section', L('استبيانات فريقي', 'My team’s surveys'), h('span.count', L('اطلاع فقط', 'view only'))),
      card(null, h('p.tiny.faint.sv-card-note', L('استبيانات أعدّها أعضاء إدارتك. يمكنك الاطلاع على نتائجها المجمّعة ونسخها كمسودة، ويبقى تعديلها لمُعِدّها.', 'Surveys prepared by your department. You can read their aggregated results and copy them as a draft; editing stays with their author.')), closedTable(ctx, overseen, { team: true })));
  }
}
function openCard(ctx, s) {
  const st = s.stats || {};
  return h('article.card.sv-scard',
    h('div.sv-scard-top', surveyStatus(s), anonChip(s), demoChip(s), h('span.grow'), s.scheduled ? h('span.chip.tiny.sand', icon('calendarClock'), L(`يُفتح ${dateLabel(s.opens_on)}`, `Opens ${dateLabel(s.opens_on)}`)) : leftChip(s)),
    h('div.sv-scard-body',
      h('div.grow',
        h('h3', h('a', { href: `#/sys/${ctx.key}/results/${s.id}` }, s.title)),
        h('div.sv-scard-meta', h('span', icon('usersRound'), L(s.audience_ar, s.audience_en)), h('span', icon('listChecks'), questionsLabel(s.question_count))),
        h('div.sv-scard-stats',
          h('div', h('strong.num.tabular', fmtNum(st.responded ?? 0)), h('span', L('مشاركة', 'responses'))),
          h('div', h('strong.num.tabular', fmtNum(st.eligible ?? 0)), h('span', L('مدعواً', 'invited'))),
          h('div', h('strong.num.tabular', fmtNum(st.released ?? 0)), h('span', L('في النتائج', 'in results'))))),
      ring(st.rate ?? 0, { size: 88, stroke: 8, label: pctText(st.rate), sub: L('استجابة', 'response'), tone: (st.rate ?? 0) >= 60 ? 'good' : (st.rate ?? 0) >= 30 ? 'accent' : 'warn' })),
    h('div.sv-scard-foot',
      h('a.btn.sm.tertiary', { href: `#/sys/${ctx.key}/results/${s.id}` }, icon('chartBar'), L('النتائج', 'Results')),
      h('a.btn.sm.ghost', { href: `#/sys/${ctx.key}/build/${s.id}` }, icon('eye'), L('الأسئلة', 'Questions')),
      h('span.grow'),
      h('button.icon-btn', { type: 'button', 'aria-label': L('إجراءات أخرى', 'More actions'), 'aria-haspopup': 'menu', onclick: (e) => menu(e.currentTarget, [
        { label: L('تذكير غير المشاركين', 'Remind non-respondents'), icon: 'bell', onClick: () => remindSurvey(s) },
        { label: L('نسخ كمسودة جديدة', 'Copy as a new draft'), icon: 'copy', onClick: () => duplicateSurvey(ctx, s) },
        { sep: true },
        { label: L('إغلاق الاستبيان', 'Close survey'), icon: 'lock', danger: true, onClick: () => closeSurveyFlow(s) },
      ]) }, icon('more'))));
}
function draftCard(ctx, s) {
  return h('article.card.sv-scard.draft',
    h('div.sv-scard-top', surveyStatus(s), anonChip(s), demoChip(s)),
    h('h3', h('a', { href: `#/sys/${ctx.key}/build/${s.id}` }, s.title)),
    h('div.sv-scard-meta', h('span', icon('usersRound'), L(s.audience_ar, s.audience_en)), h('span', icon('listChecks'), questionsLabel(s.question_count)), h('span', icon('calendar'), `${dateLabel(s.opens_on)} – ${dateLabel(s.closes_on)}`)),
    h('div.sv-scard-foot',
      h('a.btn.sm.primary', { href: `#/sys/${ctx.key}/build/${s.id}` }, icon('pencil'), L('متابعة الإعداد', 'Continue editing')),
      h('span.grow'),
      h('button.btn.sm.ghost', { type: 'button', onclick: (e) => deleteDraft(e.currentTarget, s) }, icon('trash'), L('حذف', 'Delete'))));
}
function closedTable(ctx, list, { team = false } = {}) {
  return dataTable({
    caption: team ? L('استبيانات فريقي', 'Team surveys') : L('الاستبيانات المغلقة', 'Closed surveys'),
    onRow: (s) => go(ctx, 'results', s.id),
    columns: [
      { key: 'title', label: L('الاستبيان', 'Survey'), sort: (s) => s.title, render: (s) => h('div.sv-cell-title', h('strong', s.title), team ? h('span.tiny.faint', L(s.author?.name_ar, s.author?.name_en)) : h('span.tiny.faint', L(s.audience_ar, s.audience_en))) },
      { key: 'status', label: L('الحالة', 'Status'), sort: (s) => s.status, render: (s) => h('div.row-wrap.sv-gap', surveyStatus(s), anonChip(s), demoChip(s)) },
      { key: 'date', label: L('الإغلاق', 'Closes'), sort: (s) => s.closes_on, render: (s) => dateLabel(s.closes_on) },
      { key: 'rate', label: L('الاستجابة', 'Response'), num: true, sort: (s) => s.stats?.rate ?? -1, render: (s) => h('div.sv-rate-cell', h('span.num.tabular', pctText(s.stats?.rate)), h('span.tiny.faint', `${fmtNum(s.stats?.responded ?? 0)}/${fmtNum(s.stats?.eligible ?? 0)}`)) },
      { key: 'share', label: L('مشاركة النتائج', 'Shared'), render: (s) => (s.share_results ? h('span.chip.tiny.good', icon('share'), L('مع المشاركين', 'With participants')) : h('span.chip.tiny.outline', L('للمُعِدّ فقط', 'Author only'))) },
    ],
    rows: list, sortKey: 'date', sortDir: 'desc',
  });
}

// ---------------------------------------------------------------- «مشاركة فريقي»
export function renderTeam(root, ctx, data) {
  root.append(h('div.callout.sv-strip', icon('heartHandshake'), h('span.grow', L(`شجّع فريقك على المشاركة دون الضغط على أحد. لا تُعرض أسماء المشاركين، وتُخفى نسبة المشاركة لأي مجموعة أقل من ${MIN_GROUP} موظفين.`, `Encourage your team without pressuring anyone. Names are never shown, and participation is hidden for any group under ${MIN_GROUP}.`))));
  if (!data.surveys.length) {
    root.append(card(null, emptyState({ icon: 'usersRound', title: L('لا استبيانات مفتوحة لفريقك', 'No open surveys for your team'), body: L('عند نشر استبيان موجّه لإدارتك ستظهر هنا نسبة مشاركة الفريق.', 'When a survey addressed to your department opens, team participation appears here.') })));
    return;
  }
  root.append(h('div.sv-cards.two', data.surveys.map((s) => h('article.card.sv-scard',
    h('div.sv-scard-top', leftChip(s), anonChip(s), demoChip(s)),
    h('div.sv-scard-body',
      h('div.grow',
        h('h3', s.title),
        h('div.sv-scard-meta', h('span', icon('building'), L(s.author_dept_ar || '', s.author_dept_en || '')), h('span', icon('usersRound'), L(`${countAr(s.invited, ['مدعو واحد', 'مدعوان', 'مدعوين', 'مدعواً'])} من فريقك`, `${s.invited} invited from your team`))),
        s.hidden ? h('p.sv-hidden-note', icon('lockKeyhole'), L(`أقل من ${MIN_GROUP} — مخفي لحماية الخصوصية`, `Fewer than ${MIN_GROUP} — hidden to protect privacy`)) : h('p.tiny.faint', L(`شارك ${fmtNum(s.responded)} من ${fmtNum(s.invited)}`, `${s.responded} of ${s.invited} took part`))),
      s.hidden ? h('div.sv-ring.muted-ring', icon('lockKeyhole')) : ring(s.rate, { size: 84, stroke: 8, sub: L('فريقك', 'your team'), tone: s.rate >= 60 ? 'good' : 'accent' }))))));
}

// ---------------------------------------------------------------- actions
export async function remindSurvey(s) {
  const ok = await confirmDialog(L('تذكير غير المشاركين', 'Remind non-respondents'), L('سيصل تنبيه لكل مدعو لم يشارك بعد، دون أن تُعرض لك أسماؤهم. يمكن الإرسال مرة واحدة يومياً.', 'Everyone invited who has not answered yet gets an alert — their names are not shown to you. Once a day.'), { confirmLabel: L('إرسال التذكير', 'Send reminder') });
  if (!ok) return;
  const r = await act(null, () => call(`/surveys/${s.id}/remind`, { method: 'POST', body: {} }));
  if (r) toast(r.sent ? L(`أُرسل التذكير إلى ${countAr(r.sent, ['موظف واحد', 'موظفَين', 'موظفين', 'موظفاً'])}`, `Reminder sent to ${r.sent}`) : L('شارك الجميع — لا حاجة للتذكير', 'Everyone has answered'));
}
export async function duplicateSurvey(ctx, s) {
  const r = await act(null, () => call(`/surveys/${s.id}/duplicate`, { method: 'POST', body: {} }));
  if (r) { toast(L('أُنشئت مسودة جديدة من الاستبيان', 'A new draft was created')); go(ctx, 'build', r.id); }
}
export async function closeSurveyFlow(s) {
  const ok = await confirmDialog(L('إغلاق الاستبيان؟', 'Close this survey?'), L('يتوقف استقبال الإجابات نهائياً وتُعرض النتائج كاملة. لا يمكن إعادة فتحه.', 'Responses stop for good and full results are released. It cannot be reopened.'), { danger: true, confirmLabel: L('إغلاق نهائي', 'Close for good') });
  if (!ok) return null;
  return act(null, () => call(`/surveys/${s.id}/close`, { method: 'POST', body: { confirm: true } }), { success: L('أُغلق الاستبيان', 'Survey closed') });
}
async function deleteDraft(btn, s) {
  const ok = await confirmDialog(L('حذف المسودة؟', 'Delete draft?'), L(`ستُحذف المسودة «${s.title}» وأسئلتها نهائياً.`, `The draft “${s.title}” and its questions will be deleted.`), { danger: true, confirmLabel: L('حذف', 'Delete') });
  if (!ok) return;
  await act(btn, () => call(`/surveys/${s.id}`, { method: 'DELETE', body: { confirm: true } }), { success: L('حُذفت المسودة', 'Draft deleted') });
}
export async function newSurvey(ctx) {
  const v = await settingsDialog({ mode: 'create' });
  if (!v) return;
  const r = await act(null, () => call('/surveys', { method: 'POST', body: v }), { success: L('أُنشئت المسودة — أضف الأسئلة ثم انشر', 'Draft created — add questions, then publish') });
  if (r) go(ctx, 'build', r.id);
}

// ---------------------------------------------------------------- settings dialog
const TEMPLATES = [
  { key: 'blank', icon: 'filePlus', ar: 'من الصفر', en: 'From scratch', dar: 'قسم فارغ تضيف إليه أسئلتك', den: 'An empty section for your questions' },
  { key: 'pulse', icon: 'activity', ar: 'نبض الفريق', en: 'Team pulse', dar: '4 أسئلة: رضا، دعم، NPS، رأي', den: '4 questions: satisfaction, support, NPS, comment' },
  { key: 'service', icon: 'heartHandshake', ar: 'رضا عن خدمة', en: 'Service satisfaction', dar: '5 أسئلة لتقييم خدمة داخلية', den: '5 questions to rate an internal service' },
  { key: 'poll', icon: 'vote', ar: 'تصويت سريع', en: 'Quick poll', dar: 'سؤال اختيار واحد', den: 'One single-choice question' },
];
export async function settingsDialog({ mode = 'create', survey = null } = {}) {
  const depts = await departments().catch(() => []);
  const s = survey || {};
  const today = new Date().toISOString().slice(0, 10);
  const plus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const locked = mode === 'edit' && s.status !== 'draft';
  const st = { template: 'blank', audience_type: s.audience_type || 'all', audience: new Set(s.audience || []) };
  const id = (k) => `svs-${k}`;
  const title = h('input.field', { id: id('title'), maxlength: 200, value: s.title || '', required: true, disabled: locked || null, 'aria-describedby': id('title-err') });
  const desc = h('textarea.field', { id: id('desc'), rows: 3, maxlength: 2000, placeholder: L('اشرح الهدف من الاستبيان وكيف ستُستخدم نتائجه', 'Explain the purpose and how results will be used') }, s.description || '');
  const anon = h('input.switch', { type: 'checkbox', id: id('anon'), checked: s.anonymous === false ? null : true, disabled: locked || null });
  const share = h('input.switch', { type: 'checkbox', id: id('share'), checked: s.share_results ? true : null, disabled: mode === 'edit' && s.status !== 'draft' ? true : null });
  const opens = h('input.field', { type: 'date', id: id('opens'), value: s.opens_on || today, disabled: locked || null });
  const closes = h('input.field', { type: 'date', id: id('closes'), value: s.closes_on || plus(14), min: today, disabled: mode === 'edit' && s.status === 'closed' ? true : null });
  const audBox = h('div.sv-aud-box');
  const audSeg = h('div.tabs.sv-seg', { role: 'radiogroup', 'aria-label': L('الجمهور المستهدف', 'Audience') });
  const drawAud = () => {
    audSeg.replaceChildren(...[['all', L('جميع الموظفين', 'All staff')], ['departments', L('إدارات محددة', 'Departments')], ['roles', L('حسب الدور', 'By role')]].map(([k, lbl]) => h(`button${st.audience_type === k ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(st.audience_type === k), disabled: locked || null, onclick: () => { st.audience_type = k; st.audience = new Set(); drawAud(); } }, lbl)));
    const opts = st.audience_type === 'departments' ? depts.map((d) => ({ value: d.id, label: L(d.name_ar, d.name_en) })) : st.audience_type === 'roles' ? [['employee', 'الموظفون', 'Employees'], ['manager', 'المديرون', 'Managers'], ['president', 'الرئيس', 'President']].map(([v, a, e]) => ({ value: v, label: L(a, e) })) : [];
    audBox.replaceChildren(...[opts.length ? h('div.check-list', { role: 'group', 'aria-label': L('اختر الجمهور', 'Choose the audience') }, opts.map((o) => h('label.check-label', h('input', { type: 'checkbox', value: o.value, checked: st.audience.has(o.value) || null, disabled: locked || null, onchange: (e) => { e.target.checked ? st.audience.add(o.value) : st.audience.delete(o.value); } }), o.label))) : h('p.tiny.faint', L('يصل الاستبيان إلى جميع موظفي الجهة (دون الجهات الخارجية).', 'Every staff member receives it (never external parties).')),
      st.audience_type === 'departments' ? h('p.tiny.faint', L('اختيار إدارة يشمل الأقسام التابعة لها.', 'A department includes its sub-units.')) : null].filter(Boolean));
  };
  drawAud();
  const tplGrid = mode === 'create' ? h('div.sv-tpl-grid', { role: 'radiogroup', 'aria-label': L('ابدأ من', 'Start from') }, TEMPLATES.map((t) => h(`button.sv-tpl${t.key === st.template ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(t.key === st.template), onclick: (e) => { st.template = t.key; tplGrid.querySelectorAll('.sv-tpl').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); } },
    h('span.sv-tpl-ic', icon(t.icon)), h('span.sv-tpl-t', L(t.ar, t.en)), h('span.sv-tpl-d', L(t.dar, t.den))))) : null;
  const err = h('div.error-text', { id: id('title-err'), 'aria-live': 'polite' });
  const body = h('div.sv-settings',
    locked ? h('div.callout', icon('lock'), h('span', L('بعد النشر تُقفل العناوين والجمهور وإعداد إخفاء الهوية؛ يمكنك تعديل الوصف وتاريخ الإغلاق.', 'After publishing, title, audience and anonymity are locked; you can edit the description and close date.'))) : null,
    tplGrid ? h('div.form-row', h('span.lbl', L('ابدأ من', 'Start from')), tplGrid) : null,
    h('div.form-row', h('label.lbl', { for: id('title') }, L('عنوان الاستبيان', 'Survey title'), h('span.req', { 'aria-hidden': 'true' }, ' *')), title, err),
    h('div.form-row', h('label.lbl', { for: id('desc') }, L('الوصف', 'Description')), desc),
    h('div.form-row', h('span.lbl', L('الجمهور المستهدف', 'Audience')), audSeg, audBox),
    h('div.form-grid', h('div.form-row', h('label.lbl', { for: id('opens') }, L('يُفتح في', 'Opens on')), opens), h('div.form-row', h('label.lbl', { for: id('closes') }, L('يُغلق في', 'Closes on')), closes)),
    h('label.sv-switch-row', { for: id('anon') }, h('span.grow', h('strong', L('إجابات مجهولة الهوية', 'Anonymous answers')), h('span.tiny.faint', L('موصى به. لا تُحفظ هوية المشارك مع إجاباته ولا يمكن تغييره بعد النشر.', 'Recommended. Identity is never stored with answers; cannot change after publishing.'))), anon),
    h('label.sv-switch-row', { for: id('share') }, h('span.grow', h('strong', L('مشاركة النتائج مع المشاركين بعد الإغلاق', 'Share results with participants after closing')), h('span.tiny.faint', L('يرى المشاركون النتائج المجمّعة فقط — دون أي تعليق نصي.', 'Participants see aggregates only — never comments.'))), share));
  let out = null;
  const ok = await modal(mode === 'create' ? L('استبيان جديد', 'New survey') : L('إعدادات الاستبيان', 'Survey settings'), body,
    [{ label: L('إلغاء', 'Cancel'), value: false }, { label: mode === 'create' ? L('إنشاء المسودة', 'Create draft') : L('حفظ', 'Save'), value: true, primary: true }], {
      wide: true,
      beforeClose: () => {
        const t = title.value.trim();
        err.textContent = t.length < 3 ? L('اكتب عنواناً من 3 أحرف على الأقل', 'Enter a title of at least 3 characters') : '';
        if (t.length < 3) { title.setAttribute('aria-invalid', 'true'); title.focus(); return false; }
        if (st.audience_type !== 'all' && !st.audience.size) { toast(L('اختر الجمهور المستهدف', 'Choose the audience'), { kind: 'error' }); return false; }
        if (closes.value && opens.value && closes.value < opens.value) { toast(L('تاريخ الإغلاق قبل تاريخ الفتح', 'Close date is before the open date'), { kind: 'error' }); closes.focus(); return false; }
        const v = { description: desc.value.trim(), closes_on: closes.value || undefined };
        if (!locked) Object.assign(v, { title: t, anonymous: anon.checked, audience_type: st.audience_type, audience: [...st.audience], opens_on: opens.value || undefined });
        if (mode === 'create') { v.template = st.template; v.share_results = share.checked; }
        else if (s.status === 'draft') v.share_results = share.checked;
        if (s.status === 'closed') { delete v.closes_on; }
        out = v; return true;
      },
    });
  return ok ? out : null;
}
