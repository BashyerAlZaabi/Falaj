/* Reads CSV / XLSX exports into plain row objects with normalised (lower-case) headers,
   and confines every import to the imports folder. */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { DATA_DIR } from './store.js';

export const IMPORT_DIR = path.resolve(process.env.AUDIT_IMPORT_DIR || path.join(DATA_DIR, 'imports'));
const MAX_BYTES = 50 * 1024 * 1024;

/** Resolve a user-supplied file name inside IMPORT_DIR; null if it escapes the folder. */
export function safeImportPath(file) {
  const full = path.resolve(IMPORT_DIR, String(file));
  const rel = path.relative(IMPORT_DIR, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  try { if (fs.realpathSync(full).startsWith(fs.realpathSync(IMPORT_DIR) + path.sep)) return full; } catch { return full; /* missing file: reported by the reader */ }
  return null;
}

export function listImportFiles() {
  try {
    return fs.readdirSync(IMPORT_DIR, { recursive: true })
      .filter((f) => /\.(csv|txt|xlsx)$/i.test(f))
      .map((f) => ({ file: f, bytes: fs.statSync(path.join(IMPORT_DIR, f)).size }));
  } catch { return []; }
}

const key = (h) => String(h ?? '').replace(/^﻿/, '').trim().toLowerCase().replace(/[_\s]+/g, ' ');

function cellValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
  }
  return v;
}

export async function readTable(file, { sheet } = {}) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('file larger than 50 MB');
  if (/\.xlsx$/i.test(file)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
    if (!ws) throw new Error(`sheet ${sheet} not found`);
    let headers = null;
    const rows = [];
    ws.eachRow((row) => {
      const vals = row.values.slice(1).map(cellValue);
      if (!headers) { if (vals.some((v) => String(v).trim())) headers = vals.map(key); return; }
      const o = {};
      headers.forEach((h, i) => { if (h) o[h] = vals[i] ?? ''; });
      if (Object.values(o).some((v) => String(v).trim())) rows.push(o);
    });
    return rows;
  }
  const text = fs.readFileSync(file, 'utf8');
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  return parse(text, { columns: (h) => h.map(key), skip_empty_lines: true, bom: true, delimiter, relax_column_count: true, trim: true });
}

/** First non-empty value among the given header aliases. */
export function pick(row, aliases) {
  for (const a of aliases) { const v = row[a]; if (v !== undefined && v !== null && String(v).trim() !== '') return v; }
  return undefined;
}

/** Parse "1,234.50", "(1,234.50)", "1.234,50-" style numbers. */
export function num(v) {
  if (typeof v === 'number') return v;
  if (v === undefined || v === null) return NaN;
  let s = String(v).trim().replace(/[^\d.,()\-+]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,50
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return neg ? -n : n;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY and Excel serial numbers. */
export function isoDate(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
