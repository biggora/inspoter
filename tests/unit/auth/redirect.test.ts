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
    expect(sanitizeNextPath(undefined)).toBe("/management");
  });

  it("falls back to the default when next is null", () => {
    expect(sanitizeNextPath(null)).toBe("/management");
  });

  it("falls back to the default when next is an empty string", () => {
    expect(sanitizeNextPath("")).toBe("/management");
  });

  it("honors a custom fallback", () => {
    expect(sanitizeNextPath(undefined, "/login")).toBe("/login");
  });

  it("rejects a protocol-relative path (//evil.com)", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/management");
  });

  it("rejects a backslash-prefixed path (/\\evil.com)", () => {
    expect(sanitizeNextPath("/\\evil.com")).toBe("/management");
  });

  it("rejects an absolute URL", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/management");
  });

  it("rejects a javascript: URL", () => {
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/management");
  });

  it("rejects a path that doesn't start with a slash", () => {
    expect(sanitizeNextPath("bookmarks")).toBe("/management");
  });
});
