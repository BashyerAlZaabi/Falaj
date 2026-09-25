// Performance Management — constants, schema and the competency framework.
// The framework is configuration (not demo data), so it is seeded with the
// schema and exists even when SEED_DEMO=0.
import { db, run, json } from '../kit.js';

export const KEY = 'performance';
export const HR_CAP = 'performance.hr';
export const DOMAIN = 'performance.reviews';

// Annual cycle phases (advanced by HR, one step at a time, with confirmation).
export const PHASES = ['goal_setting', 'midyear', 'self_assessment', 'manager_assessment', 'calibration', 'acknowledgement', 'closed'];
export const SCHEDULED = PHASES.slice(0, 6); // phases that carry start/end dates
export const PHASE_LABEL = {
  goal_setting: ['تحديد الأهداف', 'Goal setting'],
  midyear: ['المراجعة المرحلية', 'Mid-year check-in'],
  self_assessment: ['التقييم الذاتي', 'Self-assessment'],
  manager_assessment: ['تقييم المدير', 'Manager assessment'],
  calibration: ['المعايرة', 'Calibration'],
  acknowledgement: ['الاطلاع والإقرار', 'Acknowledgement'],
  closed: ['مغلقة', 'Closed'],
};
export const NEXT_PHASE = Object.fromEntries(PHASES.slice(0, -1).map((p, i) => [p, [PHASES[i + 1]]]));
export const phaseIndex = (p) => PHASES.indexOf(p);
export const phaseAr = (p) => PHASE_LABEL[p]?.[0] || p;

// Per-review workflow (state machine; kit.transition enforces it).
export const STATUSES = ['planning', 'active', 'self_submitted', 'assessed', 'acknowledged'];
export const STATUS_LABEL = {
  planning: ['صياغة الأهداف', 'Setting objectives'],
  active: ['الأهداف معتمدة', 'Objectives agreed'],
  self_submitted: ['أُرسل التقييم الذاتي', 'Self-assessment submitted'],
  assessed: ['قيّمه المدير', 'Assessed by manager'],
  acknowledged: ['أقرّ الموظف بالاطلاع', 'Acknowledged'],
};
export const REVIEW_FLOW = {
  planning: ['active'],
  active: ['planning', 'self_submitted', 'assessed'],
  self_submitted: ['assessed'],
  assessed: ['acknowledged'],
};
export const statusLabels = Object.fromEntries(Object.entries(STATUS_LABEL).map(([k, v]) => [k, v[0]]));
export const phaseLabels = Object.fromEntries(Object.entries(PHASE_LABEL).map(([k, v]) => [k, v[0]]));

// Phases in which each action is open.
export const OBJECTIVE_PHASES = ['goal_setting', 'midyear', 'self_assessment', 'manager_assessment'];
export const REOPEN_PHASES = ['goal_setting', 'midyear'];
export const ASSESS_PHASES = ['self_assessment', 'manager_assessment'];
export const RELEASED_PHASES = ['acknowledgement', 'closed'];

// Rating bands on the 1–5 scale (overall score → band).
export const BANDS = [
  { key: 'exceptional', min: 4.5, ar: 'يفوق التوقعات بشكل استثنائي', en: 'Exceptional' },
  { key: 'exceeds', min: 3.5, ar: 'يفوق التوقعات', en: 'Exceeds expectations' },
  { key: 'meets', min: 2.5, ar: 'يلبي التوقعات', en: 'Meets expectations' },
  { key: 'improve', min: 1.5, ar: 'يحتاج إلى تحسين', en: 'Needs improvement' },
  { key: 'unsatisfactory', min: 0, ar: 'غير مُرضٍ', en: 'Unsatisfactory' },
];
export const BAND_KEYS = BANDS.map((b) => b.key);
export const bandOf = (score) => (score == null ? null : BANDS.find((b) => score >= b.min - 1e-9)?.key || 'unsatisfactory');
export const bandAr = (k) => BANDS.find((b) => b.key === k)?.ar || '—';

export const SCALE = [
  { n: 1, ar: 'غير مُرضٍ', en: 'Unsatisfactory', desc_ar: 'لم يتحقق المستهدف ولم تظهر السلوكيات المتوقعة.', desc_en: 'Target not met; expected behaviours not shown.' },
  { n: 2, ar: 'يحتاج إلى تحسين', en: 'Needs improvement', desc_ar: 'تحقق جزء من المستهدف وتظهر السلوكيات بشكل متقطع.', desc_en: 'Target partly met; behaviours shown inconsistently.' },
  { n: 3, ar: 'يلبي التوقعات', en: 'Meets expectations', desc_ar: 'تحقق المستهدف بالجودة والتوقيت المتفق عليهما.', desc_en: 'Target met with the agreed quality and timing.' },
  { n: 4, ar: 'يفوق التوقعات', en: 'Exceeds expectations', desc_ar: 'تجاوز المستهدف بوضوح وأثّر إيجاباً في عمل الفريق.', desc_en: 'Target clearly exceeded with a positive effect on the team.' },
  { n: 5, ar: 'استثنائي', en: 'Exceptional', desc_ar: 'أثر استثنائي ممتد ونموذج يُحتذى به داخل الجهة.', desc_en: 'Exceptional, lasting impact; a role model across the entity.' },
];

export const MIN_GROUP = 5;          // minimum reviews before a rating distribution is shown to a wider audience
export const OBJ_MIN = 3; export const OBJ_MAX = 7;
export const DEFAULT_SHARE = 70;     // objectives share of the overall score (competencies = the rest)

// ---------------- competency framework ----------------
export const FRAMEWORK = [
  {
    id: 'comp_leadership', sort: 1, icon: 'compass', ar: 'القيادة', en: 'Leadership',
    d_ar: 'توجيه الجهد نحو الأولويات، وتمكين الآخرين، واتخاذ القرار بمسؤولية — تنطبق على قيادة الذات لمن لا يدير فريقاً.',
    d_en: 'Directing effort to priorities, enabling others and deciding responsibly — self-leadership for those without a team.',
    b: [
      ['يربط عمله وعمل فريقه بوضوح بالأولويات الاستراتيجية للجهة.', 'Clearly links own and team work to the entity’s strategic priorities.'],
      ['يبادر ويتحمل ملكية النتائج دون انتظار التوجيه.', 'Takes initiative and owns outcomes without waiting to be told.'],
      ['يتخذ قرارات مدروسة في الوقت المناسب ويشرح أسبابها.', 'Makes timely, well-reasoned decisions and explains them.'],
      ['يطوّر قدرات الآخرين ويقدّم تغذية راجعة بنّاءة ومنتظمة.', 'Develops others and gives regular, constructive feedback.'],
    ],
  },
  {
    id: 'comp_collaboration', sort: 2, icon: 'handshake', ar: 'التعاون', en: 'Collaboration',
    d_ar: 'بناء علاقات عمل مثمرة داخل الإدارة وعبر الإدارات لتحقيق أهداف مشتركة.',
    d_en: 'Building productive working relationships within and across departments towards shared goals.',
    b: [
      ['يشارك المعرفة والمعلومات بشفافية وفي الوقت المناسب.', 'Shares knowledge and information openly and on time.'],
      ['يقدّم أهداف الفريق المشتركة على المصلحة الفردية.', 'Puts shared team goals ahead of individual interest.'],
      ['يدير الخلافات بمهنية واحترام ويبحث عن حلول مشتركة.', 'Handles disagreement professionally and seeks joint solutions.'],
      ['يدعم زملاءه في الإدارات الأخرى عند الحاجة.', 'Supports colleagues in other departments when needed.'],
    ],
  },
  {
    id: 'comp_service', sort: 3, icon: 'heartHandshake', ar: 'التميّز في الخدمة', en: 'Service excellence',
    d_ar: 'وضع المتعامل الداخلي والخارجي في صميم العمل والالتزام بمعايير الجودة والمواعيد.',
    d_en: 'Putting internal and external customers at the heart of the work and meeting quality and time standards.',
    b: [
      ['يفهم احتياجات المتعامل ويستجيب لها بلباقة ودقة.', 'Understands customer needs and responds courteously and accurately.'],
      ['يلتزم بمعايير الجودة والمواعيد المعلنة للخدمة.', 'Meets published quality and time standards.'],
      ['يستخدم الملاحظات والشكاوى لتحسين الخدمة باستمرار.', 'Uses feedback and complaints to keep improving the service.'],
      ['يبسّط الإجراءات ويقلّل الجهد المطلوب من المتعامل.', 'Simplifies procedures and reduces customer effort.'],
    ],
  },
  {
    id: 'comp_innovation', sort: 4, icon: 'lightbulb', ar: 'الابتكار', en: 'Innovation',
    d_ar: 'تحسين طرق العمل وتبنّي الحلول الرقمية والتعلّم المستمر من التجربة.',
    d_en: 'Improving how work is done, adopting digital solutions and learning continuously from experience.',
    b: [
      ['يقترح أفكاراً عملية قابلة للتنفيذ لتحسين الإجراءات.', 'Proposes practical, implementable ideas to improve processes.'],
      ['يتبنّى الأدوات الرقمية والتقنيات الحديثة في عمله.', 'Adopts digital tools and modern technologies in daily work.'],
      ['يجرّب ويقيس ويتعلّم من النتائج دون خوف من الإخفاق.', 'Experiments, measures and learns from results without fear of failure.'],
      ['يتحدى الافتراضات السائدة بطريقة بنّاءة.', 'Challenges assumptions constructively.'],
    ],
  },
  {
    id: 'comp_integrity', sort: 5, icon: 'shield', ar: 'النزاهة والمسؤولية', en: 'Integrity & accountability',
    d_ar: 'الالتزام بمدونة السلوك الوظيفي وحماية المال العام والمعلومات وتحمّل مسؤولية النتائج.',
    d_en: 'Upholding the code of conduct, protecting public funds and information, and owning results.',
    b: [
      ['يلتزم بمدونة السلوك الوظيفي والقوانين والسياسات المعتمدة.', 'Complies with the code of conduct, laws and approved policies.'],
      ['يحافظ على سرية المعلومات ويحسن استخدام الموارد العامة.', 'Protects confidential information and uses public resources wisely.'],
      ['يعترف بالأخطاء ويعالجها بشفافية.', 'Acknowledges mistakes and addresses them transparently.'],
      ['يفي بالتزاماته ويتحمل مسؤولية نتائج عمله.', 'Keeps commitments and is accountable for results.'],
    ],
  },
];

export function schema() {
  db.exec(`
CREATE TABLE IF NOT EXISTS performance_cycles (
  id TEXT PRIMARY KEY, year INTEGER NOT NULL, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('goal_setting','midyear','self_assessment','manager_assessment','calibration','acknowledgement','closed')),
  objectives_share INTEGER NOT NULL DEFAULT 70 CHECK (objectives_share BETWEEN 50 AND 90),
  created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS performance_phases (
  cycle_id TEXT NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
  phase TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
  opened_at TEXT, opened_by TEXT,
  PRIMARY KEY (cycle_id, phase)
);
CREATE TABLE IF NOT EXISTS performance_competencies (
  id TEXT PRIMARY KEY, sort INTEGER NOT NULL, icon TEXT, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  description_ar TEXT, description_en TEXT, behaviours TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS performance_reviews (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES users(id),
  manager_id TEXT REFERENCES users(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','self_submitted','assessed','acknowledged')),
  objectives_agreed_at TEXT, objectives_agreed_by TEXT,
  mid_emp_note TEXT, mid_emp_at TEXT, mid_mgr_note TEXT, mid_mgr_at TEXT, mid_mgr_by TEXT,
  self_comment TEXT, self_saved_at TEXT, self_submitted_at TEXT,
  mgr_comment TEXT, mgr_saved_at TEXT, mgr_submitted_at TEXT, assessed_by TEXT, no_self INTEGER NOT NULL DEFAULT 0,
  obj_score REAL, comp_score REAL, score REAL, band TEXT,
  final_band TEXT, calibrated_at TEXT, calibrated_by TEXT, calibration_note TEXT,
  ack_at TEXT, disagreement TEXT,
  disagreement_status TEXT CHECK (disagreement_status IS NULL OR disagreement_status IN ('open','resolved')),
  hr_response TEXT, hr_response_by TEXT, hr_response_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cycle_id, employee_id)
);
CREATE INDEX IF NOT EXISTS ix_perf_reviews_mgr ON performance_reviews(manager_id, cycle_id);
CREATE INDEX IF NOT EXISTS ix_perf_reviews_dept ON performance_reviews(department_id, cycle_id);
CREATE TABLE IF NOT EXISTS performance_objectives (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL, measure TEXT, weight INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','goals')), source_ref TEXT,
  self_pct INTEGER CHECK (self_pct IS NULL OR self_pct BETWEEN 0 AND 100), self_note TEXT,
  mgr_rating INTEGER CHECK (mgr_rating IS NULL OR mgr_rating BETWEEN 1 AND 5), mgr_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_perf_obj_review ON performance_objectives(review_id);
CREATE TABLE IF NOT EXISTS performance_comp_ratings (
  review_id TEXT NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL REFERENCES performance_competencies(id),
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5), note TEXT,
  PRIMARY KEY (review_id, competency_id)
);
CREATE TABLE IF NOT EXISTS performance_calibrations (
  id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  from_band TEXT, to_band TEXT NOT NULL, justification TEXT, by_user TEXT NOT NULL, at TEXT NOT NULL
);
`);
  for (const c of FRAMEWORK) {
    run(`INSERT INTO performance_competencies (id,sort,icon,name_ar,name_en,description_ar,description_en,behaviours) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET sort=excluded.sort, icon=excluded.icon, name_ar=excluded.name_ar, name_en=excluded.name_en,
      description_ar=excluded.description_ar, description_en=excluded.description_en, behaviours=excluded.behaviours`,
    c.id, c.sort, c.icon, c.ar, c.en, c.d_ar, c.d_en, JSON.stringify(c.b.map(([ar, en]) => ({ ar, en }))));
  }
}

export function competencies() {
  return db.prepare('SELECT * FROM performance_competencies WHERE active=1 ORDER BY sort').all()
    .map((c) => ({ id: c.id, icon: c.icon, name_ar: c.name_ar, name_en: c.name_en, description_ar: c.description_ar, description_en: c.description_en, behaviours: json(c.behaviours, []) }));
}
