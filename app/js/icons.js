/* ===== FALAJ — inline SVG icons (24×24 stroke) + rainbow logo ===== */
const ICON_PATHS = {
  // nav
  home:    '<path d="M12 3c-1.5 3-5 4-5 8a5 5 0 0 0 10 0c0-4-3.5-5-5-8z"/><path d="M12 21v-7"/>',
  fields:  '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/>',
  support: '<path d="M4 13a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/>',
  settings:'<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  // ui
  bell:    '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  back:    '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  eye:     '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:  '<path d="M3 3l18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3.3 3.8M6.5 8.2A18 18 0 0 0 2 12s4 7 10 7a10.6 10.6 0 0 0 3.4-.6"/><path d="M9.5 10.5a3 3 0 0 0 4 4"/>',
  check:   '<path d="M20 6L9 17l-5-5"/>',
  info:    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  globe:   '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  logout:  '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h12"/>',
  user:    '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  pin:     '<path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  chat:    '<path d="M4 5h16v11H9l-5 4z"/>',
  phone:   '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-1z"/>',
  // weather
  cloudsun:'<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M3 8H1.5M14 4l-1 1M3 13l-1 1"/><path d="M10 18a3.5 3.5 0 0 1 0-7 4.5 4.5 0 0 1 8.6-1.3A3 3 0 0 1 19 18z"/>',
  drop:    '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  calendar:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M9 3v4M15 3v4"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wheat:   '<path d="M12 22V9"/><path d="M12 9c-2-1-4-3-4-6 3 0 4 2 4 4M12 9c2-1 4-3 4-6-3 0-4 2-4 4M12 14c-2-1-4-2-4-5 3 0 4 2 4 4M12 14c2-1 4-2 4-5-3 0-4 2-4 4"/>',
  leaf:    '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16z"/><path d="M4 20c4-6 8-8 12-9"/>',
  list:    '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  tag:     '<path d="M3 12l9-9 9 9-9 9z"/><circle cx="12" cy="12" r="2"/>',
  hectare: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16"/>',
};

function icon(name, cls) {
  const p = ICON_PATHS[name] || '';
  return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
         'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

// Social brand glyphs (filled, brand-ish but monochrome-friendly).
function social(name) {
  if (name === 'apple') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.7c0-2 1.6-3 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7c-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.4 2 2.4 2 1 0 1.3-.6 2.5-.6s1.5.6 2.5.6 1.7-1 2.3-2c.7-1 1-2 1-2-.1 0-2.1-.8-2.1-3.1zM14.6 6.3c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.7-.4 2.3-1.1z"/></svg>';
  if (name === 'google') return '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.6-.1-1.2-.2-1.8H12v3.5h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z"/><path fill="#34A853" d="M12 22c2.7 0 5-1 6.6-2.6l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.6V7.6H3.1a10 10 0 0 0 0 8.8z"/><path fill="#EA4335" d="M12 6.3c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.6l3.3 2.6C7.2 8 9.4 6.3 12 6.3z"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="#1877F2"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.5V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>';
}

// FALAJ rainbow "sunrise" logo: concentric arcs + wordmark.
function falajLogo(textColor, size) {
  const h = size || 30;
  const tc = textColor || '#173d2e';
  return `<span class="falaj-brand" style="--lh:${h}px">
    <svg class="falaj-mark" viewBox="0 0 48 30" fill="none" aria-hidden="true">
      <path d="M4 26a20 20 0 0 1 40 0" stroke="#e23b32" stroke-width="5" stroke-linecap="round"/>
      <path d="M10 26a14 14 0 0 1 28 0" stroke="#f0962a" stroke-width="5" stroke-linecap="round"/>
      <path d="M16 26a8 8 0 0 1 16 0" stroke="#f4c531" stroke-width="5" stroke-linecap="round"/>
      <circle cx="40" cy="9" r="2.4" fill="#f0962a"/>
    </svg>
    <span class="falaj-word" style="color:${tc}">${t('app.name')}</span>
  </span>`;
}
