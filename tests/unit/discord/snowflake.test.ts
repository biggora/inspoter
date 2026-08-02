import { describe, expect, it } from "vitest";
import { toSnowflake } from "@/lib/discord/snowflake";

// specs/discord-webhook-compatibility.md §3.3.

const DISCORD_EPOCH_MS = 1_420_070_400_000;

describe("surrogate snowflakes", () => {
  it("produces a decimal string a client can parse as a 64-bit integer", () => {
    const value = toSnowflake("cm0000000000000000000000", new Date());
    expect(value).toMatch(/^\d+$/);
    expect(BigInt(value) < 1n << 64n).toBe(true);
  });

  it("is deterministic for the same id and timestamp", () => {
    const at = new Date("2026-08-02T10:15:00.000Z");
    expect(toSnowflake("abc", at)).toBe(toSnowflake("abc", at));
  });

  it("separates different ids created at the same instant", () => {
    const at = new Date("2026-08-02T10:15:00.000Z");
    expect(toSnowflake("abc", at)).not.toBe(toSnowflake("abd", at));
  });

  it("orders by creation time", () => {
    const earlier = toSnowflake("zzz", new Date("2026-08-02T10:00:00.000Z"));
    const later = toSnowflake("aaa", new Date("2026-08-02T10:00:01.000Z"));
    expect(BigInt(later) > BigInt(earlier)).toBe(true);
  });

  it("encodes the timestamp in the high bits", () => {
    const at = new Date("2026-08-02T10:15:00.000Z");
    const decoded = Number(BigInt(toSnowflake("abc", at)) >> 22n);
    expect(decoded).toBe(at.getTime() - DISCORD_EPOCH_MS);
  });

  it("falls back to the Discord epoch when no date is known", () => {
    expect(BigInt(toSnowflake("abc")) >> 22n).toBe(0n);
    // Dates before the Discord epoch clamp instead of going negative.
    expect(BigInt(toSnowflake("abc", new Date("2000-01-01"))) >> 22n).toBe(0n);
  });
});
