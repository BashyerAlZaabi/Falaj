/* ===== FALAJ — inline SVG icons (stroke style, 24×24) ===== */
const ICON_PATHS = {
  home:    '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  drop:    '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  leaf:    '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16z"/><path d="M4 20c4-6 8-8 12-9"/>',
  bell:    '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  chart:   '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="6"/><rect x="13" y="8" width="3" height="10"/>',
  grid:    '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  temp:    '<path d="M14 14V5a2 2 0 0 0-4 0v9a4 4 0 1 0 4 0z"/>',
  humid:   '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
  flask:   '<path d="M9 3h6"/><path d="M10 3v6l-5 9a1 1 0 0 0 1 1.5h12A1 1 0 0 0 19 18l-5-9V3"/>',
  tank:    '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M5 12h14"/><path d="M5 12c2 2 4 2 7 0s5-2 7 0"/>',
  sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  trend:   '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5h-5"/>',
  cloud:   '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.7-1.5A3.5 3.5 0 0 1 18 18z"/>',
  cash:    '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  check:   '<path d="M20 6L9 17l-5-5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  globe:   '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  logout:  '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h12"/>',
  user:    '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  store:   '<path d="M4 9l1-5h14l1 5"/><path d="M4 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 9v11h14V9"/>',
  info:    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  power:   '<path d="M12 3v9"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>',
  spark:   '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
};

function icon(name, cls) {
  const p = ICON_PATHS[name] || '';
  return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
         'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

// FALAJ geometric wordmark (approximates the brand logo from the deck).
function falajLogo(color) {
  const c = color || 'currentColor';
  return `
  <svg class="falaj-logo" viewBox="0 0 220 48" fill="none" aria-label="FALAJ">
    <g fill="${c}">
      <!-- F -->
      <rect x="0" y="6" width="22" height="6"/><rect x="0" y="21" width="16" height="6"/><rect x="0" y="6" width="6" height="36"/>
      <!-- A -->
      <polygon points="34,42 44,6 50,6 60,42 53,42 47,16 41,42"/>
      <!-- L -->
      <rect x="68" y="6" width="6" height="36"/><rect x="68" y="36" width="20" height="6"/>
      <!-- A -->
      <polygon points="96,42 106,6 112,6 122,42 115,42 109,16 103,42"/>
      <!-- J -->
      <rect x="150" y="6" width="6" height="26"/><path d="M156 32a14 14 0 0 1-28 0h6a8 8 0 0 0 16 0z"/>
    </g>
  </svg>`;
}
