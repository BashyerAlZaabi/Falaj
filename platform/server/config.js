import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency). Real secrets stay on the server only.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const dataDir = process.env.DATA_DIR || path.join(ROOT, 'data');

export const config = {
  port: Number(process.env.PORT || 4000),
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  dataDir,
  dbPath: process.env.PORTAL_DB || path.join(dataDir, 'portal.db'),
  keysDir: process.env.IDENTITY_KEYS_DIR || path.join(dataDir, 'identity-keys'),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  cookieSecure: process.env.COOKIE_SECURE === '1',
  // Vault (separate service & origin). Portal knows only the public URL (for links)
  // and the inbound ingest endpoint used by Smart Uploader. It has no read path.
  vaultPublicUrl: process.env.VAULT_PUBLIC_URL || 'http://localhost:4100',
  vaultIngestUrl: process.env.VAULT_INGEST_URL || 'http://localhost:4100/ingest/su/marsad',
  suServiceToken: process.env.SU_SERVICE_TOKEN || '',
  // PDF rendering
  chromiumPath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
};
