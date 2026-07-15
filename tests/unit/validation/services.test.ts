import { describe, expect, it } from "vitest";
import { MonitorType } from "@/generated/prisma/client";
import {
  serviceCreateSchema,
  serviceUpdateSchema,
} from "@/lib/validation/services";

// Zod schemas for Services (plan.md "Слой сервиса, API, валидация"):
// per-monitorType required fields (discriminated union on create,
// superRefine on update), numeric bounds, and expectedStatusCodes format.

describe("serviceCreateSchema: per-monitorType required fields", () => {
  it("HTTP without url fails", () => {
    const result = serviceCreateSchema.safeParse({
      name: "web",
      monitorType: MonitorType.HTTP,
    });
    expect(result.success).toBe(false);
  });

  it("HTTP with a valid url passes", () => {
    const result = serviceCreateSchema.safeParse({
      name: "web",
      monitorType: MonitorType.HTTP,
      url: "https://example.com/health",
    });
    expect(result.success).toBe(true);
  });

  it("HTTP with a non-http(s) url fails", () => {
    const result = serviceCreateSchema.safeParse({
      name: "web",
      monitorType: MonitorType.HTTP,
      url: "ftp://example.com/resource",
    });
    expect(result.success).toBe(false);
  });

  it("TCP without host fails", () => {
    const result = serviceCreateSchema.safeParse({
      name: "db",
      monitorType: MonitorType.TCP,
      port: 5432,
    });
    expect(result.success).toBe(false);
  });

  it("TCP without port fails", () => {
    const result = serviceCreateSchema.safeParse({
      name: "db",
      monitorType: MonitorType.TCP,
      host: "db.internal",
    });
    expect(result.success).toBe(false);
  });

  it("TCP with host and port passes", () => {
    const result = serviceCreateSchema.safeParse({
      name: "db",
      monitorType: MonitorType.TCP,
      host: "db.internal",
      port: 5432,
    });
    expect(result.success).toBe(true);
  });

  it("PING without host fails", () => {
    const result = serviceCreateSchema.safeParse({
      name: "router",
      monitorType: MonitorType.PING,
    });
    expect(result.success).toBe(false);
  });

  it("PING with host (and no port) passes", () => {
    const result = serviceCreateSchema.safeParse({
      name: "router",
      monitorType: MonitorType.PING,
      host: "router.internal",
    });
    expect(result.success).toBe(true);
  });

  it("PING with an optional port passes", () => {
    const result = serviceCreateSchema.safeParse({
      name: "router",
      monitorType: MonitorType.PING,
      host: "router.internal",
      port: 22,
    });
    expect(result.success).toBe(true);
  });
});

describe("serviceCreateSchema: name required", () => {
  it("rejects a missing name", () => {
    const result = serviceCreateSchema.safeParse({
      monitorType: MonitorType.HTTP,
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty/whitespace-only name", () => {
    const result = serviceCreateSchema.safeParse({
      name: "   ",
      monitorType: MonitorType.HTTP,
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("serviceCreateSchema: bounds checks", () => {
  const base = {
    name: "web",
    monitorType: MonitorType.HTTP,
    url: "https://example.com",
  };

  it("rejects intervalSeconds below the minimum (10)", () => {
    const result = serviceCreateSchema.safeParse({
      ...base,
      intervalSeconds: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects intervalSeconds above the maximum (86400)", () => {
    const result = serviceCreateSchema.safeParse({
      ...base,
      intervalSeconds: 100000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts intervalSeconds within bounds", () => {
    const result = serviceCreateSchema.safeParse({
      ...base,
      intervalSeconds: 60,
    });
    expect(result.success).toBe(true);
  });

  it("rejects timeoutMs below the minimum (1000)", () => {
    const result = serviceCreateSchema.safeParse({
      ...base,
      timeoutMs: 500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects timeoutMs above the maximum (30000)", () => {
    const result = serviceCreateSchema.safeParse({
      ...base,
      timeoutMs: 40000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects retries below the minimum (1)", () => {
    const result = serviceCreateSchema.safeParse({
      ...base,
      retries: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects retries above the maximum (10)", () => {
    const result = serviceCreateSchema.safeParse({
      ...base,
      retries: 11,
    });
    expect(result.success).toBe(false);
  });

  it("accepts retries within bounds", () => {
    const result = serviceCreateSchema.safeParse({
      ...base,
      retries: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a port below the minimum (1) for TCP", () => {
    const result = serviceCreateSchema.safeParse({
      name: "db",
      monitorType: MonitorType.TCP,
      host: "db.internal",
      port: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a port above the maximum (65535) for TCP", () => {
    const result = serviceCreateSchema.safeParse({
      name: "db",
      monitorType: MonitorType.TCP,
      host: "db.internal",
      port: 70000,
    });
    expect(result.success).toBe(false);
  });
});

describe("serviceCreateSchema: expectedStatusCodes format", () => {
  it("accepts a single range like 200-299", () => {
    const result = serviceCreateSchema.safeParse({
      name: "web",
      monitorType: MonitorType.HTTP,
      url: "https://example.com",
      expectedStatusCodes: "200-299",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a comma-separated list of codes/ranges", () => {
    const result = serviceCreateSchema.safeParse({
      name: "web",
      monitorType: MonitorType.HTTP,
      url: "https://example.com",
      expectedStatusCodes: "200,204,301-399",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed expectedStatusCodes value", () => {
    const result = serviceCreateSchema.safeParse({
      name: "web",
      monitorType: MonitorType.HTTP,
      url: "https://example.com",
      expectedStatusCodes: "not-a-code",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-3-digit code", () => {
    const result = serviceCreateSchema.safeParse({
      name: "web",
      monitorType: MonitorType.HTTP,
      url: "https://example.com",
      expectedStatusCodes: "20-99",
    });
    expect(result.success).toBe(false);
  });
});

describe("serviceUpdateSchema: per-monitorType required fields (only enforced when monitorType is present)", () => {
  it("allows a partial update with no monitorType and no target fields", () => {
    const result = serviceUpdateSchema.safeParse({
      name: "renamed",
    });
    expect(result.success).toBe(true);
  });

  it("switching monitorType to HTTP without url fails", () => {
    const result = serviceUpdateSchema.safeParse({
      monitorType: MonitorType.HTTP,
    });
    expect(result.success).toBe(false);
  });

  it("switching monitorType to HTTP with url passes", () => {
    const result = serviceUpdateSchema.safeParse({
      monitorType: MonitorType.HTTP,
      url: "https://example.com/health",
    });
    expect(result.success).toBe(true);
  });

  it("switching monitorType to TCP without host/port fails", () => {
    const result = serviceUpdateSchema.safeParse({
      monitorType: MonitorType.TCP,
    });
    expect(result.success).toBe(false);
  });

  it("switching monitorType to TCP with host and port passes", () => {
    const result = serviceUpdateSchema.safeParse({
      monitorType: MonitorType.TCP,
      host: "db.internal",
      port: 5432,
    });
    expect(result.success).toBe(true);
  });

  it("switching monitorType to PING without host fails", () => {
    const result = serviceUpdateSchema.safeParse({
      monitorType: MonitorType.PING,
    });
    expect(result.success).toBe(false);
  });

  it("switching monitorType to PING with host passes", () => {
    const result = serviceUpdateSchema.safeParse({
      monitorType: MonitorType.PING,
      host: "router.internal",
    });
    expect(result.success).toBe(true);
  });
});
