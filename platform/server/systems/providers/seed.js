// Demo seed for the Service Providers registry (is_demo = 1). Idempotent.
// Coherent with the external organisations and personas in server/seed.js:
// horizon → Horizon Tech Solutions, oasis → Oasis Supplies.
import { run, one, uid, isEmpty, day, at, now } from '../kit.js';
import { quarterOf } from './service.js';

export function seed() {
  if (!isEmpty('providers_companies')) return;
  const t = now();
  const company = (id, ar, en, category, cats, contact, email, phone, org, status, statusDays, reason) => run(
    `INSERT INTO providers_companies (id,name_ar,name_en,category,categories,contact_name,contact_email,contact_phone,org_id,status,status_reason,status_by,status_at,created_by,created_at,updated_at,is_demo)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    id, ar, en, category, JSON.stringify(cats), contact, email, phone, org, status, reason, status === 'pending' ? null : 'u_reem', statusDays == null ? null : at(-statusDays, 8), 'u_reem', at(-(statusDays ?? 5) - 20, 8), t);
  const doc = (provider, kind, ref, issuedDays, expiresDays) => run(
    'INSERT INTO providers_documents (id,provider_id,kind,ref_no,issued_on,expires_on,verified_by,verified_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    uid('pd_'), provider, kind, ref, day(issuedDays), day(expiresDays), 'u_reem', at(issuedDays + 3, 9), t);
  const hist = (provider, action, from, to, reason, days, by = 'u_reem') => run('INSERT INTO providers_history (id,provider_id,action,from_status,to_status,reason,by_id,at) VALUES (?,?,?,?,?,?,?,?)', uid('ph_'), provider, action, from, to, reason, by, at(-days, 9));

  company('pv_horizon', 'شركة الأفق للحلول التقنية', 'Horizon Tech Solutions', 'it', ['it', 'supplies'], 'عبدالله الفلاسي', 'accounts@horizon-tech.demo', '+971 2 555 0142', 'ext_v_horizon', 'approved', 240, 'استيفاء متطلبات التأهيل الفني والمالي');
  doc('pv_horizon', 'licence', 'CN-1184520', -85, 280); doc('pv_horizon', 'vat', '100384729100003', -400, 330); doc('pv_horizon', 'insurance', 'POL-HZ-2025-118', -344, 21);
  hist('pv_horizon', 'created', null, 'pending', null, 262); hist('pv_horizon', 'status', 'pending', 'approved', 'استيفاء متطلبات التأهيل الفني والمالي', 240);

  company('pv_oasis', 'مؤسسة الواحة للتوريدات', 'Oasis Supplies', 'supplies', ['supplies', 'facilities'], 'ليلى الشحي', 'sales@oasis-supplies.demo', '+971 4 555 0177', 'ext_v_oasis', 'approved', 410, 'سجل توريد جيد مع الجهات الحكومية');
  doc('pv_oasis', 'licence', 'CN-2207781', -170, 195); doc('pv_oasis', 'vat', '100227781400003', -300, 365); doc('pv_oasis', 'insurance', 'POL-OS-2026-044', -210, 155);
  hist('pv_oasis', 'created', null, 'pending', null, 430); hist('pv_oasis', 'status', 'pending', 'approved', 'سجل توريد جيد مع الجهات الحكومية', 410);

  company('pv_madar', 'شركة المدار للتجهيزات المكتبية', 'Al Madar Office Solutions', 'supplies', ['supplies'], 'خليفة الكعبي', 'tenders@almadar.demo', '+971 2 555 0190', null, 'approved', 300, 'مطابقة الوثائق والمراجع');
  doc('pv_madar', 'licence', 'CN-3019922', -120, 245); doc('pv_madar', 'vat', '100301992200003', -200, 520); doc('pv_madar', 'insurance', 'POL-MD-2026-310', -60, 305);
  hist('pv_madar', 'created', null, 'pending', null, 320); hist('pv_madar', 'status', 'pending', 'approved', 'مطابقة الوثائق والمراجع', 300);

  company('pv_bayan', 'مؤسسة البيان للصيانة والخدمات', 'Al Bayan Maintenance & Services', 'facilities', ['facilities', 'supplies'], 'مريم الحمادي', 'info@albayan-services.demo', '+971 6 555 0133', null, 'approved', 520, 'تأهيل لخدمات الصيانة العامة');
  doc('pv_bayan', 'licence', 'CN-1450637', -200, 165); doc('pv_bayan', 'vat', '100145063700003', -500, 230); doc('pv_bayan', 'insurance', 'POL-BY-2025-077', -377, -12);
  hist('pv_bayan', 'created', null, 'pending', null, 540); hist('pv_bayan', 'status', 'pending', 'approved', 'تأهيل لخدمات الصيانة العامة', 520);

  company('pv_riyada', 'شركة الريادة للاستشارات الإدارية', 'Al Riyada Management Consulting', 'consulting', ['consulting'], 'سلطان النيادي', 'contact@alriyada.demo', '+971 2 555 0168', null, 'pending', null, null);
  doc('pv_riyada', 'licence', 'CN-4120558', -30, 335); doc('pv_riyada', 'vat', '100412055800003', -30, 700);
  hist('pv_riyada', 'created', null, 'pending', null, 5);

  company('pv_saqr', 'شركة الصقر للخدمات التقنية', 'Al Saqr Technical Services', 'it', ['it'], 'راشد السويدي', 'ops@alsaqr.demo', '+971 3 555 0121', null, 'suspended', 34, 'تأخر متكرر في تسليم أعمال الصيانة وعدم الالتزام بخطة التصحيح');
  doc('pv_saqr', 'licence', 'CN-2981104', -150, 215); doc('pv_saqr', 'vat', '100298110400003', -250, 480); doc('pv_saqr', 'insurance', 'POL-SQ-2026-009', -90, 275);
  hist('pv_saqr', 'created', null, 'pending', null, 400); hist('pv_saqr', 'status', 'pending', 'approved', 'استيفاء متطلبات التأهيل', 380);
  hist('pv_saqr', 'status', 'approved', 'suspended', 'تأخر متكرر في تسليم أعمال الصيانة وعدم الالتزام بخطة التصحيح', 34);

  // portal accounts ↔ companies
  for (const [u, p] of [['u_ext_horizon', 'pv_horizon'], ['u_ext_oasis', 'pv_oasis']]) {
    if (one('SELECT 1 FROM users WHERE id=?', u)) run('INSERT OR IGNORE INTO providers_users (user_id,provider_id,linked_by,linked_at) VALUES (?,?,?,?)', u, p, 'u_reem', at(-200, 9));
  }

  // legacy contracts (before this platform) with a previous-quarter evaluation
  const contract = (id, number, provider, title, dept, owner, value, startDays, endDays, po) => run(
    `INSERT INTO providers_contracts (id,number,provider_id,title,department_id,owner_id,value,start_date,end_date,status,po_number,source,created_by,created_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,'active',?,'legacy','u_reem',?,1)`,
    id, number, provider, title, dept, owner, value, day(startDays), day(endDays), po, at(startDays - 5, 9));
  contract('ct_demo_portal_ops', 'CN-2026-0071', 'pv_horizon', 'دعم وتشغيل منصة البوابة الموحدة', 'dept_it', 'u_mariam', 148000, -150, 215, 'PO-2026-0351');
  contract('ct_demo_bldg_maint', 'CN-2026-0058', 'pv_bayan', 'صيانة مباني مركز خدمة المتعاملين', 'dept_ops', 'u_omar', 96000, -200, 165, 'PO-2026-0322');
  const prevQ = day(-100);
  const evaln = (contractId, provider, evaluator, q, tm, c, comment) => run(
    'INSERT INTO providers_evaluations (id,contract_id,provider_id,evaluator_id,period,quality,timeliness,compliance,score,comment,created_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
    uid('pe_'), contractId, provider, evaluator, quarterOf(prevQ), q, tm, c, Math.round(((q + tm + c) / 3) * 100) / 100, comment, at(-100, 11));
  evaln('ct_demo_portal_ops', 'pv_horizon', 'u_mariam', 5, 4, 5, 'استجابة سريعة للبلاغات والتزام باتفاقية مستوى الخدمة، مع تأخر بسيط في تحديث الأمن الشهري.');
  evaln('ct_demo_bldg_maint', 'pv_bayan', 'u_omar', 3, 2, 3, 'تأخر في إغلاق طلبات الصيانة الطارئة وتكرار الملاحظات على جودة الأعمال الكهربائية.');
}
