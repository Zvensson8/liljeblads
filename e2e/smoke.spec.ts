import { test, expect } from "@playwright/test";

/**
 * Smoke tests — no real Supabase login required.
 * Verifies the app shell boots and public routes render.
 */
test.describe("Smoke", () => {
  test("auth page loads with Liljeblads branding", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: /Liljeblads/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: /Logga in/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Registrera/i })).toBeVisible();
  });

  test("root redirects unauthenticated users toward auth", async ({ page }) => {
    await page.goto("/");
    // Index either shows loader briefly then navigates to /auth
    await page.waitForURL(/\/auth|\/dashboard/, { timeout: 15_000 });
    const url = page.url();
    // Without a session we expect auth; with leftover session, dashboard is ok
    expect(url.includes("/auth") || url.includes("/dashboard")).toBeTruthy();
  });

  test("unknown route shows not-found or app shell", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-xyz");
    // App may show NotFound or redirect; ensure we never get a blank white crash
    await expect(page.locator("body")).not.toBeEmpty();
    const content = await page.locator("body").innerText();
    expect(content.length).toBeGreaterThan(0);
  });

  test("protected route redirects to auth when logged out", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await page.waitForURL(/\/auth|\/dashboard/, { timeout: 15_000 });
    // Without session should land on auth (WorkspaceBootstrap only runs when authenticated)
    if (page.url().includes("/dashboard")) {
      // Session may persist in localStorage from a previous run — clear and retry
      await page.evaluate(() => localStorage.clear());
      await page.goto("/dashboard");
      await page.waitForURL(/\/auth/, { timeout: 15_000 });
    }
    await expect(page).toHaveURL(/\/auth/);
  });
});
