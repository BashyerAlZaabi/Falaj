// Dev launcher: ensures service tokens exist in .env, then starts Vault and the Portal
// as two separate processes (separate ports/origins, separate databases).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(ROOT, '.env');
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
for (const k of ['SU_SERVICE_TOKEN', 'WAJIB_FS_TOKEN', 'WAJIB_MARSAD_TOKEN']) {
  if (!new RegExp(`^${k}=`, 'm').test(env)) env += `${env && !env.endsWith('\n') ? '\n' : ''}${k}=${crypto.randomBytes(24).toString('base64url')}\n`;
}
fs.writeFileSync(envPath, env, { mode: 0o600 });

const start = (name, file) => {
  const p = spawn(process.execPath, ['--no-warnings', file], { cwd: ROOT, stdio: 'inherit', env: process.env });
  p.on('exit', (c) => { console.log(`[${name}] exited ${c}`); process.exit(c ?? 1); });
  return p;
};
const procs = [start('portal', 'server/index.js')];
setTimeout(() => procs.push(start('vault', 'vault/server.js')), 800); // portal creates identity keys first
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { procs.forEach((p) => p.kill(s)); process.exit(0); });
