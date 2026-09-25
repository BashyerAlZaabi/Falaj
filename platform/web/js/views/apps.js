// My Apps: arranged by organisation structure & permissions. Visibility here
// never grants data access; each app still enforces its own permissions.
// Vault apps open on Vault's own origin — the portal never reads their content.
import { h, icon } from '../ui.js';
import { L } from '../i18n.js';
import { state } from '../state.js';

const ICONS = { home: 'home', gauge: 'gauge', folder: 'folder', check: 'check', doc: 'doc', upload: 'upload', vault: 'vault', people: 'people', settings: 'settings' };
const CATS = { core: ['المنصة', 'Platform'], work: ['العمل', 'Work'], 'vault-feed': ['تغذية Vault', 'Vault feeds'], vault: ['داخل Vault', 'Inside Vault'], enterprise: ['الأنظمة المؤسسية', 'Enterprise systems'], admin: ['الإدارة', 'Administration'] };

export async function renderApps(root) {
  const apps = state.me.apps;
  root.append(h('p.small.muted', L(`تطبيقاتك حسب دورك (${state.me.user.role}) وإدارتك (${state.me.user.dept_ar}). ظهور التطبيق لا يمنح صلاحية الاطلاع على بياناته؛ كل تطبيق يتحقق من صلاحياتك في الخادم.`, 'Apps shown by your role and department. Seeing an app never grants access to its data.')));
  for (const [cat, label] of Object.entries(CATS)) {
    const list = apps.filter((a) => a.category === cat);
    if (!list.length) continue;
    root.append(h('div.section', L(...label)));
    root.append(h('div.apps-grid', list.map((a) => {
      const isVault = a.zone === 'vault'; const off = a.integration_status === 'not_connected';
      const tile = h(`${off ? 'div' : 'a'}.card.app-tile${isVault ? '.vault' : ''}${off ? '.off' : ''}`, off ? {} : { href: isVault ? `${a.url.replace(/\/(fs|marsad)$/, '')}/sso/start?next=${encodeURIComponent(a.route)}` : a.url, target: isVault ? '_blank' : null, rel: isVault ? 'noopener noreferrer' : null },
        h('div.ic', icon(ICONS[a.icon] || 'grid')),
        h('div', { style: { fontWeight: 600 } }, L(a.name_ar, a.name_en)),
        h('div.small.muted', a.description_ar),
        isVault ? h('span.chip.tiny.warn', icon('lock'), L('يفتح داخل Vault — بيئة معزولة', 'Opens inside Vault')) : off ? h('span.chip.tiny', L('غير متصل — يحتاج إعداد تكامل', 'Not connected — integration setup needed')) : null);
      return tile;
    })));
  }
}
