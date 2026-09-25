import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('console', (m) => console.log('console', m.type(), m.text()));
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
p.on('requestfailed', (r) => console.log('FAILED', r.url()));
await p.goto('http://localhost:4000/'); await p.waitForTimeout(2500);
await b.close();
