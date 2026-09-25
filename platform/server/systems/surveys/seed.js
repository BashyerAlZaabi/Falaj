// Surveys — demo seed (idempotent). Realistic Arabic content, dated relative to
// today, coherent with the personas: every response has exactly one participation
// row (and nothing links the two), response rates match the audience.
//  * «استبيان الارتباط الوظيفي 2026» — HR (hessa), open, anonymous, 10 of 16 staff.
//  * «رضا الموظفين عن خدمات تقنية المعلومات» — SPMO (latifa), closed, anonymous,
//    results shared with participants, 10 of 12 invited (IT excluded: it rates itself).
//  * «موعد الجلسة الأسبوعية في القاعة الكبرى» — HR (salem), open, NON-anonymous poll
//    for directors, 5 of 8.
//  * «تقييم ورشة التخطيط الاستراتيجي 2027» — SPMO (latifa), draft.
import crypto from 'node:crypto';
import { run, one, day, isEmpty } from '../kit.js';
import { weekStart } from './service.js';

const rid = () => crypto.randomBytes(16).toString('hex');

function survey({ id, title, description, author, status, anonymous = 1, audienceType = 'all', audience = [], opens, closes, share = 0, eligibleCount = null, publishedAt = null, closedAt = null }) {
  run(`INSERT INTO surveys_surveys (id,title,description,author_id,status,anonymous,audience_type,audience,opens_on,closes_on,share_results,eligible_count,announced,published_at,closed_at,is_demo,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
  id, title, description, author, status, anonymous, audienceType, JSON.stringify(audience), opens, closes, share, eligibleCount, status === 'draft' ? 0 : 1, publishedAt, closedAt, `${day(-45)} 08:00:00`, `${status === 'draft' ? day(-1) : opens} 08:00:00`);
}
function section(id, surveyId, title, position, description = '') {
  run('INSERT INTO surveys_sections (id,survey_id,title,description,position) VALUES (?,?,?,?,?)', id, surveyId, title, description, position);
}
function question(id, surveyId, sectionId, position, type, text, { required = 1, help = '', options = [] } = {}) {
  run('INSERT INTO surveys_questions (id,survey_id,section_id,position,type,text,help,required,options) VALUES (?,?,?,?,?,?,?,?,?)',
    id, surveyId, sectionId, position, type, text, help, required, JSON.stringify(options.map((label, i) => ({ id: `o${i + 1}`, label }))));
}
// One respondent: participation (who) + an unlinked response (what).
function respond(surveyId, username, daysAgo, answers, { named = false } = {}) {
  const u = one('SELECT id, department_id FROM users WHERE username=?', username);
  if (!u) return;
  const date = day(-daysAgo);
  run('INSERT OR IGNORE INTO surveys_participation (survey_id,user_id,responded_on) VALUES (?,?,?)', surveyId, u.id, date);
  const r = rid();
  run('INSERT INTO surveys_responses (id,survey_id,dept_id,period,batch,user_id) VALUES (?,?,?,?,NULL,?)', r, surveyId, u.department_id, weekStart(date), named ? u.id : null);
  for (const [qid, v] of Object.entries(answers)) {
    if (v == null || v === '') continue;
    const num = typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : null;
    const choices = Array.isArray(v) ? JSON.stringify(v) : typeof v === 'string' && /^o\d+$/.test(v) ? JSON.stringify([v]) : null;
    const text = typeof v === 'string' && !choices ? v : null;
    run('INSERT INTO surveys_answers (response_id,question_id,survey_id,num,text,choices) VALUES (?,?,?,?,?,?)', r, qid, surveyId, num, text, choices);
  }
}
const release = (surveyId) => run('UPDATE surveys_responses SET batch=1 WHERE survey_id=? AND batch IS NULL', surveyId);

export function seedSurveys() {
  if (!isEmpty('surveys_surveys')) return;
  if (!one("SELECT 1 FROM users WHERE username='hessa'")) return;

  // ---------- 1) Employee engagement (open, anonymous, all staff) ----------
  const E = 'sv_demo_engagement';
  survey({ id: E, title: 'استبيان الارتباط الوظيفي 2026', author: 'u_hessa', status: 'published', opens: day(-9), closes: day(5), share: 1, publishedAt: `${day(-9)}T05:30:00.000Z`,
    description: 'يقيس هذا الاستبيان السنوي مستوى ارتباط الموظفين ورضاهم عن بيئة العمل والقيادة وفرص التطوير. تُستخدم النتائج المجمّعة في إعداد خطة تحسين تجربة الموظف للعام القادم.' });
  section('ss_e1', E, 'بيئة العمل والأدوات', 0); section('ss_e2', E, 'القيادة والتواصل', 1); section('ss_e3', E, 'التطوير والتقدير', 2); section('ss_e4', E, 'رأيك بكلماتك', 3, 'سؤال اختياري — تجنّب ذكر أسماء أو تفاصيل تكشف هويتك.');
  question('q_e1', E, 'ss_e1', 0, 'rating', 'أشعر بالفخر لعملي في هذه الجهة');
  question('q_e2', E, 'ss_e1', 1, 'rating', 'لدي الأدوات والأنظمة التي أحتاجها لأداء عملي بكفاءة');
  question('q_e3', E, 'ss_e2', 0, 'rating', 'يوفّر مديري المباشر توجيهاً واضحاً ودعماً مستمراً');
  question('q_e4', E, 'ss_e2', 1, 'yesno', 'هل تصلك المعلومات المهمة عن قرارات الجهة في الوقت المناسب؟');
  question('q_e5', E, 'ss_e3', 0, 'single', 'ما أكثر ما يحفّزك على الاستمرار والتميّز في عملك؟', { options: ['فرص التطوير والتدريب', 'التقدير والحوافز', 'المرونة والتوازن', 'وضوح الأهداف', 'بيئة العمل والزملاء'] });
  question('q_e6', E, 'ss_e3', 1, 'multi', 'ما المجالات التي تقترح أن تركّز عليها الجهة خلال العام القادم؟', { help: 'اختر كل ما ينطبق', options: ['التدريب المتخصص', 'تحديث الأنظمة الرقمية', 'تبسيط الإجراءات', 'برامج التقدير', 'المرونة في العمل', 'تحسين المرافق'] });
  question('q_e7', E, 'ss_e3', 2, 'nps', 'ما مدى احتمال أن توصي بالجهة كمكان عمل لصديق أو قريب؟');
  question('q_e8', E, 'ss_e4', 0, 'text', 'ما الأمر الوحيد الذي لو تغيّر لجعل تجربتك في العمل أفضل؟', { required: 0 });
  const eng = (a, b, c, d, e, f, g, h) => ({ q_e1: a, q_e2: b, q_e3: c, q_e4: d, q_e5: e, q_e6: f, q_e7: g, q_e8: h });
  respond(E, 'ahmed', 8, eng(5, 3, 4, true, 'o1', ['o1', 'o2'], 8, 'بطء الأنظمة الداخلية يؤخر إنجاز المعاملات، ونحتاج إلى تحديث الأجهزة والشبكة'));
  respond(E, 'sara', 8, eng(4, 4, 5, true, 'o4', ['o1', 'o3'], 9, 'أتمنى برامج تدريب متخصصة ومسار تطوير واضح لكل موظف'));
  respond(E, 'omar', 7, eng(5, 4, 4, true, 'o4', ['o3', 'o2'], 9, null));
  respond(E, 'fatima', 6, eng(4, 3, 4, false, 'o3', ['o5', 'o3'], 7, 'مرونة أكبر في ساعات الدوام والعمل عن بعد عند الحاجة'));
  respond(E, 'noura', 5, eng(4, 2, 3, false, 'o2', ['o2', 'o4'], 6, 'تبسيط إجراءات الموافقات وتقليل التوقيعات الورقية في المعاملات المالية'));
  respond(E, 'reem', 5, eng(4, 3, 4, true, 'o1', ['o3', 'o1'], 8, 'الأنظمة جيدة لكن الدعم الفني يتأخر أحياناً، ونحتاج دورات على الأنظمة الجديدة'));
  respond(E, 'hamad', 3, eng(5, 4, 5, true, 'o4', ['o1', 'o2'], 10, 'تحسين التواصل حول القرارات المهمة قبل تعميمها، ووضوح أكبر في الأولويات'));
  respond(E, 'salem', 2, eng(4, 4, 4, true, 'o2', ['o4', 'o5'], 8, null));
  respond(E, 'yousef', 1, eng(4, 3, 3, false, 'o5', ['o3', 'o6'], 7, 'زيادة التقدير والحوافز للفرق التي تنجز مشاريع استثنائية'));
  respond(E, 'saeed', 1, eng(3, 3, 4, true, 'o1', ['o1', 'o6'], 6, null));
  release(E);

  // ---------- 2) IT services satisfaction (closed, anonymous, shared) ----------
  const I = 'sv_demo_itsat';
  const notIt = ['dept_ops', 'dept_fin', 'dept_spmo', 'dept_hr', 'dept_legal', 'dept_ia'];
  survey({ id: I, title: 'رضا الموظفين عن خدمات تقنية المعلومات — الربع الثالث', author: 'u_latifa', status: 'closed', audienceType: 'departments', audience: notIt, opens: day(-40), closes: day(-12), share: 1, eligibleCount: 12,
    publishedAt: `${day(-40)}T05:00:00.000Z`, closedAt: `${day(-11)}T04:00:00.000Z`,
    description: 'قياس ربع سنوي لمؤشر «رضا المتعاملين الداخليين» ضمن الخطة الاستراتيجية: سرعة الدعم الفني وجودته وسهولة البوابة الموحدة. يُستثنى موظفو إدارة التحول الرقمي لأنهم مقدّمو الخدمة.' });
  section('ss_i1', I, 'جودة الخدمة', 0); section('ss_i2', I, 'قنوات الدعم', 1);
  question('q_i1', I, 'ss_i1', 0, 'rating', 'سرعة الاستجابة لطلبات الدعم الفني');
  question('q_i2', I, 'ss_i1', 1, 'rating', 'جودة حل المشكلات من المحاولة الأولى');
  question('q_i3', I, 'ss_i1', 2, 'rating', 'سهولة استخدام البوابة الموحدة للخدمات');
  question('q_i4', I, 'ss_i2', 0, 'single', 'ما القناة التي تفضّلها لطلب الدعم الفني؟', { options: ['البوابة الموحدة', 'الهاتف', 'البريد الإلكتروني', 'الحضور إلى مكتب الدعم'] });
  question('q_i5', I, 'ss_i2', 1, 'yesno', 'هل حُلّ آخر طلب دعم قدّمته خلال الوقت المتوقع؟');
  question('q_i6', I, 'ss_i2', 2, 'nps', 'ما مدى احتمال أن توصي زملاءك بالتواصل مع فريق الدعم الفني؟');
  question('q_i7', I, 'ss_i2', 3, 'text', 'ما اقتراحك لتحسين خدمات تقنية المعلومات؟', { required: 0 });
  const it = (a, b, c, d, e, f, g) => ({ q_i1: a, q_i2: b, q_i3: c, q_i4: d, q_i5: e, q_i6: f, q_i7: g });
  respond(I, 'omar', 38, it(4, 4, 3, 'o1', true, 8, 'تحديث البوابة لتعرض حالة الطلب لحظياً'));
  respond(I, 'fatima', 37, it(5, 4, 4, 'o1', true, 9, 'فريق متعاون جداً وسريع، شكراً لهم'));
  respond(I, 'noura', 35, it(3, 3, 3, 'o3', false, 6, 'سرعة الاستجابة جيدة لكن الحل النهائي يتأخر أحياناً'));
  respond(I, 'majed', 33, it(4, 5, 4, 'o2', true, 9, null));
  respond(I, 'reem', 30, it(4, 3, 2, 'o1', true, 7, 'تحسين سرعة الشبكة في الطابق الثاني'));
  respond(I, 'hessa', 24, it(4, 4, 3, 'o3', true, 8, 'دورات قصيرة للموظفين على استخدام الأنظمة الجديدة'));
  respond(I, 'salem', 22, it(3, 3, 4, 'o2', false, 6, null));
  respond(I, 'yousef', 19, it(4, 4, 3, 'o4', true, 8, 'تخصيص رقم مباشر للدعم العاجل خارج أوقات الذروة'));
  respond(I, 'saeed', 16, it(5, 4, 4, 'o1', true, 9, null));
  respond(I, 'aisha', 14, it(4, 4, 5, 'o1', true, 9, 'البوابة سهلة الاستخدام، ونقترح إضافة دليل مختصر لكل خدمة'));
  release(I);

  // ---------- 3) Meeting-room poll (open, NON-anonymous, directors) ----------
  const P = 'sv_demo_rooms';
  survey({ id: P, title: 'موعد الجلسة الأسبوعية للمديرين في القاعة الكبرى', author: 'u_salem', status: 'published', anonymous: 0, audienceType: 'roles', audience: ['manager', 'president'], opens: day(-3), closes: day(4), share: 1, publishedAt: `${day(-3)}T06:00:00.000Z`,
    description: 'لتنظيم حجز القاعة الكبرى للجلسة التنسيقية الأسبوعية للمديرين. هذا الاستبيان غير مجهول: يطّلع المُعِدّ على قائمة من شارك لتنسيق الحجز، وتُعرض النتائج مجمّعة.' });
  section('ss_p1', P, 'الموعد والتجهيزات', 0);
  question('q_p1', P, 'ss_p1', 0, 'single', 'ما الموعد الأنسب للجلسة الأسبوعية؟', { options: ['الأحد 9:00 صباحاً', 'الاثنين 10:00 صباحاً', 'الثلاثاء 11:00 صباحاً', 'الأربعاء 9:30 صباحاً'] });
  question('q_p2', P, 'ss_p1', 1, 'multi', 'ما التجهيزات التي تحتاجها في القاعة؟', { options: ['شاشة عرض مزدوجة', 'نظام اتصال مرئي', 'سبورة ذكية', 'ضيافة خفيفة'] });
  question('q_p3', P, 'ss_p1', 2, 'yesno', 'هل تفضّل إتاحة المشاركة عن بُعد؟');
  question('q_p4', P, 'ss_p1', 3, 'text', 'ملاحظات إضافية', { required: 0 });
  const poll = (a, b, c, d) => ({ q_p1: a, q_p2: b, q_p3: c, q_p4: d });
  respond(P, 'omar', 3, poll('o2', ['o1', 'o2'], true, 'يُفضّل أن تنتهي الجلسة قبل الساعة 12 ظهراً'), { named: true });
  respond(P, 'majed', 2, poll('o2', ['o1'], false, null), { named: true });
  respond(P, 'yousef', 2, poll('o3', ['o2', 'o4'], true, null), { named: true });
  respond(P, 'aisha', 1, poll('o2', ['o1', 'o2'], true, null), { named: true });
  respond(P, 'latifa', 1, poll('o1', ['o1', 'o3'], true, 'نقترح حجز القاعة لمدة ساعة ونصف'), { named: true });
  release(P);

  // ---------- 4) Draft ----------
  const D = 'sv_demo_workshop';
  survey({ id: D, title: 'تقييم ورشة التخطيط الاستراتيجي 2027', author: 'u_latifa', status: 'draft', audienceType: 'roles', audience: ['manager', 'president'], opens: day(3), closes: day(17),
    description: 'تقييم ورشة إعداد الخطة التشغيلية 2027 لتحسين تنظيم الورش القادمة.' });
  section('ss_d1', D, 'تقييم الورشة', 0);
  question('q_d1', D, 'ss_d1', 0, 'rating', 'وضوح أهداف الورشة ومخرجاتها');
  question('q_d2', D, 'ss_d1', 1, 'rating', 'ملاءمة المدة والتنظيم');
  question('q_d3', D, 'ss_d1', 2, 'text', 'ما مقترحاتك لتحسين الورشة القادمة؟', { required: 0 });
}
