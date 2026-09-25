// Shared stack for system tests: one Portal + Vault per test file, cached
// logins per persona. Usage:
//   import { stack, as, done } from './_stack.js';
//   test('…', async () => { const c = await as('hessa'); const r = await c.get('/api/sys/performance/…'); … });
//   after(done);
import { startStack, login } from '../helpers.js';

let S = null; const clients = new Map();
export async function stack() { S ||= await startStack(); return S; }
export async function as(username) {
  const s = await stack();
  if (!clients.has(username)) clients.set(username, await login(s.portal, username));
  return clients.get(username);
}
export async function done() { if (S) await S.stop(); S = null; clients.clear(); }
