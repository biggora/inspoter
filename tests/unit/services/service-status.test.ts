import { describe, expect, it } from "vitest";
import { ServiceStatus } from "@/generated/prisma/client";
import { nextState, type CurrentState } from "@/lib/services/service-status";

// Table-driven tests of the pure nextState() function (plan.md "Логика
// проверок"): status-flip logic, independent of Prisma/DB. The critical
// guarantee under test is that a service's very first observation out of
// PENDING never counts as a flip, no matter which way it resolves — that's
// what keeps Alert creation from firing when a brand-new service is created
// (services.test.ts re-verifies this at the DB-integration level).

describe("nextState(): PENDING -> success", () => {
  it("resolves to UP with no flip on the very first successful observation", () => {
    const result = nextState(
      { status: ServiceStatus.PENDING, consecutiveFailures: 0 },
      { ok: true },
      3,
    );
    expect(result).toEqual({
      status: ServiceStatus.UP,
      consecutiveFailures: 0,
      flipped: false,
    });
  });
});

describe("nextState(): PENDING -> failure(s)", () => {
  it("stays PENDING with no flip while under the retries threshold", () => {
    const result = nextState(
      { status: ServiceStatus.PENDING, consecutiveFailures: 0 },
      { ok: false },
      3,
    );
    expect(result).toEqual({
      status: ServiceStatus.PENDING,
      consecutiveFailures: 1,
      flipped: false,
    });
  });

  it("resolves to DOWN with NO flip once retries is reached on the first-ever observation (retries=1)", () => {
    const result = nextState(
      { status: ServiceStatus.PENDING, consecutiveFailures: 0 },
      { ok: false },
      1,
    );
    expect(result).toEqual({
      status: ServiceStatus.DOWN,
      consecutiveFailures: 1,
      flipped: false,
    });
  });

  it("resolves to DOWN with NO flip once retries is reached across several failed observations (retries=3)", () => {
    let current: CurrentState = {
      status: ServiceStatus.PENDING,
      consecutiveFailures: 0,
    };

    const first = nextState(current, { ok: false }, 3);
    expect(first).toEqual({
      status: ServiceStatus.PENDING,
      consecutiveFailures: 1,
      flipped: false,
    });
    current = first;

    const second = nextState(current, { ok: false }, 3);
    expect(second).toEqual({
      status: ServiceStatus.PENDING,
      consecutiveFailures: 2,
      flipped: false,
    });
    current = second;

    const third = nextState(current, { ok: false }, 3);
    expect(third).toEqual({
      status: ServiceStatus.DOWN,
      consecutiveFailures: 3,
      flipped: false,
    });
  });
});

describe("nextState(): UP -> failure", () => {
  it("stays UP with no flip while under the retries threshold", () => {
    const result = nextState(
      { status: ServiceStatus.UP, consecutiveFailures: 1 },
      { ok: false },
      3,
    );
    expect(result).toEqual({
      status: ServiceStatus.UP,
      consecutiveFailures: 2,
      flipped: false,
    });
  });

  it("flips to DOWN exactly when consecutiveFailures reaches retries", () => {
    const result = nextState(
      { status: ServiceStatus.UP, consecutiveFailures: 2 },
      { ok: false },
      3,
    );
    expect(result).toEqual({
      status: ServiceStatus.DOWN,
      consecutiveFailures: 3,
      flipped: true,
    });
  });

  it("flips to DOWN on the very first failure when retries=1", () => {
    const result = nextState(
      { status: ServiceStatus.UP, consecutiveFailures: 0 },
      { ok: false },
      1,
    );
    expect(result).toEqual({
      status: ServiceStatus.DOWN,
      consecutiveFailures: 1,
      flipped: true,
    });
  });
});

describe("nextState(): UP -> success", () => {
  it("stays UP, resets consecutiveFailures, no flip", () => {
    const result = nextState(
      { status: ServiceStatus.UP, consecutiveFailures: 0 },
      { ok: true },
      3,
    );
    expect(result).toEqual({
      status: ServiceStatus.UP,
      consecutiveFailures: 0,
      flipped: false,
    });
  });
});

describe("nextState(): DOWN -> success", () => {
  it("flips to UP immediately on the first success, no retries threshold on recovery", () => {
    const result = nextState(
      { status: ServiceStatus.DOWN, consecutiveFailures: 5 },
      { ok: true },
      3,
    );
    expect(result).toEqual({
      status: ServiceStatus.UP,
      consecutiveFailures: 0,
      flipped: true,
    });
  });
});

describe("nextState(): DOWN -> failure", () => {
  it("stays DOWN, increments consecutiveFailures, no flip (already down)", () => {
    const result = nextState(
      { status: ServiceStatus.DOWN, consecutiveFailures: 5 },
      { ok: false },
      3,
    );
    expect(result).toEqual({
      status: ServiceStatus.DOWN,
      consecutiveFailures: 6,
      flipped: false,
    });
  });
});
