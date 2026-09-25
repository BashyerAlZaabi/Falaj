// Tiny, strict HTML tokenizer + sanitizer for document content.
// Only a whitelist of structural tags survives; all attributes are dropped
// (except colspan/rowspan numbers), so no scripts, styles, links or handlers.
const ALLOWED = new Set(['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong', 'b', 'em', 'i', 'u', 'br', 'blockquote']);
const VOID = new Set(['br']);
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'head', 'title']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function parse(html) {
  const root = { tag: 'root', children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)|</g;
  let m; let dropDepth = 0; let dropTag = null;
  const src = String(html || '');
  while ((m = re.exec(src))) {
    const full = m[0];
    if (full.startsWith('<!--')) continue;
    if (m[3] !== undefined || full === '<') {
      if (dropDepth) continue;
      stack[stack.length - 1].children.push({ text: decode(m[3] ?? '<') });
      continue;
    }
    const tag = m[1].toLowerCase();
    const closing = full.startsWith('</');
    if (DROP_CONTENT.has(tag)) {
      if (!closing && !full.endsWith('/>')) { if (!dropDepth) dropTag = tag; if (tag === dropTag) dropDepth++; }
      else if (closing && tag === dropTag) { dropDepth--; }
      continue;
    }
    if (dropDepth) continue;
    const mapped = tag === 'div' || tag === 'section' || tag === 'article' ? 'p' : tag === 'h4' || tag === 'h5' || tag === 'h6' ? 'h3' : tag === 'span' || tag === 'font' || tag === 'a' ? null : tag;
    if (!mapped || !ALLOWED.has(mapped)) continue; // unwrap: keep children, drop tag
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === mapped) { stack.length = i; break; }
      continue;
    }
    const node = { tag: mapped, children: [] };
    if (mapped === 'td' || mapped === 'th') {
      const cs = /colspan\s*=\s*["']?(\d+)/i.exec(m[2] || ''); if (cs) node.colspan = Math.min(20, +cs[1]);
    }
    // Implicitly close paragraph-like parents when a block opens inside them
    if (['p', 'h1', 'h2', 'h3', 'table', 'ul', 'ol', 'blockquote'].includes(mapped)) {
      const top = stack[stack.length - 1];
      if (['p', 'h1', 'h2', 'h3'].includes(top.tag)) stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(mapped) && !full.endsWith('/>')) stack.push(node);
  }
  return root;
}

// Keep ISO dates/times readable inside RTL text (LRI … PDI isolation); idempotent.
export const isolateLtr = (t) => t.replace(/(?<!\u2066)(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)(?!\u2069)/g, '\u2066$1\u2069');
export function serialize(node) {
  if (node.text !== undefined) return esc(isolateLtr(node.text));
  const inner = (node.children || []).map(serialize).join('');
  if (node.tag === 'root') return inner;
  if (VOID.has(node.tag)) return `<${node.tag}>`;
  const attrs = node.colspan ? ` colspan="${node.colspan}"` : '';
  return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

export function sanitize(html) {
  const root = parse(html);
  // Wrap loose top-level inline content in paragraphs
  const blocks = []; let buf = [];
  const flush = () => { if (buf.some((n) => (n.text ?? 'x').trim())) blocks.push({ tag: 'p', children: buf }); buf = []; };
  for (const n of root.children) {
    if (n.text !== undefined || ['strong', 'b', 'em', 'i', 'u', 'br'].includes(n.tag)) buf.push(n);
    else if (['li', 'tr', 'td', 'th', 'thead', 'tbody'].includes(n.tag)) { flush(); blocks.push({ tag: 'p', children: [{ text: textOf(n) }] }); }
    else { flush(); blocks.push(n); }
  }
  flush();
  return blocks.map(serialize).join('\n');
}

export function textOf(node) {
  if (node.text !== undefined) return node.text;
  const sep = ['p', 'h1', 'h2', 'h3', 'li', 'tr', 'blockquote'].includes(node.tag) ? '\n' : node.tag === 'td' || node.tag === 'th' ? '\t' : node.tag === 'br' ? '\n' : '';
  return (node.children || []).map(textOf).join('') + sep;
}
export const htmlToText = (html) => textOf(parse(html)).replace(/\n{3,}/g, '\n\n').trim();

export const blocks = (html) => parse(sanitize(html)).children.filter((n) => n.tag);
export const fromBlocks = (bs) => bs.map(serialize).join('\n');

export function textToHtml(text) {
  return String(text).split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('\n');
}
