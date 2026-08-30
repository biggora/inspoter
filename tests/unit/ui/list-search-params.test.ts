import { describe, expect, it } from "vitest";

import {
  buildListSearch,
  listHref,
  pickListSearch,
  toValues,
} from "@/lib/list-search-params";

describe("buildListSearch", () => {
  it("omits empty, absent and false values", () => {
    expect(
      buildListSearch({
        query: "",
        labelId: null,
        starred: false,
        page: undefined,
      }),
    ).toBe("");
  });

  it("never stringifies undefined into the query", () => {
    expect(buildListSearch({ query: undefined })).not.toContain("undefined");
  });

  it("keeps numbers, including zero", () => {
    expect(buildListSearch({ page: 0 })).toBe("page=0");
    expect(buildListSearch({ page: 3 })).toBe("page=3");
  });

  it("keeps true as the literal the parsers look for", () => {
    expect(buildListSearch({ starred: true })).toBe("starred=true");
  });

  it("emits one entry per array item, in order", () => {
    expect(buildListSearch({ cursor: ["a", "b", "c"] })).toBe(
      "cursor=a&cursor=b&cursor=c",
    );
  });

  it("emits nothing for an empty array", () => {
    expect(buildListSearch({ cursor: [] })).toBe("");
  });

  it("preserves insertion order so the same state yields the same string", () => {
    expect(buildListSearch({ query: "a", labelId: "l", page: 2 })).toBe(
      "query=a&labelId=l&page=2",
    );
  });

  it("percent-encodes reserved characters and non-ASCII text", () => {
    const search = buildListSearch({ query: "a&b#c+d Иванов" });
    expect(search).not.toContain("&b");
    expect(search).not.toContain("#");
    expect(new URLSearchParams(search).get("query")).toBe("a&b#c+d Иванов");
  });
});

describe("listHref", () => {
  it("returns a bare path when there is no search", () => {
    expect(listHref("/contacts", "")).toBe("/contacts");
  });

  it("joins the path and the search", () => {
    expect(listHref("/contacts", "query=a")).toBe("/contacts?query=a");
  });
});

describe("toValues", () => {
  it("normalizes the three App Router shapes", () => {
    expect(toValues(undefined)).toEqual([]);
    expect(toValues("a")).toEqual(["a"]);
    expect(toValues(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("pickListSearch", () => {
  it("copies only allowlisted keys", () => {
    expect(
      pickListSearch({ query: "a", page: "2", highlightAlertId: "alert-1" }, [
        "query",
        "page",
      ]),
    ).toBe("query=a&page=2");
  });

  it("drops everything outside the allowlist", () => {
    expect(pickListSearch({ highlightAlertId: "alert-1" }, ["query"])).toBe("");
  });

  it("preserves repeated values in order", () => {
    expect(pickListSearch({ cursor: ["a", "b"] }, ["cursor"])).toBe(
      "cursor=a&cursor=b",
    );
  });

  it("skips missing and empty values", () => {
    expect(pickListSearch({ query: "" }, ["query", "page"])).toBe("");
  });
});
