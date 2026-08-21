#!/usr/bin/env node
/* =============================================================================
   يبني نسخة الموقع في ملفٍ واحد · builds the site as one self-contained file
   -----------------------------------------------------------------------------
   يدمج css/world.css وملفات js/world-*.js داخل index.html، فيصير ملفاً واحداً
   يُفتح مباشرة أو يُرفع على أي استضافة ثابتة بلا مجلدات.

   Inlines css/world.css and the js/world-*.js files into index.html, producing a
   single file you can open directly or drop on any static host — no folders.

     node tools/bundle.js            → dist/index.html
     node tools/bundle.js --body     → dist/body.html  (بلا وسوم html/head/body،
                                        لمنصّات تُغلّف المحتوى بنفسها)
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const bodyOnly = process.argv.includes('--body');

let html = read('index.html');

// نستبدل وسم الستايل الخارجي بمحتواه · replace the external stylesheet with its contents
html = html.replace(
  /[ \t]*<link rel="stylesheet" href="(css\/[^"]+)"\s*\/?>/g,
  (_, href) => `  <style>\n${read(href).trimEnd()}\n  </style>`
);

// ونفس الشيء لكل ملفات السكربت · and the same for every script file
html = html.replace(
  /[ \t]*<script src="(js\/[^"]+)"><\/script>/g,
  (_, src) => `  <script>\n${read(src).trimEnd()}\n  </script>`
);

if (html.includes('href="css/') || html.includes('src="js/')) {
  console.error('bundle: a local asset was left un-inlined — check index.html');
  process.exit(1);
}

if (bodyOnly) {
  // نُخرج ما بين <body> و</body> فقط، مسبوقاً بالعنوان وخطوط جوجل
  // Emit only what sits between <body> and </body>, led by the title and the fonts.
  const title = html.match(/<title>([\s\S]*?)<\/title>/)[1];
  const fonts = html.match(/[ \t]*<link href="https:\/\/fonts\.googleapis[^>]*>/)[0].trim();
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  html = `<title>${title}</title>\n${fonts}\n${style}\n<div id="top">${body}</div>\n`;
}

const out = path.join(ROOT, 'dist', bodyOnly ? 'body.html' : 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${path.relative(ROOT, out)}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
