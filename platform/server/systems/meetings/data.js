// Meetings — schema and demo seed.
// The seed is realistic Arabic content coherent with the personas and their
// departments, dated relative to today (organisation wall clock, UTC+4) and
// marked is_demo=1. Stable ids (mt_demo_*) keep deep links and tests readable.
import * as K from '../kit.js';
import { localDay, dayStartUtc, isWeekend, addWorkingDays, ORG_TZ } from './service.js';

const { db, one, run, now } = K;

export function schema() {
  db.exec(`
CREATE TABLE IF NOT EXISTS meetings_committees (
  id TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  confidential INTEGER NOT NULL DEFAULT 0, quorum INTEGER NOT NULL DEFAULT 1 CHECK (quorum >= 1),
  chair_id TEXT NOT NULL REFERENCES users(id), secretary_id TEXT REFERENCES users(id),
  department_id TEXT REFERENCES departments(id), active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings_committee_members (
  committee_id TEXT NOT NULL REFERENCES meetings_committees(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('chair','secretary','member')),
  PRIMARY KEY (committee_id, user_id)
);
CREATE TABLE IF NOT EXISTS meetings_meetings (
  id TEXT PRIMARY KEY, title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('management','committee','project','coordination')),
  committee_id TEXT REFERENCES meetings_committees(id), project_id TEXT, description TEXT NOT NULL DEFAULT '',
  organizer_id TEXT NOT NULL REFERENCES users(id), secretary_id TEXT REFERENCES users(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, location TEXT, virtual_link TEXT,
  confidential INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')), cancel_reason TEXT,
  minutes_status TEXT NOT NULL DEFAULT 'none' CHECK (minutes_status IN ('none','draft','circulated','approved')),
  minutes_circulated_at TEXT, minutes_circulated_by TEXT, minutes_approved_at TEXT, minutes_approved_by TEXT,
  attendance_taken_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meetings_meetings_time ON meetings_meetings (starts_at);
CREATE INDEX IF NOT EXISTS meetings_meetings_org ON meetings_meetings (organizer_id);
CREATE TABLE IF NOT EXISTS meetings_attendees (
  meeting_id TEXT NOT NULL REFERENCES meetings_meetings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  required INTEGER NOT NULL DEFAULT 1,
  rsvp TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp IN ('pending','accepted','declined','tentative')), rsvp_note TEXT, rsvp_at TEXT,
  attendance TEXT CHECK (attendance IS NULL OR attendance IN ('present','absent','excused')),
  review TEXT NOT NULL DEFAULT 'none' CHECK (review IN ('none','pending','approved','commented')), review_at TEXT,
  PRIMARY KEY (meeting_id, user_id)
);
CREATE INDEX IF NOT EXISTS meetings_attendees_user ON meetings_attendees (user_id);
CREATE TABLE IF NOT EXISTS meetings_agenda (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings_meetings(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL, title TEXT NOT NULL, presenter_id TEXT REFERENCES users(id), duration_min INTEGER NOT NULL DEFAULT 15,
  document_id TEXT, minutes TEXT NOT NULL DEFAULT '', minutes_updated_at TEXT, minutes_updated_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings_decisions (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings_meetings(id) ON DELETE CASCADE, agenda_id TEXT,
  number INTEGER NOT NULL, text TEXT NOT NULL, owner_id TEXT REFERENCES users(id), due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (meeting_id, number)
);
CREATE TABLE IF NOT EXISTS meetings_actions (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings_meetings(id) ON DELETE CASCADE,
  decision_id TEXT, agenda_id TEXT, title TEXT NOT NULL, assignee_id TEXT NOT NULL REFERENCES users(id),
  due_date TEXT, priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL CHECK (status IN ('pending_acceptance','open','declined','cancelled')),
  task_id TEXT, decline_reason TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, responded_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS meetings_actions_assignee ON meetings_actions (assignee_id);
CREATE TABLE IF NOT EXISTS meetings_comments (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings_meetings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), agenda_id TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings_history (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings_meetings(id) ON DELETE CASCADE,
  user_id TEXT, action TEXT NOT NULL, detail TEXT, at TEXT NOT NULL
);`);
}

// ---------------------------------------------------------------- seed helpers
const HOUR = 36e5;
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
// Local day n working days from today (n < 0: in the past). Weekend = Fri/Sat.
function wd(n) {
  let d = localDay(now(), ORG_TZ); let k = 0;
  const step = n > 0 ? 1 : -1;
  while (k < Math.abs(n)) { d = addDays(d, step); if (!isWeekend(d)) k++; }
  return d;
}
// ISO instant for local wall-clock hh:mm on a local day.
const lt = (day, hh, mm = 0) => new Date(Date.parse(dayStartUtc(day, ORG_TZ)) + hh * HOUR + mm * 6e4).toISOString();
const plus = (iso, hours) => new Date(Date.parse(iso) + hours * HOUR).toISOString();

export function seed() {
  if (!K.isEmpty('meetings_committees')) return;
  const need = ['u_president', 'u_aisha', 'u_yousef', 'u_latifa', 'u_hamad', 'u_mariam', 'u_ahmed', 'u_sara', 'u_omar', 'u_fatima', 'u_majed', 'u_noura', 'u_reem', 'u_hessa', 'u_salem'];
  if (need.some((id) => !one('SELECT 1 FROM users WHERE id=?', id))) return; // demo personas not present
  const created = now();

  // ---------- committees ----------
  const committee = (id, ar, en, desc, conf, quorum, chair, secretary, dept, members) => {
    run(`INSERT INTO meetings_committees (id,name_ar,name_en,description,confidential,quorum,chair_id,secretary_id,department_id,is_demo,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`,
      id, ar, en, desc, conf, quorum, chair, secretary, dept, chair, created);
    run("INSERT INTO meetings_committee_members (committee_id,user_id,role) VALUES (?,?,'chair')", id, chair);
    if (secretary && secretary !== chair) run("INSERT INTO meetings_committee_members (committee_id,user_id,role) VALUES (?,?,'secretary')", id, secretary);
    for (const u of members) run("INSERT OR IGNORE INTO meetings_committee_members (committee_id,user_id,role) VALUES (?,?,'member')", id, u);
  };
  committee('cm_exec', 'اللجنة التنفيذية', 'Executive Committee', 'تتابع تنفيذ الخطة الاستراتيجية والمشاريع الكبرى والموازنة، وتعتمد القرارات التنفيذية على مستوى الجهة.', 0, 4,
    'u_president', 'u_latifa', 'dept_exec', ['u_mariam', 'u_omar', 'u_majed', 'u_hessa', 'u_yousef']);
  committee('cm_audit', 'لجنة التدقيق', 'Audit Committee', 'تشرف على أعمال التدقيق الداخلي وخطط المعالجة واستقلالية الوظيفة الرقابية.', 1, 2,
    'u_president', 'u_aisha', 'dept_exec', ['u_yousef']);
  committee('cm_proc', 'لجنة المشتريات', 'Procurement Committee', 'تقيّم العروض وتوصي بالترسية وفق لائحة المشتريات، وتضمن الشفافية وتكافؤ الفرص.', 1, 3,
    'u_majed', 'u_reem', 'dept_fin', ['u_mariam', 'u_yousef']);
  committee('cm_innov', 'لجنة الابتكار', 'Innovation Committee', 'تقيّم أفكار الموظفين والمبادرات المبتكرة وترشّح القابل منها للتنفيذ.', 0, 3,
    'u_latifa', 'u_hamad', 'dept_spmo', ['u_president', 'u_mariam', 'u_hessa']);

  // ---------- meetings ----------
  const meeting = (m) => {
    const createdAt = m.created_at || plus(m.starts, -24 * (m.lead || 5));
    run(`INSERT INTO meetings_meetings (id,title,type,committee_id,project_id,description,organizer_id,secretary_id,department_id,starts_at,ends_at,location,virtual_link,confidential,status,cancel_reason,is_demo,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`, m.id, m.title, m.type, m.committee || null, m.project || null, m.description || '', m.organizer, m.secretary || null,
    one('SELECT department_id FROM users WHERE id=?', m.organizer).department_id, m.starts, m.ends, m.location || null, m.link || null, m.confidential ? 1 : 0,
    m.cancelled ? 'cancelled' : 'scheduled', m.cancelled || null, m.organizer, createdAt, createdAt);
    const people = new Map([[m.organizer, { rsvp: 'accepted' }], ...(m.secretary ? [[m.secretary, { rsvp: 'accepted' }]] : []), ...Object.entries(m.people || {})]);
    for (const [u, p] of people) {
      run('INSERT INTO meetings_attendees (meeting_id,user_id,required,rsvp,rsvp_note,rsvp_at,attendance) VALUES (?,?,?,?,?,?,?)', m.id, u, p.optional ? 0 : 1, p.rsvp || 'pending', p.note || null,
        p.rsvp && p.rsvp !== 'pending' ? plus(createdAt, 6) : null, p.att || (m.present ? (m.present.includes(u) ? 'present' : m.excused?.includes(u) ? 'excused' : 'absent') : null));
    }
    if (m.present) run('UPDATE meetings_meetings SET attendance_taken_at=? WHERE id=?', plus(m.starts, 0.25), m.id);
    (m.agenda || []).forEach((g, i) => run('INSERT INTO meetings_agenda (id,meeting_id,seq,title,presenter_id,duration_min,minutes,minutes_updated_at,minutes_updated_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      `${m.id}_a${i + 1}`, m.id, i + 1, g[0], g[1] || null, g[2] || 15, g[3] || '', g[3] ? plus(m.ends, 2) : null, g[3] ? (m.secretary || m.organizer) : null, createdAt));
    (m.decisions || []).forEach((d, i) => run('INSERT INTO meetings_decisions (id,meeting_id,agenda_id,number,text,owner_id,due_date,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      `${m.id}_d${i + 1}`, m.id, d.agenda ? `${m.id}_a${d.agenda}` : null, i + 1, d.text, d.owner, d.due || null, d.status || 'open', m.secretary || m.organizer, plus(m.ends, -0.2), d.status === 'done' ? plus(m.ends, 30) : plus(m.ends, 1)));
    (m.actions || []).forEach((a, i) => {
      let taskId = null;
      if (a.task) {
        taskId = `tk_mtg_${m.id.slice(8)}_${i + 1}`;
        const dept = one('SELECT department_id FROM users WHERE id=?', a.assignee).department_id;
        run(`INSERT INTO tasks (id,title,description,project_id,assignee_id,department_id,status,priority,due_date,completed_at,created_by,created_at,is_demo) VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,1)`,
          taskId, m.confidential ? 'تكليف من اجتماع سري — التفاصيل في نظام الاجتماعات' : a.title,
          m.confidential ? 'تكليف مرتبط باجتماع سري للغاية؛ لا تُعرض تفاصيله خارج نظام الاجتماعات.' : `تكليف من اجتماع «${m.title}» (${localDay(m.starts)}) — نظام الاجتماعات`,
          a.assignee, dept, a.task, a.priority || 'medium', a.due || null, a.task === 'done' ? plus(m.ends, 48) : null, a.creator || m.organizer, plus(m.ends, 1).replace('T', ' ').slice(0, 19));
      }
      run('INSERT INTO meetings_actions (id,meeting_id,decision_id,title,assignee_id,due_date,priority,status,task_id,created_by,created_at,responded_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)',
        `${m.id}_x${i + 1}`, m.id, a.decision ? `${m.id}_d${a.decision}` : null, a.title, a.assignee, a.due || null, a.priority || 'medium', a.task ? 'open' : a.status || 'pending_acceptance', taskId,
        m.secretary || m.organizer, plus(m.ends, 1), a.task && a.creator ? plus(m.ends, 20) : null);
    });
    if (m.minutes) {
      const mn = m.minutes;
      run('UPDATE meetings_meetings SET minutes_status=?, minutes_circulated_at=?, minutes_circulated_by=?, minutes_approved_at=?, minutes_approved_by=? WHERE id=?',
        mn.status, mn.circulated || null, mn.circulated ? (mn.by || m.secretary || m.organizer) : null, mn.approved || null, mn.approved ? 'all' : null, m.id);
      for (const [u, r] of Object.entries(mn.reviews || {})) run('UPDATE meetings_attendees SET review=?, review_at=? WHERE meeting_id=? AND user_id=?', r, r === 'pending' ? null : plus(mn.circulated, 20), m.id, u);
      for (const c of mn.comments || []) run('INSERT INTO meetings_comments (id,meeting_id,user_id,body,created_at) VALUES (?,?,?,?,?)', `${m.id}_c${c.i}`, m.id, c.user, c.body, plus(mn.circulated, 18));
      const hist = [['created', m.organizer, createdAt], ['attendance', m.secretary || m.organizer, plus(m.starts, 0.25)], ['minutes_saved', m.secretary || m.organizer, plus(m.ends, 2)]];
      if (mn.circulated) hist.push(['minutes_circulated', mn.by || m.secretary || m.organizer, mn.circulated]);
      if (mn.approved) hist.push(['minutes_approved', null, mn.approved]);
      hist.forEach(([a, u, at], i) => run('INSERT INTO meetings_history (id,meeting_id,user_id,action,detail,at) VALUES (?,?,?,?,?,?)', `${m.id}_h${i}`, m.id, u, a, null, at));
    } else {
      run('INSERT INTO meetings_history (id,meeting_id,user_id,action,detail,at) VALUES (?,?,?,?,?,?)', `${m.id}_h0`, m.id, m.organizer, 'created', null, createdAt);
      if (m.cancelled) run('INSERT INTO meetings_history (id,meeting_id,user_id,action,detail,at) VALUES (?,?,?,?,?,?)', `${m.id}_h1`, m.id, m.organizer, 'cancelled', null, plus(createdAt, 30));
    }
  };

  // Today: one meeting around "now" and one later in the (local) day.
  const t = Date.now();
  const today = localDay(now(), ORG_TZ);
  const clampToday = (ms, len) => { const lo = Date.parse(lt(today, 7)); const hi = Date.parse(lt(today, 21)) - len * HOUR; return new Date(Math.max(lo, Math.min(hi, Math.round(ms / 9e5) * 9e5))).toISOString(); };
  const launchStart = clampToday(t - 0.5 * HOUR, 1.5);
  const serviceStart = clampToday(t + 3 * HOUR, 1);

  // --- past, fully documented: Executive Committee (approved minutes, decisions, real tasks)
  const d1 = wd(-7);
  const exS = lt(d1, 9); const exE = lt(d1, 11);
  meeting({ id: 'mt_demo_exec', title: 'اجتماع اللجنة التنفيذية — مراجعة أداء الربع الثالث', type: 'committee', committee: 'cm_exec', organizer: 'u_president', secretary: 'u_latifa', starts: exS, ends: exE, lead: 10,
    location: 'قاعة المجلس — المبنى الرئيسي', description: 'الاجتماع الدوري للجنة التنفيذية لمراجعة الأداء الاستراتيجي والمالي للربع الثالث.',
    people: { u_mariam: { rsvp: 'accepted' }, u_omar: { rsvp: 'accepted' }, u_majed: { rsvp: 'accepted' }, u_hessa: { rsvp: 'accepted' }, u_yousef: { rsvp: 'declined', note: 'ارتباط بجلسة قضائية' } },
    present: ['u_president', 'u_latifa', 'u_mariam', 'u_omar', 'u_majed', 'u_hessa'], excused: ['u_yousef'],
    agenda: [
      ['متابعة مؤشرات الأداء الاستراتيجي للربع الثالث', 'u_latifa', 30, 'استعرضت إدارة المشاريع الاستراتيجية نتائج الربع الثالث: حققت 14 مؤشراً من أصل 18 مستهدفاتها، مع تأخر في مؤشرَي رضا المتعاملين ونسبة أتمتة الخدمات. أوصت الإدارة بخطة تصحيحية قبل نهاية الربع الرابع.'],
      ['جاهزية إطلاق البوابة الموحدة', 'u_mariam', 20, 'عرضت إدارة التحول الرقمي نسبة الإنجاز الحالية ومخاطر ربط الهوية الموحدة. اتُّفق على مراجعة الجاهزية قبل الإطلاق بأسبوعين وعدم الإطلاق قبل اجتياز اختبارات الأداء.'],
      ['الموازنة التشغيلية ومؤشرات الإنفاق', 'u_majed', 25, 'أوضح المدير المالي أن الإنفاق التشغيلي بلغ 71% من الموازنة المعتمدة حتى نهاية الربع، ضمن الحدود المخطط لها، مع فرص ترشيد في التعاقدات الخارجية.'],
      ['خطة التدريب والتطوير للربع الرابع', 'u_hessa', 20, 'قدّمت إدارة الموارد البشرية مقترحاً لبرنامج تدريبي في مهارات التحول الرقمي يستهدف 60 موظفاً من الإدارات التشغيلية.'],
    ],
    decisions: [
      { text: 'اعتماد خطة تصحيحية لمؤشرَي رضا المتعاملين وأتمتة الخدمات، وعرض نتائجها في الاجتماع القادم.', owner: 'u_latifa', due: K.day(10), status: 'in_progress', agenda: 1 },
      { text: 'ربط موعد إطلاق البوابة الموحدة باجتياز اختبارات الأداء واكتمال ربط الهوية الموحدة.', owner: 'u_mariam', due: K.day(20), agenda: 2 },
      { text: 'اعتماد تقرير الإنفاق التشغيلي للربع الثالث وتعميمه على الإدارات.', owner: 'u_majed', status: 'done', agenda: 3 },
      { text: 'إطلاق برنامج تدريبي في مهارات التحول الرقمي لموظفي الإدارات التشغيلية.', owner: 'u_hessa', due: K.day(30), agenda: 4 },
    ],
    actions: [
      { title: 'إعداد الخطة التصحيحية لمؤشر رضا المتعاملين', assignee: 'u_latifa', due: K.day(5), task: 'in_progress', priority: 'high', decision: 1 },
      { title: 'رفع تقرير اختبارات أداء البوابة الموحدة', assignee: 'u_mariam', due: K.day(8), task: 'todo', priority: 'high', decision: 2 },
      { title: 'تعميم تقرير الإنفاق التشغيلي على الإدارات', assignee: 'u_majed', due: K.day(-3), task: 'done', decision: 3 },
      { title: 'تصميم البرنامج التدريبي للتحول الرقمي', assignee: 'u_hessa', due: K.day(14), task: 'todo', decision: 4 },
    ],
    minutes: { status: 'approved', circulated: lt(addWorkingDays(d1, 1), 13), by: 'u_latifa', approved: lt(addWorkingDays(d1, 3), 10),
      reviews: { u_president: 'approved', u_mariam: 'approved', u_omar: 'approved', u_majed: 'approved', u_hessa: 'approved' } } });

  // --- past, restricted: Audit Committee (aisha, president, yousef) — circulated, awaiting Yousef
  const d2 = wd(-3);
  const auS = lt(d2, 11); const auE = lt(d2, 12, 30);
  meeting({ id: 'mt_demo_audit', title: 'اجتماع لجنة التدقيق — نتائج تدقيق دورة المشتريات', type: 'committee', committee: 'cm_audit', organizer: 'u_aisha', confidential: true, starts: auS, ends: auE, lead: 9,
    location: 'قاعة الاجتماعات المغلقة — الطابق الخامس', description: 'مناقشة نتائج مهمة تدقيق دورة المشتريات والعقود وخطط المعالجة.',
    people: { u_president: { rsvp: 'accepted' }, u_yousef: { rsvp: 'accepted' } },
    present: ['u_aisha', 'u_president', 'u_yousef'],
    agenda: [
      ['نتائج تدقيق دورة المشتريات والعقود', 'u_aisha', 40, 'عُرضت ست ملاحظات، منها ملاحظتان عاليتا الخطورة تتعلقان بفصل المهام في اعتماد أوامر الشراء وتوثيق مبررات الإسناد المباشر.'],
      ['متابعة تنفيذ خطط المعالجة السابقة', 'u_aisha', 20, 'أُغلقت تسع خطط معالجة من أصل اثنتي عشرة، وتُتابع الخطط الثلاث المتبقية مع الإدارات المعنية.'],
      ['الملاحظات القانونية على عقود الموردين', 'u_yousef', 20, 'أوصت الشؤون القانونية بتوحيد بند فصل المهام في نماذج عقود الشراء.'],
    ],
    decisions: [
      { text: 'اعتماد خطط المعالجة لملاحظات دورة المشتريات، مع مهلة 60 يوماً للملاحظات عالية الخطورة.', owner: 'u_yousef', due: K.day(40), agenda: 1 },
      { text: 'توسيع نطاق خطة التدقيق للعام القادم لتشمل عقود تقنية المعلومات.', owner: 'u_aisha', due: K.day(25), status: 'in_progress', agenda: 1 },
    ],
    actions: [
      { title: 'تحديث خطة التدقيق السنوية لتشمل عقود تقنية المعلومات', assignee: 'u_aisha', due: K.day(12), task: 'in_progress', priority: 'high', decision: 2 },
      { title: 'مراجعة الصيغة القانونية لبند فصل المهام في عقود الشراء', assignee: 'u_yousef', due: K.day(15), decision: 1 },
    ],
    minutes: { status: 'circulated', circulated: lt(addWorkingDays(d2, 1), 9), by: 'u_aisha', reviews: { u_president: 'approved', u_yousef: 'pending' } } });

  // --- past: Digital Transformation weekly (approved, circulated by the secretary on time)
  const d3 = wd(-5);
  meeting({ id: 'mt_demo_itweekly', title: 'الاجتماع الأسبوعي لفريق التحول الرقمي', type: 'management', organizer: 'u_mariam', secretary: 'u_ahmed', starts: lt(d3, 9), ends: lt(d3, 10), lead: 6,
    location: 'قاعة 2 — إدارة التحول الرقمي', link: 'https://meet.example.ae/j/dt-weekly',
    people: { u_sara: { rsvp: 'accepted' } }, present: ['u_mariam', 'u_ahmed', 'u_sara'],
    agenda: [
      ['مستجدات ترحيل الأنظمة إلى السحابة', 'u_ahmed', 20, 'اكتمل نقل ثلاثة أنظمة من أصل خمسة. تأخر نقل قاعدة بيانات الموارد بانتظار اختبار خطة الرجوع عند الفشل.'],
      ['متطلبات أتمتة طلبات الموظفين', 'u_sara', 20, 'حُصر 23 نموذج طلب، يمكن توحيد 15 منها في نموذج واحد كمرحلة أولى.'],
      ['جاهزية البوابة الموحدة', 'u_mariam', 15, 'مراجعة المخاطر قبل اجتماع الجاهزية مع الإدارات.'],
    ],
    decisions: [
      { text: 'تأجيل نقل قاعدة بيانات الموارد إلى ما بعد اختبار خطة الرجوع عند الفشل.', owner: 'u_ahmed', status: 'in_progress', agenda: 1 },
      { text: 'اعتماد نموذج الطلبات الموحد كمرحلة أولى لأتمتة طلبات الموظفين.', owner: 'u_sara', due: K.day(12), agenda: 2 },
    ],
    actions: [
      { title: 'اختبار خطة الرجوع عند الفشل لترحيل السحابة', assignee: 'u_ahmed', due: K.day(2), task: 'todo', priority: 'high', decision: 1 },
      { title: 'توثيق نماذج الطلبات الحالية وتصنيفها', assignee: 'u_sara', due: K.day(-2), task: 'done', decision: 2 },
    ],
    minutes: { status: 'approved', circulated: lt(addWorkingDays(d3, 1), 12), by: 'u_ahmed', approved: lt(addWorkingDays(d3, 2), 9), reviews: { u_mariam: 'approved', u_sara: 'approved' } } });

  // --- past: cloud migration project review (minutes circulated late → no points)
  const d4 = wd(-9);
  meeting({ id: 'mt_demo_cloud', title: 'مراجعة مشروع ترحيل الأنظمة إلى السحابة', type: 'project', project: 'pr_cloud', organizer: 'u_ahmed', starts: lt(d4, 11), ends: lt(d4, 12), lead: 4,
    location: 'عن بُعد', link: 'https://meet.example.ae/j/cloud-review', people: { u_mariam: { rsvp: 'accepted' } }, present: ['u_ahmed', 'u_mariam'],
    agenda: [['خطة نقل الأنظمة المتبقية', 'u_ahmed', 30, 'اتُّفق على نقل نظامَي الأرشفة والموارد على مرحلتين مع نافذة صيانة ليلية.'], ['مخاطر التوقف والتواصل مع المستخدمين', 'u_mariam', 20, 'يُرسل إشعار للمستخدمين قبل كل نافذة صيانة بثلاثة أيام عمل.']],
    decisions: [{ text: 'تنفيذ نقل الأنظمة المتبقية على مرحلتين خلال نوافذ صيانة ليلية.', owner: 'u_ahmed', status: 'in_progress', agenda: 1 }],
    minutes: { status: 'approved', circulated: lt(addWorkingDays(d4, 4), 10), by: 'u_ahmed', approved: lt(addWorkingDays(d4, 5), 10), reviews: { u_mariam: 'approved' } } });

  // --- past: customer service coordination (Operations)
  const d5 = wd(-12);
  meeting({ id: 'mt_demo_cx', title: 'تنسيق مؤشرات مركز خدمة المتعاملين', type: 'coordination', organizer: 'u_fatima', starts: lt(d5, 10), ends: lt(d5, 11), lead: 5,
    location: 'مركز خدمة المتعاملين — قاعة 1', people: { u_omar: { rsvp: 'accepted' }, u_sara: { rsvp: 'accepted', optional: true } }, present: ['u_fatima', 'u_omar', 'u_sara'],
    agenda: [['مؤشرات زمن الاستجابة', 'u_fatima', 25, 'متوسط زمن الاستجابة ثلاثة أيام عمل، والمستهدف يومان.'], ['متطلبات نظام إدارة التذاكر', 'u_sara', 20, 'حُددت المتطلبات الأساسية للتكامل مع البوابة الموحدة.']],
    decisions: [{ text: 'اعتماد مستهدف زمن استجابة يومَي عمل اعتباراً من الربع القادم.', owner: 'u_omar', due: K.day(20), agenda: 1 }],
    minutes: { status: 'approved', circulated: lt(addWorkingDays(d5, 1), 11), by: 'u_fatima', approved: lt(addWorkingDays(d5, 2), 10), reviews: { u_omar: 'approved', u_sara: 'approved' } } });

  // --- past: HR weekly — minutes still a draft (secretary must circulate)
  const d6 = wd(-2);
  meeting({ id: 'mt_demo_hr', title: 'اجتماع إدارة الموارد البشرية الأسبوعي', type: 'management', organizer: 'u_hessa', secretary: 'u_salem', starts: lt(d6, 8, 30), ends: lt(d6, 9, 30), lead: 5,
    location: 'مكتب مديرة الموارد البشرية', present: ['u_hessa', 'u_salem'],
    agenda: [['مراجعة طلبات التوظيف للربع الرابع', 'u_salem', 20, 'وردت 11 طلب توظيف من الإدارات، منها أربعة طلبات لوظائف تخصصية في التحول الرقمي.'], ['تحديث سياسة العمل المرن', 'u_hessa', 25, '']],
    decisions: [{ text: 'رفع مقترح تحديث سياسة العمل المرن إلى اللجنة التنفيذية.', owner: 'u_hessa', due: K.day(9), agenda: 2 }],
    actions: [{ title: 'إعداد مسودة سياسة العمل المرن المحدّثة', assignee: 'u_salem', due: K.day(6), task: 'todo', decision: 1 }],
    minutes: { status: 'draft' } });

  // --- today
  meeting({ id: 'mt_demo_launch', title: 'مراجعة جاهزية إطلاق البوابة الموحدة', type: 'project', project: 'pr_portal', organizer: 'u_mariam', secretary: 'u_sara', starts: launchStart, ends: plus(launchStart, 1.5), lead: 7,
    location: 'قاعة 2 — إدارة التحول الرقمي', link: 'https://meet.example.ae/j/portal-readiness', description: 'مراجعة قائمة الجاهزية قبل الإطلاق: الأداء، ربط الهوية، الدعم الفني والتواصل.',
    people: { u_ahmed: { rsvp: 'accepted' }, u_omar: { rsvp: 'tentative', optional: true, note: 'قد أتأخر ربع ساعة' }, u_latifa: { rsvp: 'accepted', optional: true } },
    agenda: [['نتائج اختبارات الأداء', 'u_ahmed', 25], ['ربط الهوية الموحدة — المخاطر المتبقية', 'u_ahmed', 20], ['خطة التواصل والدعم بعد الإطلاق', 'u_sara', 20], ['قرار موعد الإطلاق', 'u_mariam', 15]] });
  meeting({ id: 'mt_demo_service', title: 'تنسيق تشغيل مركز خدمة المتعاملين', type: 'coordination', organizer: 'u_omar', secretary: 'u_fatima', starts: serviceStart, ends: plus(serviceStart, 1), lead: 3,
    location: 'مركز خدمة المتعاملين — قاعة 1', people: { u_sara: { rsvp: 'pending', optional: true }, u_reem: { rsvp: 'accepted' } },
    agenda: [['جاهزية نظام إدارة التذاكر', 'u_fatima', 20], ['احتياجات التوريد للمركز', 'u_reem', 20], ['تكامل المركز مع البوابة الموحدة', null, 15]] });

  // --- upcoming
  const u1 = wd(1);
  meeting({ id: 'mt_demo_budget', title: 'مراجعة مقترحات موازنة الربع الرابع', type: 'management', organizer: 'u_majed', secretary: 'u_noura', starts: lt(u1, 10), ends: lt(u1, 11, 30), lead: 4,
    location: 'قاعة الإدارة المالية', people: { u_mariam: { rsvp: 'pending' }, u_hessa: { rsvp: 'accepted' }, u_omar: { rsvp: 'tentative', note: 'بانتظار تأكيد ورشة الإجراءات' } },
    agenda: [['مقترحات الموازنة لكل إدارة', 'u_noura', 40], ['ترشيد الإنفاق على التعاقدات الخارجية', 'u_majed', 30], ['احتياجات التحول الرقمي للعام القادم', 'u_mariam', 20]] });
  const u2 = wd(2);
  meeting({ id: 'mt_demo_innov', title: 'اجتماع لجنة الابتكار — تقييم أفكار الربع الثالث', type: 'committee', committee: 'cm_innov', organizer: 'u_latifa', secretary: 'u_hamad', starts: lt(u2, 12), ends: lt(u2, 13, 30), lead: 8,
    location: 'قاعة الابتكار', people: { u_president: { rsvp: 'accepted' }, u_mariam: { rsvp: 'pending' }, u_hessa: { rsvp: 'accepted' } },
    agenda: [['عرض الأفكار المرشحة للتنفيذ', 'u_hamad', 40], ['مقترح مسابقة الابتكار السنوية', 'u_latifa', 25], ['آلية تقدير أصحاب الأفكار المنفّذة', 'u_hessa', 15]] });
  const u3 = wd(3);
  meeting({ id: 'mt_demo_stores', title: 'مراجعة إجراءات المخازن', type: 'management', organizer: 'u_omar', starts: lt(u3, 9), ends: lt(u3, 10), lead: 6, cancelled: 'دُمج البند في ورشة تحديث إجراءات التشغيل',
    location: 'قاعة 1', people: { u_fatima: { rsvp: 'accepted' } }, agenda: [['تحديث دليل إجراءات المخازن', 'u_fatima', 30]] });
  const u4 = wd(4);
  meeting({ id: 'mt_demo_proc', title: 'لجنة المشتريات — تقييم عروض مناقصة الخدمات السحابية', type: 'committee', committee: 'cm_proc', organizer: 'u_majed', secretary: 'u_reem', confidential: true, starts: lt(u4, 10), ends: lt(u4, 12), lead: 7,
    location: 'قاعة اللجان — الطابق الثالث', people: { u_mariam: { rsvp: 'accepted' }, u_yousef: { rsvp: 'tentative', note: 'سأؤكد بعد مراجعة جدول الجلسات' } },
    agenda: [['التقييم الفني للعروض الأربعة', 'u_mariam', 45], ['التقييم المالي ومقارنة الأسعار', 'u_reem', 30], ['الملاحظات القانونية على شروط العقد', 'u_yousef', 20], ['التوصية بالترسية', 'u_majed', 20]] });
  const u5 = wd(6);
  meeting({ id: 'mt_demo_legal', title: 'تنسيق مراجعة عقود الموردين', type: 'coordination', organizer: 'u_yousef', starts: lt(u5, 13), ends: lt(u5, 14), lead: 5,
    link: 'https://meet.example.ae/j/contracts-review', people: { u_reem: { rsvp: 'accepted' }, u_majed: { rsvp: 'pending', optional: true } },
    agenda: [['العقود المنتهية خلال الربع القادم', 'u_reem', 20], ['تحديث نماذج العقود الموحدة', 'u_yousef', 25]] });
  const u6 = wd(8);
  meeting({ id: 'mt_demo_strategy', title: 'ورشة مراجعة مؤشرات الخطة الاستراتيجية', type: 'coordination', organizer: 'u_latifa', secretary: 'u_hamad', starts: lt(u6, 9), ends: lt(u6, 12), lead: 10,
    location: 'قاعة الابتكار', description: 'ورشة مع الإدارات لمراجعة مستهدفات المؤشرات للعام القادم.',
    people: { u_hessa: { rsvp: 'accepted' }, u_omar: { rsvp: 'accepted' }, u_mariam: { rsvp: 'pending' }, u_majed: { rsvp: 'pending' } },
    agenda: [['قراءة نتائج المؤشرات الحالية', 'u_hamad', 45], ['مقترحات المستهدفات لكل إدارة', null, 90], ['الخطوات التالية', 'u_latifa', 15]] });
  const u7 = wd(10);
  meeting({ id: 'mt_demo_exec_next', title: 'اجتماع اللجنة التنفيذية — متابعة الخطة التصحيحية', type: 'committee', committee: 'cm_exec', organizer: 'u_president', secretary: 'u_latifa', starts: lt(u7, 9), ends: lt(u7, 11), lead: 3,
    location: 'قاعة المجلس — المبنى الرئيسي', people: { u_mariam: {}, u_omar: {}, u_majed: {}, u_hessa: {}, u_yousef: {} },
    agenda: [['نتائج الخطة التصحيحية لمؤشرَي رضا المتعاملين والأتمتة', 'u_latifa', 30], ['موعد إطلاق البوابة الموحدة', 'u_mariam', 20], ['مقترح سياسة العمل المرن', 'u_hessa', 20]] });
}
