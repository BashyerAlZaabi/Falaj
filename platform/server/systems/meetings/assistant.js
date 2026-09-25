// Meetings — Ask AI tools and rule-based intents.
// Tools belong to the data domain meetings.general and reuse the service
// functions (same authorisation). They never return, create or touch restricted
// meetings: every lookup runs with { ai: true }, which filters confidential
// meetings in the SQL (a restricted id behaves exactly like an unknown id).
import * as K from '../kit.js';
import * as svc from './service.js';

const { S, str, int, arr, date } = K;
const DOMAIN = 'meetings.general';
const TYPE_ENUM = Object.keys(svc.TYPES);
const RSVP_AR = { pending: 'لم ترد', accepted: 'مؤكد', declined: 'معتذر', tentative: 'ربما' };
const ACTION_AR = { pending_acceptance: 'بانتظار القبول', open: 'مفتوح', in_progress: 'قيد التنفيذ', done: 'منجز', declined: 'معتذر عنه', cancelled: 'ملغى', task_removed: 'حُذفت المهمة' };

function aiMeeting(user, m) {
  const me = K.one('SELECT rsvp FROM meetings_attendees WHERE meeting_id=? AND user_id=?', m.id, user.id);
  const org = K.userBrief(m.organizer_id);
  const cm = m.committee_id ? K.one('SELECT name_ar FROM meetings_committees WHERE id=?', m.committee_id) : null;
  const invited = K.all('SELECT u.name_ar FROM meetings_attendees a JOIN users u ON u.id=a.user_id WHERE a.meeting_id=? AND a.user_id<>? ORDER BY u.name_ar', m.id, m.organizer_id).map((r) => r.name_ar);
  return { id: m.id, title: m.title, type: m.type, type_ar: svc.TYPES[m.type][0], committee: cm?.name_ar || null, starts_at: m.starts_at, ends_at: m.ends_at, when_ar: svc.arWhen(m.starts_at),
    location: m.location, virtual: !!m.virtual_link, organizer: org?.name_ar, my_rsvp: me?.rsvp || null, invited, status: m.status, minutes_status: m.minutes_status, href: `#/sys/meetings/m/${m.id}` };
}

export function upcoming(user, days = 14) {
  const to = new Date(Date.now() + days * 864e5).toISOString();
  return svc.listVisible(user, { from: K.now(), to, ai: true, includeCancelled: false }).map((m) => aiMeeting(user, m));
}
export function decisionsOf(user, meetingId) {
  let m;
  if (meetingId) m = svc.loadVisible(user, meetingId, { ai: true });
  else {
    const s = svc.scopeSql(user);
    m = K.one(`SELECT m.* FROM meetings_meetings m WHERE ${s.sql} AND m.confidential=0 AND m.status='scheduled' AND m.starts_at <= ?
      ORDER BY EXISTS (SELECT 1 FROM meetings_decisions d WHERE d.meeting_id=m.id) DESC, m.starts_at DESC LIMIT 1`, ...s.params, K.now());
    if (!m) return { meeting: null, decisions: [], actions: [] };
  }
  return {
    meeting: aiMeeting(user, m),
    decisions: K.all('SELECT * FROM meetings_decisions WHERE meeting_id=? ORDER BY number', m.id).map(svc.decisionView).map((d) => ({ number: d.number, text: d.text, owner: d.owner?.name_ar || null, status: d.status, status_ar: svc.DECISION_LABELS[d.status], due_date: d.due_date, overdue: d.overdue })),
    actions: K.all("SELECT * FROM meetings_actions WHERE meeting_id=? AND status<>'cancelled' ORDER BY created_at", m.id).map(svc.actionView).map((a) => ({ title: a.title, assignee: a.assignee?.name_ar, due_date: a.due_date, status: a.status, status_ar: ACTION_AR[a.status], overdue: a.overdue })),
  };
}
function withdraw(user, id) {
  const m = svc.loadVisible(user, id, { ai: true });
  if (m.organizer_id !== user.id || m.status !== 'scheduled' || svc.phase(m) !== 'upcoming' || m.minutes_status !== 'none') throw new K.Conflict('لا يمكن التراجع عن إنشاء هذا الاجتماع الآن');
  return svc.cancelMeeting(user, id, { confirm: true, reason: 'تراجع المنظّم عن إنشاء الاجتماع' });
}

const list = (xs, fn, max = 8) => xs.slice(0, max).map(fn).join('\n') + (xs.length > max ? `\n… و${xs.length - max} غيرها` : '');

export const tools = [
  { name: 'meetings_upcoming', domain: DOMAIN,
    description: 'My upcoming meetings (as organizer, secretary or invitee) within the next N days, with time, place, organizer and my RSVP. Restricted (confidential) meetings are never returned.',
    input_schema: S({ days: int('look-ahead window in days (1-60, default 14)', { minimum: 1, maximum: 60 }) }),
    handler: (u, i) => ({ result: upcoming(u, i.days || 14) }),
    format: (r) => (r.length ? `اجتماعاتك القادمة (${r.length}):\n${list(r, (m) => `– ${m.title}: ${m.when_ar}${m.location ? ` — ${m.location}` : m.virtual ? ' — عن بُعد' : ''}${m.my_rsvp && m.my_rsvp !== 'accepted' ? ` (ردّك: ${RSVP_AR[m.my_rsvp]})` : ''}`)}\n(الاجتماعات السرية لا تُعرض عبر المساعد.)` : 'لا توجد اجتماعات قادمة ضمن المدة المحددة. (الاجتماعات السرية لا تُعرض عبر المساعد.)') },
  { name: 'meetings_create', domain: DOMAIN, mutates: true,
    description: 'Schedule a (non-confidential) meeting and invite staff. starts_at is an ISO datetime (convert the user local time with their timezone); duration in minutes (default 60). attendee_ids are staff user ids (use list_assignable_users or the directory). Never invent attendees.',
    input_schema: S({ title: str('meeting title', { maxLength: 200 }), starts_at: str('ISO datetime'), duration_min: int('duration in minutes', { minimum: 15, maximum: 720 }), type: str('meeting type', { enum: TYPE_ENUM.filter((t) => t !== 'committee') }), location: str('room or place', { maxLength: 200 }), virtual_link: str('https link', { maxLength: 500 }), attendee_ids: arr(str('user id'), { maxItems: 40 }), agenda: arr(str('agenda item title', { maxLength: 300 }), { maxItems: 20 }) }, ['title', 'starts_at']),
    handler: (u, i) => {
      const r = svc.createMeeting(u, { ...i, confidential: false, committee_id: undefined });
      return { result: aiMeeting(u, K.one('SELECT * FROM meetings_meetings WHERE id=?', r.id)), undo: { tool: 'meetings_undo_create', input: { id: r.id } } };
    },
    format: (r) => `جدولت اجتماع «${r.title}» ${r.when_ar}${r.location ? ` في ${r.location}` : ''}${r.invited.length ? `، ودعوت: ${r.invited.join('، ')}` : ''}. أُرسلت الدعوات، ويمكنك إضافة جدول الأعمال من نظام الاجتماعات.` },
  { name: 'meetings_add_action', domain: DOMAIN, mutates: true,
    description: 'Record an action item on a meeting I organize or keep the minutes for (after it started). The assignee must be an invitee. It becomes a real task when the organizer may assign work to that person; otherwise the assignee is asked to accept it.',
    input_schema: S({ meeting_id: str('meeting id'), title: str('action item', { maxLength: 300 }), assignee_id: str('user id of an invitee'), due_date: date('due date YYYY-MM-DD'), priority: str('priority', { enum: ['low', 'medium', 'high', 'urgent'] }) }, ['meeting_id', 'title', 'assignee_id']),
    handler: (u, i) => { const a = svc.addAction(u, i.meeting_id, i, { ai: true }); return { result: a, undo: { tool: 'meetings_undo_action', input: { id: a.id } } }; },
    format: (r) => (r.status === 'pending_acceptance' ? `سجّلت التكليف «${r.title}» وأرسلته إلى ${r.assignee?.name_ar} لقبوله (خارج نطاق الإسناد المباشر للمنظّم).` : `أضفت التكليف «${r.title}» إلى ${r.assignee?.name_ar}${r.due_date ? ` حتى ${r.due_date}` : ''} وأُنشئت مهمة مرتبطة به.`) },
  { name: 'meetings_decisions', domain: DOMAIN,
    description: 'Decisions and action items of one of my meetings (default: my most recent held meeting with decisions). Restricted meetings are excluded.',
    input_schema: S({ meeting_id: str('meeting id (optional)') }),
    handler: (u, i) => ({ result: decisionsOf(u, i.meeting_id) }),
    format: (r) => {
      if (!r.meeting) return 'لا توجد اجتماعات سابقة لديك بقرارات مسجّلة (الاجتماعات السرية لا تُعرض عبر المساعد).';
      const head = `قرارات «${r.meeting.title}» (${r.meeting.when_ar}):`;
      const ds = r.decisions.length ? list(r.decisions, (d) => `${d.number}. ${d.text}${d.owner ? ` — المسؤول: ${d.owner}` : ''} (${d.status_ar}${d.overdue ? '، متأخر' : ''})`, 12) : 'لم تُسجَّل قرارات.';
      const as = r.actions.length ? `\nالتكليفات:\n${list(r.actions, (a) => `– ${a.title} — ${a.assignee}${a.due_date ? ` حتى ${a.due_date}` : ''} (${a.status_ar}${a.overdue ? '، متأخر' : ''})`)}` : '';
      return `${head}\n${ds}${as}`;
    } },
  { name: 'meetings_my_actions', domain: DOMAIN,
    description: 'My open action items from meetings (including those waiting for my acceptance). Restricted meetings are excluded.',
    input_schema: S({}),
    handler: (u) => ({ result: svc.myActionItems(u, { ai: true }).map((a) => ({ id: a.id, title: a.title, meeting: a.meeting.title, due_date: a.due_date, status: a.status, status_ar: ACTION_AR[a.status], overdue: a.overdue })) }),
    format: (r) => (r.length ? `تكليفاتك من الاجتماعات (${r.length}):\n${list(r, (a) => `– ${a.title} — من «${a.meeting}»${a.due_date ? ` حتى ${a.due_date}` : ''} (${a.status_ar}${a.overdue ? '، متأخر' : ''})`)}` : 'لا توجد تكليفات مفتوحة عليك من الاجتماعات.') },
  // internal (undo only)
  { name: 'meetings_undo_create', internal: true, domain: DOMAIN, input_schema: S({ id: str('') }, ['id']), handler: (u, i) => ({ result: withdraw(u, i.id) && { id: i.id, undone: true } }) },
  { name: 'meetings_undo_action', internal: true, domain: DOMAIN, input_schema: S({ id: str('') }, ['id']), handler: (u, i) => ({ result: svc.cancelAction(u, i.id, { confirm: true }) }) },
];

// ---------------------------------------------------------------- intents (rule-based planner)
// n is normalized (أإآ→ا, ة→ه, ى→ي, ؤ→و, ئ→ي). They never capture «موعد/مواعيد»
// (appointments) nor document requests («اكتب/جهّز محضر…»).
const NOT_OURS = /(موعد|مواعيد|اكتب|جهز|صغ|محضر|مستند|تقرير|خطاب)/;
const stripAl = (w) => w.replace(/^(وال|بال|لل|فال|كال|ال|و)/, '');

function findPeople(helpers, segment) {
  const staff = K.staffUsers();
  const parts = helpers.norm(segment).split(/\s*(?:،|,|\s+و(?=\S)|\s+and\s+)\s*/).map((s) => s.trim()).filter(Boolean);
  const ids = []; const unknown = []; const ambiguous = [];
  for (const p of parts) {
    const words = p.split(/\s+/).map(stripAl).filter((w) => w.length > 1);
    if (!words.length) continue;
    const hits = staff.filter((u) => { const nw = helpers.norm(u.name_ar).split(/\s+/).map(stripAl); const ne = String(u.name_en || '').toLowerCase().split(/\s+/); return words.every((w) => nw.includes(w) || ne.includes(w)); });
    if (hits.length === 1) ids.push(hits[0].id);
    else if (hits.length > 1) ambiguous.push({ p, hits });
    else unknown.push(p);
  }
  return { ids: [...new Set(ids)], unknown, ambiguous };
}
function localIso(dateStr, time, tzOffset) {
  const [y, mo, d] = dateStr.split('-').map(Number); const [h, mi] = time.split(':').map(Number);
  const off = Number.isFinite(+tzOffset) ? +tzOffset : svc.ORG_TZ;
  return new Date(Date.UTC(y, mo - 1, d, h, mi) + off * 6e4).toISOString();
}

export const intents = [
  // «اجتماعاتي القادمة» / «اجتماعات الأسبوع» / «ما اجتماعاتي اليوم؟»
  { test: (n) => /(اجتماعاتي|اجتماعات (هذا )?الاسبوع|اجتماعات الاسبوع (القادم|الجاي)|اجتماعات (اليوم|غدا|بكره)|الاجتماعات القادمه|my meetings|meetings (this|next) week|upcoming meetings)/.test(n) && !NOT_OURS.test(n) && !/(انشي|انشئ|اعقد|نظم|قرارات|تكليف)/.test(n),
    plan: (user, clause, ctx, { norm }) => {
      const n = norm(clause);
      const days = /اليوم|today/.test(n) ? 1 : /غدا|بكره|tomorrow/.test(n) ? 2 : /(القادم|الجاي|next)/.test(n) && /(اسبوع|week)/.test(n) ? 14 : /(اسبوع|week)/.test(n) ? 7 : 14;
      return [{ tool: 'meetings_upcoming', input: { days }, label: 'عرض اجتماعاتي القادمة' }];
    } },
  // «أنشئ اجتماع متابعة البوابة يوم الأحد الساعة 10 مع أحمد وسارة في قاعة 2»
  { test: (n) => /^(?:(?:لو سمحت|من فضلك|رجاء)\s+)?(انشي|انشئ|اعقد|نظم|رتب|جدول)\s+(?:لي\s+)?(اجتماع|اجتماعا)(\s|$)/.test(n) && !/(موعد|مواعيد|محضر)/.test(n),
    plan: (user, clause, ctx, helpers) => {
      const { norm, parseDate, parseTime, digits } = helpers;
      const n = norm(clause);
      const raw = String(clause).replace(/[ًٌٍَُِّْـ]/g, '');
      const tm = raw.match(/اجتماع(?:اً|ا)?\s*(?:بعنوان|باسم|:)?\s*[«"“']?(.+?)[»"”']?(?=\s+(?:يوم|غد[اًا]?|بكر[ةه]|بعد|اليوم|الساع[ةه]|مع|في|فى|بتاريخ|لمد[ةه]|الأحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الخميس|السبت|الجمعة)(?:\s|$)|$)/);
      let title = (tm?.[1] || '').trim().replace(/[.،,]+$/, '');
      if (title.length < 3) title = 'اجتماع تنسيقي';
      else if (!/^(اجتماع|لجنة|ورشة)/.test(title)) title = `اجتماع ${title}`;
      // The invitees segment («مع أحمد…») is removed before parsing the time: «م» of «مع» must not read as p.m.
      const whenText = raw.replace(/\s(?:مع|with)\s+.+?(?=\s+(?:يوم|غد[اًا]?|بكر[ةه]|اليوم|الساع[ةه]|في|فى|بتاريخ|لمد[ةه]|at|on)(?:\s|$)|$)/, ' ');
      const day = parseDate(whenText);
      const time = parseTime(whenText);
      if (!day && !time) return [{ ask: 'في أي يوم وأي ساعة؟ مثال: «أنشئ اجتماع متابعة يوم الأحد الساعة 10 مع سارة».' }];
      if (!day) return [{ ask: 'في أي يوم؟ مثال: «… يوم الأحد الساعة 10» أو «… غداً الساعة 9».' }];
      if (!time) return [{ ask: 'في أي ساعة؟ مثال: «… الساعة 10 صباحاً».' }];
      const starts = localIso(day, time, ctx?.ui?.tzOffset);
      if (Date.parse(starts) < Date.now()) return [{ say: 'الموعد المحدد مضى بالفعل؛ اختر وقتاً قادماً.' }];
      let duration = 60;
      const dm = digits(n).match(/لمده\s*(ساعتين|ساعه ونصف|ساعه|نصف ساعه|(\d+)\s*دقيقه|(\d+)\s*ساعات?)/);
      if (dm) duration = dm[1] === 'ساعتين' ? 120 : dm[1] === 'ساعه ونصف' ? 90 : dm[1] === 'ساعه' ? 60 : dm[1] === 'نصف ساعه' ? 30 : dm[2] ? Math.max(15, +dm[2]) : dm[3] ? +dm[3] * 60 : 60;
      const input = { title: title.slice(0, 200), starts_at: starts, duration_min: Math.min(720, duration) };
      const lm = raw.match(/(?:في|فى)\s+((?:ال)?(?:قاع[ةه]|مكتب|مبنى|مركز)[^،,]*?)(?=\s+(?:يوم|الساع[ةه]|مع|لمد[ةه]|غد)|[،,]|$)/);
      if (lm) input.location = lm[1].trim().slice(0, 200);
      const pm = raw.match(/\sمع\s+(.+?)(?=\s+(?:يوم|غد[اًا]?|بكر[ةه]|اليوم|الساع[ةه]|في|فى|بتاريخ|لمد[ةه])(?:\s|$)|$)/);
      if (pm) {
        const found = findPeople(helpers, pm[1]);
        if (found.ambiguous.length) return [{ ask: `أي «${found.ambiguous[0].p}» تقصد؟ ${found.ambiguous[0].hits.slice(0, 4).map((u) => `${u.name_ar} (${u.dept_ar})`).join('، ')}` }];
        if (found.unknown.length) return [{ ask: `لم أتعرّف على «${found.unknown[0]}» ضمن موظفي الجهة. اذكر الاسم كما في الدليل.` }];
        if (found.ids.length) input.attendee_ids = found.ids.filter((id) => id !== user.id);
      }
      return [{ tool: 'meetings_create', input, label: `جدولة «${input.title}»` }];
    } },
  // «قرارات الاجتماع الأخير» / «قرارات اجتماع متابعة البوابة»
  { test: (n) => /(قرارات|تكليفات|مخرجات)\s+(ال)?(اجتماع|لجنه)/.test(n) || /(قرارات|مخرجات) (اخر|الاخير)/.test(n) || /last meeting decisions|decisions of the (last )?meeting/.test(n),
    plan: (user, clause, ctx, { norm, matchByName }) => {
      const n = norm(clause);
      if (/(الاخير|الماضي|السابق|اخر|last)/.test(n)) return [{ tool: 'meetings_decisions', input: {}, label: 'قراءة قرارات آخر اجتماع' }];
      const mine = svc.listVisible(user, { ai: true, to: K.now(), order: 'DESC', limit: 60 });
      const { matches } = matchByName(mine, clause, (m) => m.title.replace(/^(اجتماع|لجنة)\s+/, ''));
      if (matches.length > 1) return [{ ask: `أي اجتماع تقصد؟ ${matches.slice(0, 4).map((m) => `«${m.title}» (${svc.localDay(m.starts_at)})`).join('، ')}` }];
      return [{ tool: 'meetings_decisions', input: matches[0] ? { meeting_id: matches[0].id } : {}, label: 'قراءة قرارات الاجتماع' }];
    } },
  // «تكليفاتي» / «ما كُلّفت به في الاجتماعات»
  { test: (n) => /(تكليفاتي|تكليفات الاجتماعات|ما كلفت به|my action items)/.test(n) && !NOT_OURS.test(n),
    plan: () => [{ tool: 'meetings_my_actions', input: {}, label: 'عرض تكليفاتي من الاجتماعات' }] },
];

export const agent = {
  name_ar: 'مساعد الاجتماعات', name_en: 'Meetings assistant',
  description_ar: 'اجتماعاتك القادمة، جدولة الاجتماعات، القرارات والتكليفات — دون الاجتماعات السرية',
  description_en: 'Upcoming meetings, scheduling, decisions and action items — never restricted meetings',
  instructions: 'يعمل ضمن اجتماعات المستخدم فقط (منظّماً أو أميناً للسر أو مدعواً). لا يصل إلى الاجتماعات السرية مطلقاً. لا يخترع مدعوين أو مواعيد؛ يسأل عند نقص المعلومة.',
};
