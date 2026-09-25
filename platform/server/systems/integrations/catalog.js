// Integration & Control Center — connector catalogue (pure data, no DB).
//
// HONESTY RULE: only the personal calendar feed (ICS) is implemented end to
// end. Every other connector needs configuration that this deployment does not
// have; its status is computed from the presence of the listed environment
// variables (names only — values are never read out or displayed) and, once
// configured, from an explicit network reachability test run by an admin.
// Nothing here ever reports a connection as working unless it really is.

// Platform "core" data touched by connectors that is not owned by an
// enterprise system (so it has no row in data_domains).
export const CORE_DOMAINS = {
  'core.calendar': { name_ar: 'مواعيدي ومهامي في المنصة', name_en: 'My platform appointments and tasks', classification: 'internal' },
  'core.directory': { name_ar: 'دليل الموظفين والهيكل التنظيمي', name_en: 'Staff directory and org structure', classification: 'internal' },
  'core.notifications': { name_ar: 'عناوين التنبيهات فقط', name_en: 'Notification titles only', classification: 'internal' },
  'core.identity': { name_ar: 'الهوية وتسجيل الدخول', name_en: 'Identity and sign-in', classification: 'confidential' },
  'core.documents': { name_ar: 'المستندات المرسلة للتوقيع', name_en: 'Documents sent for signature', classification: 'confidential' },
};

// direction: in (وارد) · out (صادر) · both (ثنائي)
// candidates: data domains the connector COULD touch. Restricted domains are
// listed so people can see they are protected — they can never be selected.
// who: capabilities of the people who use it (empty = every staff member).
export const CONNECTORS = [
  {
    key: 'ics', real: true, personal: true, fixedScopes: true,
    name_ar: 'تقويمي الشخصي (ICS)', name_en: 'My calendar feed (ICS)',
    vendor: 'iCalendar · RFC 5545',
    icon: 'calendarDays', direction: 'out',
    desc_ar: 'رابط سري خاص بك يعرض اجتماعاتك ومواعيدك ومواعيد استحقاق مهامك في Outlook أو تقويم Google أو Apple — للقراءة فقط.',
    desc_en: 'A secret link of your own that shows your meetings, appointments and task due dates in Outlook, Google or Apple Calendar — read-only.',
    flows_ar: ['اجتماعاتك ومواعيدك القادمة (90 يوماً)', 'مواعيد استحقاق مهامك المفتوحة', 'الاجتماعات السرية تظهر «مشغول» فقط بلا عنوان أو مكان'],
    flows_en: ['Your upcoming meetings and appointments (90 days)', 'Due dates of your open tasks', 'Confidential meetings appear as “Busy” only, with no title or location'],
    candidates: ['meetings.general', 'core.calendar', 'meetings.confidential'],
    defaultScopes: ['meetings.general', 'core.calendar'],
    masked: ['meetings.confidential'],
    env: [], who: [], who_ar: 'كل موظفي الجهة', who_en: 'All staff',
  },
  {
    key: 'm365',
    name_ar: 'Outlook وTeams من Microsoft 365', name_en: 'Microsoft 365 — Outlook & Teams',
    vendor: 'Microsoft Graph',
    icon: 'mail', direction: 'both',
    desc_ar: 'مزامنة الاجتماعات مع تقويم Outlook وإنشاء روابط Teams للاجتماعات عن بُعد.',
    desc_en: 'Sync meetings with Outlook calendars and create Teams links for remote meetings.',
    flows_ar: ['إرسال الاجتماعات المعتمدة إلى تقويم Outlook', 'استقبال ردود الحضور (قبول/اعتذار)', 'إنشاء رابط Teams للاجتماع عن بُعد'],
    flows_en: ['Push approved meetings to Outlook calendars', 'Receive attendance responses (accept/decline)', 'Create a Teams link for remote meetings'],
    candidates: ['meetings.general', 'core.calendar', 'meetings.confidential'],
    defaultScopes: ['meetings.general', 'core.calendar'],
    env: ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET'],
    test: { type: 'https', url: (e) => `https://login.microsoftonline.com/${encodeURIComponent(e.M365_TENANT_ID)}/v2.0/.well-known/openid-configuration` },
    who: [], who_ar: 'كل موظفي الجهة بعد إعداد المستأجر', who_en: 'All staff once the tenant is set up',
  },
  {
    key: 'uaepass',
    name_ar: 'الهوية الرقمية UAE PASS والتوقيع الإلكتروني', name_en: 'UAE PASS identity & e-signature',
    vendor: 'UAE PASS',
    icon: 'fingerprint', direction: 'both',
    desc_ar: 'تسجيل الدخول بالهوية الرقمية الوطنية وتوقيع المستندات المعتمدة إلكترونياً.',
    desc_en: 'Sign in with the national digital identity and e-sign approved documents.',
    flows_ar: ['تأكيد هوية الموظف عند الدخول', 'إرسال المستند المعتمد للتوقيع واستلام حالة التوقيع'],
    flows_en: ['Confirm the employee’s identity at sign-in', 'Send an approved document for signature and receive its status'],
    candidates: ['core.identity', 'core.documents'],
    defaultScopes: ['core.identity', 'core.documents'],
    env: ['UAEPASS_BASE_URL', 'UAEPASS_CLIENT_ID', 'UAEPASS_CLIENT_SECRET', 'UAEPASS_REDIRECT_URI'],
    test: { type: 'https', url: (e) => e.UAEPASS_BASE_URL },
    who: [], who_ar: 'كل موظفي الجهة', who_en: 'All staff',
  },
  {
    key: 'hrms',
    name_ar: 'نظام الموارد البشرية (HRMS)', name_en: 'HR management system (HRMS)',
    vendor: 'HRMS API',
    icon: 'idCard', direction: 'both',
    desc_ar: 'استقبال الهيكل التنظيمي وبيانات الموظفين الأساسية، وإرسال نتائج التقييم المعتمدة نهائياً.',
    desc_en: 'Receive the org structure and core employee records, and send finally approved appraisal results.',
    flows_ar: ['استقبال الهيكل التنظيمي والمسميات الوظيفية', 'إرسال نتائج التقييم بعد اعتمادها النهائي فقط'],
    flows_en: ['Receive the org structure and job titles', 'Send appraisal results only after final approval'],
    candidates: ['core.directory', 'performance.reviews'],
    defaultScopes: ['core.directory'],
    env: ['HRMS_BASE_URL', 'HRMS_API_KEY'],
    test: { type: 'https', url: (e) => e.HRMS_BASE_URL },
    who: ['performance.hr'], who_ar: 'فريق الموارد البشرية', who_en: 'HR team',
  },
  {
    key: 'erp',
    name_ar: 'النظام المالي ERP (Oracle / SAP)', name_en: 'Finance ERP (Oracle / SAP)',
    vendor: 'Oracle Fusion · SAP S/4HANA',
    icon: 'landmark', direction: 'both',
    desc_ar: 'تحويل طلبات الشراء المعتمدة إلى أوامر شراء، واستقبال توفر الميزانية والالتزامات.',
    desc_en: 'Turn approved purchase requests into purchase orders and receive budget availability and commitments.',
    flows_ar: ['إرسال طلبات الشراء المعتمدة', 'استقبال توفر الميزانية لكل بند', 'العروض المالية لا تُرسل أبداً'],
    flows_en: ['Send approved purchase requests', 'Receive budget availability per line', 'Financial bids are never sent'],
    candidates: ['procurement.requests', 'providers.registry', 'procurement.bids'],
    defaultScopes: ['procurement.requests'],
    env: ['ERP_BASE_URL', 'ERP_CLIENT_ID', 'ERP_CLIENT_SECRET'],
    test: { type: 'https', url: (e) => e.ERP_BASE_URL },
    who: ['finance.budget', 'procurement.finance', 'procurement.officer'], who_ar: 'الإدارة المالية والمشتريات', who_en: 'Finance and procurement',
  },
  {
    key: 'smtp',
    name_ar: 'إشعارات البريد الإلكتروني (SMTP)', name_en: 'E-mail notifications (SMTP)',
    vendor: 'SMTP',
    icon: 'mailCheck', direction: 'out',
    desc_ar: 'إرسال عناوين التنبيهات إلى البريد الرسمي؛ لا تُرسل تفاصيل السجلات السرية بالبريد.',
    desc_en: 'Send notification titles to official e-mail; details of confidential records are never e-mailed.',
    flows_ar: ['إرسال عنوان التنبيه ورابط فتحه في المنصة', 'لا تفاصيل للسجلات السرية أو السرية للغاية'],
    flows_en: ['Send the alert title and a link to open it in the platform', 'No details of confidential or restricted records'],
    candidates: ['core.notifications'],
    defaultScopes: ['core.notifications'],
    env: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'],
    test: { type: 'tcp', host: (e) => e.SMTP_HOST, port: (e) => Number(e.SMTP_PORT) },
    who: [], who_ar: 'كل موظفي الجهة', who_en: 'All staff',
  },
];

export const connectorDef = (key) => CONNECTORS.find((c) => c.key === key) || null;

// Status vocabulary (UI labels live client-side):
//   connected   — the user's own ICS feed is active (the only real connection)
//   available   — ICS enabled, no feed yet
//   needs_setup — required environment variables are missing (names listed)
//   configured  — variables present; only a network reachability test is possible
//   disabled    — switched off organisation-wide by a platform admin
export const STATUSES = ['connected', 'available', 'needs_setup', 'configured', 'disabled'];

// Why a system may be unavailable and who grants access (never its data).
export const GRANT_HINTS = {
  providers: ['فريق المشتريات والمالية ومديرو الإدارات، أو من لديه صلاحية «إدارة سجل مقدمي الخدمات»', 'Procurement and finance teams, department managers, or holders of “manage provider registry”'],
  procurement: ['موظفو الجهة ومقدمو الخدمات المسجلون', 'Staff and registered service providers'],
  audit: ['موظفو الجهة والمدقق الخارجي المعتمد', 'Staff and the approved external auditor'],
};

export const quarterOf = (iso = new Date().toISOString()) => { const d = new Date(iso); return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; };
export const quarterLabel = (period, lang = 'ar') => { const q = Number(String(period).slice(-1)); return lang === 'en' ? `Q${q} ${String(period).slice(0, 4)}` : `الربع ${['الأول', 'الثاني', 'الثالث', 'الرابع'][q - 1] || q}`; };
export function quarterBounds(period) {
  const [y, q] = String(period).split('-Q').map(Number);
  const start = new Date(Date.UTC(y, (q - 1) * 3, 1));
  const end = new Date(Date.UTC(y, q * 3, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}
