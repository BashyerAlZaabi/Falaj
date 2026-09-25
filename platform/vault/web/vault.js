// Vault UI — talks only to its own origin.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (p, o = {}) => fetch('/api' + p, { ...o, headers: { 'x-requested-with': 'vault', 'content-type': 'application/json' } }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message || b.error); return b; });
const view = location.pathname.includes('marsad') ? 'marsad' : 'fs';
document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === view));

(async () => {
  const me = await api('/me');
  $('#me').textContent = `${me.user.name_ar} · ${{ employee: 'موظف', manager: 'مدير', president: 'الرئيس' }[me.user.role] || me.user.role} · ذكاء داخلي: ${me.local_ai === 'extractive' ? 'تلخيص محلي' : 'نموذج داخلي'}`;
  if (view === 'fs') {
    const [rows, sum] = await Promise.all([api('/fs'), api('/fs/summary')]);
    $('#main').innerHTML = `<div class="card"><h2>FS — السجلات الواردة من «واجب»</h2>
      ${sum.length ? `<p>${sum.map((s) => `${esc(s.kind)}: ${s.n} سجل، الإجمالي ${Number(s.total || 0).toLocaleString('ar')} ${esc(s.currency || '')}`).join(' · ')}</p>` : ''}
      ${rows.length ? `<table><thead><tr><th>النوع</th><th>العنوان</th><th>المبلغ</th><th>الفترة</th><th>وقت الاستلام</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.kind)}</td><td>${esc(r.title)}</td><td>${r.amount == null ? '—' : Number(r.amount).toLocaleString('ar')} ${esc(r.currency || '')}</td><td>${esc(r.period || '')}</td><td>${esc(r.received_at.slice(0, 16).replace('T', ' '))}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">لا توجد سجلات ضمن نطاقك.</p>'}</div>`;
  } else {
    const rows = await api('/marsad');
    $('#main').innerHTML = `<div class="card"><h2>مرصاد — العناصر الواردة (واجب، Smart Uploader)</h2>
      ${rows.length ? `<table><thead><tr><th>المصدر</th><th>العنوان</th><th>الحجم</th><th>الاستلام</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.source === 'wajib' ? 'واجب' : 'Smart Uploader'}</td><td>${esc(r.title || r.filename)}</td><td>${r.size ?? ''}</td><td>${esc(r.received_at.slice(0, 16).replace('T', ' '))}</td><td>${r.has_text ? `<button data-sum="${r.id}">تلخيص داخل Vault</button>` : ''}</td></tr><tr><td colspan="5"><pre id="s-${r.id}" class="muted"></pre></td></tr>`).join('')}</tbody></table>` : '<p class="muted">لا توجد عناصر ضمن نطاقك.</p>'}</div>`;
    document.querySelectorAll('[data-sum]').forEach((b) => b.onclick = async () => {
      const out = $('#s-' + b.dataset.sum); out.textContent = 'جارٍ التلخيص داخل Vault…';
      try { const r = await api(`/marsad/${b.dataset.sum}/summarize`, { method: 'POST' }); out.textContent = r.points.map((p) => '• ' + p).join('\n') + `\n(${r.method === 'extractive' ? 'تلخيص محلي داخل Vault' : 'نموذج داخلي'})`; }
      catch (e) { out.textContent = 'تعذّر: ' + e.message; }
    });
  }
})().catch((e) => { $('#main').innerHTML = `<div class="card">تعذّر التحميل: ${esc(e.message)}</div>`; });
