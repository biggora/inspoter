import { describe, expect, it } from "vitest";

// Frozen contract (plan.md §5.3 step 7): src/lib/validation/bookmarks.ts —
// zod schemas for category name (required/trimmed, AC-BM-005) and bookmark
// name+url (required, AC-BM-007) + url must be http(s) (AC-BM-008). This
// module has not been authored yet (backend-dev Step 7 has not started), so
// this whole file currently fails to resolve the import below ("Cannot find
// module") — the expected Mode A red reason: missing implementation, not a
// typo in this test file.

describe("AC-BM-005: category name validation", () => {
  it("rejects an empty name", async () => {
    const { categorySchema } = await import("@/lib/validation/bookmarks");
    const result = categorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only name (trimmed)", async () => {
    const { categorySchema } = await import("@/lib/validation/bookmarks");
    const result = categorySchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts a valid trimmed name", async () => {
    const { categorySchema } = await import("@/lib/validation/bookmarks");
    const result = categorySchema.safeParse({ name: "Infrastructure" });
    expect(result.success).toBe(true);
  });
});

describe("AC-BM-007: bookmark name + url required", () => {
  it("rejects a missing name", async () => {
    const { bookmarkSchema } = await import("@/lib/validation/bookmarks");
    const result = bookmarkSchema.safeParse({
      url: "https://example.com",
      categoryId: "cat_1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing url", async () => {
    const { bookmarkSchema } = await import("@/lib/validation/bookmarks");
    const result = bookmarkSchema.safeParse({
      name: "Grafana",
      categoryId: "cat_1",
    });
    expect(result.success).toBe(false);
  });
});

describe("AC-BM-008: bookmark url must be http(s)", () => {
  it("rejects a non-http(s) url", async () => {
    const { bookmarkSchema } = await import("@/lib/validation/bookmarks");
    const result = bookmarkSchema.safeParse({
      name: "Grafana",
      url: "ftp://example.com/resource",
      categoryId: "cat_1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed url", async () => {
    const { bookmarkSchema } = await import("@/lib/validation/bookmarks");
    const result = bookmarkSchema.safeParse({
      name: "Grafana",
      url: "not-a-url",
      categoryId: "cat_1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid https url", async () => {
    const { bookmarkSchema } = await import("@/lib/validation/bookmarks");
    const result = bookmarkSchema.safeParse({
      name: "Grafana",
      url: "https://grafana.example.com",
      categoryId: "cat_1",
    });
    expect(result.success).toBe(true);
  });
});
