// Meetings — «القادمة» landing: a hero that answers "what next?" with today's
// timeline, the next two weeks grouped by day, a mini calendar, what is waiting
// for me (RSVPs, minutes, action items) and — for managers — meeting-governance
// aggregates without names.
import { h, icon, toast, skeleton, errorState, emptyState, plural, act, statusChip, fmtNum, L, go } from '../../../sys-kit.js';
import * as C from './common.js';

const ui = { day: null };

export async function render(root, ctx, tab) {
  const page = h('div.mt-page');
  root.append(page);
  const sel = ctx.params[1] || null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sel || '') ? sel : null;
  const month = day ? day.slice(0, 7) : /^\d{4}-\d{2}$/.test(sel || '') ? sel : C.todayLocal().slice(0, 7);
  const load = () => Promise.all([
    C.call(`/overview?tz=${C.tz()}`),
    C.call(`/calendar?month=${month}&tz=${C.tz()}`),
    day ? C.call(`/meetings?from=${day}&to=${C.addDays(day, 1)}&tz=${C.tz()}`) : null,
  ]).then(([o, cal, dayList]) => paint(page, ctx, tab, { o, cal, day, dayList, month }))
    .catch((e) => C.fill(page, ...C.shell(ctx, tab, { actions: [newAction(ctx, [])] }), h('section.card', errorState(e, () => { paintSkeleton(page, ctx, tab); load(); }))));
  if (ctx.soft) { await load(); return; }
  paintSkeleton(page, ctx, tab);
  load();
}

function paintSkeleton(page, ctx, tab) {
  C.fill(page, ...C.shell(ctx, tab, { actions: [newAction(ctx, [])] }),
    h('section.card.mt-hero.is-skel', skeleton('card')),
    h('div.mt-layout', h('div.mt-main', h('section.card', skeleton('list', 5))), h('aside.mt-side', h('section.card', skeleton('chart')), h('section.card', skeleton('list', 3)))));
}

const newAction = (ctx, committees, preset = {}) => ({ label: L('اجتماع جديد', 'New meeting'), icon: 'calendarPlus', primary: true, onClick: () => createMeeting(ctx, committees, preset) });
export async function createMeeting(ctx, committees, preset = {}) {
  const v = await C.composer({ committees, preset });
  if (!v) return;
  try {
    const m = await C.call('/meetings', { method: 'POST', body: v });
    toast(L('جُدول الاجتماع وأُرسلت الدعوات', 'Meeting scheduled and invitations sent'));
    go(ctx, 'm', m.id);
  } catch (e) { C.toastErr(e); }
}

function paint(page, ctx, tab, { o, cal, day, dayList, month }) {
  const inboxCount = o.inbox.rsvp.length + o.inbox.review.length + o.inbox.circulate.filter((m) => m.ended).length + o.inbox.accept.length;
  C.fill(page, 
    ...C.shell(ctx, tab, { counts: { upcoming: o.today_meetings.filter((m) => m.status === 'scheduled').length, decisions: o.inbox.accept.length + o.inbox.actions.length }, actions: [newAction(ctx, o.committees)] }),
    hero(ctx, o),
    h('div.mt-layout',
      h('div.mt-main',
        day ? dayCard(ctx, o, day, dayList) : null,
        agenda(ctx, o)),
      h('aside.mt-side', { 'aria-label': L('لوحة جانبية', 'Side panel') },
        miniCalendar(ctx, cal, day, month),
        inbox(ctx, o, inboxCount),
        o.governance ? governance(o.governance) : null,
        o.committees.length ? myCommittees(o.committees) : null,
        recent(o.recent))));
}

// ---------------- hero ----------------
function nextStep(o) {
  const live = o.today_meetings.find((m) => m.phase === 'live' && m.my.rsvp !== 'declined');
  if (live) return { tone: 'live', icon: 'circleDot', eyebrow: L('جارٍ الآن', 'Happening now'), text: C.titleOf(live), label: L('افتح جدول الأعمال', 'Open the agenda'), href: `#/sys/meetings/m/${live.id}` };
  const circ = o.inbox.circulate.find((m) => m.ended);
  if (circ) return { tone: 'warn', icon: 'send', eyebrow: L('محضر ينتظر التعميم', 'Minutes to circulate'), text: C.titleOf(circ), label: L('أكمل المحضر وعمّمه', 'Finish & circulate the minutes'), href: `#/sys/meetings/m/${circ.id}/minutes` };
  const rev = o.inbox.review[0];
  if (rev) return { tone: 'warn', icon: 'fileCheck', eyebrow: L('محضر بانتظار اعتمادك', 'Minutes awaiting your approval'), text: C.titleOf(rev), label: L('راجع المحضر', 'Review the minutes'), href: `#/sys/meetings/m/${rev.id}/minutes` };
  const acc = o.inbox.accept[0];
  if (acc) return { tone: 'warn', icon: 'hourglass', eyebrow: L('تكليف بانتظار قبولك', 'Action item awaiting you'), text: acc.title || L('تكليف من اجتماع سري', 'Action from a restricted meeting'), label: L('قرّر بشأن التكليف', 'Respond to the action item'), href: `#/sys/meetings/m/${acc.meeting.id}/actions` };
  const rsvp = o.inbox.rsvp[0];
  if (rsvp) return { tone: 'info', icon: 'mailCheck', eyebrow: L('دعوة بانتظار ردّك', 'Invitation awaiting reply'), text: C.titleOf(rsvp), label: L('ردّ على الدعوة', 'Reply to the invitation'), href: `#/sys/meetings/m/${rsvp.id}` };
  const next = [...o.today_meetings, ...o.upcoming].find((m) => m.phase === 'upcoming' && m.status === 'scheduled' && m.my.rsvp !== 'declined');
  if (next) return { tone: 'calm', icon: 'calendarCheck', eyebrow: L('استعد لاجتماعك القادم', 'Prepare for your next meeting'), text: C.titleOf(next), label: L('اطّلع على جدول الأعمال', 'See the agenda'), href: `#/sys/meetings/m/${next.id}` };
  return { tone: 'calm', icon: 'calendarPlus', eyebrow: L('لا شيء بانتظارك', 'Nothing waiting for you'), text: L('جدولك خالٍ؛ يمكنك تنظيم اجتماع جديد.', 'Your calendar is clear; you can schedule a meeting.'), label: null };
}

function hero(ctx, o) {
  const todays = o.today_meetings.filter((m) => m.status === 'scheduled');
  const active = todays.filter((m) => m.my.rsvp !== 'declined');
  const upcomingToday = active.filter((m) => m.phase !== 'ended');
  const step = nextStep(o);
  const next = upcomingToday.find((m) => m.phase === 'upcoming');
  const live = upcomingToday.find((m) => m.phase === 'live');
  const title = !todays.length ? L('لا اجتماعات اليوم', 'No meetings today')
    : L(`لديك ${plural(active.length, ['اجتماع واحد', 'اجتماعان', 'اجتماعات', 'اجتماعاً'])} اليوم`, `You have ${active.length} ${active.length === 1 ? 'meeting' : 'meetings'} today`);
  const sub = live ? L(`جارٍ الآن حتى ${C.time(live.ends_at)}`, `In progress until ${C.time(live.ends_at)}`)
    : next ? L(`التالي ${C.until(next.starts_at)} — ${C.titleOf(next)}`, `Next ${C.until(next.starts_at)} — ${C.titleOf(next)}`)
      : todays.length ? L('انتهت اجتماعات اليوم', 'Today’s meetings are over') : o.upcoming[0] ? L(`أقرب اجتماع ${C.relDay(C.localDay(o.upcoming[0].starts_at))} الساعة ${C.time(o.upcoming[0].starts_at)}`, `Next meeting ${C.relDay(C.localDay(o.upcoming[0].starts_at))} at ${C.time(o.upcoming[0].starts_at)}`) : L('لا اجتماعات خلال الأسبوعين القادمين', 'Nothing in the next two weeks');
  const liveLink = live?.virtual ? live : null;
  const pills = [
    o.inbox.rsvp.length ? pill('mailCheck', L(`${plural(o.inbox.rsvp.length, ['دعوة', 'دعوتان', 'دعوات', 'دعوة'])} بانتظار ردّك`, `${o.inbox.rsvp.length} ${o.inbox.rsvp.length === 1 ? 'invitation' : 'invitations'} to answer`), '#inbox') : null,
    o.inbox.review.length ? pill('fileCheck', L(`${plural(o.inbox.review.length, ['محضر', 'محضران', 'محاضر', 'محضراً'])} للاعتماد`, `${o.inbox.review.length} ${o.inbox.review.length === 1 ? 'set' : 'sets'} of minutes to approve`), `#/sys/meetings/m/${o.inbox.review[0].id}/minutes`) : null,
    o.inbox.actions.length ? pill('listChecks', L(`${plural(o.inbox.actions.length, ['تكليف مفتوح', 'تكليفان مفتوحان', 'تكليفات مفتوحة', 'تكليفاً مفتوحاً'])}`, `${o.inbox.actions.length} open action ${o.inbox.actions.length === 1 ? 'item' : 'items'}`), '#/sys/meetings/decisions') : null,
  ].filter(Boolean);
  return h(`section.card.mt-hero.${step.tone}`, { 'aria-labelledby': 'mt-hero-title' },
    h('div.mt-hero-top',
      h('div.mt-hero-text',
        h('span.eyebrow', `${C.weekday(o.today)} · ${C.dayMonth(o.today)}`),
        h('h2.mt-hero-title#mt-hero-title', title),
        h('p.mt-hero-sub', sub),
        pills.length ? h('div.mt-pills', pills) : null),
      h('div.mt-next', { role: 'group', 'aria-label': L('الخطوة التالية', 'Next step') },
        h('div.mt-next-row', h('span.mt-next-ic', icon(step.icon)), h('div.grow', h('span.mt-next-eyebrow', step.eyebrow), h('span.mt-next-text', step.text))),
        h('div.mt-next-actions',
          step.label ? h('a.btn.primary', { href: step.href }, step.label, icon('chevron', 'flip-rtl')) : h('button.btn.primary', { type: 'button', onclick: () => createMeeting(ctx, o.committees) }, icon('calendarPlus'), L('اجتماع جديد', 'New meeting')),
          liveLink ? h('a.btn', { href: `#/sys/meetings/m/${liveLink.id}`, 'data-tip': L('رابط الاجتماع الافتراضي في صفحة الاجتماع', 'The virtual link is on the meeting page') }, icon('link'), L('الانضمام عن بُعد', 'Join online')) : null))),
    dayTimeline(todays));
}
const pill = (ic, text, href) => h('a.mt-pill', { href: href.startsWith('#/') ? href : null, onclick: href.startsWith('#/') ? null : (e) => { e.preventDefault(); document.getElementById('mt-inbox')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } , role: href.startsWith('#/') ? null : 'button', tabindex: 0 }, icon(ic), text);

// Today's timeline: blocks positioned by time (inline style only for the dynamic geometry).
function dayTimeline(list) {
  if (!list.length) {
    return h('div.mt-timeline.empty', h('div.mt-tl-empty', icon('sun'), h('span', L('يوم بلا اجتماعات — وقت مثالي للعمل المركّز', 'A meeting-free day — ideal for focused work'))));
  }
  const hourOf = (iso) => { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60; };
  let from = 8; let to = 18;
  for (const m of list) { from = Math.min(from, Math.floor(hourOf(m.starts_at))); to = Math.max(to, Math.ceil(hourOf(m.ends_at) + (C.localDay(m.ends_at) !== C.localDay(m.starts_at) ? 24 : 0))); }
  to = Math.min(24, to); const range = to - from;
  const pos = (hr) => `${((hr - from) / range) * 100}%`;
  // lanes: a block needs room for its title, so short meetings reserve a minimum visual span
  const minSpan = range * 0.22;
  const lanes = [];
  const items = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((m) => {
    const s = hourOf(m.starts_at); const e = Math.max(s + minSpan, hourOf(m.ends_at) || 24);
    let lane = lanes.findIndex((end) => end <= s);
    if (lane < 0) { lanes.push(e); lane = lanes.length - 1; } else lanes[lane] = e;
    return { m, lane };
  });
  const nowHr = hourOf(new Date().toISOString());
  const ticks = []; for (let t = from; t <= to; t += range > 12 ? 3 : 2) ticks.push(t);
  return h('div.mt-timeline', { role: 'list', 'aria-label': L('خط اجتماعات اليوم', 'Today’s meeting timeline'), 'data-lanes': String(lanes.length) },
    h('div.mt-tl-grid', { 'aria-hidden': 'true' }, ticks.map((t) => h('span.mt-tl-tick', { style: { insetInlineStart: pos(t) } }, h('i'), h('b.num', `${String(t % 24).padStart(2, '0')}:00`)))),
    h('div.mt-tl-track', items.map(({ m, lane }) => {
      const s = hourOf(m.starts_at); const e = Math.max(s + minSpan, hourOf(m.ends_at) || 24);
      return h(`a.mt-tl-block.t-${m.type}${m.phase === 'live' ? '.live' : ''}${m.phase === 'ended' ? '.past' : ''}${m.my.rsvp === 'declined' ? '.declined' : ''}${m.masked ? '.masked' : ''}`,
        { href: `#/sys/meetings/m/${m.id}`, role: 'listitem', style: { insetInlineStart: pos(s), width: `${((e - s) / range) * 100}%`, top: `calc(${lane} * var(--mt-lane))` },
          'aria-label': `${C.span(m)} — ${C.titleOf(m)}`, 'data-tip': `${C.span(m)} · ${C.titleOf(m)}${m.location ? ` · ${m.location}` : ''}` },
        h('span.mt-tl-time.num', C.time(m.starts_at)), h('span.mt-tl-title', m.masked ? icon('lockKeyhole') : null, C.titleOf(m)));
    }), nowHr >= from && nowHr <= to ? h('span.mt-tl-now', { style: { insetInlineStart: pos(nowHr) }, 'aria-label': L('الآن', 'Now') }, h('b', L('الآن', 'Now'))) : null));
}

// ---------------- agenda (next 14 days, grouped by day) ----------------
export function meetingRow(m, { showDay = false } = {}) {
  const needsReply = m.my.rsvp === 'pending' && m.my.role !== 'organizer' && m.status === 'scheduled' && m.phase !== 'ended';
  return h(`a.mt-row${m.status === 'cancelled' ? '.cancelled' : ''}${m.my.rsvp === 'declined' ? '.declined' : ''}`, { href: `#/sys/meetings/m/${m.id}` },
    h('div.mt-row-time', showDay ? h('span.mt-row-day', `${C.weekday(C.localDay(m.starts_at))} ${C.dayMonth(C.localDay(m.starts_at))}`) : null, h('strong.num', C.time(m.starts_at)), h('span.num', C.time(m.ends_at))),
    h(`span.mt-rail.t-${m.type}`, { 'aria-hidden': 'true' }),
    h('div.mt-row-main',
      h('div.mt-row-title', m.masked ? h('span.mt-mask-ic', { 'data-tip': C.maskedTip }, icon('lockKeyhole')) : null, h('span', { dir: 'auto' }, C.titleOf(m))),
      h('div.mt-row-meta',
        C.chip(C.TYPE, m.type),
        m.status === 'cancelled' ? C.chip(C.PHASE, 'cancelled') : m.phase === 'live' ? C.chip(C.PHASE, 'live') : null,
        m.masked ? C.lockChip() : null,
        m.location ? h('span.mt-meta-item', icon('mapPin'), m.location) : m.virtual ? h('span.mt-meta-item', icon('link'), L('عن بُعد', 'Online')) : null,
        h('span.mt-meta-item', icon('user'), C.person(m.organizer)),
        C.demoChip(m))),
    h('div.mt-row-end',
      C.avatarStack(m.people, { total: m.counts.invited }),
      needsReply ? h('span.chip.tiny.warn', icon('mailCheck'), L('بانتظار ردّك', 'Reply needed')) : m.my.role !== 'attendee' ? C.chip(C.ROLE, m.my.role) : C.chip(C.RSVP, m.my.rsvp)));
}

function agenda(ctx, o) {
  const groups = new Map();
  for (const m of o.upcoming) { const d = C.localDay(m.starts_at); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(m); }
  const card = h('section.card.mt-agenda', { 'aria-labelledby': 'mt-ag-title' },
    h('div.card-head', h('h2.card-title#mt-ag-title', L('الأسبوعان القادمان', 'Next two weeks')), h('span.card-sub', L(`${fmtNum(o.upcoming.length)} اجتماع`, `${o.upcoming.length} meetings`))));
  if (!groups.size) {
    card.append(emptyState({ icon: 'calendarCheck', title: L('لا اجتماعات قادمة', 'No upcoming meetings'), body: L('عندما تُدعى إلى اجتماع أو تنظّمه سيظهر هنا مرتباً حسب اليوم.', 'Meetings you organize or are invited to appear here, grouped by day.'), actions: [{ label: L('جدولة اجتماع', 'Schedule a meeting'), primary: true, icon: 'calendarPlus', onClick: () => createMeeting(ctx, o.committees) }] }));
    return card;
  }
  for (const [d, list] of groups) {
    card.append(h('div.mt-day',
      h('div.mt-day-head', h('span.mt-day-name', C.weekday(d)), h('span.mt-day-date', C.dayMonth(d)), h('span.chip.tiny.outline', C.relDay(d)), h('span.grow'), list.length > 1 ? h('span.tiny.faint', L(`${fmtNum(list.length)} اجتماعات`, `${list.length} meetings`)) : null),
      h('div.mt-day-list', list.map((m) => meetingRow(m)))));
  }
  return card;
}

function dayCard(ctx, o, day, list) {
  return h('section.card.mt-daycard', { 'aria-labelledby': 'mt-dc-title' },
    h('div.card-head', h('h2.card-title#mt-dc-title', `${C.weekday(day)} ${C.dayMonth(day)}`), h('span.chip.tiny.outline', C.relDay(day)),
      h('button.btn.sm.tertiary', { type: 'button', onclick: () => createMeeting(ctx, o.committees, { date: day }) }, icon('calendarPlus'), L('اجتماع في هذا اليوم', 'Meeting on this day')),
      h('a.icon-btn', { href: '#/sys/meetings/upcoming', 'aria-label': L('إلغاء تحديد اليوم', 'Clear the selected day') }, icon('x'))),
    list?.length ? h('div.mt-day-list', list.map((m) => meetingRow(m))) : h('p.muted.mt-dc-empty', L('لا اجتماعات لك في هذا اليوم.', 'No meetings for you on this day.')));
}

// ---------------- side: mini calendar ----------------
function miniCalendar(ctx, cal, day, month) {
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const startDow = first.getDay(); // 0 = Sunday (regional week starts on Sunday)
  const daysIn = new Date(y, mo, 0).getDate();
  const today = C.todayLocal();
  const prev = new Date(y, mo - 2, 1); const next = new Date(y, mo, 1);
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const names = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'ar-AE', { weekday: 'narrow' }));
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(h('span.mt-cal-cell.pad', { 'aria-hidden': 'true' }));
  for (let dnum = 1; dnum <= daysIn; dnum++) {
    const d = `${month}-${String(dnum).padStart(2, '0')}`;
    const n = cal.days[d] || 0;
    const dow = new Date(y, mo - 1, dnum).getDay();
    cells.push(h(`a.mt-cal-cell${d === today ? '.today' : ''}${d === day ? '.sel' : ''}${dow === 5 || dow === 6 ? '.we' : ''}${n ? '.has' : ''}`,
      { href: d === day ? '#/sys/meetings/upcoming' : `#/sys/meetings/upcoming/${d}`, 'aria-label': `${C.weekday(d)} ${C.dayMonth(d)}${n ? L(` — ${fmtNum(n)} اجتماع`, ` — ${n} meetings`) : ''}`, 'aria-current': d === today ? 'date' : null, 'aria-pressed': d === day ? 'true' : null },
      h('span.num', fmtNum(dnum)), n ? h('span.mt-cal-dots', { 'aria-hidden': 'true' }, Array.from({ length: Math.min(3, n) }, () => h('i'))) : null));
  }
  return h('section.card.mt-cal', { 'aria-labelledby': 'mt-cal-title' },
    h('div.mt-cal-head',
      h('a.icon-btn', { href: `#/sys/meetings/upcoming/${ym(prev)}`, 'aria-label': L('الشهر السابق', 'Previous month') }, icon('chevronL', 'flip-rtl')),
      h('h2.mt-cal-title#mt-cal-title', C.monthTitle(month)),
      h('a.icon-btn', { href: `#/sys/meetings/upcoming/${ym(next)}`, 'aria-label': L('الشهر التالي', 'Next month') }, icon('chevron', 'flip-rtl'))),
    h('div.mt-cal-grid', { role: 'grid', 'aria-label': C.monthTitle(month) }, names.map((n) => h('span.mt-cal-dow', { 'aria-hidden': 'true' }, n)), cells),
    month !== today.slice(0, 7) || day ? h('a.btn.sm.ghost.mt-cal-today', { href: '#/sys/meetings/upcoming' }, icon('calendarCheck'), L('العودة إلى اليوم', 'Back to today')) : null);
}

// ---------------- side: waiting for me ----------------
function inbox(ctx, o, count) {
  const card = h('section.card.mt-inbox#mt-inbox', { 'aria-labelledby': 'mt-inbox-title' },
    h('div.card-head', h('h2.card-title#mt-inbox-title', L('بانتظارك', 'Waiting for you')), count ? h('span.chip.tiny.purple', fmtNum(count)) : null));
  if (!count) {
    card.append(h('div.mt-allclear', icon('circleCheck'), h('span', L('لا شيء بانتظارك — أحسنت!', 'All clear — nicely done!'))));
    return card;
  }
  const section = (title, items) => (items.length ? h('div.mt-inbox-sec', h('div.mt-inbox-sec-title', title), h('ul.mt-inbox-list', items)) : null);
  const rsvpBtns = (m) => h('div.mt-rsvp-mini', { role: 'group', 'aria-label': L('الرد على الدعوة', 'Reply') },
    h('button.btn.sm.tertiary', { type: 'button', onclick: (e) => reply(e.currentTarget, m, 'accepted') }, icon('check'), L('قبول', 'Accept')),
    h('button.btn.sm.ghost', { type: 'button', onclick: (e) => reply(e.currentTarget, m, 'tentative') }, L('ربما', 'Maybe')),
    h('button.btn.sm.ghost', { type: 'button', onclick: (e) => reply(e.currentTarget, m, 'declined') }, L('اعتذار', 'Decline')));
  C.fill(card, [...card.childNodes],
    section(L('دعوات بانتظار ردّك', 'Invitations to answer'), o.inbox.rsvp.map((m) => h('li.mt-inbox-item',
      h('a.mt-inbox-link', { href: `#/sys/meetings/m/${m.id}` }, h('span.mt-inbox-title', m.masked ? icon('lockKeyhole') : null, C.titleOf(m)), h('span.mt-inbox-meta', `${C.relDay(C.localDay(m.starts_at))} · ${C.time(m.starts_at)}`)), rsvpBtns(m)))),
    section(L('محاضر للاعتماد', 'Minutes to approve'), o.inbox.review.map((m) => h('li.mt-inbox-item', h('a.mt-inbox-link', { href: `#/sys/meetings/m/${m.id}/minutes` }, h('span.mt-inbox-title', m.masked ? icon('lockKeyhole') : null, C.titleOf(m)), h('span.mt-inbox-meta', L('راجع واعتمد أو أضف ملاحظة', 'Review, approve or comment')))))),
    section(L('محاضر عليك إكمالها', 'Minutes you need to finish'), o.inbox.circulate.filter((m) => m.ended).map((m) => h('li.mt-inbox-item', h('a.mt-inbox-link', { href: `#/sys/meetings/m/${m.id}/minutes` }, h('span.mt-inbox-title', m.masked ? icon('lockKeyhole') : null, C.titleOf(m)),
      h('span.mt-inbox-meta', m.due_day < C.todayLocal() ? h('span.mt-late', L(`متأخر — كان التعميم مستحقاً ${C.dayMonth(m.due_day)}`, `Late — was due ${C.dayMonth(m.due_day)}`)) : L(`عمّمه قبل نهاية ${C.weekday(m.due_day)} ${C.dayMonth(m.due_day)}`, `Circulate by ${C.weekday(m.due_day)} ${C.dayMonth(m.due_day)}`)))))),
    section(L('تكليفات بانتظار قبولك', 'Action items to accept'), o.inbox.accept.map((a) => h('li.mt-inbox-item', h('a.mt-inbox-link', { href: `#/sys/meetings/m/${a.meeting.id}/actions` }, h('span.mt-inbox-title', a.masked ? icon('lockKeyhole') : null, a.title || L('تكليف من اجتماع سري', 'Action from a restricted meeting')), h('span.mt-inbox-meta', a.due_date ? L(`الاستحقاق ${C.dayMonth(a.due_date)}`, `Due ${C.dayMonth(a.due_date)}`) : L('بلا تاريخ استحقاق', 'No due date')))))));
  return card;
}
async function reply(btn, m, response) {
  let note;
  if (response === 'declined') {
    const r = await C.confirmWithReason(L('الاعتذار عن الحضور', 'Decline the invitation'), L(`سيُبلَّغ المنظّم باعتذارك عن «${C.titleOf(m)}».`, `The organizer will be told you can’t attend “${C.titleOf(m)}”.`), { danger: false, confirmLabel: L('إرسال الاعتذار', 'Send'), reasonLabel: m.my.required ? L('سبب الاعتذار (مطلوب لحضور إلزامي)', 'Reason (required attendance)') : L('ملاحظة للمنظّم (اختياري)', 'Note to the organizer (optional)'), required: m.my.required });
    if (!r) return; note = r.reason || undefined;
  }
  await act(btn, () => C.call(`/meetings/${m.id}/rsvp`, { method: 'POST', body: { response, note } }), { success: response === 'accepted' ? L('أكدت حضورك', 'Attendance confirmed') : response === 'tentative' ? L('سُجّل ردّك: ربما', 'Marked as tentative') : L('أُرسل اعتذارك', 'Your apology was sent') });
}

// ---------------- side: governance (managers) ----------------
function governance(g) {
  const t = g.total;
  const body = t.suppressed
    ? h('p.muted.tiny', L(`تظهر المؤشرات عند توفر ${g.min_group.meetings} اجتماعات على الأقل لمنظّمَين مختلفين خلال ${g.window_days} يوماً، حمايةً للخصوصية.`, `Shown once there are at least ${g.min_group.meetings} meetings by ${g.min_group.organizers}+ organizers in ${g.window_days} days, to protect privacy.`))
    : h('div.mt-gov',
      h('div.mt-gov-kpi', h('span.num', `${fmtNum(t.minutes_on_time_pct)}%`), h('span', L('محاضر عُمّمت خلال يومَي عمل', 'Minutes circulated within 2 working days'))),
      h('div.progress.mt-gov-bar', { role: 'progressbar', 'aria-valuenow': t.minutes_on_time_pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L('نسبة التعميم في الموعد', 'On-time circulation') }, h('i', { style: { width: `${t.minutes_on_time_pct}%` } })),
      h('dl.sys-kv.mt-gov-kv',
        h('dt', L('اجتماعات منعقدة', 'Meetings held')), h('dd.num', fmtNum(t.meetings)),
        h('dt', L('محاضر معتمدة', 'Minutes approved')), h('dd.num', `${fmtNum(t.minutes_approved_pct)}%`),
        h('dt', L('تكليفات مفتوحة', 'Open action items')), h('dd.num', fmtNum(t.actions_open)),
        h('dt', L('تكليفات متأخرة', 'Overdue action items')), h('dd.num', { class: t.actions_overdue ? 'mt-late' : '' }, fmtNum(t.actions_overdue))));
  const depts = g.by_department?.filter((d) => !d.suppressed) || [];
  return h('section.card.mt-govcard', { 'aria-labelledby': 'mt-gov-title' },
    h('div.card-head', h('h2.card-title#mt-gov-title', g.scope === 'organisation' ? L('حوكمة الاجتماعات في الجهة', 'Meeting governance — organisation') : L('حوكمة اجتماعات إدارتك', 'Meeting governance — your department')), h('span.chip.tiny.outline', L(`${g.window_days} يوماً`, `${g.window_days} days`))),
    body,
    depts.length ? h('ul.mt-gov-depts', depts.map((d) => h('li', h('span.grow', L(d.department.name_ar, d.department.name_en)), h('span.num.tiny', `${fmtNum(d.minutes_on_time_pct)}%`)))) : null,
    h('p.tiny.faint.mt-gov-note', icon('shield'), L('مؤشرات مجمّعة بلا أسماء أو عناوين، ولا تشمل الاجتماعات السرية.', 'Aggregates only — no names or titles; restricted meetings excluded.')));
}

function myCommittees(list) {
  return h('section.card.mt-mycm', { 'aria-labelledby': 'mt-mycm-title' },
    h('div.card-head', h('h2.card-title#mt-mycm-title', L('لجاني', 'My committees')), h('a.btn.sm.ghost', { href: '#/sys/meetings/committees' }, L('الكل', 'All'))),
    h('ul.mt-mycm-list', list.map((c) => h('li', h('a', { href: `#/sys/meetings/committees/${c.id}` }, icon('landmark'), h('span.grow', L(c.name_ar, c.name_en)), c.confidential ? h('span.mt-mask-ic', icon('lockKeyhole')) : null, C.chip(C.ROLE, c.role))))));
}

function recent(list) {
  return h('section.card.mt-recent', { 'aria-labelledby': 'mt-recent-title' },
    h('div.card-head', h('h2.card-title#mt-recent-title', L('اجتماعات سابقة', 'Recent meetings'))),
    list.length ? h('ul.mt-recent-list', list.map((m) => h('li', h('a', { href: `#/sys/meetings/m/${m.id}` },
      h('span.mt-recent-date', h('b.num', new Date(m.starts_at).getDate()), h('small', new Date(m.starts_at).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'ar-AE', { month: 'short' }))),
      h('span.grow.mt-recent-title', m.masked ? icon('lockKeyhole') : null, C.titleOf(m)),
      statusChip(m.minutes_status, C.MINUTES))))) : h('p.muted.tiny', L('لا اجتماعات خلال الأسابيع الماضية.', 'No meetings in the past weeks.')));
}
void ui;
