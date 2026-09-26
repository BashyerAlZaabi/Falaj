// One-off consistent backup of the Portal and Vault databases (safe while running).
//   npm run backup [-- --dir /path/to/backups]
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../server/config.js';
import { backupSqlite } from '../server/lib/ops.js';

const i = process.argv.indexOf('--dir');
const dir = i > 0 ? process.argv[i + 1] : (process.env.BACKUP_DIR || path.join(config.dataDir, 'backups'));
const targets = [['portal', config.dbPath], ['vault', path.join(process.env.VAULT_DATA_DIR || path.join(config.dataDir, 'vault'), 'vault.db')]];
for (const [name, file] of targets) {
  if (!fs.existsSync(file)) { console.log(`skip ${name}: ${file} not found`); continue; }
  const db = new DatabaseSync(file, { readOnly: true });
  // Vault backups stay beside Vault's data: never mixed into the portal backup directory.
  const out = backupSqlite(db, name === 'vault' ? path.join(path.dirname(file), 'backups') : dir, name);
  db.close();
  console.log(`${name}: ${out}`);
}
