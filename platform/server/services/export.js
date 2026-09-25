// DOCX and PDF export with correct RTL/Arabic handling.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType } from 'docx';
import { blocks } from '../lib/html.js';
import { config, ROOT } from '../config.js';

const isArabic = (s) => /[؀-ۿ]/.test(s);

function runs(node, style = {}, rtl) {
  if (node.text !== undefined) return node.text ? [new TextRun({ text: node.text, rightToLeft: rtl, bold: style.bold, italics: style.italics, underline: style.underline ? {} : undefined, font: 'Arial', size: style.size })] : [];
  if (node.tag === 'br') return [new TextRun({ break: 1 })];
  const s = { ...style };
  if (node.tag === 'strong' || node.tag === 'b') s.bold = true;
  if (node.tag === 'em' || node.tag === 'i') s.italics = true;
  if (node.tag === 'u') s.underline = true;
  return (node.children || []).flatMap((c) => runs(c, s, rtl));
}

function para(node, rtl, opts = {}) {
  return new Paragraph({ bidirectional: rtl, alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 120, line: 320 }, ...opts, children: runs(node, opts.style || {}, rtl) });
}

function table(node, rtl) {
  const rows = [];
  const walk = (n) => { for (const c of n.children || []) { if (c.tag === 'tr') rows.push(c); else if (c.tag === 'thead' || c.tag === 'tbody') walk(c); } };
  walk(node);
  const border = { style: BorderStyle.SINGLE, size: 4, color: '9AA4B2' };
  return new Table({
    visuallyRightToLeft: rtl,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((r) => new TableRow({
      tableHeader: (r.children || []).some((c) => c.tag === 'th'),
      children: (r.children || []).filter((c) => c.tag === 'td' || c.tag === 'th').map((c) => new TableCell({
        columnSpan: c.colspan, borders: { top: border, bottom: border, left: border, right: border },
        shading: c.tag === 'th' ? { type: ShadingType.CLEAR, fill: 'E8EEF6', color: 'auto' } : undefined,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [para(c, rtl, { style: { bold: c.tag === 'th' }, spacing: { after: 0 } })],
      })),
    })),
  });
}

export async function toDocx(doc) {
  const rtl = doc.lang !== 'en' && (doc.lang === 'ar' || isArabic(doc.content_html));
  const children = [new Paragraph({ bidirectional: rtl, heading: HeadingLevel.TITLE, alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: doc.title, rightToLeft: rtl, bold: true, size: 36, font: 'Arial' })] })];
  const list = (n, ordered) => (n.children || []).filter((c) => c.tag === 'li').map((li, i) => new Paragraph({
    bidirectional: rtl, alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT, indent: rtl ? { right: 360 } : { left: 360 }, spacing: { after: 60 },
    children: [new TextRun({ text: ordered ? `${i + 1}. ` : '• ', rightToLeft: rtl, font: 'Arial' }), ...runs(li, {}, rtl)],
  }));
  for (const b of blocks(doc.content_html)) {
    if (b.tag === 'h1' || b.tag === 'h2' || b.tag === 'h3') children.push(para(b, rtl, { heading: { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 }[b.tag], style: { bold: true, size: { h1: 32, h2: 28, h3: 24 }[b.tag] }, spacing: { before: 240, after: 120 } }));
    else if (b.tag === 'table') { children.push(table(b, rtl)); children.push(new Paragraph({ children: [] })); }
    else if (b.tag === 'ul' || b.tag === 'ol') children.push(...list(b, b.tag === 'ol'));
    else children.push(para(b, rtl, b.tag === 'blockquote' ? { style: { italics: true } } : {}));
  }
  const d = new Document({
    creator: 'Smart Work Platform', title: doc.title,
    styles: { default: { document: { run: { font: 'Arial', size: 24, rightToLeft: rtl } } } },
    sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } }, children }],
  });
  return Packer.toBuffer(d);
}

const fontFile = (subset, w) => path.join(ROOT, 'node_modules/@fontsource/ibm-plex-sans-arabic/files', `ibm-plex-sans-arabic-${subset}-${w}-normal.woff2`);
const RANGES = { arabic: 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC', latin: 'U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122,U+2212' };
let fontCss = null;
function fontFace() {
  if (fontCss != null) return fontCss;
  fontCss = [400, 700].flatMap((w) => ['arabic', 'latin'].map((sub) => {
    try { return `@font-face{font-family:'Plex Arabic';font-weight:${w};unicode-range:${RANGES[sub]};src:url(data:font/woff2;base64,${fs.readFileSync(fontFile(sub, w)).toString('base64')}) format('woff2');}`; } catch { return ''; }
  })).join('');
  return fontCss;
}

export function printableHtml(doc) {
  const rtl = doc.lang !== 'en' && (doc.lang === 'ar' || isArabic(doc.content_html));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
${fontFace()}
@page{size:A4;margin:18mm 16mm}
body{font-family:'Plex Arabic','DejaVu Sans',Arial,sans-serif;font-size:11.5pt;line-height:1.75;color:#111}
h1.doc-title{font-size:20pt;margin:0 0 4mm;border-bottom:2px solid #1f4e8c;padding-bottom:2mm}
h1{font-size:16pt}h2{font-size:14pt;color:#1f4e8c;margin-top:6mm}h3{font-size:12pt}
table{width:100%;border-collapse:collapse;margin:3mm 0;page-break-inside:auto}tr{page-break-inside:avoid}
th,td{border:1px solid #9aa4b2;padding:2mm 3mm;text-align:start;vertical-align:top}th{background:#e8eef6}
blockquote{border-inline-start:3px solid #9aa4b2;margin:0;padding-inline-start:4mm;color:#444}
.meta{color:#666;font-size:9pt;margin-bottom:6mm}
</style></head><body><h1 class="doc-title">${esc(doc.title)}</h1><div class="meta">${new Date(doc.updated_at + (String(doc.updated_at).endsWith('Z') ? '' : 'Z')).toISOString().slice(0, 10)} · v${doc.current_version}</div>${doc.content_html}</body></html>`;
}

let browserPromise = null;
async function browser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      if (!fs.existsSync(config.chromiumPath)) throw new Error('chromium-missing');
      const { chromium } = await import('playwright-core');
      return chromium.launch({ executablePath: config.chromiumPath, args: ['--no-sandbox'] });
    })().catch((e) => { browserPromise = null; throw e; });
  }
  return browserPromise;
}

export async function pdfEngineStatus() {
  if (fs.existsSync(config.chromiumPath)) return { engine: 'chromium', ok: true };
  const soffice = await which('soffice');
  return soffice ? { engine: 'libreoffice', ok: true } : { engine: null, ok: false, message: 'لا يوجد محرك PDF (Chromium أو LibreOffice). اضبط CHROMIUM_PATH.' };
}
const which = (bin) => new Promise((r) => execFile('which', [bin], (e, out) => r(e ? null : out.trim())));

export async function toPdf(doc) {
  try {
    const b = await browser();
    const page = await b.newPage();
    try {
      await page.setContent(printableHtml(doc), { waitUntil: 'load' });
      return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    } finally { await page.close(); }
  } catch (e) {
    if (e.message !== 'chromium-missing') console.warn('[pdf] chromium failed, trying LibreOffice:', e.message);
    const soffice = await which('soffice');
    if (!soffice) { const err = new Error('تعذّر إنشاء PDF: لا يوجد محرك تحويل متاح'); err.status = 503; throw err; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swp-pdf-'));
    const input = path.join(dir, 'doc.docx');
    fs.writeFileSync(input, await toDocx(doc));
    await new Promise((res, rej) => execFile(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', dir, input], { timeout: 60000 }, (er) => (er ? rej(er) : res())));
    const buf = fs.readFileSync(path.join(dir, 'doc.pdf'));
    fs.rmSync(dir, { recursive: true, force: true });
    return buf;
  }
}

export async function closeBrowser() { if (browserPromise) { try { (await browserPromise).close(); } catch {} browserPromise = null; } }
