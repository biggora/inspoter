"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "next-intl";

import type { ClockConfig } from "@/lib/validation/dashboards";

// The clock is the one widget with no server payload at all: the browser already
// knows the time.
//
// The tick is modelled as an external store rather than an interval that calls
// setState, which is what the clock actually is — a subscription to the system
// clock. The snapshot is the current whole second, so a re-render happens on
// second boundaries and not on every poll. On the server (and during hydration)
// the snapshot is null and the widget renders nothing: a server-rendered time is
// already wrong by the time it reaches the browser.

const TICK_POLL_MS = 250;

function subscribeToSecond(onStoreChange: () => void): () => void {
  const timer = setInterval(onStoreChange, TICK_POLL_MS);
  return () => clearInterval(timer);
}

function currentSecond(): number {
  return Math.floor(Date.now() / 1000);
}

function useCurrentTime(): Date | null {
  const second = useSyncExternalStore(
    subscribeToSecond,
    currentSecond,
    () => null,
  );
  return second === null ? null : new Date(second * 1000);
}

export function ClockWidget({ config }: { config: ClockConfig }) {
  const locale = useLocale();
  const now = useCurrentTime();

  if (!now) return null;

  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    ...(config.showSeconds ? { second: "2-digit" } : {}),
    hour12: config.format === "12h",
    ...(config.timeZone ? { timeZone: config.timeZone } : {}),
  };
  const dateFormat: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(config.timeZone ? { timeZone: config.timeZone } : {}),
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p
        className="font-heading text-3xl leading-none font-semibold tabular-nums text-foreground-900"
        // The minute is the unit that matters; announcing every tick would make
        // a screen reader unusable while this tile is on screen.
        aria-live="off"
      >
        {new Intl.DateTimeFormat(locale, timeFormat).format(now)}
      </p>
      {config.showDate && (
        <p className="text-xs text-muted-foreground">
          {new Intl.DateTimeFormat(locale, dateFormat).format(now)}
        </p>
      )}
      {config.timeZone && (
        <p className="text-[0.7rem] text-muted-foreground">{config.timeZone}</p>
      )}
    </div>
  );
}
