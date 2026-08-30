import { describe, expect, it } from "vitest";

import {
  parseServicesFilters,
  serviceDetailHref,
  servicesListSearch,
  type ServicesFilters,
} from "@/components/services/list-params";

const empty: ServicesFilters = { query: "", labelIds: [] };

describe("parseServicesFilters", () => {
  it("defaults an empty query string to no filters", () => {
    expect(parseServicesFilters(new URLSearchParams())).toEqual(empty);
  });

  it("trims the query and collects every labelId", () => {
    expect(
      parseServicesFilters(
        new URLSearchParams("query=  api  &labelId=l1&labelId=l2"),
      ),
    ).toEqual({ query: "api", labelIds: ["l1", "l2"] });
  });

  it("drops empty label ids", () => {
    expect(
      parseServicesFilters(new URLSearchParams("labelId=")).labelIds,
    ).toEqual([]);
  });
});

describe("servicesListSearch", () => {
  it("is empty when nothing is filtered", () => {
    expect(servicesListSearch(empty)).toBe("");
  });

  it("round-trips through parseServicesFilters", () => {
    const filters: ServicesFilters = {
      query: "api & web",
      labelIds: ["l1", "l2"],
    };
    expect(
      parseServicesFilters(new URLSearchParams(servicesListSearch(filters))),
    ).toEqual(filters);
  });
});

describe("serviceDetailHref", () => {
  it("carries the filtered list into the detail URL", () => {
    expect(
      serviceDetailHref("s1", { query: "api", labelIds: ["l1", "l2"] }),
    ).toBe("/services/s1?query=api&labelId=l1&labelId=l2");
  });

  it("stays bare when the list is unfiltered", () => {
    expect(serviceDetailHref("s1", empty)).toBe("/services/s1");
  });
});
