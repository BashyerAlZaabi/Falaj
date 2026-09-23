/* Turns rows from any ERP (file extract or API) into the audit store's shapes:
     trial balance line: { account, name, type, cy, py }       (debit +, credit −)
     journal line:       { je, date, account, amount, user, source, desc }
   and runs the basic integrity checks auditors do on receipt of data. */
import { pick, num, isoDate } from '../tables.js';

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

export function inferType(account, hint) {
  const h = String(hint || '').toLowerCase();
  if (h) {
    if (/receiv|payabl(?!e)|asset|cash|bank|inventor|stock|fixed|prepa/.test(h) && !/liab/.test(h)) return 'asset';
    if (/liab|payable|accru|loan|borrow|provision/.test(h)) return 'liability';
    if (/equity|capital|reserve|retained/.test(h)) return 'equity';
    if (/income|revenue|sales|turnover/.test(h)) return 'income';
    if (/expense|cost|cogs|depreciation|salar/.test(h)) return 'expense';
    const t = TYPES.find((x) => h.startsWith(x));
    if (t) return t;
  }
  const d = String(account).trim()[0];
  return { 1: 'asset', 2: 'liability', 3: 'equity', 4: 'income' }[d] || 'expense';
}

export function tbFromRows(rows) {
  const out = [], rejected = [];
  rows.forEach((r, i) => {
    const account = String(pick(r, ['account', 'account no', 'account number', 'gl account', 'code', 'account code', 'no.', 'number']) ?? '').trim();
    const name = String(pick(r, ['name', 'account name', 'description', 'account description', 'display name']) ?? '').trim();
    let cy = num(pick(r, ['cy', 'current year', 'balance', 'closing balance', 'cy balance', 'ending balance', 'net balance']));
    const dr = num(pick(r, ['debit', 'dr', 'closing debit'])), cr = num(pick(r, ['credit', 'cr', 'closing credit']));
    if (Number.isNaN(cy) && (!Number.isNaN(dr) || !Number.isNaN(cr))) cy = (Number.isNaN(dr) ? 0 : dr) - (Number.isNaN(cr) ? 0 : Math.abs(cr));
    const py = num(pick(r, ['py', 'prior year', 'py balance', 'prior year balance', 'opening balance', 'comparative']));
    if (!account || Number.isNaN(cy)) { rejected.push({ row: i + 2, account, problem: !account ? 'no account' : 'no balance' }); return; }
    out.push({ account, name, type: inferType(account, pick(r, ['type', 'account type', 'category', 'class'])), cy, py: Number.isNaN(py) ? null : py });
  });
  return { lines: out, rejected };
}

export function jeFromRows(rows) {
  const out = [], rejected = [];
  rows.forEach((r, i) => {
    const je = String(pick(r, ['je', 'entry', 'entry no', 'journal', 'journal no', 'journal number', 'document', 'document no', 'document number', 'voucher', 'move', 'reference']) ?? '').trim();
    const date = isoDate(pick(r, ['date', 'posting date', 'gl date', 'entry date', 'accounting date']));
    const account = String(pick(r, ['account', 'account no', 'account number', 'gl account', 'account code']) ?? '').trim();
    let amount = num(pick(r, ['amount', 'balance', 'net amount', 'amount lcy', 'local amount']));
    const dr = num(pick(r, ['debit', 'dr', 'debit amount'])), cr = num(pick(r, ['credit', 'cr', 'credit amount']));
    if (Number.isNaN(amount) && (!Number.isNaN(dr) || !Number.isNaN(cr))) amount = (Number.isNaN(dr) ? 0 : dr) - (Number.isNaN(cr) ? 0 : Math.abs(cr));
    if (!je || !date || !account || Number.isNaN(amount)) { rejected.push({ row: i + 2, je, problem: !je ? 'no entry number' : !date ? 'bad date' : !account ? 'no account' : 'no amount' }); return; }
    const src = String(pick(r, ['source', 'manual', 'entry type', 'journal type', 'document type', 'source code']) ?? '').toLowerCase();
    out.push({
      je, date, account, amount,
      user: String(pick(r, ['user', 'user id', 'created by', 'posted by', 'entered by']) ?? '').trim() || null,
      source: !src ? 'unknown' : /manual|general|^gen|^m$|^y(es)?$|^true$/.test(src) ? 'manual' : 'system',
      desc: String(pick(r, ['desc', 'description', 'text', 'narration', 'memo', 'line description', 'label']) ?? ''),
    });
  });
  return { lines: out, rejected };
}

export function checkTB(lines) {
  const cy = lines.reduce((a, l) => a + l.cy, 0);
  const py = lines.some((l) => l.py != null) ? lines.reduce((a, l) => a + (l.py || 0), 0) : null;
  const ok = (v) => v == null || Math.abs(v) < 1;
  return { accounts: lines.length, cyNet: round(cy), pyNet: py == null ? null : round(py), balances: ok(cy) && ok(py) };
}

export function checkJE(lines) {
  const byJe = new Map();
  for (const l of lines) byJe.set(l.je, (byJe.get(l.je) || 0) + l.amount);
  const unbalanced = [...byJe].filter(([, v]) => Math.abs(v) >= 1).map(([je, diff]) => ({ je, diff: round(diff) }));
  const dates = lines.map((l) => l.date).sort();
  return { lines: lines.length, entries: byJe.size, from: dates[0] || null, to: dates.at(-1) || null, unbalancedEntries: unbalanced.length, unbalancedSample: unbalanced.slice(0, 10) };
}

export const round = (v) => Math.round(v * 100) / 100;
