#!/usr/bin/env node
/**
 * Browser check for feature work (uses the globally installed Playwright + bundled Chromium).
 *
 *   node scripts/browse.cjs --as sara@nokhba.demo --paths /home,/learn --locale ar --width 390 --out /tmp/shots
 *
 * Signs in (all demo passwords: Nokhba123!), visits each path, screenshots it, and prints
 * page errors / console errors / failed requests. Exit code 1 if any page error occurred.
 * Options: --as <email|none> --paths a,b --locale en|ar --width 1280 --height 860 --dark --out dir --base http://localhost:3000
 */
const path = require("node:path");
const fs = require("node:fs");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"] : [])).filter(Boolean));
const base = args.base || "http://localhost:3000";
const out = args.out || "/tmp/nokhba-shots";
fs.mkdirSync(out, { recursive: true });
const { chromium } = require(require("node:child_process").execSync("npm root -g").toString().trim() + "/playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number(args.width || 1280), height: Number(args.height || 860) }, colorScheme: args.dark === "true" ? "dark" : "light" });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`PAGE ERROR: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`CONSOLE: ${m.text().slice(0, 300)}`); });
  page.on("requestfailed", (r) => { if (!/favicon|_next\/webpack-hmr/.test(r.url())) problems.push(`REQUEST FAILED: ${r.url()} ${r.failure()?.errorText ?? ""}`); });
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  if (args.locale) await ctx.addCookies([{ name: "nokhba_locale", value: args.locale, url: base }]);
  if (args.as && args.as !== "none") {
    await page.goto(`${base}/sign-in`);
    await page.fill("#email", args.as);
    await page.fill("#password", "Nokhba123!");
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60000 }).catch(() => problems.push("SIGN-IN did not redirect"));
  }
  for (const p of (args.paths || "/").split(",")) {
    const url = `${base}${p}`;
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => { problems.push(`NAVIGATION FAILED ${p}: ${e.message}`); return null; });
    await page.waitForTimeout(600);
    const file = path.join(out, `${(args.locale || "en")}-${p.replace(/[^a-z0-9]+/gi, "_") || "root"}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const missing = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).filter((el) => el.children.length === 0 && /^[a-z]+\.[a-zA-Z0-9.]+$/.test((el.textContent || "").trim())).map((el) => el.textContent.trim()).slice(0, 10));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    console.log(`${p} -> ${res ? res.status() : "n/a"} ${file}${missing.length ? ` | UNTRANSLATED KEYS: ${missing.join(", ")}` : ""}${overflow ? " | HORIZONTAL OVERFLOW" : ""}`);
  }
  if (problems.length) { console.log("PROBLEMS:\n" + problems.map((x) => " - " + x).join("\n")); }
  await browser.close();
  process.exit(problems.some((x) => x.startsWith("PAGE ERROR") || x.startsWith("HTTP 5")) ? 1 : 0);
})();
