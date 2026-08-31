import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// Critique 2026-08-29 (P2) + 2026-08-31 (P2): the management landing is a
// reading surface — "Record a decision" is a header CTA opening a dialog, the
// snapshot card fits its content, only signal (non-zero) totals render as
// drill-down tiles with an all-quiet line otherwise, and the system-health
// row restates the sidebar footer's two facts. No nested cards inside the
// decisions list. These invariants hold at both breakpoints.
test("management distillation invariants", async ({ browser }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await login(page);

    await page.goto("/management");
    await page
      .getByRole("heading", { name: "Management", exact: true })
      .waitFor();

    // The write action is a header CTA, not a fold form.
    const recordButton = page.getByRole("button", {
      name: "Record a decision",
    });
    await expect(recordButton).toBeVisible();
    await recordButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Title")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Signal tiles are anchors into their sections; zeros never render.
    const tiles = page.locator("main [data-signal-tile]");
    const tileCount = await tiles.count();
    for (let i = 0; i < tileCount; i++) {
      const box = await tiles.nth(i).boundingBox();
      expect(box && box.height >= 40, `tile ${i} tappable height`).toBeTruthy();
      const value = await tiles.nth(i).locator("div").first().textContent();
      expect(value && value.trim() !== "0", `tile ${i} carries a signal`).toBe(
        true,
      );
    }
    // Either live signals or the quiet line — never an empty region.
    const quietCount = await page
      .getByText("All quiet — no signals in this period.")
      .count();
    expect(quietCount + tileCount).toBeGreaterThan(0);

    // The system-health row links both sidebar-footer facts.
    const health = page.locator("[data-slot='system-health']");
    await expect(health).toBeVisible();
    await expect(health.locator("a[href='/settings/providers']")).toBeVisible();
    await expect(health.locator("a[href='/alerts']")).toBeVisible();

    // AI config is a single compact card with one link, no part grid.
    expect(
      await page.locator("main a[href='/management/automation']").count(),
    ).toBe(1);
    expect(await page.getByText("AI provider", { exact: true }).count()).toBe(
      0,
    );

    // No horizontal overflow on either page.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.goto("/management/automation");
    await page
      .getByRole("heading", { name: "AI briefs", exact: true })
      .waitFor();
    const autoOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(autoOverflow).toBeLessThanOrEqual(0);

    await context.close();
  }
});
