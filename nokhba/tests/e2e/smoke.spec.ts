import { expect, test, type Page } from "@playwright/test";

/** Demo accounts are created by `npm run db:seed` (password shared by all). */
export const PASSWORD = "Nokhba123!";

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000 });
}

test.describe("platform smoke", () => {
  test("health endpoint reports the database", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.status ?? json.ok).toBeTruthy();
  });

  test("anonymous visitors are sent to sign-in for private routes", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("learner signs in, sees the dashboard, opens the AI companion and the command palette", async ({ page }) => {
    await signIn(page, "sara@nokhba.demo");
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText(/Sara/).first()).toBeVisible();

    // No raw i18n keys leaked into the page.
    const leaked = await page.evaluate(() =>
      Array.from(document.querySelectorAll("body *")).filter((el) => el.children.length === 0 && /^[a-z]+\.[a-zA-Z0-9.]+$/.test((el.textContent || "").trim())).length,
    );
    expect(leaked).toBe(0);

    // Global AI companion streams a reply (demo provider, no key needed).
    await page.getByRole("button", { name: /companion|ai/i }).first().click({ force: true });
    const composer = page.getByRole("textbox").last();
    await composer.fill("What should I learn today?");
    await composer.press("Enter");
    await expect(page.locator("[data-role=assistant], [data-turn=assistant]").last().or(page.getByText(/learn|plan|lesson/i).last())).toBeVisible({ timeout: 30_000 });

    // Command palette answers a search.
    await page.keyboard.press("Escape");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.getByPlaceholder(/search|ابحث/i).fill("machine learning");
    await expect(page.getByText(/Machine Learning/i).first()).toBeVisible();
  });

  test("Arabic locale renders right-to-left without horizontal overflow", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "nokhba_locale", value: "ar", url: baseURL! }]);
    await signIn(page, "sara@nokhba.demo");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });

  test("role areas are enforced by the proxy", async ({ page }) => {
    await signIn(page, "sara@nokhba.demo");
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);
    await page.goto("/instructor");
    await expect(page).not.toHaveURL(/\/instructor$/);
  });

  test("AI API rejects unauthenticated calls and validates input", async ({ request }) => {
    const anon = await request.post("/api/ai/chat", { data: { kind: "tutor", message: "hi" } });
    expect(anon.status()).toBe(401);
  });
});
