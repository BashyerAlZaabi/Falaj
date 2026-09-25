// Seeds the organisation structure, platform configuration (AI services,
// agents, skills, apps) and clearly-flagged DEMO work data (is_demo = 1).
import { db, run, one, uid, tx } from './db.js';
import { hashPassword } from './identity.js';
import { SKILL_DEFS } from './ai/skills.js';

const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at = (n, h, m = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h, m, 0, 0); return d.toISOString(); };

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2026';

export function seedConfig() {
  // ---- AI providers (keys referenced by env var name only) ----
  const prov = (id, name, kind, base_url, model, env) => run(`INSERT OR IGNORE INTO ai_providers (id,name,kind,base_url,model,api_key_env,enabled) VALUES (?,?,?,?,?,?,1)`, id, name, kind, base_url, model, env);
  prov('ap_local', 'الفهم المحلي (قواعد) — Local rules', 'local', null, null, null);
  prov('ap_browser_speech', 'صوت المتصفح — Web Speech API', 'local', null, null, null);
  prov('ap_anthropic', 'Anthropic Claude', 'anthropic', 'https://api.anthropic.com', process.env.ANTHROPIC_MODEL || 'claude-sonnet-5', 'ANTHROPIC_API_KEY');
  prov('ap_gateway', 'بوابة نماذج مؤسسية (OpenAI-compatible)', 'openai_compatible', process.env.LLM_GATEWAY_URL || 'https://llm-gateway.example.internal/v1', process.env.LLM_GATEWAY_MODEL || 'enterprise-model', 'LLM_GATEWAY_KEY');
  for (const c of ['chat', 'generate', 'summarize', 'analyze']) run('INSERT OR IGNORE INTO ai_routing (capability,provider_id) VALUES (?,?)', c, 'ap_anthropic');
  for (const c of ['stt', 'tts']) run('INSERT OR IGNORE INTO ai_routing (capability,provider_id) VALUES (?,?)', c, 'ap_browser_speech');

  // ---- Agents ----
  // Upsert keeps admin choices (enabled, allowed_roles) while refreshing tool lists.
  const agent = (key, ar, en, dar, den, tools, roles, instr) => run(`INSERT INTO agents (key,name_ar,name_en,description_ar,description_en,tools,allowed_roles,instructions,enabled) VALUES (?,?,?,?,?,?,?,?,1)
    ON CONFLICT(key) DO UPDATE SET name_ar=excluded.name_ar,name_en=excluded.name_en,description_ar=excluded.description_ar,description_en=excluded.description_en,tools=excluded.tools,instructions=excluded.instructions`, key, ar, en, dar, den, JSON.stringify(tools), JSON.stringify(roles), instr);
  const ALL = ['employee', 'manager', 'president'];
  agent('work', 'مساعد الأعمال', 'Work agent', 'المشاريع والمهام والمواعيد والبحث والملخص اليومي', 'Projects, tasks, appointments, search, daily summary',
    ['get_daily_summary', 'get_my_achievements', 'list_projects', 'get_project', 'find_project', 'list_tasks', 'list_events', 'search_workspace', 'list_assignable_users', 'create_project', 'update_project', 'create_task', 'update_task', 'create_event', 'delete_project', 'delete_task'], ALL,
    'ينفّذ عمليات المشاريع والمهام ضمن نطاق المستخدم. لا يفترض نسب الإنجاز.');
  agent('dashboard', 'مساعد الداشبورد', 'Dashboard agent', 'تخصيص عناصر الداشبورد وطريقة عرضها', 'Customise dashboard widgets and views',
    ['get_dashboard', 'add_widget', 'update_widget', 'reorder_widgets', 'remove_widget', 'restore_dashboard', 'get_kpis'], ALL,
    'يغيّر طريقة العرض فقط ولا يعدّل بيانات المصدر.');
  agent('docs', 'مساعد المستندات', 'Documents agent', 'إنشاء المستندات وتعديلها وإصداراتها وتصديرها والمهارات', 'Create/edit/version/export documents, run skills',
    ['list_documents', 'read_document', 'list_document_versions', 'create_document', 'edit_document', 'restore_document_version', 'export_document', 'run_skill', 'delete_document', 'share_document'], ALL,
    'يحافظ على نفس المستند أثناء التعديلات ويحفظ الإصدارات.');
  agent('office', 'مكتب الوكلاء', 'Agents Office', 'بناء وكلاء يجهّزون الأعمال المتكررة للمراجعة والموافقة', 'Build agents that prepare recurring work for review & approval',
    ['list_office_templates', 'list_office_agents', 'create_office_agent', 'schedule_office_agent', 'run_office_agent', 'list_office_runs'], ALL,
    'يحضّر المقترحات فقط؛ لا يُنفَّذ شيء إلا بعد موافقة المالك في الواجهة.');
  agent('monitor', 'مساعد المتابعة (ADAA I)', 'Monitoring agent (ADAA I)', 'مؤشرات المتابعة للمديرين والقيادة من مصادر خارج Vault', 'Monitoring indicators for managers & leadership (outside-Vault sources)',
    ['get_kpis', 'list_projects', 'get_project'], ['manager', 'president'],
    'يقرأ مؤشرات المتابعة فقط ضمن النطاق المصرّح، ولا يصل إلى Vault.');

  // ---- Skills ----
  for (const s of SKILL_DEFS) run(`INSERT OR REPLACE INTO skills (key,name_ar,name_en,description_ar,description_en,inputs,outputs,invocation,enabled) VALUES (?,?,?,?,?,?,?,?,1)`,
    s.key, s.name_ar, s.name_en, s.description_ar, s.description_en || s.name_en, JSON.stringify(s.inputs), s.outputs, s.invocation);

  // ---- Apps (visibility only; data access is enforced per API) ----
  const app = (key, ar, en, dar, icon, cat, zone, dept, roles, route, status, sort) => run(`INSERT OR REPLACE INTO apps (key,name_ar,name_en,description_ar,icon,category,zone,department_id,roles,route,integration_status,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, key, ar, en, dar, icon, cat, zone, dept, JSON.stringify(roles), route, status, sort);
  app('portal', 'Unified Portal', 'Unified Portal', 'مساحة العمل والمحادثة', 'home', 'core', 'portal', null, ALL, '#/home', 'built_in', 1);
  app('adaa', 'ADAA I', 'ADAA I', 'داشبورد الرقابة والمتابعة', 'gauge', 'core', 'portal', null, ALL, '#/adaa', 'built_in', 2);
  app('projects', 'المشاريع', 'Projects', 'إدارة المشاريع والتقدم', 'folder', 'work', 'portal', null, ALL, '#/projects', 'built_in', 3);
  app('tasks', 'المهام', 'Tasks', 'مهامي ومهام الفريق', 'check', 'work', 'portal', null, ALL, '#/tasks', 'built_in', 4);
  app('documents', 'المستندات', 'Documents', 'التقارير والخطط والمحاضر', 'doc', 'work', 'portal', null, ALL, '#/documents', 'built_in', 5);
  app('office', 'مكتب الوكلاء', 'Agents Office', 'وكلاء يجهّزون مهامك المتكررة بعد موافقتك', 'people', 'core', 'portal', null, ALL, '#/office', 'built_in', 3);
  app('smart_uploader', 'Smart Uploader', 'Smart Uploader', 'رفع الملفات إلى مرصاد (اتجاه واحد إلى Vault)', 'upload', 'vault-feed', 'portal', null, ALL, '#/uploader', 'built_in', 6);
  app('fs', 'FS', 'FS', 'النظام المالي — داخل Vault', 'vault', 'vault', 'vault', 'dept_fin', ALL, '/fs', 'vault', 7);
  app('marsad', 'مرصاد', 'Marsad', 'منصة الرصد — داخل Vault', 'vault', 'vault', 'vault', null, ['manager', 'president'], '/marsad', 'vault', 8);
  app('hr', 'الخدمة الذاتية للموارد البشرية', 'HR self-service', 'نظام مؤسسي خارجي', 'people', 'enterprise', 'external', null, ALL, '', 'not_connected', 9);
  app('admin', 'إدارة المنصة', 'Platform admin', 'خدمات الذكاء الاصطناعي، الوكلاء، المهارات، MCP', 'settings', 'admin', 'portal', null, ['admin'], '#/admin', 'built_in', 10);
}

// Departments and demo personas across the organisation, plus external
// identities (an external auditor and two service providers). Idempotent:
// safe to run on every boot. Capabilities are granted only when a persona is
// first created, so later admin revocations are respected.
export function seedPeople() {
  if (process.env.SEED_DEMO === '0') return;
  const dept = (id, ar, en, parent, external = 0) => run('INSERT OR IGNORE INTO departments (id,name_ar,name_en,parent_id,is_external) VALUES (?,?,?,?,?)', id, ar, en, parent, external);
  dept('dept_exec', 'مكتب الرئيس', 'President Office', null);
  dept('dept_it', 'إدارة التحول الرقمي', 'Digital Transformation', 'dept_exec');
  dept('dept_ops', 'إدارة العمليات', 'Operations', 'dept_exec');
  dept('dept_fin', 'الإدارة المالية', 'Finance', 'dept_exec');
  dept('dept_spmo', 'إدارة المشاريع الاستراتيجية', 'Strategic Projects Management', 'dept_exec');
  dept('dept_hr', 'إدارة الموارد البشرية', 'Human Resources', 'dept_exec');
  dept('dept_legal', 'إدارة الشؤون القانونية', 'Legal Affairs', 'dept_exec');
  dept('dept_ia', 'مكتب التدقيق الداخلي', 'Internal Audit', 'dept_exec');
  dept('dept_proc', 'قسم المشتريات', 'Procurement', 'dept_fin');
  // external organisations (never part of the internal tree)
  dept('ext_audit', 'جهة التدقيق الخارجي (تجريبية)', 'External audit firm (demo)', null, 1);
  dept('ext_v_horizon', 'شركة الأفق للحلول التقنية (تجريبية)', 'Horizon Tech Solutions (demo)', null, 1);
  dept('ext_v_oasis', 'مؤسسة الواحة للتوريدات (تجريبية)', 'Oasis Supplies (demo)', null, 1);

  const pw = hashPassword(DEMO_PASSWORD);
  // Demo capability grants are applied once per seed version; admin changes made
  // afterwards (grant/revoke in the Integration & Control Center) are kept.
  db.exec('CREATE TABLE IF NOT EXISTS seed_marks (key TEXT PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const grantCaps = !one("SELECT 1 FROM seed_marks WHERE key='caps_v1'");
  const person = (id, username, ar, en, role, deptId, tar, ten, caps = [], { admin = 0, type = 'staff' } = {}) => {
    run(`INSERT OR IGNORE INTO users (id,username,password_hash,name_ar,name_en,email,role,is_admin,department_id,title_ar,title_en,is_demo,user_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)`,
      id, username, pw, ar, en, `${username}@demo.local`, role, admin, deptId, tar, ten, type);
    if (grantCaps && one('SELECT 1 FROM users WHERE id=?', id)) for (const c of caps) run('INSERT OR IGNORE INTO user_caps (user_id,cap,granted_by) VALUES (?,?,?)', id, c, 'seed');
  };
  person('u_president', 'president', 'خالد المنصوري', 'Khalid Al Mansoori', 'president', 'dept_exec', 'الرئيس', 'President', ['audit.committee', 'awards.committee', 'ideas.committee']);
  person('u_mariam', 'mariam', 'مريم الكعبي', 'Mariam Al Kaabi', 'manager', 'dept_it', 'مديرة التحول الرقمي', 'Director, Digital Transformation', ['ideas.committee', 'procurement.committee'], { admin: 1 });
  person('u_ahmed', 'ahmed', 'أحمد الشامسي', 'Ahmed Al Shamsi', 'employee', 'dept_it', 'مهندس أنظمة', 'Systems Engineer');
  person('u_sara', 'sara', 'سارة النعيمي', 'Sara Al Nuaimi', 'employee', 'dept_it', 'محللة أعمال', 'Business Analyst');
  person('u_omar', 'omar', 'عمر الظاهري', 'Omar Al Dhaheri', 'manager', 'dept_ops', 'مدير العمليات', 'Director, Operations');
  person('u_fatima', 'fatima', 'فاطمة الحمادي', 'Fatima Al Hammadi', 'employee', 'dept_ops', 'أخصائية عمليات', 'Operations Specialist');
  person('u_noura', 'noura', 'نورة المهيري', 'Noura Al Muhairi', 'employee', 'dept_fin', 'محاسبة', 'Accountant', ['finance.budget']);
  person('u_majed', 'majed', 'ماجد الحوسني', 'Majed Al Hosani', 'manager', 'dept_fin', 'المدير المالي', 'Chief Financial Officer', ['finance.budget', 'procurement.finance', 'procurement.committee']);
  person('u_reem', 'reem', 'ريم العامري', 'Reem Al Ameri', 'employee', 'dept_proc', 'أخصائية مشتريات', 'Procurement Specialist', ['procurement.officer', 'providers.manage']);
  person('u_latifa', 'latifa', 'لطيفة السويدي', 'Latifa Al Suwaidi', 'manager', 'dept_spmo', 'مديرة إدارة المشاريع الاستراتيجية', 'Director, Strategic Projects', ['strategy.admin', 'surveys.author', 'ideas.committee', 'awards.committee']);
  person('u_hamad', 'hamad', 'حمد الكتبي', 'Hamad Al Ketbi', 'employee', 'dept_spmo', 'محلل أداء استراتيجي', 'Strategy Performance Analyst', ['strategy.admin']);
  person('u_hessa', 'hessa', 'حصة البلوشي', 'Hessa Al Balushi', 'manager', 'dept_hr', 'مديرة الموارد البشرية', 'Director, Human Resources', ['performance.hr', 'awards.admin', 'surveys.author']);
  person('u_salem', 'salem', 'سالم الرميثي', 'Salem Al Rumaithi', 'employee', 'dept_hr', 'أخصائي موارد بشرية', 'HR Specialist', ['performance.hr', 'surveys.author']);
  person('u_yousef', 'yousef', 'يوسف الزعابي', 'Yousef Al Zaabi', 'manager', 'dept_legal', 'مدير الشؤون القانونية وضابط الامتثال', 'Director, Legal Affairs & Compliance Officer', ['integrity.officer', 'procurement.legal']);
  person('u_aisha', 'aisha', 'عائشة النقبي', 'Aisha Al Naqbi', 'manager', 'dept_ia', 'رئيسة التدقيق الداخلي', 'Chief Audit Executive', ['audit.head', 'audit.auditor']);
  person('u_saeed', 'saeed', 'سعيد المزروعي', 'Saeed Al Mazrouei', 'employee', 'dept_ia', 'مدقق داخلي', 'Internal Auditor', ['audit.auditor']);
  // external identities
  person('u_ext_rashid', 'rashid', 'راشد المرر', 'Rashid Al Marar', 'employee', 'ext_audit', 'مدقق خارجي', 'External Auditor', ['audit.external'], { type: 'external' });
  person('u_ext_horizon', 'horizon', 'عبدالله الفلاسي', 'Abdulla Al Falasi', 'employee', 'ext_v_horizon', 'مدير الحسابات — شركة الأفق', 'Account Manager, Horizon', ['providers.portal'], { type: 'external' });
  person('u_ext_oasis', 'oasis', 'ليلى الشحي', 'Laila Al Shehhi', 'employee', 'ext_v_oasis', 'مسؤولة المبيعات — مؤسسة الواحة', 'Sales Lead, Oasis', ['providers.portal'], { type: 'external' });
  if (grantCaps) run("INSERT OR IGNORE INTO seed_marks (key) VALUES ('caps_v1')");
}

export function seedOrgAndDemo() {
  seedPeople();
  if (one('SELECT 1 FROM projects LIMIT 1')) return;
  const proj = (id, name, desc, deptId, owner, progress, start, due, members) => {
    run(`INSERT INTO projects (id,name,description,department_id,owner_id,status,progress,progress_updated_at,progress_updated_by,start_date,due_date,created_by,is_demo) VALUES (?,?,?,?,?,'active',?,?,?,?,?,?,1)`,
      id, name, desc, deptId, owner, progress, progress == null ? null : at(-3, 9), progress == null ? null : owner, start, due, owner);
    for (const m of members) run('INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)', id, m);
  };
  proj('pr_portal', 'البوابة الموحدة', 'إطلاق بوابة الخدمات الموحدة للموظفين', 'dept_it', 'u_mariam', 55, day(-60), day(30), ['u_mariam', 'u_ahmed', 'u_sara']);
  proj('pr_cloud', 'ترحيل الأنظمة إلى السحابة', 'نقل الأنظمة التشغيلية إلى السحابة الحكومية', 'dept_it', 'u_ahmed', 40, day(-90), day(-10), ['u_ahmed', 'u_mariam']);
  proj('pr_automation', 'أتمتة طلبات الموظفين', 'أتمتة دورة الطلبات الإدارية', 'dept_it', 'u_sara', null, day(-10), day(60), ['u_sara']);
  proj('pr_procedures', 'تحديث إجراءات التشغيل', 'مراجعة وتحديث أدلة الإجراءات', 'dept_ops', 'u_omar', 70, day(-80), day(-5), ['u_omar', 'u_fatima']);
  proj('pr_service', 'مركز خدمة العملاء', 'تأسيس مركز موحد لخدمة المتعاملين', 'dept_ops', 'u_fatima', 30, day(-20), day(45), ['u_fatima', 'u_omar']);

  const task = (title, project, assignee, deptId, status, priority, due, completedDaysAgo, creator) => run(`INSERT INTO tasks (id,title,project_id,assignee_id,department_id,status,priority,due_date,completed_at,created_by,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
    uid('tk_'), title, project, assignee, deptId, status, priority, due, completedDaysAgo == null ? null : at(-completedDaysAgo, 10), creator);
  const dow = new Date().getUTCDay(); // tasks completed "this week" must fall on/after Sunday
  task('تصميم واجهة تسجيل الدخول', 'pr_portal', 'u_sara', 'dept_it', 'done', 'high', day(-2), Math.min(1, dow), 'u_mariam');
  task('ربط الهوية الموحدة', 'pr_portal', 'u_ahmed', 'dept_it', 'in_progress', 'urgent', day(0), null, 'u_mariam');
  task('اختبارات الأداء للبوابة', 'pr_portal', 'u_ahmed', 'dept_it', 'todo', 'medium', day(12), null, 'u_mariam');
  task('توثيق متطلبات البوابة', 'pr_portal', 'u_sara', 'dept_it', 'done', 'medium', day(-6), Math.min(0, dow), 'u_mariam');
  task('نقل قاعدة بيانات الموارد', 'pr_cloud', 'u_ahmed', 'dept_it', 'in_progress', 'high', day(-4), null, 'u_ahmed');
  task('خطة الرجوع عند الفشل', 'pr_cloud', 'u_ahmed', 'dept_it', 'todo', 'high', day(-1), null, 'u_ahmed');
  task('تحليل نماذج الطلبات الحالية', 'pr_automation', 'u_sara', 'dept_it', 'in_progress', 'medium', day(5), null, 'u_sara');
  task('مراجعة دليل إجراءات المخازن', 'pr_procedures', 'u_fatima', 'dept_ops', 'done', 'medium', day(-8), 9, 'u_omar');
  task('اعتماد الإجراءات المحدثة', 'pr_procedures', 'u_omar', 'dept_ops', 'todo', 'urgent', day(-3), null, 'u_omar');
  task('اختيار نظام إدارة التذاكر', 'pr_service', 'u_fatima', 'dept_ops', 'in_progress', 'high', day(3), null, 'u_omar');
  task('إعداد الميزانية التقديرية', null, 'u_noura', 'dept_fin', 'todo', 'medium', day(7), null, 'u_noura');
  task('تجهيز عرض مجلس الإدارة', null, 'u_president', 'dept_exec', 'todo', 'high', day(2), null, 'u_president');

  const ev = (title, start, end, owner, attendees, loc) => {
    const id = uid('ev_');
    run('INSERT INTO events (id,title,starts_at,ends_at,location,owner_id,is_demo) VALUES (?,?,?,?,?,?,1)', id, title, start, end, loc, owner);
    for (const a of attendees) run('INSERT OR IGNORE INTO event_attendees (event_id,user_id) VALUES (?,?)', id, a);
  };
  ev('اجتماع متابعة البوابة الموحدة', at(0, 7), at(0, 8), 'u_mariam', ['u_ahmed', 'u_sara'], 'قاعة 2');
  ev('مراجعة ترحيل السحابة', at(1, 9), at(1, 10), 'u_ahmed', ['u_mariam'], 'عن بُعد');
  ev('اجتماع الإدارة التنفيذية', at(0, 10), at(0, 11), 'u_president', ['u_mariam', 'u_omar'], 'مكتب الرئيس');
  ev('ورشة إجراءات التشغيل', at(2, 8), at(2, 11), 'u_omar', ['u_fatima'], 'قاعة 1');

  const alert = (userId, level, title, body) => run('INSERT INTO alerts (id,user_id,level,title,body,is_demo) VALUES (?,?,?,?,?,1)', uid('al_'), userId, level, title, body);
  alert('u_ahmed', 'warning', 'اقتراب موعد ربط الهوية الموحدة', 'الموعد اليوم');
  alert('u_mariam', 'info', 'طلب اعتماد تقرير الربع', 'بانتظار مراجعتك');
  alert('u_president', 'info', 'تحديث مؤشرات الأداء الأسبوعية', 'متاح في ADAA I');
}

export function seedAll({ reset = false } = {}) {
  if (reset) {
    db.exec(`DELETE FROM messages; DELETE FROM conversations; DELETE FROM actions; DELETE FROM confirmations; DELETE FROM idempotency;
      DELETE FROM document_shares; DELETE FROM document_versions; DELETE FROM documents; DELETE FROM dashboard_versions; DELETE FROM dashboards;
      DELETE FROM alerts; DELETE FROM event_attendees; DELETE FROM events; DELETE FROM tasks; DELETE FROM project_members; DELETE FROM projects;
      DELETE FROM uploads; DELETE FROM su_receipts; DELETE FROM sessions; DELETE FROM api_tokens;`);
  }
  tx(() => {
    seedConfig();
    if (process.env.SEED_DEMO !== '0') { seedOrgAndDemo(); return; }
    // Production bootstrap: org root + one platform admin (no demo data).
    run("INSERT OR IGNORE INTO departments (id,name_ar,name_en,parent_id) VALUES ('dept_exec','مكتب الرئيس','President Office',NULL)");
    if (!process.env.ADMIN_PASSWORD) { console.warn('[seed] SEED_DEMO=0: set ADMIN_PASSWORD (and ADMIN_USERNAME) to create the first admin.'); return; }
    run(`INSERT OR IGNORE INTO users (id,username,password_hash,name_ar,name_en,role,is_admin,department_id) VALUES ('u_admin',?,?,?,?,'manager',1,'dept_exec')`,
      (process.env.ADMIN_USERNAME || 'admin').toLowerCase(), hashPassword(process.env.ADMIN_PASSWORD), 'مدير المنصة', 'Platform admin');
  });
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedAll({ reset: process.argv.includes('--reset') });
  console.log('Seeded. Demo password:', DEMO_PASSWORD);
}
