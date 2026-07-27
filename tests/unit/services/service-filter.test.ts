import { describe, expect, it } from "vitest";
import {
  filterServices,
  type FilterableService,
} from "@/components/services/filter";

// Pure client-side filtering for the /services list (search + label chips).
// The label filter uses OR semantics deliberately: picking two labels widens
// the result set instead of narrowing it to services carrying both.

function service(
  overrides: Partial<FilterableService> & { name: string },
): FilterableService {
  return {
    monitorType: "HTTP",
    url: "https://example.com/health",
    labels: [],
    ...overrides,
  };
}

const prod = { id: "label-prod" };
const staging = { id: "label-staging" };

const services: FilterableService[] = [
  service({
    name: "Checkout API",
    description: "Payments entry point",
    url: "https://checkout.example.com/health",
    labels: [prod],
  }),
  service({
    name: "Redis",
    monitorType: "TCP",
    url: null,
    host: "cache.internal",
    port: 6379,
    labels: [staging],
  }),
  service({
    name: "Gateway",
    monitorType: "PING",
    url: null,
    host: "gw.example.net",
    labels: [prod, staging],
  }),
  service({ name: "Unlabeled", description: null }),
];

const noFilters = { query: "", labelIds: [] as string[] };

function names(result: FilterableService[]): string[] {
  return result.map((item) => item.name);
}

describe("filterServices(): no filters", () => {
  it("returns every service untouched", () => {
    expect(names(filterServices(services, noFilters))).toEqual([
      "Checkout API",
      "Redis",
      "Gateway",
      "Unlabeled",
    ]);
  });

  it("treats a whitespace-only query as empty", () => {
    expect(
      filterServices(services, { ...noFilters, query: "   " }),
    ).toHaveLength(services.length);
  });
});

describe("filterServices(): text search", () => {
  it("matches the name case-insensitively", () => {
    expect(
      names(filterServices(services, { ...noFilters, query: "checkout" })),
    ).toEqual(["Checkout API"]);
  });

  it("matches the description", () => {
    expect(
      names(filterServices(services, { ...noFilters, query: "payments" })),
    ).toEqual(["Checkout API"]);
  });

  it("matches an HTTP target url", () => {
    expect(
      names(
        filterServices(services, { ...noFilters, query: "checkout.example" }),
      ),
    ).toEqual(["Checkout API"]);
  });

  it("matches a TCP target as host:port", () => {
    expect(
      names(
        filterServices(services, {
          ...noFilters,
          query: "cache.internal:6379",
        }),
      ),
    ).toEqual(["Redis"]);
  });

  it("matches a PING target host", () => {
    expect(
      names(
        filterServices(services, { ...noFilters, query: "gw.example.net" }),
      ),
    ).toEqual(["Gateway"]);
  });

  it("returns nothing when no field matches", () => {
    expect(
      filterServices(services, { ...noFilters, query: "nomatch" }),
    ).toEqual([]);
  });

  it("tolerates a null description", () => {
    expect(
      names(filterServices(services, { ...noFilters, query: "unlabeled" })),
    ).toEqual(["Unlabeled"]);
  });
});

describe("filterServices(): label filter", () => {
  it("keeps only services carrying the selected label", () => {
    expect(
      names(filterServices(services, { ...noFilters, labelIds: [prod.id] })),
    ).toEqual(["Checkout API", "Gateway"]);
  });

  it("unions the matches across several labels (OR, not AND)", () => {
    expect(
      names(
        filterServices(services, {
          ...noFilters,
          labelIds: [prod.id, staging.id],
        }),
      ),
    ).toEqual(["Checkout API", "Redis", "Gateway"]);
  });

  it("returns nothing for a label nobody carries", () => {
    expect(
      filterServices(services, { ...noFilters, labelIds: ["label-unused"] }),
    ).toEqual([]);
  });
});

describe("filterServices(): search combined with labels", () => {
  it("requires both conditions to hold", () => {
    expect(
      names(
        filterServices(services, { query: "gateway", labelIds: [staging.id] }),
      ),
    ).toEqual(["Gateway"]);
  });

  it("drops a text match that lacks the selected label", () => {
    expect(
      filterServices(services, { query: "checkout", labelIds: [staging.id] }),
    ).toEqual([]);
  });
});
