import { describe, expect, it } from "vitest";

import {
  parseRunCursors,
  runDetailHref,
  runsListHref,
} from "@/components/agents/runs-params";

describe("parseRunCursors", () => {
  it("reads the three App Router shapes", () => {
    expect(parseRunCursors(undefined)).toEqual([]);
    expect(parseRunCursors("c1")).toEqual(["c1"]);
    expect(parseRunCursors(["c1", "c2"])).toEqual(["c1", "c2"]);
  });

  it("drops empty cursors so a stray `?cursor=` still means page 1", () => {
    expect(parseRunCursors("")).toEqual([]);
    expect(parseRunCursors(["c1", ""])).toEqual(["c1"]);
  });
});

describe("runsListHref", () => {
  it("is a bare path on the first page", () => {
    expect(runsListHref([])).toBe("/agents/runs");
  });

  it("emits one entry per cursor, in order", () => {
    expect(runsListHref(["c1", "c2"])).toBe("/agents/runs?cursor=c1&cursor=c2");
  });

  it("percent-encodes a cursor's separator", () => {
    const href = runsListHref(["2026-01-01T00:00:00.000Z|abc"]);
    expect(href).not.toContain("|");
    expect(new URLSearchParams(href.split("?")[1]).getAll("cursor")).toEqual([
      "2026-01-01T00:00:00.000Z|abc",
    ]);
  });

  it("round-trips appending and dropping a page", () => {
    const cursors = ["c1"];
    const forward = [...cursors, "c2"];
    expect(runsListHref(forward)).toBe("/agents/runs?cursor=c1&cursor=c2");
    expect(runsListHref(forward.slice(0, -1))).toBe("/agents/runs?cursor=c1");
    expect(runsListHref(cursors.slice(0, -1))).toBe("/agents/runs");
  });
});

describe("runDetailHref", () => {
  it("carries the page a run was opened from", () => {
    expect(runDetailHref("r1", ["c1", "c2"])).toBe(
      "/agents/runs/r1?cursor=c1&cursor=c2",
    );
  });

  it("stays bare on the first page", () => {
    expect(runDetailHref("r1", [])).toBe("/agents/runs/r1");
  });
});
