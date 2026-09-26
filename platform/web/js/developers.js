// Self-hosted API reference: renders /api/openapi.json (generated per user).
// No third-party viewer or CDN: the platform CSP allows only 'self'.
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
// minimal, safe inline markdown: **bold**, `code`, line breaks (text nodes only; no innerHTML)
function md(text = '') {
  const frag = document.createDocumentFragment();
  String(text).split('\n').forEach((line, i) => {
    if (i) frag.append(h('br'));
    for (const part of line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
      if (!part) continue;
      if (part.startsWith('**')) frag.append(h('strong', {}, part.slice(2, -2)));
      else if (part.startsWith('`')) frag.append(h('code', { dir: 'ltr' }, part.slice(1, -1)));
      else frag.append(part);
    }
  });
  return frag;
}
try { const t = localStorage.getItem('swp.theme'); if (t) document.documentElement.dataset.theme = t; } catch {}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function schemaView(schema, spec, depth = 0) {
  if (!schema) return h('span', { class: 'dd-muted' });
  if (schema.$ref) { const name = schema.$ref.split('/').pop(); return schemaView(spec.components.schemas[name], spec, depth); }
  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type || (schema.const ? 'const' : 'any');
  if (type === 'object' && schema.properties && depth < 4) {
    const req = new Set(schema.required || []);
    return h('ul', { class: 'dd-schema' }, Object.entries(schema.properties).map(([k, v]) => h('li', {},
      h('code', { class: 'dd-prop', dir: 'ltr' }, k), req.has(k) ? h('span', { class: 'dd-req' }, 'required') : null,
      h('span', { class: 'dd-type', dir: 'ltr' }, Array.isArray(v.type) ? v.type.join(' | ') : v.type || (v.$ref ? v.$ref.split('/').pop() : v.const != null ? JSON.stringify(v.const) : 'any')),
      v.enum ? h('span', { class: 'dd-enum', dir: 'ltr' }, v.enum.join(' · ')) : null,
      v.description && v.description.toLowerCase() !== k.replace(/_/g, ' ') ? h('span', { class: 'dd-desc', dir: 'ltr' }, v.description) : null,
      (v.properties || v.$ref) ? schemaView(v, spec, depth + 1) : null,
      v.items?.properties ? schemaView(v.items, spec, depth + 1) : null)));
  }
  return h('span', { class: 'dd-type', dir: 'ltr' }, type);
}
function curlFor(method, path, op, spec) {
  const url = spec.servers[0].url + path;
  const body = op.requestBody ? (path.startsWith('/api/tools/') ? ' \\\n  -H "Content-Type: application/json" \\\n  -d \'{"input": {}, "requestId": "…"}\'' : ' \\\n  -H "Content-Type: application/json" \\\n  -d \'{}\'') : '';
  return `curl -X ${method.toUpperCase()} "${url}" \\\n  -H "Authorization: Bearer swp_…"${body}`;
}
const copy = async (text, btn) => { try { await navigator.clipboard.writeText(text); const o = btn.textContent; btn.textContent = 'نُسخ ✓'; setTimeout(() => (btn.textContent = o), 1400); } catch {} };

function opCard(method, path, op, spec) {
  const id = op.operationId;
  const params = op.parameters || [];
  const bodySchema = op.requestBody?.content && Object.values(op.requestBody.content)[0]?.schema;
  const curl = curlFor(method, path, op, spec);
  const tryOut = h('pre', { class: 'dd-try-out', dir: 'ltr', hidden: true });
  const inputs = params.map((p) => h('label', { class: 'dd-param' }, h('code', { dir: 'ltr' }, p.name), h('input', { 'data-p': p.name, dir: 'ltr', required: true })));
  const tryBtn = method === 'get' ? h('button', { class: 'btn sm tertiary', type: 'button', onclick: async () => {
    let p = path; for (const i of inputs) { const v = $('input', i).value.trim(); if (!v) return $('input', i).focus(); p = p.replace(`{${i.querySelector('input').dataset.p}}`, encodeURIComponent(v)); }
    tryOut.hidden = false; tryOut.textContent = '…';
    try { const r = await fetch(p, { credentials: 'same-origin' }); const ct = r.headers.get('content-type') || ''; tryOut.textContent = `HTTP ${r.status}\n` + (ct.includes('json') ? JSON.stringify(await r.json(), null, 2).slice(0, 20000) : `(${ct || 'binary'})`); }
    catch (e) { tryOut.textContent = String(e.message); }
  } }, 'جرّب بجلستك') : null;
  return h('details', { class: 'dd-op card', id },
    h('summary', {},
      h('span', { class: `dd-method m-${method}` }, method.toUpperCase()),
      h('code', { class: 'dd-path', dir: 'ltr' }, path),
      h('span', { class: 'dd-sum', dir: 'auto' }, op.summary),
      op['x-destructive'] ? h('span', { class: 'dd-flag danger' }, 'يتطلب تأكيداً') : op['x-mutates'] ? h('span', { class: 'dd-flag' }, 'تعديل') : null,
      op['x-data-domain'] ? h('span', { class: 'dd-flag muted', dir: 'ltr' }, op['x-data-domain']) : null),
    h('div', { class: 'dd-op-body' },
      op.description ? h('p', { class: 'dd-desc-block', dir: 'auto' }, md(op.description)) : null,
      op.security && !op.security.length ? h('p', { class: 'dd-flag muted' }, 'لا يتطلب مصادقة') : null,
      params.length ? h('div', {}, h('h4', {}, 'معاملات المسار'), h('ul', { class: 'dd-schema' }, params.map((p) => h('li', {}, h('code', { class: 'dd-prop', dir: 'ltr' }, p.name), h('span', { class: 'dd-req' }, 'required'), h('span', { class: 'dd-type', dir: 'ltr' }, 'string'))))) : null,
      bodySchema ? h('div', {}, h('h4', {}, 'جسم الطلب'), schemaView(bodySchema, spec)) : null,
      h('div', { class: 'dd-code' }, h('div', { class: 'dd-code-head' }, h('span', {}, 'cURL'), h('button', { class: 'btn sm ghost', type: 'button', onclick: (e) => copy(curl, e.currentTarget) }, 'نسخ')), h('pre', { dir: 'ltr' }, curl)),
      tryBtn ? h('div', { class: 'dd-try' }, inputs, tryBtn, tryOut) : null));
}

async function main() {
  const res = await fetch('/api/openapi.json', { credentials: 'same-origin' });
  if (res.status === 401) {
    $('#dd-main').replaceChildren(h('div', { class: 'card dd-empty' }, h('h2', {}, 'سجّل الدخول لعرض الواجهات'), h('p', {}, 'التوثيق يُولَّد حسب صلاحياتك: لا يظهر إلا ما يمكنك الوصول إليه.'), h('a', { class: 'btn primary', href: `/?next=${encodeURIComponent('/docs')}#/login` }, 'تسجيل الدخول')));
    return;
  }
  if (!res.ok) { $('#dd-main').replaceChildren(h('div', { class: 'card dd-empty' }, h('h2', {}, 'التوثيق غير متاح لحسابك'))); return; }
  const spec = await res.json();
  const byTag = new Map();
  for (const [path, ops] of Object.entries(spec.paths)) for (const [m, op] of Object.entries(ops)) {
    const tag = op.tags?.[0] || 'Other';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push([m, path, op]);
  }
  const order = [...byTag.keys()].sort((a, b) => (a.startsWith('Tools') - b.startsWith('Tools')) || (a.startsWith('System') - b.startsWith('System')) || a.localeCompare(b));
  const intro = h('section', { class: 'card dd-intro', id: 'overview' },
    h('h2', {}, spec.info.title, ' ', h('span', { class: 'dd-flag muted', dir: 'ltr' }, `v${spec.info.version} · OpenAPI ${spec.openapi}`)),
    h('p', { class: 'dd-desc-block', dir: 'ltr' }, md(spec.info.description)),
    h('div', { class: 'dd-stats' },
      h('span', {}, h('strong', {}, String(Object.values(spec.paths).reduce((n, o) => n + Object.keys(o).length, 0))), ' عملية'),
      h('span', {}, h('strong', {}, String(Object.keys(spec.paths).filter((p) => p.startsWith('/api/tools/')).length)), ' أداة'),
      h('span', {}, h('strong', {}, String(order.filter((t) => t.startsWith('System')).length)), ' نظام متاح لك')));
  const sections = order.map((tag) => h('section', { class: 'dd-section', id: `t-${slug(tag)}`, 'data-tag': tag },
    h('h2', { class: 'dd-tag', dir: 'ltr' }, tag, h('span', { class: 'dd-count' }, String(byTag.get(tag).length))),
    byTag.get(tag).map(([m, p, op]) => opCard(m, p, op, spec))));
  $('#dd-main').replaceChildren(intro, ...sections);
  $('#dd-nav').replaceChildren(h('a', { href: '#overview' }, 'نظرة عامة'), ...order.map((t) => h('a', { href: `#t-${slug(t)}`, dir: 'ltr' }, t, h('span', { class: 'dd-count' }, String(byTag.get(t).length)))));
  $('#dd-q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const s of document.querySelectorAll('.dd-section')) {
      let any = false;
      for (const d of s.querySelectorAll('.dd-op')) { const hit = !q || d.querySelector('summary').textContent.toLowerCase().includes(q) || s.dataset.tag.toLowerCase().includes(q); d.hidden = !hit; any ||= hit; }
      s.hidden = !any;
    }
  });
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
main().catch((e) => { $('#dd-main').replaceChildren(h('div', { class: 'card dd-empty' }, h('h2', {}, 'تعذّر تحميل التوثيق'), h('p', { dir: 'ltr' }, e.message))); });
