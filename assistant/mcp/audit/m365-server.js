#!/usr/bin/env node
/* ===== Audit MCP server — Microsoft 365 (Outlook mail & calendar, SharePoint / OneDrive) =====
   Uses Microsoft Graph when M365_* variables are set (see m365/graph.js), otherwise a demo
   mailbox and document library. Emails are only ever saved as DRAFTS — never sent. */
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { json, fail, run } from '../lib/serve.js';
import { GraphBackend, graphConfigured } from './m365/graph.js';
import { DemoBackend } from './m365/demo.js';
import { extractText } from './m365/extract.js';
import { IMPORT_DIR } from './tables.js';

const backend = graphConfigured() ? new GraphBackend() : new DemoBackend();
const readOnly = { readOnlyHint: true, openWorldHint: true };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'YYYY-MM-DDTHH:MM');
const emails = z.array(z.string().email());
const wrap = (fn) => async (args) => { try { return json(await fn(args)); } catch (e) { return fail(e.message); } };
const addDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function buildServer() {
  const server = new McpServer({ name: 'audit-m365', version: '1.0.0' });

  server.registerTool('m365_status', {
    title: 'Microsoft 365 connection',
    description: 'Which Microsoft 365 backend is in use (real tenant or demo).',
    annotations: { readOnlyHint: true },
  }, async () => json({ backend: backend.mode }));

  // ---------- Outlook mail ----------
  server.registerTool('search_emails', {
    title: 'Search Outlook email',
    description: 'Search the mailbox (subject, body, sender, attachment names). Returns newest first with ids for read_email.',
    inputSchema: {
      query: z.string().optional().describe('Keywords, e.g. "trial balance" or a client name'),
      from: z.string().optional().describe('Sender address or name'),
      since: date.optional(),
      top: z.number().int().min(1).max(50).optional(),
    },
    annotations: readOnly,
  }, wrap(({ query, from, since, top = 10 }) => backend.searchEmails({ query, from, since, top })));

  server.registerTool('read_email', {
    title: 'Read an email',
    description: 'Full text of one email plus its attachment list (ids for read_attachment / save_attachment_for_import).',
    inputSchema: { id: z.string() },
    annotations: readOnly,
  }, wrap(({ id }) => backend.readEmail(id)));

  server.registerTool('read_attachment', {
    title: 'Read an attachment',
    description: 'Extract the text of an email attachment (Word, Excel, CSV, text).',
    inputSchema: { message_id: z.string(), attachment_id: z.string() },
    annotations: readOnly,
  }, wrap(async ({ message_id, attachment_id }) => {
    const a = await backend.getAttachment(message_id, attachment_id);
    return { name: a.name, ...(await extractText(a.buffer, a.name)) };
  }));

  server.registerTool('save_attachment_for_import', {
    title: 'Save attachment to the imports folder',
    description: 'Save a client-supplied file (e.g. a trial balance or GL extract emailed by the client) into the audit imports folder so the ERP / billing import tools can load it. Only when the user asks.',
    inputSchema: { message_id: z.string(), attachment_id: z.string(), file_name: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, wrap(async ({ message_id, attachment_id, file_name }) => {
    const a = await backend.getAttachment(message_id, attachment_id);
    const name = path.basename(file_name || a.name).replace(/[^\w.\- ()]/g, '_');
    if (!/\.(csv|txt|xlsx)$/i.test(name)) throw new Error('Only CSV, TXT or XLSX files can be imported.');
    fs.mkdirSync(IMPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMPORT_DIR, name), a.buffer);
    return { saved: name, bytes: a.buffer.length, folder: IMPORT_DIR, next: 'Use erp › import_extract (dry_run first) to load it into the audit file.' };
  }));

  server.registerTool('draft_email', {
    title: 'Draft an email',
    description: 'Save an email as a DRAFT in Outlook (never sends). For a reply, pass reply_to_message_id. The auditor reviews and sends it themselves. Only when the user asks.',
    inputSchema: {
      to: emails.optional(), cc: emails.optional(),
      subject: z.string().optional(), body: z.string(),
      reply_to_message_id: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(({ to, cc, subject, body, reply_to_message_id }) => {
    if (!reply_to_message_id && !(to?.length && subject)) throw new Error('A new email needs "to" and "subject".');
    return backend.draftEmail({ to, cc, subject, body, replyTo: reply_to_message_id });
  }));

  // ---------- Calendar ----------
  server.registerTool('list_events', {
    title: 'Calendar',
    description: 'Meetings between two dates (default: today to 14 days ahead).',
    inputSchema: { from: date.optional(), to: date.optional() },
    annotations: readOnly,
  }, wrap(({ from = addDays(0), to = addDays(14) }) => backend.listEvents({ from, to })));

  server.registerTool('create_event', {
    title: 'Create a meeting',
    description: 'Create a calendar event and invite attendees (invitations ARE sent). Times are local (M365_TIMEZONE, default Arabian Standard Time). Only when the user explicitly asks.',
    inputSchema: {
      subject: z.string(), start: dateTime, end: dateTime,
      attendees: emails.optional(), location: z.string().optional(), body: z.string().optional(),
      online_meeting: z.boolean().optional().describe('Add a Teams link'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(({ subject, start, end, attendees, location, body, online_meeting }) => {
    if (end <= start) throw new Error('end must be after start');
    return backend.createEvent({ subject, start, end, attendees, location, body, online: online_meeting });
  }));

  // ---------- SharePoint / OneDrive ----------
  server.registerTool('search_files', {
    title: 'Search SharePoint / OneDrive',
    description: 'Find documents (workpapers, memos, engagement letters) by name or content.',
    inputSchema: { query: z.string(), top: z.number().int().min(1).max(50).optional() },
    annotations: readOnly,
  }, wrap(({ query, top = 20 }) => backend.searchFiles({ query, top })));

  server.registerTool('list_folder', {
    title: 'List a folder',
    description: 'Contents of a document-library folder, e.g. "Clients/Gulf Trading LLC/FY2026". Empty path = library root.',
    inputSchema: { path: z.string().optional() },
    annotations: readOnly,
  }, wrap(({ path: p }) => backend.listFolder(p || '')));

  server.registerTool('read_file', {
    title: 'Read a document',
    description: 'Text of a document from the library (Word, Excel, CSV, text, Markdown) by path or id.',
    inputSchema: { path: z.string().optional(), id: z.string().optional() },
    annotations: readOnly,
  }, wrap(async ({ path: p, id }) => {
    if (!p && !id) throw new Error('Give a path or an id.');
    const { buffer, ...meta } = await backend.downloadFile({ path: p, id });
    return { ...meta, ...(await extractText(buffer, meta.name)) };
  }));

  server.registerTool('save_file', {
    title: 'Save a document',
    description: 'Save a text / Markdown / CSV document (e.g. a memo or a summary of testing) into a library folder. Never overwrites — a new name is chosen if it exists. Only when the user asks.',
    inputSchema: {
      folder: z.string().describe('e.g. "Clients/Gulf Trading LLC/FY2026/Fieldwork"'),
      name: z.string().regex(/^[^/\\]+\.(md|txt|csv)$/, 'name.md, name.txt or name.csv'),
      content: z.string().max(1_000_000),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(({ folder, name, content }) => backend.saveFile({ folder, name, content })));

  return server;
}

run(buildServer, { name: 'Audit Microsoft 365', defaultPort: 3406 });
