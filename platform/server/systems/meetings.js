// Meetings — نظام الاجتماعات.
// Scheduling, agendas (linked to the organizer's Documents), minutes per agenda
// item with a draft → circulated → approved lifecycle, numbered decisions,
// action items that become real tasks, attendance and committee quorum.
// Isolation: a meeting (existence included) is visible only to its organizer,
// secretary and invitees. Restricted meetings are logged on every view/change,
// masked everywhere outside their logged detail view and never reach Ask AI.
// Implementation: meetings/service.js (rules), meetings/data.js (schema + demo
// seed), meetings/assistant.js (Ask AI tools + intents).
import { defineSystem } from './registry.js';
import * as K from './kit.js';
import * as svc from './meetings/service.js';
import { schema, seed } from './meetings/data.js';
import { tools, intents, agent } from './meetings/assistant.js';

const { S, str, int, bool, arr, date, wrap, check } = K;

// Integration & Control Center calendar feed (restricted meetings flagged so the feed masks them).
export const upcomingForUser = svc.upcomingForUser;

// ---------------------------------------------------------------- request schemas
const TYPE = str('type', { enum: Object.keys(svc.TYPES) });
const ISO = (d) => str(d, { maxLength: 40 });
const CREATE = S({
  title: str('title', { maxLength: 200 }), type: TYPE, committee_id: str('committee'), project_id: str('project'), description: str('description', { maxLength: 2000 }),
  starts_at: ISO('ISO start'), ends_at: ISO('ISO end'), duration_min: int('minutes', { minimum: 15, maximum: 720 }),
  location: str('location', { maxLength: 200 }), virtual_link: str('https link', { maxLength: 500 }), confidential: bool('restricted'), secretary_id: str('secretary'),
  attendees: arr(S({ user_id: str('user'), required: bool('required') }, ['user_id']), { maxItems: 60 }), attendee_ids: arr(str('user'), { maxItems: 60 }),
  agenda: arr(S({ title: str('title', { maxLength: 300 }), presenter_id: str('presenter'), duration_min: int('minutes', { minimum: 5, maximum: 240 }) }, ['title']), { maxItems: 30 }),
}, ['title', 'starts_at']);
const UPDATE = S({ title: str('title', { maxLength: 200 }), description: str('description', { maxLength: 2000 }), starts_at: ISO('ISO start'), ends_at: ISO('ISO end'), duration_min: int('minutes', { minimum: 15, maximum: 720 }),
  location: str('location', { maxLength: 200 }), virtual_link: str('link', { maxLength: 500 }), secretary_id: str('secretary'), confidential: bool('restricted'), confirm: bool('confirmed') });
const CONFIRM = S({ confirm: bool('confirmed'), reason: str('reason', { maxLength: 500 }) });
const INVITE = S({ user_ids: arr(str('user'), { maxItems: 60 }), required: bool('required') }, ['user_ids']);
const RSVP = S({ response: str('response', { enum: ['accepted', 'declined', 'tentative'] }), note: str('note', { maxLength: 300 }) }, ['response']);
const ATTEND = S({ entries: arr(S({ user_id: str('user'), status: str('status', { enum: ['present', 'absent', 'excused'] }) }, ['user_id']), { maxItems: 80 }) }, ['entries']);
const AGENDA = S({ title: str('title', { maxLength: 300 }), presenter_id: str('presenter'), duration_min: int('minutes', { minimum: 5, maximum: 240 }), document_id: str('document') }, ['title']);
const AGENDA_UPD = S({ title: str('title', { maxLength: 300 }), presenter_id: str('presenter'), duration_min: int('minutes', { minimum: 5, maximum: 240 }), document_id: str('document'), minutes: str('minutes', { maxLength: 8000 }), move: str('move', { enum: ['up', 'down'] }) });
const DECISION = S({ text: str('text', { maxLength: 1500 }), owner_id: str('owner'), due_date: date(), agenda_id: str('agenda item') }, ['text']);
const DECISION_UPD = S({ status: str('status', { enum: Object.keys(svc.DECISION_FLOW) }), text: str('text', { maxLength: 1500 }), owner_id: str('owner'), due_date: date() });
const ACTION = S({ title: str('title', { maxLength: 300 }), assignee_id: str('assignee'), due_date: date(), priority: str('priority', { enum: ['low', 'medium', 'high', 'urgent'] }), decision_id: str('decision'), agenda_id: str('agenda item') }, ['title', 'assignee_id']);
const DECLINE = S({ reason: str('reason', { maxLength: 500 }) }, ['reason']);
const COMMENT = S({ body: str('comment', { maxLength: 2000 }), agenda_id: str('agenda item') }, ['body']);
const COMMITTEE = S({ name_ar: str('name', { maxLength: 120 }), name_en: str('name (en)', { maxLength: 120 }), description: str('description', { maxLength: 1000 }), confidential: bool('restricted'), quorum: int('quorum', { minimum: 1, maximum: 60 }), secretary_id: str('secretary'), member_ids: arr(str('user'), { maxItems: 60 }) }, ['name_ar']);
const COMMITTEE_UPD = S({ quorum: int('quorum', { minimum: 1, maximum: 60 }), description: str('description', { maxLength: 1000 }) });
const MEMBER = S({ user_id: str('user'), role: str('role', { enum: ['member', 'secretary'] }), remove: bool('remove'), confirm: bool('confirmed') }, ['user_id']);
const EMPTY = S({});

function routes(r) {
  const q = (req) => req.query || {};
  r.get('/', wrap((req) => svc.overview(req.user, { tz: q(req).tz })));
  r.get('/overview', wrap((req) => svc.overview(req.user, { tz: q(req).tz })));
  r.get('/calendar', wrap((req) => svc.calendar(req.user, { month: q(req).month, tz: q(req).tz })));
  r.get('/meetings', wrap((req) => svc.meetingsForRange(req.user, { from: q(req).from, to: q(req).to, tz: q(req).tz })));
  r.post('/meetings', wrap((req) => svc.createMeeting(req.user, check(CREATE, req.body))));
  r.get('/meetings/:id', wrap((req) => svc.getMeeting(req.user, req.params.id)));
  r.put('/meetings/:id', wrap((req) => svc.updateMeeting(req.user, req.params.id, check(UPDATE, req.body))));
  r.post('/meetings/:id/cancel', wrap((req) => svc.cancelMeeting(req.user, req.params.id, check(CONFIRM, req.body))));
  r.post('/meetings/:id/attendees', wrap((req) => svc.inviteAttendees(req.user, req.params.id, check(INVITE, req.body))));
  r.post('/meetings/:id/attendees/:uid/remove', wrap((req) => svc.removeAttendee(req.user, req.params.id, req.params.uid, check(CONFIRM, req.body))));
  r.post('/meetings/:id/rsvp', wrap((req) => svc.respond(req.user, req.params.id, check(RSVP, req.body))));
  r.post('/meetings/:id/attendance', wrap((req) => svc.setAttendance(req.user, req.params.id, check(ATTEND, req.body))));
  r.post('/meetings/:id/agenda', wrap((req) => svc.addAgendaItem(req.user, req.params.id, check(AGENDA, req.body))));
  r.put('/meetings/:id/agenda/:aid', wrap((req) => svc.updateAgendaItem(req.user, req.params.id, req.params.aid, check(AGENDA_UPD, req.body))));
  r.post('/meetings/:id/agenda/:aid/remove', wrap((req) => svc.removeAgendaItem(req.user, req.params.id, req.params.aid, check(CONFIRM, req.body))));
  r.post('/meetings/:id/agenda/:aid/share', wrap((req) => svc.shareAgendaDocument(req.user, req.params.id, req.params.aid, check(CONFIRM, req.body))));
  r.post('/meetings/:id/decisions', wrap((req) => svc.addDecision(req.user, req.params.id, check(DECISION, req.body))));
  r.put('/decisions/:id', wrap((req) => svc.updateDecision(req.user, req.params.id, check(DECISION_UPD, req.body))));
  r.post('/meetings/:id/actions', wrap((req) => svc.addAction(req.user, req.params.id, check(ACTION, req.body))));
  r.post('/actions/:id/accept', wrap((req) => { check(EMPTY, req.body); return svc.acceptAction(req.user, req.params.id); }));
  r.post('/actions/:id/decline', wrap((req) => svc.declineAction(req.user, req.params.id, check(DECLINE, req.body))));
  r.post('/actions/:id/cancel', wrap((req) => svc.cancelAction(req.user, req.params.id, check(CONFIRM, req.body))));
  r.post('/meetings/:id/minutes/circulate', wrap((req) => { check(EMPTY, req.body); return svc.circulateMinutes(req.user, req.params.id); }));
  r.post('/meetings/:id/minutes/revise', wrap((req) => { check(EMPTY, req.body); return svc.reviseMinutes(req.user, req.params.id); }));
  r.post('/meetings/:id/minutes/approve', wrap((req) => { check(EMPTY, req.body); return svc.approveMinutes(req.user, req.params.id); }));
  r.post('/meetings/:id/minutes/comment', wrap((req) => svc.commentMinutes(req.user, req.params.id, check(COMMENT, req.body))));
  r.post('/meetings/:id/minutes/finalize', wrap((req) => svc.finalizeMinutes(req.user, req.params.id, check(CONFIRM, req.body))));
  r.post('/meetings/:id/minutes/summary', wrap((req) => { check(EMPTY, req.body); return svc.summarizeMinutes(req.user, req.params.id); }));
  r.post('/meetings/:id/minutes/document', wrap((req) => { check(EMPTY, req.body); return svc.exportMinutes(req.user, req.params.id); }));
  r.get('/tracker', wrap((req) => svc.tracker(req.user, { mine: q(req).mine === '1', status: q(req).status || null, q: q(req).q || null })));
  r.get('/committees', wrap((req) => svc.listCommittees(req.user)));
  r.post('/committees', wrap((req) => svc.createCommittee(req.user, check(COMMITTEE, req.body))));
  r.get('/committees/:id', wrap((req) => svc.getCommittee(req.user, req.params.id)));
  r.put('/committees/:id', wrap((req) => svc.updateCommittee(req.user, req.params.id, check(COMMITTEE_UPD, req.body))));
  r.post('/committees/:id/members', wrap((req) => svc.setCommitteeMember(req.user, req.params.id, check(MEMBER, req.body))));
  r.get('/my-documents', wrap((req) => svc.myDocuments(req.user)));
}

// ---------------------------------------------------------------- Home workspace (same scope; restricted titles masked)
const label = (m) => m.title || svc.MASK.ar;
function workspace(user) {
  if (!K.isStaff(user)) return [];
  const o = svc.overview(user, {});
  const cards = [];
  const t = K.now();
  const todays = o.today_meetings.filter((m) => m.status === 'scheduled' && m.ends_at > t && m.my.rsvp !== 'declined');
  if (todays.length) {
    const next = todays[0];
    cards.push({
      title_ar: next.phase === 'live' ? 'اجتماع جارٍ الآن' : 'اجتماعك التالي اليوم', title_en: next.phase === 'live' ? 'Meeting in progress' : 'Your next meeting today',
      value: svc.hhmm(next.starts_at), unit_ar: todays.length > 1 ? `و${todays.length - 1} بعده اليوم` : 'اليوم', unit_en: todays.length > 1 ? `+${todays.length - 1} more today` : 'today',
      tone: next.phase === 'live' ? 'emph' : null,
      hint_ar: `${label(next)}${next.location ? ` — ${next.location}` : next.virtual ? ' — عن بُعد' : ''}`, hint_en: `${next.title || svc.MASK.en}${next.location ? ` — ${next.location}` : ''}`,
      href: `#/sys/meetings/m/${next.id}`,
      items: todays.slice(1, 4).map((m) => ({ title: label(m), meta_ar: svc.hhmm(m.starts_at), meta_en: svc.hhmm(m.starts_at), href: `#/sys/meetings/m/${m.id}` })),
      cta: { label_ar: 'افتح جدول الأعمال', label_en: 'Open the agenda', href: `#/sys/meetings/m/${next.id}` },
    });
  }
  const review = o.inbox.review; const circulate = o.inbox.circulate.filter((m) => m.ended);
  if (review.length || circulate.length) {
    cards.push({
      title_ar: 'محاضر بانتظارك', title_en: 'Minutes waiting for you', value: review.length + circulate.length, unit_ar: 'محضر', unit_en: 'minutes',
      tone: 'warn',
      hint_ar: [review.length ? `${review.length} للاعتماد` : null, circulate.length ? `${circulate.length} للتعميم` : null].filter(Boolean).join(' · '),
      hint_en: [review.length ? `${review.length} to approve` : null, circulate.length ? `${circulate.length} to circulate` : null].filter(Boolean).join(' · '),
      href: `#/sys/meetings/m/${(review[0] || circulate[0]).id}/minutes`,
      items: [...review.map((m) => ({ title: label(m), meta_ar: 'للاعتماد', meta_en: 'to approve', href: `#/sys/meetings/m/${m.id}/minutes` })),
        ...circulate.map((m) => ({ title: label(m), meta_ar: 'للتعميم', meta_en: 'to circulate', href: `#/sys/meetings/m/${m.id}/minutes` }))].slice(0, 3),
      cta: { label_ar: review.length ? 'راجع المحضر' : 'أكمل المحضر', label_en: review.length ? 'Review minutes' : 'Finish minutes', href: `#/sys/meetings/m/${(review[0] || circulate[0]).id}/minutes` },
    });
  }
  const acts = [...o.inbox.accept, ...o.inbox.actions];
  if (acts.length) {
    const overdue = acts.filter((a) => a.overdue).length;
    cards.push({
      title_ar: 'تكليفاتي من الاجتماعات', title_en: 'My meeting action items', value: acts.length, unit_ar: 'مفتوح', unit_en: 'open',
      tone: overdue ? 'crit' : o.inbox.accept.length ? 'warn' : 'good',
      hint_ar: [overdue ? `${overdue} متأخر` : null, o.inbox.accept.length ? `${o.inbox.accept.length} بانتظار قبولك` : null].filter(Boolean).join(' · ') || 'ضمن المواعيد',
      hint_en: [overdue ? `${overdue} overdue` : null, o.inbox.accept.length ? `${o.inbox.accept.length} awaiting your acceptance` : null].filter(Boolean).join(' · ') || 'On schedule',
      href: '#/sys/meetings/decisions',
      items: acts.slice(0, 3).map((a) => ({ title: a.title || 'تكليف من اجتماع سري', meta_ar: a.status === 'pending_acceptance' ? 'بانتظار قبولك' : a.due_date || '—', meta_en: a.status === 'pending_acceptance' ? 'accept?' : a.due_date || '—', href: `#/sys/meetings/m/${a.meeting.id}/actions` })),
      cta: { label_ar: 'افتح التكليفات', label_en: 'Open action items', href: '#/sys/meetings/decisions' },
    });
  }
  return cards.slice(0, 3);
}

// ---------------------------------------------------------------- gamification (derived from real records)
const gameRules = [
  { key: 'minutes_on_time', points: 8, ar: 'تعميم محضر اجتماع خلال يومَي عمل من انعقاده (منظّماً أو أميناً للسر)', en: 'Minutes circulated within 2 working days of the meeting (organizer/secretary)' },
  { key: 'minutes_reviewed', points: 3, ar: 'مراجعة محضر معمّم (اعتماد أو ملاحظة) خلال يومَي عمل', en: 'Circulated minutes reviewed (approved or commented) within 2 working days' },
];
function gameEvents(userId) {
  const out = [];
  // Only meetings scheduled in advance, actually held (≥ 2 present) and circulated by the organizer/secretary.
  for (const m of K.all(`SELECT m.id, m.title, m.confidential, m.starts_at, m.ends_at, m.created_at, m.minutes_circulated_at FROM meetings_meetings m
    WHERE m.minutes_circulated_by=? AND m.minutes_circulated_at IS NOT NULL AND m.status='scheduled' AND (m.organizer_id=? OR m.secretary_id=?)
      AND m.created_at <= m.starts_at AND (SELECT COUNT(*) FROM meetings_attendees a WHERE a.meeting_id=m.id AND a.attendance='present') >= 2`, userId, userId, userId)) {
    if (!svc.circulatedOnTime(m.ends_at, m.minutes_circulated_at)) continue;
    out.push({ kind: 'minutes_on_time', points: 8, at: m.minutes_circulated_at, ref: m.confidential ? 'محضر اجتماع سري' : m.title, id: `meetings:minutes:${m.id}` });
  }
  for (const r of K.all(`SELECT m.id, m.title, m.confidential, m.minutes_circulated_at, a.review_at FROM meetings_attendees a JOIN meetings_meetings m ON m.id=a.meeting_id
    WHERE a.user_id=? AND a.review IN ('approved','commented') AND a.review_at IS NOT NULL AND m.minutes_circulated_at IS NOT NULL AND m.minutes_circulated_by<>?`, userId, userId)) {
    if (svc.localDay(r.review_at) > svc.addWorkingDays(svc.localDay(r.minutes_circulated_at), 2)) continue;
    out.push({ kind: 'minutes_reviewed', points: 3, at: r.review_at, ref: r.confidential ? 'محضر اجتماع سري' : r.title, id: `meetings:review:${r.id}` });
  }
  return out;
}

defineSystem({
  key: 'meetings',
  name_ar: 'نظام الاجتماعات', name_en: 'Meetings',
  description_ar: 'جدولة الاجتماعات وجداول الأعمال والمحاضر والقرارات والتكليفات',
  description_en: 'Schedule meetings, agendas, minutes, decisions and action items',
  icon: 'calendarClock', category: 'operations',
  access: (u) => K.isStaff(u),
  defaultPinned: () => true,
  caps: [],
  domains: [
    { key: 'meetings.general', name_ar: 'الاجتماعات ومحاضرها', name_en: 'Meetings and minutes', classification: 'internal', ai: 'allowed' },
    { key: 'meetings.confidential', name_ar: 'اجتماعات اللجان السرية', name_en: 'Confidential committee meetings', classification: 'restricted', ai: 'off', locked: true, note_ar: 'للحضور المدعوين فقط، ولا يصل إليها المساعد الذكي', note_en: 'Invited attendees only; never available to Ask AI' },
  ],
  schema, seed, routes, tools, intents, agent, workspace, gameRules, gameEvents,
});
