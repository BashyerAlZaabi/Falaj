/* Text from office files, for the assistant to read (Word, Excel, CSV, text). */
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

export const MAX_CHARS = 40_000;

export async function extractText(buffer, name = '') {
  const ext = (name.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
  let text;
  if (ext === 'docx') text = (await mammoth.extractRawText({ buffer })).value;
  else if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    text = wb.worksheets.map((ws) => {
      const rows = [];
      ws.eachRow((r) => rows.push(r.values.slice(1).map((v) => (v && typeof v === 'object' ? v.result ?? v.text ?? (v instanceof Date ? v.toISOString().slice(0, 10) : '') : v ?? '')).join('\t')));
      return `## Sheet: ${ws.name}\n${rows.join('\n')}`;
    }).join('\n\n');
  } else if (['txt', 'csv', 'md', 'json', 'xml', 'html', 'htm', 'eml', 'log', 'tsv'].includes(ext) || !ext) {
    text = buffer.toString('utf8');
    if (ext === 'html' || ext === 'htm') text = htmlToText(text);
  } else {
    return { supported: false, text: '', note: `Cannot extract text from .${ext} files here — open the link instead.` };
  }
  const truncated = text.length > MAX_CHARS;
  return { supported: true, text: truncated ? text.slice(0, MAX_CHARS) : text, truncated, chars: text.length };
}

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
