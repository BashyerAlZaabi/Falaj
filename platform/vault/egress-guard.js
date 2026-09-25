// Vault egress guard: the Vault process may only open network connections to
// explicitly allow-listed internal hosts (e.g. an internal model server).
// Enforced at the lowest level (net.Socket#connect) so every client — fetch,
// http/https (CJS or ESM imports), tls, raw sockets — is covered.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

export class EgressBlocked extends Error {
  constructor(host) { super(`Vault egress blocked: ${host} is not an allowed internal destination`); this.code = 'EGRESS_BLOCKED'; }
}

export function installEgressGuard(allowList) {
  const allowed = new Set(allowList.map((h) => h.trim().toLowerCase()).filter(Boolean));
  const check = (host) => {
    const h = String(host || 'localhost').toLowerCase().replace(/^\[|\]$/g, '');
    if (!allowed.has(h)) throw new EgressBlocked(h);
  };

  // 1) Choke point: every TCP/TLS client connection goes through Socket#connect.
  const origConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    let opts = args[0];
    if (Array.isArray(opts)) opts = opts[0]; // internal normalized form
    let host; let isPath = false;
    if (opts && typeof opts === 'object') { isPath = !!opts.path; host = opts.host ?? opts.hostname; }
    else if (typeof opts === 'string' && !/^\d+$/.test(opts)) isPath = true; // IPC path
    else host = typeof args[1] === 'string' ? args[1] : undefined;
    if (!isPath) check(host);
    return origConnect.apply(this, args);
  };

  // 2) Friendly early errors for high-level clients.
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    try { check(new URL(typeof input === 'string' ? input : input.url).hostname); } catch (e) { return Promise.reject(e); }
    return origFetch(input, init);
  };
  for (const mod of [http, https]) {
    const orig = mod.request; const origGet = mod.get;
    const hostOf = (a) => (typeof a === 'string' ? new URL(a).hostname : a instanceof URL ? a.hostname : a?.hostname || a?.host);
    mod.request = function (a, b, c) { check(hostOf(a)); return orig.call(this, a, b, c); };
    mod.get = function (a, b, c) { check(hostOf(a)); return origGet.call(this, a, b, c); };
  }
  syncBuiltinESMExports(); // make `import { request } from 'node:https'` see the guarded versions
  return { allowed: [...allowed] };
}
