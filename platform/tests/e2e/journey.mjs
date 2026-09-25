// Browser journey (real Chromium) over a fresh Portal + Vault stack.
// Usage: npm run e2e   (screenshots -> tests/e2e/output or $E2E_OUT)
// Voice: headless Chromium has no working speech service, so the journey
// injects a fake SpeechRecognition that returns a fixed transcript. This
// exercises the app's voice pipeline (explicit start, mic state, transcript,
// confirmation of uncertain values) but NOT a real speech-to-text engine.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startStack, ROOT } from '../helpers.js';

const OUT = process.env.E2E_OUT || path.join(ROOT, 'tests/e2e/output');
fs.mkdirSync(OUT, { recursive: true });
const S = await startStack();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`✔ ${name}`); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log(`✘ ${name}\n   ${e.message.split('\n')[0]}`); }
};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const errors = [];

async function newPage(viewport = { width: 1440, height: 900 }, { voice } = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, locale: 'ar-AE', timezoneId: 'Asia/Dubai' });
  if (voice) await ctx.addInitScript((transcript) => {
    class FakeSR { constructor() { this.lang = 'ar-AE'; } start() { setTimeout(() => this.onstart?.(), 50); setTimeout(() => { const alt = { transcript, confidence: 0.92 }; const res = [alt]; res.isFinal = true; this.onresult?.({ resultIndex: 0, results: [res] }); }, 400); setTimeout(() => this.onend?.(), 600); } stop() { this.onend?.(); } }
    window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  }, voice);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${e.message}`));
  // 401/404/409 are expected API answers in some steps; the CSP refusals are the
  // expected result of step 14 (portal page trying to read Vault cross-origin).
  page.on('console', (m) => { if (m.type() === 'error' && !/401|409|404|Content Security Policy/.test(m.text())) errors.push(m.text()); });
  return page;
}
async function login(page, user) {
  await page.goto(S.portal + '/');
  await page.waitForSelector('#login-form', { state: 'visible' });
  await page.fill('#lg-user', user); await page.fill('#lg-pass', 'Demo@2026');
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('.greet h1');
}
// The assistant is opened through its orb (#ai-orb → immersive conversation on
// desktop; the Chat tab on mobile). If the conversation is already on screen
// (docked side panel, immersive view or the mobile tab), nothing to do.
async function openChat(page) {
  if (await page.locator('#chat-input').isVisible()) return;
  await page.click('#ai-orb');
  await page.waitForSelector('#chat-input', { state: 'visible' });
}
async function chat(page, text) {
  await openChat(page);
  const before = await page.locator('#chat-body .msg.assistant').count();
  await page.fill('#chat-input', text);
  await page.click('#btn-send');
  await page.waitForFunction((n) => document.querySelectorAll('#chat-body .msg.assistant').length > n, before, { timeout: 20000 });
  return page.locator('#chat-body .msg.assistant').last().innerText();
}

// Vault demo data (Wajib simulator)
await fetch(`${S.vault}/ingest/wajib/marsad`, { method: 'POST', headers: { authorization: `Bearer ${S.env.WAJIB_MARSAD_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: '[تجريبي] بلاغ رصد', department_id: 'dept_ops', text: 'رُصد تأخر في معالجة الطلبات خلال الأسبوع الماضي. بلغ متوسط زمن المعالجة ثلاثة أيام عمل. أوصى الفريق بإعادة توزيع الموارد.' }) });

const page = await newPage();
let docId;

await step('1. تسجيل الدخول وعرض المحتوى حسب الدور (مديرة)', async () => {
  await login(page, 'mariam');
  await page.waitForSelector('.card .stats-row');
  assert.match(await page.locator('.greet').innerText(), /مريم/);
  assert.ok(await page.locator('#nav a[data-route=admin]').count()); // admin sees admin
  await shot(page, '01-home-manager');
});

await step('2. طلب مركّب بالمحادثة: ملخص + مراجعة التقدم + تقرير فعلي يُفتح في المحرر', async () => {
  const txt = await chat(page, 'جهّز لي ملخص اليوم، وحدّث تقدم المشاريع، وابنِ تقريراً عن المشاريع المتأخرة');
  assert.match(txt, /ملخص يوم/); assert.match(txt, /لن أفترض/);
  await page.waitForSelector('#editor:not(.collapsed) .doc-body');
  assert.match(await page.locator('#editor .doc-body').innerText(), /ترحيل الأنظمة إلى السحابة/);
  docId = await page.evaluate(() => (localStorage.getItem('swp.conv'), document.querySelector('#editor a[href*="export.docx"]').getAttribute('href').split('/')[3]));
  await shot(page, '02-chat-report-editor');
});

await step('3. تعديل المستند يدوياً مع الحفظ التلقائي', async () => {
  await page.click('#editor .doc-body p >> nth=0');
  await page.keyboard.press('End');
  await page.keyboard.type(' — ملاحظة مضافة يدوياً.');
  await page.waitForFunction(() => /غير محفوظة|Unsaved|جارٍ الحفظ/.test(document.querySelector('#doc-save')?.textContent || ''), null, { timeout: 4000 });
  await page.waitForFunction(() => /^محفوظ$|^Saved$/.test(document.querySelector('#doc-save')?.textContent || ''), null, { timeout: 8000 });
  const d = await page.evaluate(async (id) => (await fetch(`/api/documents/${id}`)).json(), docId);
  assert.match(d.content_html, /ملاحظة مضافة يدوياً/);
  await shot(page, '02b-manual-edit-autosaved');
});

await step('4. تعديل نفس المستند بالمحادثة (اختصار المقدمة + جدول المسؤوليات)', async () => {
  const v0 = (await page.evaluate(async (id) => (await fetch(`/api/documents/${id}`)).json(), docId)).current_version;
  await chat(page, 'اختصر المقدمة');
  await chat(page, 'أضف جدولاً للمسؤوليات والمواعيد');
  await page.waitForFunction(() => /المسؤوليات والمواعيد/.test(document.querySelector('#editor .doc-body')?.innerText || ''), null, { timeout: 8000 });
  const d = await page.evaluate(async (id) => (await fetch(`/api/documents/${id}`)).json(), docId);
  assert.equal(d.id, docId); assert.ok(d.current_version >= v0 + 2);
  await shot(page, '03-doc-edited-by-chat');
});

await step('5. سجل الإصدارات واستعادة إصدار سابق', async () => {
  await page.click('#editor button[title="سجل الإصدارات"]');
  await page.waitForSelector('#versions:not(.hidden) li');
  await shot(page, '04-versions');
  await page.locator('#versions li', { hasText: 'v1 ' }).getByRole('button', { name: 'استعادة' }).click();
  await page.locator('.modal .btn.primary').click();
  await page.waitForFunction(() => !/المسؤوليات والمواعيد/.test(document.querySelector('#editor .doc-body')?.innerText || 'x'), null, { timeout: 8000 });
  const d = await page.evaluate(async (id) => (await fetch(`/api/documents/${id}`)).json(), docId);
  assert.doesNotMatch(d.content_html, /المسؤوليات والمواعيد/);
});

await step('6. تنزيل DOCX و PDF من المحرر', async () => {
  for (const [fmt, magic] of [['docx', 'PK'], ['pdf', '%PDF']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`#editor a[href$="export.${fmt}"]`)]);
    const p = path.join(OUT, `report.${fmt}`); await dl.saveAs(p);
    assert.equal(fs.readFileSync(p).subarray(0, magic.length).toString(), magic);
  }
});

await step('7. إضافة بطاقة للداشبورد بالمحادثة وظهورها دون إعادة تحميل ثم بقاؤها بعد التحديث', async () => {
  await page.click('#editor .panel-head button[aria-label="إغلاق"]');
  await page.goto(S.portal + '/#/home'); await page.waitForSelector('.grid .card');
  const n0 = await page.locator('.grid .card').count();
  await chat(page, 'أضف بطاقة للمشاريع المتأخرة');
  await page.waitForFunction((n) => document.querySelectorAll('.grid .card').length > n, n0, { timeout: 8000 });
  await chat(page, 'حوّل بيانات المهام إلى رسم بياني');
  await page.waitForSelector('.card .chart svg');
  await shot(page, '05-dashboard-customized');
  await page.reload(); await page.waitForSelector('.grid .card');
  assert.ok(await page.getByRole('heading', { name: 'المشاريع المتأخرة' }).count());
});

await step('8. تحديث مشروع من المحادثة وظهوره في صفحة المشروع والداشبورد مباشرة', async () => {
  await page.goto(S.portal + '/#/projects/pr_portal'); await page.waitForSelector('h1:has-text("البوابة الموحدة")');
  await chat(page, 'حدّث تقدم هذا المشروع إلى 75%');
  await page.waitForFunction(() => document.querySelector('input[type=number]')?.value === '75', null, { timeout: 8000 });
  await shot(page, '06-project-updated-from-chat');
});

await step('9. إنشاء مشروع ومهمة من الواجهة', async () => {
  await page.goto(S.portal + '/#/projects'); await page.getByRole('button', { name: 'مشروع جديد' }).click();
  await page.locator('.modal input.field').first().fill('مشروع تجربة الرحلة');
  await page.locator('.modal .btn.primary').click();
  await page.waitForSelector('h1:has-text("مشروع تجربة الرحلة")');
  await page.getByRole('button', { name: 'مهمة' }).click();
  await page.locator('.modal input.field').first().fill('مهمة من الواجهة');
  await page.locator('.modal .btn.primary').click();
  await page.waitForSelector('text=مهمة من الواجهة');
});

await step('10. Agents Office: بناء وكيل بالمحادثة، تحضير، مراجعة، موافقة', async () => {
  await page.goto(S.portal + '/#/office');
  await chat(page, 'ابنِ وكيلاً يجهّز خطة الأسبوع كل أحد الساعة 7');
  await page.waitForSelector('text=خطة الأسبوع');
  await page.getByRole('button', { name: 'حضّر الآن' }).first().click();
  await page.waitForSelector('text=بانتظار مراجعتك (1)');
  await shot(page, '07-office-review');
  await page.getByRole('button', { name: /موافقة وتنفيذ المحدد/ }).click();
  await page.waitForSelector('#editor:not(.collapsed) .doc-body');
  assert.match(await page.locator('#editor .doc-title').inputValue(), /خطة الأسبوع/);
});

await step('11. البيانات باقية بعد إعادة الدخول', async () => {
  await page.click('#user-card'); await page.click('#btn-logout'); await page.waitForSelector('#login-form', { state: 'visible' });
  await login(page, 'mariam');
  await page.goto(S.portal + '/#/documents'); await page.waitForSelector('table.tbl');
  assert.match(await page.locator('table.tbl').innerText(), /تقرير المشاريع المتأخرة/);
  assert.equal(await page.locator('#chat-body .msg.user').count() > 0, true); // conversation restored
});

await step('12. أمر صوتي (تعرّف محاكى) مع تأكيد القيمة المؤثرة قبل التنفيذ', async () => {
  const vp = await newPage(undefined, { voice: 'حدّث تقدم مشروع البوابة الموحدة إلى 80%' });
  await login(vp, 'mariam');
  await openChat(vp);
  await vp.click('#btn-mute'); // keep headless quiet
  await vp.click('#btn-mic');
  await vp.waitForSelector('.confirm-card', { timeout: 15000 });
  assert.match(await vp.locator('#chat-body .msg.user').last().innerText(), /إدخال صوتي/);
  await shot(vp, '08-voice-confirmation');
  await vp.locator('.confirm-card .btn.danger').click();
  await vp.waitForSelector('.confirm-card >> text=تم التنفيذ');
  const p = await vp.evaluate(async () => (await fetch('/api/projects/pr_portal')).json());
  assert.equal(p.progress, 80);
  await vp.context().close();
});

await step('13. منع الوصول لبيانات مستخدم آخر', async () => {
  const sp = await newPage();
  await login(sp, 'sara');
  const r = await sp.evaluate(async (id) => (await fetch(`/api/documents/${id}`)).status, docId);
  assert.equal(r, 404);
  await sp.goto(S.portal + '/#/projects/pr_service'); await sp.waitForSelector('text=تعذّر التحميل');
  const apps = await sp.evaluate(async () => (await (await fetch('/api/me')).json()).apps.map((a) => a.key));
  assert.ok(!apps.includes('admin') && !apps.includes('marsad'));
  await shot(sp, '09-employee-blocked');
  await sp.context().close();
});

await step('14. Vault: فتح مرصاد عبر الدخول الموحد، والمعالجة داخل Vault فقط', async () => {
  const vp = await newPage();
  await login(vp, 'president');
  await vp.goto(`${S.vault}/sso/start?next=/marsad`);
  await vp.waitForSelector('text=مرصاد — العناصر الواردة');
  await vp.getByRole('button', { name: 'تلخيص داخل Vault' }).first().click();
  await vp.waitForSelector('text=تلخيص محلي داخل Vault');
  await shot(vp, '10-vault-marsad');
  // the portal page cannot read Vault responses cross-origin
  await vp.goto(S.portal + '/#/home'); await vp.waitForSelector('.greet');
  const leaked = await vp.evaluate(async (v) => { try { const r = await fetch(`${v}/api/marsad`, { credentials: 'include' }); return await r.text(); } catch (e) { return 'BLOCKED'; } }, S.vault);
  assert.equal(leaked, 'BLOCKED');
  await vp.context().close();
});

await step('15. الهاتف: تبويبات واضحة (مساحة العمل، المحادثة، المستند)', async () => {
  const mp = await newPage({ width: 390, height: 844 });
  await login(mp, 'ahmed');
  await shot(mp, '11-mobile-home');
  await mp.click('#tabbar button[data-tab=chat]');
  await chat(mp, 'ما هي مهامي؟');
  await shot(mp, '12-mobile-chat');
  await mp.context().close();
});

await step('16. الإنجليزية واتجاه LTR', async () => {
  const ep = await newPage();
  await ep.addInitScript(() => localStorage.setItem('swp.lang', 'en'));
  await login(ep, 'president');
  assert.equal(await ep.evaluate(() => document.documentElement.dir), 'ltr');
  await ep.goto(S.portal + '/#/adaa'); await ep.waitForSelector('text=Monitoring');
  await shot(ep, '13-adaa-english');
  await ep.context().close();
});

await step('17. نقاط التميّز: إنجاز مهمة حقيقية يمنح نقاطاً، وصفحة الإنجازات، والانضمام الاختياري للوحة', async () => {
  const gp = await newPage();
  await login(gp, 'ahmed');
  await gp.waitForSelector('#level-chip-host .level-chip');
  const before = await gp.evaluate(async () => (await (await fetch('/api/game/me')).json()).xp);
  const id = await gp.evaluate(async () => (await (await fetch('/api/tasks?mine=1')).json()).find((t) => t.title === 'خطة الرجوع عند الفشل')?.id);
  assert.ok(id, 'seeded overdue task exists');
  const r = await gp.evaluate(async (tid) => (await fetch('/api/tools/update_task', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'swp' }, body: JSON.stringify({ input: { id: tid, status: 'done' } }) })).json(), id);
  assert.equal(r.status, 'ok');
  await gp.waitForSelector('#toast >> text=/نقطة تميّز|مستوى جديد/', { timeout: 8000 }); // realtime → server-derived score changed
  const after = await gp.evaluate(async () => (await (await fetch('/api/game/me')).json()).xp);
  assert.ok(after > before, `xp ${before} → ${after}`);
  await gp.goto(S.portal + '/#/achievements');
  await gp.waitForSelector('.game-hero-grid svg.rings'); await gp.waitForSelector('.badge-tile');
  const earnedN = await gp.locator('.badge-tile.earned').count();
  assert.ok(earnedN >= 1, `no earned badge on the page; API: ${await gp.evaluate(async () => JSON.stringify((await (await fetch('/api/game/me')).json()).badges.map((b) => [b.key, b.have, b.need, b.earned])))}`);
  const sw = gp.locator('.optin input.switch');
  await sw.check();
  await gp.waitForFunction(async () => (await (await fetch('/api/game/me')).json()).prefs.leaderboard_opt_in === true, null, { timeout: 5000 });
  await gp.waitForSelector('.people-board li.me');
  await shot(gp, '14-achievements');
  await gp.context().close();
});

await step('18. واجهات الأقسام: الموارد البشرية والتدقيق الداخلي ترى أنظمتها في القائمة', async () => {
  const hp = await newPage();
  await login(hp, 'hessa');
  await hp.waitForSelector('#nav .nav-systems a[data-route="sys:performance"]');
  await hp.click('#nav .nav-systems a[data-route="sys:performance"]');
  await hp.waitForSelector('.sys-head h1');
  assert.match(await hp.locator('.sys-head .class-chip').innerText(), /سري/);
  await shot(hp, '15-hr-performance');
  await hp.context().close();
  const ap = await newPage();
  await login(ap, 'aisha');
  await ap.waitForSelector('#nav .nav-systems a[data-route="sys:audit"]');
  await ap.context().close();
});

await step('19. جهة خارجية (مقدم خدمة): بوابة معزولة بلا مساحة عمل ولا مساعد', async () => {
  const vp = await newPage();
  await vp.goto(S.portal + '/');
  await vp.waitForSelector('#login-form', { state: 'visible' });
  await vp.fill('#lg-user', 'horizon'); await vp.fill('#lg-pass', 'Demo@2026');
  await vp.click('#login-form button[type=submit]');
  await vp.waitForFunction(() => location.hash.startsWith('#/sys/'), null, { timeout: 8000 });
  const routes = await vp.locator('#nav a.item').evaluateAll((as) => as.map((a) => a.dataset.route));
  assert.deepEqual(routes.sort(), ['sys:procurement', 'sys:providers']);
  assert.equal(await vp.locator('#btn-ask').isVisible(), false);
  assert.equal(await vp.locator('#ask-dock').isVisible(), false);
  assert.equal(await vp.locator('#ai-orb').isVisible(), false); // no assistant orb for external parties
  await vp.goto(S.portal + '/#/projects');
  await vp.waitForFunction(() => location.hash.startsWith('#/sys/'), null, { timeout: 8000 });
  await shot(vp, '16-provider-portal');
  await vp.context().close();
});

await step('20. أيقونة المساعد تفتح محادثة كاملة الشاشة، وبطاقة اقتراح تنفّذ طلباً، وEsc يغلق ويعيد التركيز', async () => {
  const ip = await newPage();
  await login(ip, 'fatima');
  await ip.waitForSelector('#ai-orb');
  assert.equal(await ip.locator('#ask-dock').isVisible(), false); // the orb replaces the old bar
  assert.equal(await ip.getAttribute('#ai-orb', 'aria-label'), 'تحدّث مع المساعد (/)');
  await ip.focus('#ai-orb');
  await ip.keyboard.press('Enter');
  await ip.waitForSelector('body.ai-immersive #chat.immersive.is-empty');
  await ip.waitForFunction(() => document.activeElement?.id === 'chat-input', null, { timeout: 3000 }); // focus moves after the open animation
  assert.equal(await ip.locator('#chat').getAttribute('role'), 'dialog');
  assert.ok(await ip.evaluate(() => document.querySelector('#main').inert), 'the page behind is inert');
  const cards = ip.locator('#ai-starters .starter');
  assert.equal(await cards.count(), 4); // role-aware starters (employee)
  await shot(ip, '17-immersive-empty');
  await cards.filter({ hasText: 'ما مهامي اليوم؟' }).click();
  await ip.waitForFunction(() => document.querySelectorAll('#chat-body .msg.assistant:not(.welcome)').length > 0, null, { timeout: 20000 });
  assert.match(await ip.locator('#chat-body .msg.user').last().innerText(), /ما مهامي اليوم/);
  const answer = await ip.locator('#chat-body .msg.assistant').last().innerText();
  assert.doesNotMatch(answer, /لم أتمكن من تحديد|تعذّر التنفيذ/); assert.ok(answer.length > 20, answer);
  await ip.waitForSelector('#ai-rail .rail-item[aria-current="true"]');
  assert.match(await ip.locator('#ai-title').innerText(), /ما مهامي اليوم/);
  await shot(ip, '18-immersive-conversation');
  await ip.keyboard.press('Escape');
  await ip.waitForFunction(() => !document.body.classList.contains('ai-immersive'));
  await ip.waitForFunction(() => document.activeElement?.id === 'ai-orb', null, { timeout: 3000 }); // focus restored to where it was
  assert.ok(await ip.locator('#chat.collapsed').count());
  assert.equal(await ip.evaluate(() => document.querySelector('#main').inert), false);
  // "/" opens it again; the conversation is still there; «إرساء بجانب الصفحة» docks it beside the page
  await ip.keyboard.press('/');
  await ip.waitForSelector('body.ai-immersive');
  assert.ok(await ip.locator('#chat-body .msg.user').count() >= 1);
  await ip.click('#ai-dock');
  await ip.waitForFunction(() => !document.body.classList.contains('ai-immersive') && !document.querySelector('#chat').classList.contains('collapsed'));
  await ip.context().close();
});

await step('21. الصفحة الرئيسية تبدأ بالمحادثة: الطلب من البطاقة العلوية يفتح المحادثة وينفّذه', async () => {
  const hp = await newPage();
  await login(hp, 'omar');
  await hp.waitForSelector('.home-ask #home-ask-input');
  assert.match(await hp.locator('.greet h1').innerText(), /كيف أساعدك اليوم يا عمر/);
  assert.ok(await hp.locator('.home-ask .ha-chip').count() >= 3);
  await hp.fill('#home-ask-input', 'ما المهام المتأخرة في فريقي؟');
  await hp.keyboard.press('Enter');
  await hp.waitForSelector('body.ai-immersive');
  await hp.waitForFunction(() => document.querySelectorAll('#chat-body .msg.assistant:not(.welcome)').length > 0, null, { timeout: 20000 });
  const answer = await hp.locator('#chat-body .msg.assistant').last().innerText();
  assert.doesNotMatch(answer, /لم أتمكن من تحديد|تعذّر التنفيذ/); assert.ok(answer.length > 20, answer);
  assert.equal(await hp.inputValue('#home-ask-input'), ''); // sent, not left behind
  await hp.keyboard.press('Escape');
  await hp.waitForFunction(() => !document.body.classList.contains('ai-immersive'));
  await hp.waitForSelector('.dash-grid .card'); // the dashboard is still there underneath
  // a reply that arrives after the conversation was closed → the orb asks for attention
  await hp.click('#ai-orb'); await hp.waitForSelector('body.ai-immersive');
  const n0 = await hp.locator('#chat-body .msg.assistant:not(.welcome)').count();
  await hp.evaluate(() => {
    const i = document.querySelector('#chat-input'); i.value = 'ما مواعيدي؟'; i.dispatchEvent(new Event('input'));
    document.querySelector('#btn-send').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // closed while the request runs
  });
  await hp.waitForFunction((n) => document.querySelectorAll('#chat-body .msg.assistant:not(.welcome)').length > n, n0, { timeout: 20000 });
  await hp.waitForSelector('#ai-orb-wrap[data-attn="answer"]');
  assert.match(await hp.getAttribute('#ai-orb', 'aria-label'), /وصل رد جديد/);
  await shot(hp, '20-orb-attention');
  await hp.click('#ai-orb'); await hp.waitForSelector('body.ai-immersive');
  assert.equal(await hp.locator('#ai-orb-wrap[data-attn]').count(), 0);
  await hp.context().close();
});

await step('22. المحادثة الصوتية: فتح الوضع الصوتي (تعرّف محاكى)، ترجمة حية للكلام والرد، ثم إنهاء نظيف', async () => {
  const vp = await newPage(undefined, { voice: 'ما مهامي؟' });
  await vp.addInitScript(() => { try { localStorage.setItem('swp.mute', '1'); } catch {} }); // keep headless quiet
  await login(vp, 'ahmed');
  await vp.click('#ai-orb-mic');
  await vp.waitForSelector('#ai-voice[role=dialog]');
  assert.equal(await vp.evaluate(() => document.querySelector('#main').inert && document.querySelector('#chat').inert), true);
  await vp.waitForFunction(() => /ما مهامي/.test(document.querySelector('#ai-voice .vo-line.you .vo-text')?.textContent || ''), null, { timeout: 10000 });
  await vp.waitForFunction(() => (document.querySelector('#ai-voice .vo-line.ai .vo-text')?.textContent || '').length > 10, null, { timeout: 20000 });
  assert.doesNotMatch(await vp.locator('#ai-voice .vo-line.ai').innerText(), /لم أتمكن من تحديد|تعذّر التنفيذ/);
  await shot(vp, '19-voice-mode');
  await vp.click('#ai-voice-end');
  await vp.waitForSelector('#ai-voice', { state: 'detached' });
  assert.equal(await vp.evaluate(() => document.activeElement?.id), 'ai-orb-mic');
  assert.equal(await vp.evaluate(() => document.querySelector('#main').inert), false);
  // the spoken turn is in the conversation, marked as voice input — and the loop stopped
  const n = await vp.locator('#chat-body .msg.user').count();
  assert.ok(n >= 1);
  assert.match(await vp.locator('#chat-body .msg.user').first().innerText(), /إدخال صوتي/);
  await vp.waitForTimeout(2500);
  assert.equal(await vp.locator('#chat-body .msg.user').count(), n);
  await vp.context().close();
});

await browser.close();
await S.stop();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, console_errors: errors }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} steps passed. Console errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
process.exit(failed.length ? 1 : 0);
