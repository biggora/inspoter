import { describe, expect, it } from "vitest";
import { BoundedFixedWindowLimiter } from "@/lib/rate-limit/fixed-window";

describe("BoundedFixedWindowLimiter", () => {
  it("expires and reuses a key", () => {
    const limiter = new BoundedFixedWindowLimiter(10, 5);
    expect(limiter.consume("a", 1, 100, 0).allowed).toBe(true);
    expect(limiter.consume("a", 1, 100, 50).allowed).toBe(false);
    expect(limiter.consume("a", 1, 100, 100).allowed).toBe(true);
    expect(limiter.size()).toBe(1);
  });

  it("evicts the oldest key at the hard cap", () => {
    const limiter = new BoundedFixedWindowLimiter(2, 10_000);
    limiter.consume("first", 1, 10_000, 1);
    limiter.consume("second", 1, 10_000, 2);
    limiter.consume("third", 1, 10_000, 3);
    expect(limiter.size()).toBe(2);
    expect(limiter.consume("first", 1, 10_000, 4).allowed).toBe(true);
  });

  it("keeps independent limiter pools isolated", () => {
    const webhook = new BoundedFixedWindowLimiter();
    const mail = new BoundedFixedWindowLimiter();
    expect(webhook.consume("workspace", 1, 1000, 0).allowed).toBe(true);
    expect(webhook.consume("workspace", 1, 1000, 1).allowed).toBe(false);
    expect(mail.consume("workspace", 1, 1000, 1).allowed).toBe(true);
  });
});
