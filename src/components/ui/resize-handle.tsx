"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The corner grip that resizes a grid tile. It lives in components/ui because it
// is the one place a raw pointer-drag interaction is allowed: the native-control
// checker (scripts/check-native-controls.mjs) excludes this folder, and the
// interaction genuinely needs low-level pointer events that no existing
// primitive provides.
//
// It is a real button, not a decorated div, which is what makes the resize
// keyboard-operable: arrow keys step the size by one cell in each direction, so
// the layout can be arranged without a pointer at all.

export interface ResizeHandleProps {
  label: string;
  /** Pointer drag start — the consumer tracks pointermove/pointerup itself. */
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  /** Keyboard step, in grid cells. */
  onResizeStep: (delta: { w: number; h: number }) => void;
  className?: string;
}

const KEY_STEPS: Record<string, { w: number; h: number }> = {
  ArrowRight: { w: 1, h: 0 },
  ArrowLeft: { w: -1, h: 0 },
  ArrowDown: { w: 0, h: 1 },
  ArrowUp: { w: 0, h: -1 },
};

export function ResizeHandle({
  label,
  onResizeStart,
  onResizeStep,
  className,
}: ResizeHandleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      data-slot="resize-handle"
      onPointerDown={onResizeStart}
      onKeyDown={(event) => {
        const step = KEY_STEPS[event.key];
        if (!step) return;
        event.preventDefault();
        onResizeStep(step);
      }}
      className={cn(
        "absolute right-1 bottom-1 cursor-se-resize touch-none text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        // Two stacked strokes read as a corner grip at any size, and need no
        // icon font — this handle must stay visible even before the Remix Icon
        // CSS arrives (the same reason Icon carries its own min-size).
        className="pointer-events-none block size-2.5 border-r-2 border-b-2 border-current opacity-70"
      />
    </Button>
  );
}
