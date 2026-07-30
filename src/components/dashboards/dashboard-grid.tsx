"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROW_HEIGHT,
  moveWidget,
  resizeWidget,
  sortByPosition,
  type GridItem,
} from "@/lib/dashboards/grid";
import { specFor } from "@/lib/dashboards/widget-kinds";
import type { DashboardWidgetKind } from "@/generated/prisma/client";

// The grid itself: placement, dragging, and resizing. It owns no data — the
// caller passes the current layout and receives the proposed next one, computed
// by the pure engine in src/lib/dashboards/grid.ts.
//
// Placement is plain CSS Grid, expressed as custom properties consumed by an
// `sm:`-only rule. That indirection is what makes the phone layout work: inline
// grid-column/grid-row would win over any media query, so below `sm` the tiles
// would keep their desktop columns instead of stacking.
//
// Cell width is measured for exactly one purpose: turning a pointer delta in
// pixels into a delta in grid cells.

export interface DashboardGridEntry extends GridItem {
  kind: DashboardWidgetKind;
  /** Tile name, used for the drag handle's accessible label. */
  title: string;
  /**
   * Renders the tile. Receives the ready-made drag handle (null in view mode)
   * to place in its header — the grid builds that button itself rather than
   * handing out the dnd props, so the ref never travels through a props object.
   */
  render: (dragHandle: React.ReactNode) => React.ReactNode;
}

interface ResizeHandlers {
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onResizeStep: (delta: { w: number; h: number }) => void;
}

interface DashboardGridProps {
  items: DashboardGridEntry[];
  editable: boolean;
  onLayoutChange: (items: GridItem[]) => void;
  /** Renders the resize grip for one tile; only called while editable. */
  renderResizeHandle?: (
    item: DashboardGridEntry,
    handlers: ResizeHandlers,
  ) => React.ReactNode;
}

function toGridItems(entries: DashboardGridEntry[]): GridItem[] {
  return entries.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
}

export function DashboardGrid({
  items,
  editable,
  onLayoutChange,
  renderResizeHandle,
}: DashboardGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [cellWidth, setCellWidth] = useState(0);

  // One column plus its share of the gutter. Re-measured on resize, because the
  // sidebar collapses and the viewport changes.
  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      const columnWidth =
        (width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
      setCellWidth(columnWidth + GRID_GAP);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 4px activation distance, same as the Bookmarks board: an ordinary click on
  // the tile's menu must not arm a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const rowStep = GRID_ROW_HEIGHT + GRID_GAP;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      if (!cellWidth || (delta.x === 0 && delta.y === 0)) return;
      const current = items.find((item) => item.id === active.id);
      if (!current) return;

      onLayoutChange(
        moveWidget(
          toGridItems(items),
          current.id,
          {
            x: current.x + Math.round(delta.x / cellWidth),
            y: current.y + Math.round(delta.y / rowStep),
          },
          specFor(current.kind),
        ),
      );
    },
    [cellWidth, items, onLayoutChange, rowStep],
  );

  const applyResize = useCallback(
    (item: DashboardGridEntry, size: { w: number; h: number }) => {
      onLayoutChange(
        resizeWidget(toGridItems(items), item.id, size, specFor(item.kind)),
      );
    },
    [items, onLayoutChange],
  );

  // Pointer resize: the grip captures the pointer and the tile follows the
  // cursor, one commit per crossed cell boundary. Every step goes through the
  // same resizeWidget() the keyboard path uses, so a drag can never produce a
  // layout the arrow keys couldn't.
  const startPointerResize = useCallback(
    (
      item: DashboardGridEntry,
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      if (!cellWidth) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startY = event.clientY;
      let lastW = item.w;
      let lastH = item.h;

      const onMove = (moveEvent: PointerEvent) => {
        const w = item.w + Math.round((moveEvent.clientX - startX) / cellWidth);
        const h = item.h + Math.round((moveEvent.clientY - startY) / rowStep);
        if (w === lastW && h === lastH) return;
        lastW = w;
        lastH = h;
        applyResize(item, { w, h });
      };
      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [applyResize, cellWidth, rowStep],
  );

  // Reading order is the DOM order, which is also the order the single-column
  // phone layout shows and the order the keyboard tabs through.
  const ordered = sortByPosition(toGridItems(items)).map((placed) =>
    items.find((item) => item.id === placed.id)!,
  );

  return (
    <DndContext id="dashboard-grid" sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        ref={gridRef}
        data-slot="dashboard-grid"
        data-editable={editable ? "true" : "false"}
        className="grid grid-cols-1 gap-4 sm:auto-rows-[var(--dashboard-row-height)] sm:grid-cols-12"
        style={
          {
            "--dashboard-row-height": `${GRID_ROW_HEIGHT}px`,
          } as React.CSSProperties
        }
      >
        {ordered.map((item) => (
          <GridTile
            key={item.id}
            item={item}
            editable={editable}
            renderResizeHandle={renderResizeHandle}
            onResizeStart={(event) => startPointerResize(item, event)}
            onResizeStep={(delta) =>
              applyResize(item, { w: item.w + delta.w, h: item.h + delta.h })
            }
          />
        ))}
      </div>
    </DndContext>
  );
}

function GridTile({
  item,
  editable,
  renderResizeHandle,
  onResizeStart,
  onResizeStep,
}: {
  item: DashboardGridEntry;
  editable: boolean;
  renderResizeHandle: DashboardGridProps["renderResizeHandle"];
} & ResizeHandlers) {
  const t = useTranslations("dashboards");
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    isDragging,
  } = useDraggable({ id: item.id, disabled: !editable });

  return (
    <div
      ref={setNodeRef}
      data-slot="dashboard-grid-item"
      data-widget-id={item.id}
      data-widget-kind={item.kind}
      data-dragging={isDragging ? "true" : undefined}
      style={
        {
          "--tile-x": item.x + 1,
          "--tile-y": item.y + 1,
          "--tile-w": item.w,
          "--tile-h": item.h,
          // The dragged tile follows the pointer; the rest stay put until the
          // drop, when the engine recomputes the whole layout at once.
          transform: transform
            ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
            : undefined,
        } as React.CSSProperties
      }
      className={cn(
        "relative min-h-36 sm:min-h-0",
        "sm:[grid-area:var(--tile-y)/var(--tile-x)/span_var(--tile-h)/span_var(--tile-w)]",
        isDragging && "z-20 opacity-90 shadow-lg",
      )}
    >
      {item.render(
        editable ? (
          <Button
            ref={setActivatorNodeRef}
            type="button"
            variant="ghost"
            size="icon-xs"
            {...attributes}
            {...listeners}
            aria-label={t("dragHandleLabel", { widget: item.title })}
            className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
          >
            <Icon name="ri-draggable" aria-hidden />
          </Button>
        ) : null,
      )}
      {editable && renderResizeHandle?.(item, { onResizeStart, onResizeStep })}
    </div>
  );
}
