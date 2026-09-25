// Integration & Control Center — shared view helpers (labels, chips, sidebar sync).
import { h, icon, L, fmtNum, fmtDate, fmtTime, getLang, state, api, sysApi, classificationChip } from '../../../sys-kit.js';
import { sortSystems } from '../../../systems.js';
import { t } from '../../../i18n.js';

export const call = sysApi('integrations');
export { classificationChip };

// ---------- time ----------
export function ago(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(+d)) return '';
  const sec = Math.round((d - Date.now()) / 1000); const a = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat(getLang() === 'ar' ? 'ar-AE' : 'en', { numeric: 'auto' });
  if (a < 45) return L('الآن', 'just now');
  if (a < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (a < 86400 * 45) return rtf.format(Math.round(sec / 86400), 'day');
  return fmtDate(iso);
}
export const stamp = (iso) => (iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : '—');
export const num = (n) => h('span.num.tabular', fmtNum(n));

// Arabic counted nouns: [one, two, few (3–10), many (11+)] + English [one, many]
export function count(n, ar, en) {
  if (getLang() === 'en') return `${fmtNum(n)} ${n === 1 ? en[0] : en[1]}`;
  if (n === 0) return `${fmtNum(0)} ${ar[3]}`;
  if (n === 1) return ar[0];
  if (n === 2) return ar[1];
  return `${fmtNum(n)} ${n <= 10 ? ar[2] : ar[3]}`;
}
export const N = {
  system: [['نظام واحد', 'نظامان', 'أنظمة', 'نظاماً'], ['system', 'systems']],
  domain: [['نطاق واحد', 'نطاقان', 'نطاقات', 'نطاقاً'], ['domain', 'domains']],
  tool: [['أداة واحدة', 'أداتان', 'أدوات', 'أداة'], ['tool', 'tools']],
  request: [['طلب واحد', 'طلبان', 'طلبات', 'طلباً'], ['request', 'requests']],
  user: [['مستخدم واحد', 'مستخدمان', 'مستخدمين', 'مستخدماً'], ['user', 'users']],
  grant: [['صلاحية واحدة', 'صلاحيتان', 'صلاحيات', 'صلاحية'], ['grant', 'grants']],
  fetch: [['مرة واحدة', 'مرتان', 'مرات', 'مرة'], ['time', 'times']],
};
export const nOf = (n, key) => count(n, ...N[key]);

// ---------- policy & status vocab ----------
export const CLASS_LABEL = { internal: ['داخلي', 'Internal'], confidential: ['سري', 'Confidential'], restricted: ['سري للغاية', 'Restricted'] };
export const POLICY = {
  allowed: ['متاح للمساعد', 'Available to Ask AI'],
  opt_in: ['بموافقة المستخدم', 'User opt-in'],
  off: ['موقوف', 'Off'],
};
// What Ask AI can do with a domain for THIS user.
export function aiState(d) {
  if (d.ai_active) return 'on';
  if (d.ai_policy === 'opt_in') return 'optin';
  if (d.ai_locked) return 'locked';
  return 'off';
}
const AI_CHIP = {
  on: ['يقرؤه المساعد', 'Ask AI can read', 'info', 'spark'],
  optin: ['بموافقتك — غير مفعّل', 'Opt-in — off', 'outline', 'shield'],
  locked: ['مقفل دائماً', 'Always locked', 'purple', 'lockKeyhole'],
  off: ['موقوف بسياسة الجهة', 'Off by policy', 'outline', 'shieldBan'],
};
export function aiStateChip(d) {
  const [ar, en, tone, ic] = AI_CHIP[aiState(d)];
  return h(`span.chip.tiny.${tone}.ic-ai-state`, icon(ic), L(ar, en));
}
export const DIRECTION = {
  in: ['وارد', 'Inbound', 'download', 'بيانات تدخل إلى المنصة', 'Data comes into the platform'],
  out: ['صادر', 'Outbound', 'upload', 'بيانات تخرج من المنصة', 'Data leaves the platform'],
  both: ['ثنائي', 'Two-way', 'arrowLR', 'في الاتجاهين', 'Both ways'],
};
export function directionChip(dir) {
  const [ar, en, ic, tar, ten] = DIRECTION[dir] || DIRECTION.both;
  return h('span.chip.tiny.navy.ic-dir', { 'data-tip': L(tar, ten) }, icon(ic), L(ar, en));
}
export const STATUS = {
  connected: ['متصل', 'Connected', 'good', 'circleCheck'],
  available: ['جاهز للربط', 'Ready to connect', 'info', 'circlePlus'],
  needs_setup: ['يحتاج إعداد', 'Needs setup', 'warn', 'settings'],
  configured: ['مُعدّ — لم تُفعَّل المزامنة', 'Configured — sync not active', 'outline', 'circleDashed'],
  disabled: ['معطّل من المدير', 'Disabled by admin', 'outline', 'ban'],
};
export function statusChip(status) {
  const [ar, en, tone, ic] = STATUS[status] || STATUS.needs_setup;
  return h(`span.chip.${tone}.ic-status`, { 'data-status': status }, icon(ic), L(ar, en));
}
export function domainChip(d, { showState = false } = {}) {
  const cls = d.classification;
  return h(`span.ic-domain-chip.${cls}${d.protected ? '.protected' : ''}${d.masked ? '.masked' : ''}`, { 'data-tip': d.protected ? L('نطاق سري للغاية — لا يُربط بأي موصل', 'Restricted domain — never connectable') : d.masked ? L('يظهر «مشغول» فقط بلا تفاصيل', 'Shown as “busy” only, no details') : L(CLASS_LABEL[cls]?.[0] || '', CLASS_LABEL[cls]?.[1] || '') },
    icon(d.protected ? 'lockKeyhole' : d.masked ? 'eyeOff' : cls === 'confidential' ? 'lock' : 'database'),
    h('span', L(d.name_ar, d.name_en)),
    d.protected ? h('span.ic-dc-note', L('محمي', 'Protected')) : d.masked ? h('span.ic-dc-note', L('مقنّع', 'Masked')) : null,
    showState ? aiStateChip(d) : null);
}
export const toolsText = (tools) => {
  if (!tools || (!tools.read && !tools.write)) return L('لا أدوات للمساعد', 'No assistant tools');
  const parts = [];
  if (tools.read) parts.push(L(`${fmtNum(tools.read)} للقراءة`, `${tools.read} read`));
  if (tools.write) parts.push(L(`${fmtNum(tools.write)} للتعديل بتأكيدك`, `${tools.write} write (with your confirmation)`));
  return `${L('أدوات المساعد', 'Assistant tools')}: ${parts.join(' · ')}`;
};

// ---------- identity of the viewer's own systems (keep /api/me state in sync) ----------
export function updateMeSystem(summary) {
  if (!summary?.key || !state.me?.systems) return;
  const i = state.me.systems.findIndex((s) => s.key === summary.key);
  if (i >= 0) state.me.systems[i] = { ...state.me.systems[i], ...summary };
}
// Local equivalent of the shell's nav rebuild for the pinned-systems group
// (the shell does not expose one): same markup as app.js systemsGroup().
export function syncSidebar() {
  const nav = document.querySelector('#nav-items');
  if (!nav || !state.me) return;
  const list = sortSystems((state.me.systems || []).filter((s) => s.pinned));
  const current = state.route === 'sys' ? `sys:${state.params?.[0]}` : state.route;
  const group = list.length ? h('div.nav-group.nav-systems', { role: 'group', 'aria-label': t('nav.group.systems') }, h('div.nav-group-title', t('nav.group.systems')),
    list.map((s) => h(`a.item${`sys:${s.key}` === current ? '.on' : ''}`, { href: `#/sys/${s.key}`, 'data-route': `sys:${s.key}`, title: L(s.name_ar, s.name_en), 'aria-current': `sys:${s.key}` === current ? 'page' : null },
      icon(s.icon), h('span.label', L(s.name_ar, s.name_en)), h('span.nav-badge.hidden', { 'data-badge': `sys:${s.key}` })))) : null;
  const old = nav.querySelector('.nav-systems');
  if (old) { if (group) old.replaceWith(group); else old.remove(); return; }
  if (!group) return;
  const appsGroup = nav.querySelector('a.item[data-route="apps"]')?.closest('.nav-group');
  if (appsGroup) nav.insertBefore(group, appsGroup); else nav.append(group);
}
// PUT /api/systems/:key/prefs (platform endpoint) and mirror the result locally.
export async function setPrefs(key, body) {
  const summary = await api(`/api/systems/${encodeURIComponent(key)}/prefs`, { method: 'PUT', body });
  updateMeSystem(summary);
  if (body.pinned !== undefined) syncSidebar();
  return summary;
}

// ---------- small building blocks ----------
export const sysGlyph = (ic, cls = '') => h(`span.ic-glyph${cls ? '.' + cls : ''}`, { 'aria-hidden': 'true' }, icon(ic));
export function sectionHead(title, { sub, count: c, actions = [] } = {}) {
  return h('div.ic-section-head', h('div.grow', h('h2.ic-section-title', title, c != null ? h('span.ic-count.num.tabular', fmtNum(c)) : null), sub ? h('p.ic-section-sub', sub) : null), actions.length ? h('div.ic-section-actions', actions) : null);
}
export async function copyText(text, msg) {
  const { toast } = await import('../../../ui.js');
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text); document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(msg); } catch { toast(L('تعذّر النسخ — انسخ النص يدوياً', 'Could not copy — copy it manually'), { kind: 'error' }); }
    ta.remove();
  }
}
