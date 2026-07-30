import { describe, expect, it } from "vitest";

import {
  GRID_COLUMNS,
  clampRect,
  compactVertically,
  findFreeSlot,
  hasOverlaps,
  layoutRowCount,
  moveWidget,
  rectsOverlap,
  resizeWidget,
  resolveCollisions,
  sortByPosition,
  type GridItem,
} from "@/lib/dashboards/grid";

const limits = {
  minSize: { w: 2, h: 1 },
  maxSize: { w: 12, h: 8 },
};

function item(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): GridItem {
  return { id, x, y, w, h };
}

describe("clampRect", () => {
  it("keeps a legal rectangle untouched", () => {
    expect(clampRect({ x: 3, y: 2, w: 4, h: 3 }, limits)).toEqual({
      x: 3,
      y: 2,
      w: 4,
      h: 3,
    });
  });

  it("shrinks an over-wide widget instead of shifting it left", () => {
    const rect = clampRect({ x: 0, y: 0, w: 20, h: 2 }, limits);
    expect(rect.w).toBe(GRID_COLUMNS);
    expect(rect.x).toBe(0);
  });

  it("pulls a widget back inside the right edge", () => {
    expect(clampRect({ x: 11, y: 0, w: 4, h: 2 }, limits)).toMatchObject({
      x: 8,
      w: 4,
    });
  });

  it("clamps below the minimum and above the maximum size", () => {
    expect(clampRect({ x: 0, y: 0, w: 1, h: 0 }, limits)).toMatchObject({
      w: 2,
      h: 1,
    });
    expect(clampRect({ x: 0, y: 0, w: 12, h: 99 }, limits)).toMatchObject({
      h: 8,
    });
  });

  it("never allows a negative row", () => {
    expect(clampRect({ x: 0, y: -5, w: 3, h: 2 }, limits).y).toBe(0);
  });

  it("rounds fractional cells, as produced by a pointer drag", () => {
    expect(clampRect({ x: 2.4, y: 1.6, w: 3.5, h: 2.2 }, limits)).toEqual({
      x: 2,
      y: 2,
      w: 4,
      h: 2,
    });
  });
});

describe("rectsOverlap / hasOverlaps", () => {
  it("treats touching edges as free", () => {
    expect(
      rectsOverlap({ x: 0, y: 0, w: 3, h: 2 }, { x: 3, y: 0, w: 3, h: 2 }),
    ).toBe(false);
    expect(
      rectsOverlap({ x: 0, y: 0, w: 3, h: 2 }, { x: 0, y: 2, w: 3, h: 2 }),
    ).toBe(false);
  });

  it("detects a shared cell", () => {
    expect(
      rectsOverlap({ x: 0, y: 0, w: 3, h: 2 }, { x: 2, y: 1, w: 3, h: 2 }),
    ).toBe(true);
  });

  it("reports overlaps across a whole layout", () => {
    expect(hasOverlaps([item("a", 0, 0, 3, 2), item("b", 3, 0, 3, 2)])).toBe(
      false,
    );
    expect(hasOverlaps([item("a", 0, 0, 3, 2), item("b", 2, 1, 3, 2)])).toBe(
      true,
    );
  });
});

describe("resolveCollisions", () => {
  it("pushes the overlapped item down and keeps the priority item put", () => {
    const result = resolveCollisions(
      [item("moved", 0, 0, 4, 2), item("other", 0, 0, 4, 2)],
      "moved",
    );
    expect(result.find((entry) => entry.id === "moved")).toMatchObject({
      y: 0,
    });
    expect(result.find((entry) => entry.id === "other")).toMatchObject({
      y: 2,
    });
  });

  it("propagates a push through a stack of items", () => {
    const result = resolveCollisions(
      [
        item("moved", 0, 0, 4, 2),
        item("middle", 0, 0, 4, 2),
        item("bottom", 0, 2, 4, 2),
      ],
      "moved",
    );
    expect(result.find((entry) => entry.id === "middle")).toMatchObject({
      y: 2,
    });
    expect(result.find((entry) => entry.id === "bottom")).toMatchObject({
      y: 4,
    });
    expect(hasOverlaps(result)).toBe(false);
  });

  it("leaves side-by-side items alone", () => {
    const layout = [item("a", 0, 0, 4, 2), item("b", 4, 0, 4, 2)];
    expect(resolveCollisions(layout, "a")).toEqual(sortByPosition(layout));
  });

  it("is a no-op when the priority id is unknown", () => {
    const layout = [item("a", 0, 0, 4, 2), item("b", 4, 0, 4, 2)];
    expect(resolveCollisions(layout, "missing")).toEqual(
      sortByPosition(layout),
    );
  });
});

describe("compactVertically", () => {
  it("pulls items up into a hole left by a removed widget", () => {
    const result = compactVertically([item("a", 0, 4, 4, 2)]);
    expect(result[0]).toMatchObject({ y: 0 });
  });

  it("keeps stacking order while removing gaps", () => {
    const result = compactVertically([
      item("top", 0, 1, 4, 2),
      item("bottom", 0, 6, 4, 2),
    ]);
    expect(result.find((entry) => entry.id === "top")).toMatchObject({ y: 0 });
    expect(result.find((entry) => entry.id === "bottom")).toMatchObject({
      y: 2,
    });
  });

  it("compacts independent columns independently", () => {
    const result = compactVertically([
      item("left", 0, 0, 4, 4),
      item("right", 4, 3, 4, 2),
    ]);
    expect(result.find((entry) => entry.id === "right")).toMatchObject({
      y: 0,
    });
  });

  it("never introduces an overlap and is idempotent", () => {
    const layout = [
      item("a", 0, 3, 6, 2),
      item("b", 0, 7, 6, 3),
      item("c", 6, 5, 6, 2),
    ];
    const once = compactVertically(layout);
    expect(hasOverlaps(once)).toBe(false);
    expect(compactVertically(once)).toEqual(once);
  });
});

describe("findFreeSlot", () => {
  it("places the first widget at the origin", () => {
    expect(findFreeSlot([], { w: 4, h: 2 })).toEqual({ x: 0, y: 0 });
  });

  it("fills the gap to the right of an existing widget", () => {
    expect(findFreeSlot([item("a", 0, 0, 4, 2)], { w: 4, h: 2 })).toEqual({
      x: 4,
      y: 0,
    });
  });

  it("moves to a new row when the top row is full", () => {
    const full = [item("a", 0, 0, 6, 2), item("b", 6, 0, 6, 2)];
    expect(findFreeSlot(full, { w: 4, h: 2 })).toEqual({ x: 0, y: 2 });
  });

  it("clamps an over-wide widget to the column count", () => {
    expect(findFreeSlot([], { w: 20, h: 2 })).toEqual({ x: 0, y: 0 });
  });
});

describe("moveWidget", () => {
  it("swaps two stacked widgets when one is dragged onto the other", () => {
    const layout = [item("a", 0, 0, 6, 2), item("b", 0, 2, 6, 2)];
    const result = moveWidget(layout, "b", { x: 0, y: 0 }, limits);
    expect(result.find((entry) => entry.id === "b")).toMatchObject({ y: 0 });
    expect(result.find((entry) => entry.id === "a")).toMatchObject({ y: 2 });
  });

  it("moves within a row without disturbing anything", () => {
    const layout = [item("a", 0, 0, 4, 2)];
    expect(moveWidget(layout, "a", { x: 8, y: 0 }, limits)[0]).toMatchObject({
      x: 8,
      y: 0,
    });
  });

  it("compacts a drop into empty space back against the top", () => {
    const layout = [item("a", 0, 0, 4, 2)];
    const result = moveWidget(layout, "a", { x: 4, y: 9 }, limits);
    expect(result[0]).toMatchObject({ x: 4, y: 0 });
  });

  it("ignores an unknown id", () => {
    const layout = [item("a", 0, 0, 4, 2)];
    expect(moveWidget(layout, "missing", { x: 4, y: 0 }, limits)).toEqual(
      layout,
    );
  });
});

describe("resizeWidget", () => {
  it("grows a widget and pushes its neighbour below down", () => {
    const layout = [item("a", 0, 0, 4, 2), item("b", 0, 2, 4, 2)];
    const result = resizeWidget(layout, "a", { w: 4, h: 4 }, limits);
    expect(result.find((entry) => entry.id === "a")).toMatchObject({ h: 4 });
    expect(result.find((entry) => entry.id === "b")).toMatchObject({ y: 4 });
  });

  it("pulls a neighbour back up when the widget shrinks", () => {
    const layout = [item("a", 0, 0, 4, 4), item("b", 0, 4, 4, 2)];
    const result = resizeWidget(layout, "a", { w: 4, h: 2 }, limits);
    expect(result.find((entry) => entry.id === "b")).toMatchObject({ y: 2 });
  });

  it("respects the kind's size envelope", () => {
    const layout = [item("a", 0, 0, 4, 2)];
    const result = resizeWidget(
      layout,
      "a",
      { w: 99, h: 99 },
      { minSize: { w: 2, h: 2 }, maxSize: { w: 6, h: 4 } },
    );
    expect(result[0]).toMatchObject({ w: 6, h: 4 });
  });
});

describe("layoutRowCount", () => {
  it("counts the rows the layout occupies", () => {
    expect(layoutRowCount([])).toBe(0);
    expect(layoutRowCount([item("a", 0, 0, 4, 2), item("b", 4, 3, 4, 3)])).toBe(
      6,
    );
  });
});
