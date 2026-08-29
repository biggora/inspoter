import { expect, test } from "./fixtures/test";
import { login } from "./utils/auth";

// Critique 2026-08-29 (P2): the management landing is a decision surface —
// snapshot tiles drill into their sections with zero counts de-emphasized,
// and AI-brief configuration lives behind /management/automation. These
// invariants hold at both breakpoints.
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

    // Tiles are anchors into their sections.
    const tiles = page.locator(
      "main a[href='/alerts'], main a[href='/services'], main a[href='/kanban'], main a[href='/calendar'], main a[href='/mail'], main a[href='/messages']",
    );
    await tiles.first().waitFor();
    const tileCount = await tiles.count();
    for (let i = 0; i < tileCount; i++) {
      const box = await tiles.nth(i).boundingBox();
      expect(box && box.height >= 40, `tile ${i} tappable height`).toBeTruthy();
    }

    // Emphasis class matches the value: zero → muted, non-zero → big.
    const emphasis = await page.evaluate(() => {
      const hrefs = [
        "/alerts",
        "/services",
        "/kanban",
        "/calendar",
        "/mail",
        "/messages",
      ];
      const numbers = hrefs.flatMap((href) =>
        Array.from(
          document.querySelectorAll<HTMLAnchorElement>(`main a[href='${href}']`),
        ),
      ).map((tile) => tile.querySelector("div") as HTMLElement | null);
      return numbers
        .filter(
          (n): n is HTMLElement =>
            n !== null && n.textContent !== null && n.textContent.trim() !== "",
        )
        .map((n) => ({
          text: n.textContent,
          big: n.className.includes("text-2xl"),
        }));
    });
    expect(emphasis.length).toBeGreaterThan(0);
    for (const e of emphasis) {
      const isZero = e.text?.trim() === "0";
      expect(e.big, `tile value ${e.text}`).toBe(!isZero);
    }

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
