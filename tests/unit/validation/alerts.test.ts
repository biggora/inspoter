import { describe, expect, it } from "vitest";

import { alertDateSchema, alertListQuerySchema } from "@/lib/validation/alerts";

describe("alert query validation", () => {
  it("accepts real calendar dates", () => {
    expect(alertDateSchema.safeParse("2026-07-31").success).toBe(true);
    expect(
      alertListQuerySchema.safeParse({
        date: "2026-07-31",
        sort: "desc",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    expect(alertDateSchema.safeParse("2026-7-31").success).toBe(false);
    expect(alertDateSchema.safeParse("2026-02-30").success).toBe(false);
  });
});
