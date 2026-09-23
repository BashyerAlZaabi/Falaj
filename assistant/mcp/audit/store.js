/* ===== Shared store for the audit MCP servers =====
   One JSON file (AUDIT_DATA_DIR/audit-store.json, default assistant/data/) that every
   audit server reads fresh on each call and writes through update(). This is what lets
   separate server processes act like connected apps. For production, swap this module
   for the firm's database — the servers only use load(), update() and the finders. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from './data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(process.env.AUDIT_DATA_DIR || path.join(here, '..', '..', 'data'));
const FILE = path.join(DATA_DIR, 'audit-store.json');
const LOCK = FILE + '.lock';

export const today = () => process.env.AUDIT_TODAY || new Date().toISOString().slice(0, 10);

export function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`Cannot read ${FILE}: ${e.message}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const seeded = structuredClone(SEED);
    write(seeded);
    return seeded;
  }
}

function write(state) {
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, FILE); // atomic replace
}

// Cross-process lock so two servers never interleave a read-modify-write.
function withLock(fn) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const until = Date.now() + 5000;
  for (;;) {
    try { fs.closeSync(fs.openSync(LOCK, 'wx')); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 10_000) fs.rmSync(LOCK, { force: true }); } catch {}
      if (Date.now() > until) throw new Error('Audit store is busy — try again.');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return fn(); } finally { fs.rmSync(LOCK, { force: true }); }
}

/** Read-modify-write: fn(state) may mutate state; its return value is returned. */
export function update(fn) {
  return withLock(() => {
    const state = load();
    const out = fn(state);
    write(state);
    return out;
  });
}

const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export const findEngagement = (s, id) => s.engagements.find((e) => eq(e.id, id));
export const findStaff = (s, idOrName) => s.staff.find((x) => eq(x.id, idOrName) || eq(x.name, idOrName));
