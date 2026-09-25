// DEMO: simulates the "Wajib" source system pushing records INTO Vault (inbound only).
// Real Wajib integration would call the same ingest endpoints with its own credentials.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n').map((l) => l.split(/=(.*)/s)).filter((x) => x[0]));
const VAULT = process.env.VAULT_PUBLIC_URL || 'http://localhost:4100';
const post = async (p, token, body) => {
  const r = await fetch(VAULT + p, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  console.log(p, r.status, await r.text());
};
await post('/ingest/wajib/fs', process.env.WAJIB_FS_TOKEN || env.WAJIB_FS_TOKEN, [
  { kind: 'مصروف', title: '[تجريبي] مشتريات أجهزة', amount: 125000, period: '2026-Q3', department_id: 'dept_fin' },
  { kind: 'إيراد', title: '[تجريبي] رسوم خدمات', amount: 340000, period: '2026-Q3', department_id: 'dept_fin' },
  { kind: 'مصروف', title: '[تجريبي] عقود صيانة', amount: 58000, period: '2026-Q3', department_id: 'dept_it' },
]);
await post('/ingest/wajib/marsad', process.env.WAJIB_MARSAD_TOKEN || env.WAJIB_MARSAD_TOKEN, [
  { title: '[تجريبي] بلاغ رصد 1042', department_id: 'dept_ops', text: 'رُصد تأخر في معالجة الطلبات بمركز الخدمة خلال الأسبوع الماضي. بلغ متوسط زمن المعالجة ثلاثة أيام عمل. أوصى الفريق بإعادة توزيع الموارد. سيتم رفع تقرير متابعة الأسبوع القادم.' },
]);
