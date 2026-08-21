/* =============================================================================
   الصفحة الأرضية تحت الرحلة + تبديل اللغة
   The grounded page below the flight + the language switch
   ========================================================================== */

(function () {
  'use strict';

  const W = window.WORLD;
  const $ = (s, r) => (r || document).querySelector(s);
  const T = (o, l) => (o && (o[l] != null ? o[l] : o.ar)) || '';

  const ICONS = {
    chip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9.5 9.5h5v5h-5z"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></svg>',
    drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2S5.6 10 5.6 14.2a6.4 6.4 0 0 0 12.8 0C18.4 10 12 3.2 12 3.2z"/><path d="M9.4 14.6a2.7 2.7 0 0 0 2.6 2.6"/></svg>',
    seed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-7"/><path d="M12 14C7.8 14 4.5 11.2 4 7c4.4-.6 7.6 2 8 7z"/><path d="M12.6 12.4c.5-4.2 3.3-6.6 7.4-6.1-.3 3.6-2.6 6.1-6 6.3"/></svg>',
    leaf: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 37V21" stroke="#8FC46B" stroke-width="3.4" stroke-linecap="round"/><path d="M19 22C10 21 4 15 4 6c10-1 16 5 16 15z" fill="#2FA36B"/><path d="M21 19c1-9 7-14 16-13-.6 8-6 13-14 13z" fill="#8FC46B"/></svg>',
  };

  /* ---- بناء الأقسام مرّة واحدة · build the sections once ------------------ */
  function buildTracks(lang) {
    $('#tracksGrid').innerHTML = W.TRACKS.map(t => `
      <article class="card" style="--c:${t.accent}">
        <div class="card__ico">${ICONS[t.icon]}</div>
        <h3>${T(t.name, lang)}</h3>
        <p>${T(t.desc, lang)}</p>
      </article>`).join('');
  }

  function buildPhases(lang) {
    $('#phaseGrid').innerHTML = W.PHASES.map(p => `
      <article class="step">
        <b class="n">${p.n}</b>
        <h3>${T(p.name, lang)}</h3>
        <span class="when">${T(p.when, lang)}</span>
        <p>${T(p.desc, lang)}</p>
      </article>`).join('');
  }

  function buildTargets(lang) {
    $('#numGrid').innerHTML = W.TARGETS.map(t => `
      <div class="num"><b>${lang === 'ar' ? t.value : t.valueEn}</b><span>${T(t.label, lang)}</span></div>`).join('');
  }

  function buildForm(lang) {
    const sel = $('#fTrack');
    sel.innerHTML = W.TRACKS.map(t => `<option>${T(t.name, lang)}</option>`).join('');
  }

  /* ---- تطبيق اللغة على كل شيء · apply a language everywhere -------------- */
  function apply(lang) {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', dir);

    document.title = T(W.BRAND.name, lang) + ' — ' + T(W.SCENES[0].title, lang);
    const desc = $('meta[name="description"]');
    if (desc) desc.setAttribute('content', T(W.SCENES[0].body, lang));

    // كل عنصر عليه data-t="UI.key" أو "BRAND.key"
    document.querySelectorAll('[data-t]').forEach(el => {
      const [group, key] = el.dataset.t.split('.');
      const val = T((W[group] || {})[key], lang);
      if (el.dataset.tAttr) el.setAttribute(el.dataset.tAttr, val);
      else el.textContent = val;
    });

    buildTracks(lang); buildPhases(lang); buildTargets(lang); buildForm(lang);
    $('#langBtn').textContent = T(W.UI.langLabel, lang);
    try { localStorage.setItem('yaa_lang', lang); } catch (e) {}
    return lang;
  }

  /* ---- الإقلاع · boot ---------------------------------------------------- */
  let lang = 'ar';
  try { lang = localStorage.getItem('yaa_lang') || 'ar'; } catch (e) {}
  if (!['ar', 'en'].includes(lang)) lang = 'ar';

  $('#markLeaf').innerHTML = ICONS.leaf;

  const flight = window.mountWorldFlight($('#world'), { scenes: W.SCENES, lang });
  apply(lang);
  flight.setLang(lang);

  // فوق الرحلة الشريط شفّاف على الرسم؛ وتحتها يصير فاتحاً كي يبقى مقروءاً
  // Over the flight the bar floats on the artwork; below it, it goes light so it stays readable.
  const chrome = $('.chrome');
  const syncChrome = () => {
    const past = !flight.isStatic && scrollY > flight.end() - innerHeight * 0.55;
    chrome.classList.toggle('chrome--solid', flight.isStatic ? scrollY > 40 : past);
  };
  addEventListener('scroll', syncChrome, { passive: true });
  syncChrome();

  $('#langBtn').addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    apply(lang);
    flight.setLang(lang);
  });

  // النموذج تجريبي: لا يرسل شيئاً إلى أي خادم.
  // Demo form: it posts nothing to any server.
  $('#applyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    $('#applyDone').hidden = false;
    e.target.reset();
    buildForm(lang);
    $('#applyDone').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // تنظيف عامل الخدمة القديم لتطبيق اللياقة الذي كان على الجذر
  // Retire the old root-scoped service worker from the fitness app that lived here.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations?.().then(rs => rs.forEach(r => {
      if (new URL(r.scope).pathname === location.pathname.replace(/[^/]*$/, '')) r.unregister();
    })).catch(() => {});
    if (window.caches) caches.keys().then(ks => ks.forEach(k => /^active-/.test(k) && caches.delete(k))).catch(() => {});
  }
})();
