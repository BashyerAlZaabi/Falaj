// Visual QA harness: boots a fresh Portal + Vault stack and captures every
// screen in light/dark × desktop/tablet/mobile × Arabic/English.
// Usage: node tests/e2e/screens.mjs [outDir] [--only=home,adaa] [--themes=light,dark] [--devices=desktop,mobile] [--langs=ar,en]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startStack, ROOT } from '../helpers.js';

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]?.split(',') ?? d);
const OUT = argv.find((a) => !a.startsWith('--')) || path.join(ROOT, 'tests/e2e/screens');
fs.mkdirSync(OUT, { recursive: true });
const DEVICES = { desktop: { width: 1440, height: 900 }, laptop: { width: 1280, height: 800 }, tablet: { width: 1024, height: 1366 }, mobile: { width: 390, height: 844 } };
const themes = opt('themes', ['light', 'dark']); const devices = opt('devices', ['desktop', 'mobile']); const langs = opt('langs', ['ar']);
const only = opt('only', null);

const S = await startStack();
// Seed a little extra state: a document, a pending Agents Office proposal, Vault data.
const seed = async () => {
  const { login } = await import('../helpers.js');
  const m = await login(S.portal, 'mariam');
  await m.chat('ابنِ تقريراً عن المشاريع المتأخرة');
  const a = await m.post('/api/office/agents', { template: 'weekly_plan', schedule: { type: 'weekly', day: 0, time: '07:00', tz_offset: -240 } });
  await m.post(`/api/office/agents/${a.data.result.id}/run`);
  await fetch(`${S.vault}/ingest/wajib/marsad`, { method: 'POST', headers: { authorization: `Bearer ${S.env.WAJIB_MARSAD_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: '[تجريبي] بلاغ رصد', department_id: 'dept_ops', text: 'رُصد تأخر في معالجة الطلبات خلال الأسبوع الماضي. بلغ متوسط زمن المعالجة ثلاثة أيام عمل. أوصى الفريق بإعادة توزيع الموارد.' }) });
  const docs = (await m.get('/api/documents')).data;
  return { docId: docs[0]?.id };
};
const { docId } = await seed();

const SCREENS = [
  { key: 'login', user: null, path: '/' },
  { key: 'home', user: 'mariam', path: '/#/home' },
  { key: 'adaa', user: 'president', path: '/#/adaa' },
  { key: 'projects', user: 'mariam', path: '/#/projects' },
  { key: 'project', user: 'mariam', path: '/#/projects/pr_portal' },
  { key: 'tasks', user: 'mariam', path: '/#/tasks' },
  { key: 'documents', user: 'mariam', path: '/#/documents' },
  { key: 'editor', user: 'mariam', path: '/#/documents', after: async (p) => { await p.locator('table.tbl tbody tr, [data-doc-id]').first().click(); await p.waitForSelector('#editor:not(.collapsed) .doc-body'); } },
  { key: 'office', user: 'mariam', path: '/#/office' },
  { key: 'apps', user: 'president', path: '/#/apps' },
  { key: 'uploader', user: 'ahmed', path: '/#/uploader' },
  { key: 'admin', user: 'mariam', path: '/#/admin' },
  { key: 'chat', user: 'ahmed', path: '/#/home', after: async (p, dev) => {
    if (dev === 'mobile') await p.click('#tabbar button[data-tab=chat]');
    await p.fill('#chat-input', 'جهّز لي ملخص اليوم'); await p.click('#btn-send');
    await p.waitForFunction(() => document.querySelectorAll('#chat-body .msg.assistant').length > 1, null, { timeout: 15000 });
  } },
  { key: 'modal', user: 'mariam', path: '/#/projects', after: async (p) => { await p.getByRole('button', { name: /مشروع جديد|New project/ }).first().click(); await p.waitForSelector('.modal'); } },
  { key: 'vault', user: 'president', vault: '/marsad' },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const errors = [];
let n = 0;
for (const lang of langs) for (const theme of themes) for (const dev of devices) {
  const ctx = await browser.newContext({ viewport: DEVICES[dev], deviceScaleFactor: dev === 'mobile' ? 2 : 1, colorScheme: theme, locale: lang === 'ar' ? 'ar-AE' : 'en-US', timezoneId: 'Asia/Dubai', reducedMotion: 'reduce' });
  await ctx.addInitScript(([l]) => { try { localStorage.setItem('swp.lang', l); } catch {} }, [lang]);
  let current = null;
  for (const s of SCREENS) {
    if (only && !only.includes(s.key)) continue;
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${s.key}/${dev}/${theme}] ${e.message}`));
    try {
      if (s.user !== current) {
        await ctx.clearCookies();
        if (s.user) {
          await page.goto(S.portal + '/'); await page.waitForSelector('#login-form', { state: 'visible' });
          await page.fill('#lg-user', s.user); await page.fill('#lg-pass', 'Demo@2026');
          await page.click('#login-form button[type=submit]'); await page.waitForSelector('#app:not(.hidden)');
        }
        current = s.user;
      }
      if (s.vault) { await page.goto(`${S.vault}/sso/start?next=${s.vault}`); await page.waitForLoadState('networkidle'); }
      else { await page.goto(S.portal + s.path); await page.waitForLoadState('networkidle'); }
      await page.waitForTimeout(700);
      if (s.after) await s.after(page, dev);
      await page.waitForTimeout(400);
      const file = path.join(OUT, `${s.key}__${dev}__${theme}__${lang}.png`);
      await page.screenshot({ path: file, fullPage: false });
      n++;
    } catch (e) { errors.push(`[${s.key}/${dev}/${theme}/${lang}] ${e.message.split('\n')[0]}`); }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
await S.stop();
fs.writeFileSync(path.join(OUT, '_errors.json'), JSON.stringify(errors, null, 2));
console.log(`${n} screenshots -> ${OUT}; errors: ${errors.length}`);
if (errors.length) console.log(errors.join('\n'));
void docId;
