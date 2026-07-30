import { GRID_COLUMNS, type WidgetSize } from "@/lib/dashboards/widget-kinds";

// The dashboard grid engine: pure functions over rectangles, no React and no
// DOM. Both sides depend on it — the client turns a pointer drag into a new
// layout here and sends the result to PATCH /api/dashboards/:id/layout, and the
// service layer validates the incoming layout with hasOverlaps() from this same
// module. A move therefore cannot mean one thing in the browser and another in
// the database.
//
// Coordinates are grid cells: x/w run across GRID_COLUMNS columns, y/h down an
// unbounded row axis. y grows downward, so "below" means larger y.

export { GRID_COLUMNS };

/** Row height and gutter, in px — mirrored by --dashboard-* CSS variables. */
export const GRID_ROW_HEIGHT = 72;
export const GRID_GAP = 16;

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridItem extends GridRect {
  id: string;
}

export interface SizeLimits {
  minSize: WidgetSize;
  maxSize: WidgetSize;
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  if (Number.isNaN(rounded)) return min;
  return Math.min(max, Math.max(min, rounded));
}

/**
 * Forces a rectangle into a legal shape: integral, inside the column axis, at
 * or below y = 0, and within the kind's size envelope. Width is clamped before
 * x so a widget that is too wide shrinks instead of drifting left.
 */
export function clampRect(rect: GridRect, limits: SizeLimits): GridRect {
  const maxWidth = Math.min(limits.maxSize.w, GRID_COLUMNS);
  const w = clampInt(rect.w, Math.min(limits.minSize.w, maxWidth), maxWidth);
  const h = clampInt(rect.h, limits.minSize.h, limits.maxSize.h);
  return {
    w,
    h,
    x: clampInt(rect.x, 0, GRID_COLUMNS - w),
    y: Math.max(0, Math.round(rect.y) || 0),
  };
}

export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/** True when any two items share a cell — the layout invariant saveLayout enforces. */
export function hasOverlaps(items: GridItem[]): boolean {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (rectsOverlap(items[i], items[j])) return true;
    }
  }
  return false;
}

/** Reading order: top row first, then left to right, id as the tiebreaker. */
function byPosition(a: GridItem, b: GridItem): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  return a.id.localeCompare(b.id);
}

export function sortByPosition(items: GridItem[]): GridItem[] {
  return [...items].sort(byPosition);
}

/**
 * Pushes whatever the moved item now overlaps straight down, then whatever
 * those items overlap, and so on. `priority` is the item that keeps its
 * position — every collision is resolved by moving the *other* item, which is
 * what makes a drag feel like the dragged tile wins.
 *
 * Items are processed top-down so a chain of pushes settles in one pass: by the
 * time an item is examined, everything that could push it has already moved.
 */
export function resolveCollisions(
  items: GridItem[],
  priorityId: string,
): GridItem[] {
  const priority = items.find((item) => item.id === priorityId);
  if (!priority) return sortByPosition(items);

  // The priority item is placed first regardless of its y, so it is never the
  // one that yields; everything else follows in reading order.
  const rest = items
    .filter((item) => item.id !== priorityId)
    .sort(byPosition)
    .map((item) => ({ ...item }));

  const placed: GridItem[] = [{ ...priority }];
  for (const item of rest) {
    // Repeat until the item clears every already-placed rectangle: pushing it
    // below one neighbour can drop it onto the next.
    let moved = true;
    while (moved) {
      moved = false;
      for (const other of placed) {
        if (rectsOverlap(item, other)) {
          item.y = other.y + other.h;
          moved = true;
        }
      }
    }
    placed.push(item);
  }

  return sortByPosition(placed);
}

/**
 * Pulls every item as far up as it will go without colliding, so deleting or
 * moving a tile never leaves a hole above another one. Order matters: items are
 * compacted in reading order, so an item can only settle under items that have
 * already found their final row.
 */
export function compactVertically(items: GridItem[]): GridItem[] {
  const placed: GridItem[] = [];
  for (const item of sortByPosition(items)) {
    const candidate = { ...item, y: 0 };
    // Start at the top and walk down: each bump can drop the candidate onto an
    // item it had already cleared, so keep re-checking until nothing overlaps.
    let stable = false;
    while (!stable) {
      stable = true;
      for (const other of placed) {
        if (rectsOverlap(candidate, other)) {
          candidate.y = other.y + other.h;
          stable = false;
        }
      }
    }
    placed.push(candidate);
  }
  return sortByPosition(placed);
}

/**
 * The first cell, in reading order, where a w×h rectangle fits without
 * overlapping anything — where a newly added widget lands. Always succeeds: the
 * row axis is unbounded, so the search falls through to the row below the
 * lowest occupied one.
 */
export function findFreeSlot(
  items: GridItem[],
  size: WidgetSize,
): { x: number; y: number } {
  const w = Math.min(size.w, GRID_COLUMNS);
  const h = Math.max(1, size.h);
  const bottom = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);

  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x <= GRID_COLUMNS - w; x += 1) {
      const candidate = { x, y, w, h };
      if (!items.some((item) => rectsOverlap(candidate, item))) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: bottom };
}

/**
 * Moves one item to (x, y) and returns the whole resulting layout: the target
 * position is clamped, collisions are pushed down, and the result is compacted
 * so nothing floats. The return value is exactly the payload the layout
 * endpoint accepts.
 */
export function moveWidget(
  items: GridItem[],
  id: string,
  target: { x: number; y: number },
  limits: SizeLimits,
): GridItem[] {
  const current = items.find((item) => item.id === id);
  if (!current) return sortByPosition(items);

  const rect = clampRect({ ...current, x: target.x, y: target.y }, limits);
  const next = items.map((item) =>
    item.id === id ? { ...item, ...rect } : item,
  );
  return compactVertically(resolveCollisions(next, id));
}

/**
 * Resizes one item and returns the whole resulting layout. Same contract as
 * moveWidget: clamp, push, compact.
 */
export function resizeWidget(
  items: GridItem[],
  id: string,
  size: WidgetSize,
  limits: SizeLimits,
): GridItem[] {
  const current = items.find((item) => item.id === id);
  if (!current) return sortByPosition(items);

  const rect = clampRect({ ...current, w: size.w, h: size.h }, limits);
  const next = items.map((item) =>
    item.id === id ? { ...item, ...rect } : item,
  );
  return compactVertically(resolveCollisions(next, id));
}

/** Rows the layout occupies — the grid renders at least this many. */
export function layoutRowCount(items: GridItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}
