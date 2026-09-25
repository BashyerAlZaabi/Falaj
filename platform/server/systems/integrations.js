// Integration & Control Center — مركز التكامل والتحكم.
// The user-facing control centre for which systems appear, what connects to
// what, and what Ask AI may read. Real personal calendar feed (ICS) plus an
// honest catalogue of enterprise connectors, a data-boundaries map, the user's
// own activity log, and admin-only configuration (capability matrix, data
// policies, connectors) that never unlocks any system data.
import { defineSystem } from './registry.js';
import { db, isStaff, isEmpty, userIdByUsername, wrap, check, S, str, bool, arr } from './kit.js';
import * as I from './integrations/service.js';

const OPTS = { include_meetings: bool('Show meetings'), include_events: bool('Show appointments'), include_tasks: bool('Show task due dates') };
const CONFIRM = { confirm: bool('Set by the UI after an explicit confirmation dialog') };

function routes(r) {
  r.get('/overview', wrap((req) => I.overview(req.user)));
  r.get('/systems', wrap((req) => I.systemsView(req.user)));
  r.get('/ai', wrap((req) => I.aiView(req.user)));
  r.post('/ai/review', wrap((req) => { check(S({}), req.body); return I.recordPrivacyReview(req.user); }));

  r.get('/connectors', wrap((req) => I.connectorsView(req.user)));
  r.post('/connectors/:key/request', wrap((req) => I.requestConnector(req.user, req.params.key, check(S({ note: str('Why it is needed', { maxLength: 500 }) }), req.body))));
  r.post('/requests/:id/withdraw', wrap((req) => { check(S({}), req.body); return I.withdrawRequest(req.user, req.params.id); }));

  r.get('/feed/preview', wrap((req) => I.feedPreview(req.user, req.query)));
  r.post('/feeds', wrap((req) => I.createFeed(req.user, check(S(OPTS), req.body))));
  r.post('/feeds/rotate', wrap((req) => I.rotateFeed(req.user, check(S(CONFIRM), req.body))));
  r.put('/feeds/:id', wrap((req) => I.updateFeed(req.user, req.params.id, check(S(OPTS), req.body))));
  r.post('/feeds/:id/revoke', wrap((req) => I.revokeFeed(req.user, req.params.id, check(S(CONFIRM), req.body))));

  r.get('/activity', wrap((req) => I.activity(req.user)));

  // admin-only (configuration; grants no data access)
  r.get('/admin/matrix', wrap((req) => I.adminMatrix(req.user)));
  r.put('/admin/caps', wrap((req) => { I.requireAdmin(req.user); return I.setCapability(req.user, check(S({ user_id: str('User id', { maxLength: 60 }), cap: str('Capability', { maxLength: 80 }), grant: bool('Grant (true) or revoke (false)'), ...CONFIRM }, ['user_id', 'cap', 'grant']), req.body)); }));
  r.post('/admin/access-review', wrap((req) => { I.requireAdmin(req.user); return I.recordAccessReview(req.user, check(S({ note: str('Review note', { maxLength: 500 }), ...CONFIRM }), req.body)); }));
  r.get('/admin/domains', wrap((req) => I.adminDomains(req.user)));
  r.get('/admin/connectors', wrap((req) => I.adminConnectors(req.user)));
  r.put('/admin/connectors/:key', wrap((req) => { I.requireAdmin(req.user); return I.updateConnector(req.user, req.params.key, check(S({ enabled: bool('Organisation-wide switch'), scopes: arr(str('Data domain key', { maxLength: 80 }), { maxItems: 20 }), ...CONFIRM }), req.body)); }));
  r.post('/admin/connectors/:key/test', wrap((req) => { check(S({}), req.body); return I.testConnector(req.user, req.params.key); }));
  r.post('/admin/requests/:id/close', wrap((req) => { I.requireAdmin(req.user); return I.closeRequest(req.user, req.params.id, check(S({ resolution: str('Outcome', { enum: ['done', 'declined'] }), note: str('Reply to the requester', { maxLength: 500 }), ...CONFIRM }, ['resolution']), req.body)); }));
}

// Public (no session): /pub/sys/integrations/calendar/<secret>.ics
function publicRoutes(r) {
  r.get('/calendar/:file', (req, res) => {
    I.serveFeed(req, res).catch((e) => {
      console.error('[integrations] feed failed:', e);
      if (!res.headersSent) res.status(500).type('text/plain').send('Feed unavailable');
    });
  });
}

// Rule-based planner intents: answer with a short explanation and a link.
// This system's data domain is AI-off, so intents never read personal settings.
const link = (path) => `\`${path}\``;
const intents = [
  {
    test: (n) => /((اربط|ربط|اشترك|اشتراك|زامن|مزامنه|رابط|اضف رابط).{0,30}(التقويم|تقويمي|تقويم|outlook|اوتلوك|ics))|((connect|link|subscribe|sync).{0,30}(calendar|ics))/.test(n),
    plan: () => [{ say: [
      '**ربط تقويمك الشخصي**',
      'لحماية خصوصيتك يُنشأ رابط التقويم من «مركز التكامل والتحكم» فقط ويظهر مرة واحدة، ولا يُرسل عبر المحادثة.',
      '1. افتح «التطبيقات المرتبطة ← تقويمي الشخصي (ICS)».',
      '2. اختر ما يظهر: الاجتماعات، المواعيد، مواعيد استحقاق المهام.',
      '3. انسخ الرابط وأضفه في Outlook أو تقويم Google أو Apple كتقويم «من الإنترنت».',
      'الاجتماعات السرية تظهر «مشغول» فقط بلا عنوان أو مكان، ويمكنك إيقاف الرابط أو تدويره في أي وقت.',
      `الرابط: ${link('#/sys/integrations/apps/ics')}`,
    ].join('\n') }],
  },
  {
    test: (n) => /((من|مين)\s+(يستطيع|يقدر|يمكنه|يمكن|يشوف|يري|يطلع|يصل)).{0,40}(بياناتي|معلوماتي|سجلاتي)|who can (see|view|access) my (data|information|records)/.test(n),
    plan: () => [{ say: [
      '**من يرى بياناتك؟**',
      '- **داخلي**: زملاؤك المعنيون حسب النظام ونطاق إدارتهم.',
      '- **سري**: أنت ومديرك المباشر والجهة المختصة (مثل الموارد البشرية للتقييمات).',
      '- **سري للغاية**: أنت والجهة المختصة فقط (مثل ضابط الامتثال)، ويُسجَّل كل اطلاع.',
      '- **المساعد الذكي**: لا يقرأ السري للغاية أبداً، والسري بموافقتك فقط، وبيانات Vault لا يصل إليها إطلاقاً.',
      '- **مدير المنصة**: يضبط الإعدادات فقط ولا يرى بيانات الأنظمة.',
      `التفاصيل وخريطة حدود البيانات: ${link('#/sys/integrations/ai')}`,
    ].join('\n') }],
  },
  {
    test: (n) => (/(^|\s)(ماذا|ما الذي|ما اللي|ايش|وش|هل)(\s|$)/.test(n) && /(يقرا|يطلع|يصل|يري|يشوف)/.test(n) && /(المساعد|الذكاء الاصطناعي)/.test(n))
      || /what can (the )?(assistant|ai|ask ai) (see|read|access)/.test(n),
    plan: () => [{ say: [
      '**ما الذي يستطيع المساعد قراءته؟**',
      'يعمل المساعد ضمن صلاحياتك فقط، وتحدد سياسة كل نطاق بيانات ما يصل إليه: «متاح»، أو «بموافقتك» تفعّله أنت لكل نظام، أو «مقفل» لا يُفتح لأحد.',
      `راجع كل نظام وفعّل أو أوقف الوصول الاختياري من: ${link('#/sys/integrations/ai')}`,
    ].join('\n') }],
  },
  {
    test: (n) => /(مركز التكامل|مركز التحكم|التطبيقات المرتبطه|integration (center|centre)|control (center|centre))/.test(n),
    plan: () => [{ say: [
      '**مركز التكامل والتحكم**',
      '- **أنظمتي**: اختر الأنظمة التي تظهر في قائمتك الجانبية.',
      '- **الذكاء الاصطناعي والبيانات**: ما يقرؤه المساعد وخريطة حدود البيانات.',
      '- **التطبيقات المرتبطة**: رابط تقويمك الشخصي والموصلات المؤسسية وحالتها الفعلية.',
      '- **سجل النشاط**: تغييراتك واستخدامات رابط تقويمك.',
      `افتحه من: ${link('#/sys/integrations')}`,
    ].join('\n') }],
  },
];

defineSystem({
  key: 'integrations',
  name_ar: 'مركز التكامل والتحكم', name_en: 'Integration & Control Center',
  description_ar: 'اختر الأنظمة التي تظهر لك، واربط التطبيقات المناسبة، وتحكّم في وصول المساعد الذكي إلى بياناتك',
  description_en: 'Choose your systems, connect the apps that suit you, and control what Ask AI may read',
  icon: 'plug', category: 'platform',
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [],
  domains: [
    { key: 'integrations.config', name_ar: 'إعدادات الربط والتكامل', name_en: 'Integration settings', classification: 'internal', ai: 'off', locked: true,
      note_ar: 'إعداداتك وروابطك الشخصية لا يقرؤها المساعد الذكي', note_en: 'Your personal settings and links are never read by Ask AI' },
  ],
  schema: () => I.schema(db),
  seed: () => I.seed({ isEmpty, userIdByUsername }),
  routes,
  publicRoutes,
  tools: [],
  intents,
  workspace: (u) => I.workspaceCards(u),
  gameRules: [
    { key: 'integrations_privacy_review', points: 10, ar: 'مراجعة ربع سنوية لضوابط وصول المساعد إلى بياناتك', en: 'Quarterly check-up of what Ask AI may read' },
    { key: 'integrations_access_review', points: 25, ar: 'اعتماد مراجعة الصلاحيات الربع سنوية (مدير المنصة)', en: 'Quarterly access review sign-off (platform admin)' },
  ],
  gameEvents: (userId) => I.gameEvents(userId),
});
