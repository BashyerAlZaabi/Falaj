// Generates web/js/icons-data.js from the Lucide icon set (single consistent,
// rounded icon system). Run after changing the map: node scripts/build-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP = {
  home: 'house', gauge: 'gauge', folder: 'folder-kanban', check: 'check', doc: 'file-text', grid: 'layout-grid', upload: 'cloud-upload', vault: 'vault',
  settings: 'settings', people: 'users', search: 'search', send: 'arrow-up', mic: 'mic', mute: 'volume-off', speaker: 'volume-2', clip: 'paperclip',
  plus: 'plus', x: 'x', expand: 'maximize-2', shrink: 'minimize-2', chevron: 'chevron-right', chevronL: 'chevron-left', chevronDown: 'chevron-down', chevronUp: 'chevron-up',
  history: 'rotate-ccw-clock', logout: 'log-out', sun: 'sun', moon: 'moon', monitor: 'monitor', menu: 'menu', chat: 'message-circle', bar: 'chart-column', pie: 'chart-pie',
  table: 'table-2', list: 'list', trash: 'trash', drag: 'grip-vertical', bold: 'bold', italic: 'italic', h: 'heading-2', ul: 'list', eye: 'eye', download: 'download',
  copy: 'copy', alert: 'triangle-alert', calendar: 'calendar', spark: 'sparkles', undo: 'undo-2', lock: 'lock', ext: 'external-link', refresh: 'refresh-cw', info: 'info',
  bell: 'bell', command: 'command', sidebar: 'panel-left', sidebarR: 'panel-right', circleCheck: 'circle-check', circleX: 'circle-x', circleAlert: 'circle-alert',
  loader: 'loader-circle', sliders: 'sliders-horizontal', sort: 'arrow-up-down', sortUp: 'arrow-up-narrow-wide', sortDown: 'arrow-down-wide-narrow', user: 'user', languages: 'languages',
  inbox: 'inbox', filePlus: 'file-plus', folderPlus: 'folder-plus', taskPlus: 'list-plus', bot: 'bot', filter: 'list-filter', clock: 'clock', shield: 'shield-check',
  layers: 'layers', keyboard: 'keyboard', trendUp: 'trending-up', trendDown: 'trending-down', pencil: 'pencil', share: 'share', more: 'ellipsis', zap: 'zap',
  building: 'building', database: 'database', key: 'key-round', plug: 'plug', activity: 'activity', listChecks: 'list-checks', help: 'circle-question-mark', wand: 'wand-sparkles',
  paragraph: 'pilcrow', target: 'target', pin: 'pin', play: 'play', pause: 'pause', stop: 'square', arrowRight: 'arrow-right', arrowLeft: 'arrow-left', return: 'corner-down-left',
  eyeOff: 'eye-off', minus: 'minus', circlePlus: 'circle-plus', arrowUpRight: 'arrow-up-right', gripH: 'grip-horizontal', listTodo: 'list-todo', calendarDays: 'calendar-days',
  userCheck: 'user-check', fileCheck: 'file-check', folderOpen: 'folder-open', mail: 'mail', flag: 'flag', timer: 'timer', circleDot: 'circle-dot', hourglass: 'hourglass',
  wifiOff: 'wifi-off', lightbulb: 'lightbulb', messageSquare: 'message-square-text', chartBar: 'chart-bar', chartLine: 'chart-line', chartNoAxes: 'chart-no-axes-column', percent: 'percent',
  sparkle: 'sparkle', rocket: 'rocket', badgeCheck: 'badge-check', shieldAlert: 'shield-alert', lockOpen: 'lock-open', fileDown: 'file-down', fileUp: 'file-up', files: 'files',
  mic2: 'mic-off', square: 'square', circle: 'circle', dotsV: 'ellipsis-vertical', maximize: 'maximize', columns: 'columns-2', rows: 'rows-3', sidebarClose: 'panel-left-close', panelRightClose: 'panel-right-close',
  fileText: 'file-text', calendarClock: 'calendar-clock', circleDashed: 'circle-dashed', inboxEmpty: 'inbox', checkCheck: 'check-check', link: 'link', globe: 'globe',
  // enterprise systems
  gift: 'gift', trophy: 'trophy', award: 'award', medal: 'medal', scale: 'scale', gavel: 'gavel', handshake: 'handshake', cart: 'shopping-cart', receipt: 'receipt',
  wallet: 'wallet', banknote: 'banknote', coins: 'coins', handCoins: 'hand-coins', calculator: 'calculator', fileSign: 'file-pen-line', clipboardList: 'clipboard-list',
  clipboardCheck: 'clipboard-check', searchCheck: 'search-check', scanSearch: 'scan-search', fileSearch: 'file-search', fileWarning: 'file-exclamation-point', fileLock: 'file-lock',
  briefcase: 'briefcase', landmark: 'landmark', network: 'network', milestone: 'milestone', compass: 'compass', crosshair: 'crosshair', goal: 'goal', star: 'star',
  thumbsUp: 'thumbs-up', thumbsDown: 'thumbs-down', vote: 'vote', listOrdered: 'list-ordered', calendarCheck: 'calendar-check', calendarPlus: 'calendar-plus', calendarX: 'calendar-x',
  usersRound: 'users-round', userPlus: 'user-plus', userX: 'user-x', userCog: 'user-cog', package: 'package', truck: 'truck', store: 'store', factory: 'factory',
  shieldQuestion: 'shield-question-mark', shieldX: 'shield-x', shieldBan: 'shield-ban', fingerprint: 'fingerprint-pattern', lockKeyhole: 'lock-keyhole', unplug: 'unplug', cable: 'cable',
  webhook: 'webhook', arrowLR: 'arrow-left-right', compare: 'git-compare', workflow: 'workflow', kanban: 'square-kanban', gantt: 'chart-gantt', sigma: 'sigma',
  idCard: 'id-card', contact: 'contact', mailCheck: 'mail-check', heartHandshake: 'heart-handshake', party: 'party-popper', crown: 'crown', gem: 'gem', flame: 'flame',
  dashboard: 'layout-dashboard', presentation: 'presentation', notebook: 'notebook-pen', sticky: 'sticky-note', messagePlus: 'message-square-plus', reply: 'reply', tag: 'tag',
  tags: 'tags', bookmark: 'bookmark', archive: 'archive', clockAlert: 'clock-alert', alarm: 'alarm-clock', ban: 'ban',
  squareCheck: 'square-check', circlePlay: 'circle-play', ruler: 'ruler', puzzle: 'puzzle', radar: 'radar', lineChart: 'chart-spline', scatter: 'chart-scatter', stamp: 'stamp',
  faceHappy: 'face-grinning', faceNeutral: 'face-neutral', faceSad: 'face-slightly-frowning', signature: 'signature', mapPin: 'map-pin', eyeCheck: 'scan-eye', badgeAlert: 'badge-alert', badgeDollar: 'badge-dollar-sign', percentCircle: 'circle-percent', hash: 'hash',
};
const out = {};
const missing = [];
for (const [k, name] of Object.entries(MAP)) {
  const f = path.join(ROOT, 'node_modules/lucide/dist/esm/icons', `${name}.mjs`);
  if (!fs.existsSync(f)) { missing.push(name); continue; }
  const mod = await import(f);
  out[k] = mod.default.map(([tag, attrs]) => [tag, Object.fromEntries(Object.entries(attrs).filter(([a]) => a !== 'key'))]);
}
if (missing.length) { console.error('missing lucide icons:', missing.join(', ')); process.exit(1); }
const src = `// Generated by scripts/build-icons.mjs from Lucide (ISC license). Do not edit by hand.\nexport const ICONS = ${JSON.stringify(out)};\n`;
fs.writeFileSync(path.join(ROOT, 'web/js/icons-data.js'), src);
console.log(`wrote ${Object.keys(out).length} icons`);
