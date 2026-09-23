#!/usr/bin/env node
/* ===== Audit MCP server — Time & billing =====
   Timesheets, budget vs actual, work in progress (WIP), fee invoices, fee debtors and
   realization. Stands in for the firm's time & billing / practice-management system.
   import_timesheet loads a CSV/XLSX export from any timesheet tool into the store. */
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { json, fail, run } from '../lib/serve.js';
import { load, update, findEngagement, findStaff, today, DATA_DIR } from './store.js';
import { readTable, pick, safeImportPath, IMPORT_DIR } from './tables.js';

const engId = z.string().describe('Engagement id, e.g. "ENG-001"');
const readOnly = { readOnlyHint: true };
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const rateOf = (s, id) => findStaff(s, id)?.rate || 0;

function engagementFigures(s, e) {
  const entries = s.timeEntries.filter((t) => t.engagement === e.id);
  const hours = entries.reduce((a, t) => a + t.hours, 0);
  const value = entries.reduce((a, t) => a + t.hours * rateOf(s, t.staff), 0);
  const wip = entries.filter((t) => !t.billed).reduce((a, t) => a + t.hours * rateOf(s, t.staff), 0);
  const billed = s.invoices.filter((i) => i.engagement === e.id).reduce((a, i) => a + i.amount, 0);
  const fee = s.fees[e.id] ?? null;
  return { hours, budgetHours: e.budgetHours, hoursUsedPct: +(100 * hours / e.budgetHours).toFixed(1), timeValue: value, wip, billed, agreedFee: fee,
    realizationPct: value ? +(100 * billed / value).toFixed(1) : null,
    projectedRecoveryPct: fee && value ? +(100 * fee / value).toFixed(1) : null };
}

function buildServer() {
  const server = new McpServer({ name: 'audit-billing', version: '1.0.0' });

  server.registerTool('engagement_hours', {
    title: 'Budget vs actual hours',
    description: 'Hours and time value (AED at charge-out rates) per staff member on an engagement, against the budget.',
    inputSchema: { engagement_id: engId },
    annotations: readOnly,
  }, async ({ engagement_id }) => {
    const s = load();
    const e = findEngagement(s, engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    const by = {};
    for (const t of s.timeEntries.filter((x) => x.engagement === e.id)) by[t.staff] = (by[t.staff] || 0) + t.hours;
    const rows = Object.entries(by).map(([id, hours]) => { const x = findStaff(s, id); return { staff: x?.name || id, grade: x?.grade, hours, value: hours * rateOf(s, id) }; });
    const f = engagementFigures(s, e);
    return json({ engagement: e.id, phase: e.phase, budgetHours: e.budgetHours, actualHours: f.hours, usedPct: f.hoursUsedPct, timeValue: f.timeValue, byStaff: rows });
  });

  server.registerTool('log_time', {
    title: 'Log time',
    description: 'Record hours for a staff member on an engagement. Writes to time & billing — only when the user asks.',
    inputSchema: {
      staff: z.string().describe('Staff id (e.g. "S03") or full name'),
      engagement_id: engId,
      hours: z.number().positive().max(24),
      description: z.string().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD, defaults to today'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ staff: who, engagement_id, hours, description, date }) => {
    const out = update((s) => {
      const x = findStaff(s, who);
      const e = findEngagement(s, engagement_id);
      if (!x) return { error: `Unknown staff "${who}".` };
      if (!e) return { error: `Unknown engagement "${engagement_id}".` };
      const entry = { staff: x.id, engagement: e.id, hours, date: date || today(), description: description || '', billed: false };
      s.timeEntries.push(entry);
      return { logged: true, ...entry, staffName: x.name };
    });
    return out.error ? fail(out.error) : json(out);
  });

  server.registerTool('get_wip', {
    title: 'Work in progress (unbilled time)',
    description: 'Unbilled time value per engagement (AED), with the oldest unbilled date — the basis for the next invoice.',
    inputSchema: { engagement_id: engId.optional() },
    annotations: readOnly,
  }, async ({ engagement_id }) => {
    const s = load();
    const list = s.engagements.filter((e) => !engagement_id || e.id.toLowerCase() === engagement_id.toLowerCase());
    if (!list.length) return fail(`Unknown engagement "${engagement_id}".`);
    return json(list.map((e) => {
      const open = s.timeEntries.filter((t) => t.engagement === e.id && !t.billed);
      const oldest = open.map((t) => t.date).sort()[0] || null;
      return { engagement: e.id, client: e.client, unbilledHours: open.reduce((a, t) => a + t.hours, 0), wip: open.reduce((a, t) => a + t.hours * rateOf(s, t.staff), 0), oldestUnbilled: oldest, ageDays: oldest ? days(oldest, today()) : 0 };
    }));
  });

  server.registerTool('list_invoices', {
    title: 'Fee invoices',
    description: 'Fee invoices issued to audit clients with due date, status and days overdue.',
    inputSchema: { engagement_id: engId.optional(), status: z.enum(['draft', 'unpaid', 'paid']).optional() },
    annotations: readOnly,
  }, async ({ engagement_id, status }) => {
    const s = load();
    return json(s.invoices
      .filter((i) => (!engagement_id || i.engagement.toLowerCase() === engagement_id.toLowerCase()) && (!status || i.status === status))
      .map((i) => {
        const due = i.issued ? addDays(i.issued, i.dueDays) : null;
        const overdue = i.status === 'unpaid' && due && due < today() ? days(due, today()) : 0;
        return { ...i, client: findEngagement(s, i.engagement)?.client, due, daysOverdue: overdue };
      }));
  });

  server.registerTool('fee_debtors', {
    title: 'Fee debtors ageing',
    description: 'Unpaid audit fees by client in ageing buckets (current, 1–30, 31–90, 91–365, over 1 year overdue). Significant overdue fees — especially unpaid prior-year fees — can create a self-interest threat to independence.',
    annotations: readOnly,
  }, async () => {
    const s = load();
    const by = {};
    for (const i of s.invoices.filter((x) => x.status === 'unpaid')) {
      const od = Math.max(0, days(addDays(i.issued, i.dueDays), today()));
      const b = od === 0 ? 'current' : od <= 30 ? '1-30' : od <= 90 ? '31-90' : od <= 365 ? '91-365' : 'over 1 year';
      const e = findEngagement(s, i.engagement);
      const row = (by[e.client] ||= { client: e.client, engagements: new Set(), total: 0, buckets: {} });
      row.engagements.add(e.id); row.total += i.amount; row.buckets[b] = (row.buckets[b] || 0) + i.amount;
    }
    const rows = Object.values(by).map((r) => ({ ...r, engagements: [...r.engagements],
      independenceFlag: !!(r.buckets['over 1 year'] || r.buckets['91-365']) }));
    return json({ asOf: today(), debtors: rows.sort((a, b) => b.total - a.total) });
  });

  server.registerTool('engagement_economics', {
    title: 'Engagement economics',
    description: 'Hours vs budget, time value, WIP, amount billed, agreed fee, realization (billed ÷ time value) and projected recovery (fee ÷ time value).',
    inputSchema: { engagement_id: engId },
    annotations: readOnly,
  }, async ({ engagement_id }) => {
    const s = load();
    const e = findEngagement(s, engagement_id);
    return e ? json({ engagement: e.id, client: e.client, phase: e.phase, ...engagementFigures(s, e) }) : fail(`Unknown engagement "${engagement_id}".`);
  });

  server.registerTool('draft_invoice', {
    title: 'Draft a fee invoice',
    description: 'Create a DRAFT invoice for an engagement (defaults to the current WIP value) and mark that time as billed. Nothing is sent to the client. Only when the user asks.',
    inputSchema: { engagement_id: engId, amount: z.number().positive().optional(), description: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ engagement_id, amount, description }) => {
    const out = update((s) => {
      const e = findEngagement(s, engagement_id);
      if (!e) return { error: `Unknown engagement "${engagement_id}".` };
      const open = s.timeEntries.filter((t) => t.engagement === e.id && !t.billed);
      const wip = open.reduce((a, t) => a + t.hours * rateOf(s, t.staff), 0);
      const amt = amount ?? wip;
      if (!amt) return { error: `No unbilled time on ${e.id}; give an amount.` };
      open.forEach((t) => { t.billed = true; });
      const year = today().slice(0, 4);
      const next = 1 + Math.max(0, ...s.invoices.filter((i) => i.id.startsWith(`INV-${year}-`)).map((i) => Number(i.id.split('-')[2]) || 0));
      const inv = { id: `INV-${year}-${String(next).padStart(3, '0')}`, engagement: e.id, description: description || `${e.type} — progress billing`, amount: amt, issued: null, dueDays: 30, status: 'draft', created: today(), wipCleared: wip };
      s.invoices.push(inv);
      return inv;
    });
    return out.error ? fail(out.error) : json(out);
  });

  server.registerTool('import_timesheet', {
    title: 'Import a timesheet export',
    description: `Import time entries from a CSV or XLSX export of any timesheet tool. The file must be inside the imports folder (${path.relative(process.cwd(), IMPORT_DIR) || IMPORT_DIR}). Columns recognised: staff/employee, engagement/job/project, hours, date. Only when the user asks.`,
    inputSchema: { file: z.string().describe('File name or path inside the imports folder'), dry_run: z.boolean().optional().describe('Validate only, do not save') },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ file, dry_run }) => {
    const full = safeImportPath(file);
    if (!full) return fail(`File must be inside ${IMPORT_DIR}.`);
    let rows;
    try { rows = await readTable(full); } catch (e) { return fail(`Could not read ${file}: ${e.message}`); }
    const s = load();
    const good = [], bad = [];
    rows.forEach((r, n) => {
      const who = pick(r, ['staff', 'staff id', 'employee', 'employee id', 'name', 'resource']);
      const eng = pick(r, ['engagement', 'engagement id', 'job', 'job code', 'project', 'project code']);
      const hours = Number(pick(r, ['hours', 'time', 'duration', 'qty']));
      const date = String(pick(r, ['date', 'work date', 'day']) || '').slice(0, 10);
      const x = findStaff(s, who), e = findEngagement(s, eng);
      if (!x || !e || !(hours > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) bad.push({ row: n + 2, staff: who, engagement: eng, hours, date, problem: !x ? 'unknown staff' : !e ? 'unknown engagement' : !(hours > 0) ? 'bad hours' : 'bad date' });
      else good.push({ staff: x.id, engagement: e.id, hours, date, description: pick(r, ['description', 'narrative', 'notes']) || '', billed: false });
    });
    if (!dry_run && good.length) update((st) => { st.timeEntries.push(...good); });
    return json({ file: path.basename(full), rows: rows.length, imported: dry_run ? 0 : good.length, valid: good.length, rejected: bad.slice(0, 50), dataDir: DATA_DIR });
  });

  return server;
}

run(buildServer, { name: 'Audit billing', defaultPort: 3404 });
