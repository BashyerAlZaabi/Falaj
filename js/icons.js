/* ===== مكتبة أيقونات بأسلوب SF Symbols (SVG) =====
   ICON(name, {size, color, class}) → نص SVG. اللون عبر currentColor.
*/
const ICONS = {
  house: '<path d="M11.3 3.5 3.7 9.8c-.4.4-.7 1-.7 1.6V20c0 .6.4 1 1 1h4.5c.6 0 1-.4 1-1v-4.2c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3V20c0 .6.4 1 1 1H20c.6 0 1-.4 1-1v-8.6c0-.6-.3-1.2-.7-1.6l-7.6-6.3c-.4-.3-1-.3-1.4 0Z"/>',

  dumbbell: '<rect x="2" y="9" width="2.4" height="6" rx="1"/><rect x="4.5" y="7.3" width="2.6" height="9.4" rx="1.2"/><rect x="16.9" y="7.3" width="2.6" height="9.4" rx="1.2"/><rect x="19.6" y="9" width="2.4" height="6" rx="1"/><rect x="6.8" y="10.7" width="10.4" height="2.6" rx="1.1"/>',

  bag: '<path d="M5.2 8h13.6c.5 0 1 .4 1 .9l.9 10.6c.1 1-.7 1.9-1.7 1.9H5c-1 0-1.8-.9-1.7-1.9L4.2 8.9c0-.5.5-.9 1-.9Z"/><path d="M8.2 8.5V7a3.8 3.8 0 0 1 7.6 0v1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',

  trophy: '<path d="M7 4h10v4.5a5 5 0 0 1-10 0Z"/><path d="M17 5.2h1.8c.9 0 1.5.9 1.1 1.7-.5 1.1-1.6 2-2.9 2.3M7 5.2H5.2c-.9 0-1.5.9-1.1 1.7.5 1.1 1.6 2 2.9 2.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="10.9" y="12.5" width="2.2" height="3.5"/><path d="M9 16h6l.6 2.2c.1.5-.2 1-.7 1H9.1c-.5 0-.9-.5-.7-1Z"/><rect x="7.5" y="19.3" width="9" height="1.9" rx=".9"/>',

  star: '<path d="M12 2.6c.3 0 .6.2.8.5l2.4 4.9 5.4.8c.7.1 1 1 .5 1.5l-3.9 3.8.9 5.4c.1.7-.6 1.2-1.2.9L12 18.3l-4.8 2.5c-.6.3-1.3-.2-1.2-.9l.9-5.4-3.9-3.8c-.5-.5-.2-1.4.5-1.5l5.4-.8 2.4-4.9c.2-.3.5-.5.8-.5Z"/>',

  coin: '<path fill-rule="evenodd" d="M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0Zm9-5-1.1 3.3-3.5.1 2.8 2.1-1 3.4 2.8-2 2.8 2-1-3.4 2.8-2.1-3.5-.1Z"/>',

  flame: '<path d="M12 2.5c.6 2.7 2.2 3.8 3.4 5.4 1 1.3 1.6 2.7 1.6 4.4a5 5 0 0 1-10 0c0-1.4.5-2.4 1.3-3.4.2 1.1.9 1.8 1.7 2 .3-2.3-.6-4 .9-6.1.3.9.9 1.4 1.6 1.9-.3-1.6-.7-2.9-2-4.2Z"/>',

  tshirt: '<path d="M9 3.5 4.2 6.3c-.5.3-.7.9-.5 1.4l1.2 2.7c.2.5.8.7 1.3.5l.8-.4V20c0 .6.4 1 1 1h7.4c.6 0 1-.4 1-1V10.5l.8.4c.5.2 1.1 0 1.3-.5l1.2-2.7c.2-.5 0-1.1-.5-1.4L15 3.5h-1.2a1.8 1.8 0 0 1-3.6 0Z"/>',

  play: '<path fill-rule="evenodd" d="M5 5.5h14c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-9c0-1.1.9-2 2-2Zm5 4v5l4.5-2.5Z"/>',

  person: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0c0 .3-.2.5-.5.5H5c-.3 0-.5-.2-.5-.5Z"/>',

  // شخصية إماراتية (رجل): غترة + عقال
  personMale: '<path d="M5.5 9.5C5.5 4.8 8.6 2.5 12 2.5s6.5 2.3 6.5 7c0 2.6-.3 5-1 7.2-1.2-1-2.2-.8-2.8-.3v-4.9c-1.8-1.4-3.6-1.4-5.4 0v4.9c-.6-.5-1.6-.7-2.8.3-.7-2.2-1-4.6-1-7.2Z"/><path d="M7.2 6.1c1.1-1.1 8.5-1.1 9.6 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7 7.6c1.2-1 8.8-1 10 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',

  // شخصية إماراتية (أنثى): شيلة
  personFemale: '<path d="M5 9.5C5 4.7 8.4 2.5 12 2.5s7 2.2 7 7c0 3-.3 5.6-1 8-1.3-1-2.2-.6-2.8 0-.1 0-3.2 0-6.4 0-.6-.6-1.5-1-2.8 0-.7-2.4-1-5-1-8Z"/><path d="M9 8.5c0-1.7 1.3-2.8 3-2.8s3 1.1 3 2.8c0 2.1-1.3 3.6-3 3.6S9 10.6 9 8.5Z" fill="#0b0b0c"/>',

  glasses: '<path d="M3 9h4l1 1h8l1-1h4v2h-1.2a3.3 3.3 0 0 1-6.5.4l-.1-.7h-2.4l-.1.7a3.3 3.3 0 0 1-6.5-.4H3Z"/>',

  watch: '<rect x="7.5" y="7.5" width="9" height="9" rx="3"/><path d="M9.5 7 9 4.2c-.1-.7.4-1.2 1-1.2h4c.6 0 1.1.5 1 1.2L14.5 7M9.5 17l.5 2.8c.1.7.5 1.2 1.1 1.2h2.8c.6 0 1-.5 1.1-1.2l.5-2.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',

  shoe: '<path d="M2.5 11.5c.6-.2 1.3 0 1.8.5l1.4 1.3c.7.6 1.7.8 2.5.4l2.2-1c.5-.2 1.1-.1 1.5.3l6.4 5c.7.5 1.2 1.3 1.2 2.2v.3c0 .8-.6 1-1.3 1H3.6c-.6 0-1.1-.5-1.1-1.1Z"/>',

  headphones: '<path d="M4 13v-1a8 8 0 0 1 16 0v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="2.5" y="12.5" width="4" height="7" rx="2"/><rect x="17.5" y="12.5" width="4" height="7" rx="2"/>',

  medal: '<path d="M8.5 3h7l-2.2 6.3-1.3-.7-1.3.7Z"/><circle cx="12" cy="15.5" r="5.5"/><path d="M12 12.8l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 15l2.2-.3Z" fill="#0b0b0c"/>',

  cap: '<path d="M4 14c0-5 3.6-8 8-8s8 3 8 8c0 .6-.5 1-1.1.8-3.9-1.3-9.9-1.3-13.8 0C4.5 15 4 14.6 4 14Z"/><path d="M4.2 14.2c-1.6.3-2.7 1-3 1.9-.1.5.3.9.8.8 2.4-.4 3.4-1.2 3.7-1.9Z"/>',

  check: '<path d="M5 12.5l4.2 4.3L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',

  xmark: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',

  chevron: '<path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',

  bolt: '<path d="M13.5 2 5 13h5l-1.5 9L19 11h-5.5Z"/>',

  waves: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9q2.2-2.4 4.5 0t4.5 0 4.5 0 4.5 0"/><path d="M3 14q2.2-2.4 4.5 0t4.5 0 4.5 0 4.5 0"/><path d="M3 19q2.2-2.4 4.5 0t4.5 0 4.5 0 4.5 0"/></g>',

  bicycle: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 10 8h5M9 8l4 8.5M13 8l2-2.5h2"/></g>',

  figure: '<circle cx="13" cy="4.5" r="2.2"/><path d="M12.6 8c-.7 0-1.3.4-1.6 1l-1.6 3.2-2.7 1.2c-.6.3-.9 1-.6 1.6.3.6 1 .9 1.6.6l3.2-1.4c.4-.2.7-.5.9-.9l.3-.6.9 2-2 3.8c-.4.7-.1 1.5.6 1.8.6.3 1.4 0 1.7-.6l2.3-4.3c.3-.5.3-1.1 0-1.6l-1.2-2.4 1-2 .6 1.4c.2.5.7.8 1.2.8h2.2c.7 0 1.2-.6 1.2-1.2 0-.7-.5-1.2-1.2-1.2h-1.4l-1.3-2.7c-.4-.9-1.3-1.5-2.3-1.5Z"/>',

  ring: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/>',

  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',

  sparkle: '<path d="M12 2.5l1.6 4.4c.3.8.9 1.4 1.7 1.7L19.5 12l-4.4 1.6c-.8.3-1.4.9-1.7 1.7L12 19.5l-1.6-4.4c-.3-.8-.9-1.4-1.7-1.7L4.5 12l4.2-1.4c.8-.3 1.4-.9 1.7-1.7Z"/>',

  sun: '<circle cx="12" cy="12" r="4.4"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8"/></g>',

  moon: '<path d="M20.5 14.8A8.2 8.2 0 0 1 9.2 3.5 7.2 7.2 0 1 0 20.5 14.8Z"/>',

  globe: '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.8 2.6 2.8 15.4 0 18M12 3c-2.8 2.6-2.8 15.4 0 18"/></g>',
};

function ICON(name, opts) {
  opts = opts || {};
  const s = opts.size || 24;
  const cls = opts.class ? ' class="' + opts.class + '"' : '';
  const style = opts.color ? ' style="color:' + opts.color + '"' : '';
  return '<svg' + cls + style + ' width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

window.ICON = ICON;
