import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "@/lib/auth/redirect";

// Open-redirect guard shared by the Authentik login-initiation/callback
// routes (the `next` value round-trips through a cookie an attacker could
// tamper with) — only same-origin, single-leading-slash relative paths are
// ever honored.

describe("sanitizeNextPath", () => {
  it("accepts a plain relative path", () => {
    expect(sanitizeNextPath("/bookmarks")).toBe("/bookmarks");
  });

  it("preserves query string and hash on an accepted path", () => {
    expect(sanitizeNextPath("/mail?filter=unread#top")).toBe(
      "/mail?filter=unread#top",
    );
  });

  it("falls back to the default when next is undefined", () => {
    expect(sanitizeNextPath(undefined)).toBe("/bookmarks");
  });

  it("falls back to the default when next is null", () => {
    expect(sanitizeNextPath(null)).toBe("/bookmarks");
  });

  it("falls back to the default when next is an empty string", () => {
    expect(sanitizeNextPath("")).toBe("/bookmarks");
  });

  it("honors a custom fallback", () => {
    expect(sanitizeNextPath(undefined, "/login")).toBe("/login");
  });

  it("rejects a protocol-relative path (//evil.com)", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/bookmarks");
  });

  it("rejects a backslash-prefixed path (/\\evil.com)", () => {
    expect(sanitizeNextPath("/\\evil.com")).toBe("/bookmarks");
  });

  it("rejects an absolute URL", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/bookmarks");
  });

  it("rejects a javascript: URL", () => {
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/bookmarks");
  });

  it("rejects a path that doesn't start with a slash", () => {
    expect(sanitizeNextPath("bookmarks")).toBe("/bookmarks");
  });
});
