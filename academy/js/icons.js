/* icons.js — inline SVG icon set (stroke-based, currentColor) */
(function () {
  "use strict";
  const s = (p, o = {}) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${o.w || 1.8}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  const I = {
    leaf: s('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 3c1 2 1.5 8-1 12a7 7 0 0 1-6.9 4"/><path d="M5 21c1.5-3 4-5.5 8-6.5"/>'),
    tree: s('<path d="M12 22v-8"/><path d="M12 14a5 5 0 0 0 5-5 4 4 0 0 0-1-2.6A4 4 0 0 0 12 2a4 4 0 0 0-4 4.4A4 4 0 0 0 7 9a5 5 0 0 0 5 5Z"/><path d="M9 18h6"/>'),
    palm: s('<path d="M12 22V11"/><path d="M12 11c0-4 3-6 7-6-1 3-3 5-7 6"/><path d="M12 11c0-4-3-6-7-6 1 3 3 5 7 6"/><path d="M12 11c-1-3-4-4-7-3 2 2 4 3 7 3"/><path d="M12 11c1-3 4-4 7-3-2 2-4 3-7 3"/>'),
    book: s('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'),
    scissors: s('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>'),
    droplet: s('<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7Z"/>'),
    sprout: s('<path d="M7 20h10"/><path d="M12 20v-8"/><path d="M12 12c0-3 2-5 6-5-1 3-3 5-6 5Z"/><path d="M12 14c0-2-1.5-4-5-4 .6 2.5 2.4 4 5 4Z"/>'),
    wheat: s('<path d="M12 22V8"/><path d="M12 8c-2-1-3-3-3-5 2 0 4 1 5 3M12 8c2-1 3-3 3-5-2 0-4 1-5 3"/><path d="M12 13c-2-1-3-3-3-5 2 0 4 1 5 3M12 13c2-1 3-3 3-5-2 0-4 1-5 3"/>'),
    chart: s('<path d="M3 3v18h18"/><path d="M7 15l3-4 3 3 4-6"/>'),
    coins: s('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>'),
    calc: s('<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="18"/><line x1="8" y1="18" x2="12" y2="18"/>'),
    shield: s('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>'),
    bulb: s('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z"/>'),
    home: s('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>'),
    bug: s('<path d="M8 2l1.5 1.5"/><path d="M16 2l-1.5 1.5"/><path d="M9 7h6a4 4 0 0 1 4 4v3a7 7 0 0 1-14 0v-3a4 4 0 0 1 4-4Z"/><path d="M12 20v-9"/><path d="M6.5 10H3M21 10h-3.5M6 14H3M21 14h-3M7 18l-2 2M17 18l2 2"/>'),
    seed: s('<path d="M12 2C7 6 5 10 5 14a7 7 0 0 0 14 0c0-4-2-8-7-12Z"/><path d="M12 22v-8M9 13l3 3 3-3"/>'),
    cpu: s('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>'),
    briefcase: s('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    arrowL: s('<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>'),
    arrowR: s('<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>'),
    check: s('<path d="M20 6 9 17l-5-5"/>', { w: 2.4 }),
    checkCircle: s('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
    x: s('<path d="M18 6 6 18M6 6l12 12"/>', { w: 2.2 }),
    play: s('<path d="M6 4v16l14-8Z" fill="currentColor" stroke="none"/>'),
    target: s('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
    clock: s('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    layers: s('<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'),
    star: s('<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8Z"/>'),
    grip: s('<circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/>'),
    up: s('<path d="M18 15l-6-6-6 6"/>'),
    down: s('<path d="M6 9l6 6 6-6"/>'),
    hand: s('<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-3-4 1.5-1.5a2 2 0 0 1 2.5-.3L6 16"/>'),
    tools: s('<path d="M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4Z"/><path d="m14.5 12.5 4 4"/><path d="M7 7 3 3M5 5l2 2"/>'),
    sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    eye: s('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
    flag: s('<path d="M4 22V4s1-1 4-1 5 2 8 2 4-1 4-1v9s-1 1-4 1-5-2-8-2-4 1-4 1"/>'),
    trophy: s('<path d="M6 9a6 6 0 0 0 12 0V4H6Z"/><path d="M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3"/><path d="M9 21h6M12 15v6"/>'),
    users: s('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/>'),
    plus: s('<path d="M12 5v14M5 12h14"/>'),
    factory: s('<path d="M2 20V10l6 4V10l6 4V4h4v16Z"/><path d="M2 20h20"/>'),
  };

  window.Icon = (name, cls = "") => {
    const raw = I[name] || I.leaf;
    return cls ? raw.replace("<svg ", `<svg class="${cls}" `) : raw;
  };
})();
