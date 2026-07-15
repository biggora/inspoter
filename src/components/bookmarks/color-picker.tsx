"use client";

import type { KeyboardEvent } from "react";
import { useId, useRef } from "react";
import { Ban } from "lucide-react";

import { cn } from "@/lib/utils";
import { bookmarkColorTokens } from "@/lib/validation/bookmarks";

// AC-BM-015..018: accessible accent-color picker for a bookmark's icon tile.
// Limited to the three brand color families (bookmarkColorTokens) plus a
// "no color" option that clears the field back to the deterministic
// hash-based fallback in bookmark-icon.tsx. Each swatch is a real <button>
// with a non-color-only accessible name (Russian color name, not just
// "Цвет 1") and a roving tabIndex so arrow keys move focus within the
// role="radiogroup" (native Tab+Enter/Space also work since these are
// buttons).
const SWATCHES: Array<{
  token: (typeof bookmarkColorTokens)[number];
  label: string;
  dotClassName: string;
}> = [
  { token: "primary", label: "Терракотовый", dotClassName: "bg-primary-500" },
  { token: "accent", label: "Бирюзовый", dotClassName: "bg-accent-500" },
  { token: "secondary", label: "Оливковый", dotClassName: "bg-secondary-500" },
];

const NONE_OPTION = { token: null, label: "Без цвета" } as const;

interface ColorPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
}

export function ColorPicker({
  value,
  onChange,
  label = "Цвет",
}: ColorPickerProps) {
  const groupLabelId = useId();
  const options: ReadonlyArray<{
    token: string | null;
    label: string;
    dotClassName?: string;
  }> = [NONE_OPTION, ...SWATCHES];
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowDown" &&
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowUp"
    ) {
      return;
    }
    event.preventDefault();
    const currentIndex = options.findIndex((option) => option.token === value);
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      (currentIndex + direction + options.length) % options.length;
    onChange(options[nextIndex].token);
    // Roving tabindex requires moving real DOM focus too — updating
    // aria-checked/tabIndex alone leaves focus stranded on the previous
    // (now tabIndex=-1) button.
    buttonRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={groupLabelId} className="text-sm font-medium text-foreground">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={groupLabelId}
        onKeyDown={handleKeyDown}
        className="flex flex-wrap gap-2"
      >
        {options.map((option, index) => {
          const checked = value === option.token;
          return (
            <button
              key={option.token ?? "none"}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(option.token)}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border-2 outline-none transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                checked ? "border-foreground-900" : "border-transparent",
              )}
            >
              {option.dotClassName ? (
                <span
                  aria-hidden
                  className={cn(
                    "size-6 rounded-full border border-background-300",
                    option.dotClassName,
                  )}
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-6 items-center justify-center rounded-full border border-background-300 bg-background-50 text-foreground-400"
                >
                  <Ban className="size-4" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
