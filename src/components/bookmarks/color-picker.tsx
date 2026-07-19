"use client";

import type { KeyboardEvent } from "react";
import { useId } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/ui/icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { bookmarkColorTokens } from "@/lib/validation/bookmarks";

// AC-BM-015..018: accessible accent-color picker for a bookmark's icon tile.
// Limited to the three brand color families (bookmarkColorTokens) plus a
// "no color" option that clears the field back to the deterministic
// hash-based fallback in bookmark-icon.tsx. Base UI ToggleGroup owns the
// roving focus contract, while each swatch keeps a non-color-only accessible
// name (Russian color name, not just "Цвет 1").
const SWATCHES: Array<{
  token: (typeof bookmarkColorTokens)[number];
  labelKey: "colorPrimary" | "colorAccent" | "colorSecondary";
  dotClassName: string;
}> = [
  { token: "primary", labelKey: "colorPrimary", dotClassName: "bg-primary-500" },
  { token: "accent", labelKey: "colorAccent", dotClassName: "bg-accent-500" },
  {
    token: "secondary",
    labelKey: "colorSecondary",
    dotClassName: "bg-secondary-500",
  },
];

const DEFAULT_TOKEN = "__default__";

interface ColorPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const t = useTranslations("bookmarks");
  const groupLabelId = useId();
  const noneOption = { token: null, label: t("colorNone") } as const;
  const options: ReadonlyArray<{
    token: string | null;
    label: string;
    dotClassName?: string;
  }> = [
    noneOption,
    ...SWATCHES.map((swatch) => ({
      token: swatch.token,
      label: t(swatch.labelKey),
      dotClassName: swatch.dotClassName,
    })),
  ];
  const groupLabel = label ?? t("colorGroupLabel");

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowDown" &&
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowUp"
    ) {
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-color-token]",
    );
    const currentToken = target?.dataset.colorToken;
    const currentIndex = options.findIndex(
      (option) => (option.token ?? DEFAULT_TOKEN) === currentToken,
    );
    if (currentIndex === -1) return;
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      (currentIndex + direction + options.length) % options.length;
    onChange(options[nextIndex].token);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={groupLabelId} className="text-sm font-medium text-foreground">
        {groupLabel}
      </span>
      <ToggleGroup
        value={[value ?? DEFAULT_TOKEN]}
        onValueChange={(nextValue) => {
          const selected = nextValue[0];
          if (!selected) return;
          onChange(selected === DEFAULT_TOKEN ? null : selected);
        }}
        loopFocus
        aria-labelledby={groupLabelId}
        onKeyDown={handleKeyDown}
        className="flex-wrap"
      >
        {options.map((option) => {
          const checked = value === option.token;
          const itemValue = option.token ?? DEFAULT_TOKEN;
          return (
            <ToggleGroupItem
              key={itemValue}
              value={itemValue}
              data-color-token={itemValue}
              aria-label={option.label}
              variant="outline"
              className={cn(
                "size-8 min-w-8 rounded-full border-2 p-0",
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
                  <Icon name="ri-forbid-line" />
                </span>
              )}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
