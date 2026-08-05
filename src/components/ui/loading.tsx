"use client";

/**
 * The two loading wrappers every surface uses (design.md §4.4):
 *
 *  - `LoadingRegion` — initial load. Wraps a layout-matched skeleton and is the
 *    single place that carries `aria-busy` plus the announced status text, so
 *    call sites never have to remember either.
 *  - `LoadingOverlay` — a refresh over data that is already on screen
 *    (pagination, filter change, "Refresh"). The confirmed content stays put
 *    and a spinner sits above it, instead of the table collapsing back into a
 *    skeleton.
 *
 * Skeleton shapes live in src/components/ui/skeletons.tsx.
 */
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface LoadingRegionProps extends React.ComponentProps<"div"> {
  /** Announced instead of the generic "Loading…" when the surface has a more precise wording. */
  label?: string;
}

export function LoadingRegion({
  label,
  className,
  children,
  ...props
}: LoadingRegionProps) {
  const t = useTranslations("ui");

  return (
    <div
      data-slot="loading-region"
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={className}
      {...props}
    >
      <span className="sr-only">{label ?? t("loading")}</span>
      {children}
    </div>
  );
}

interface LoadingOverlayProps extends React.ComponentProps<"div"> {
  busy: boolean;
  label?: string;
}

export function LoadingOverlay({
  busy,
  label,
  className,
  children,
  ...props
}: LoadingOverlayProps) {
  const t = useTranslations("ui");

  return (
    <div
      data-slot="loading-overlay"
      aria-busy={busy || undefined}
      className={cn("relative", className)}
      {...props}
    >
      {children}
      {busy && (
        <div
          role="status"
          aria-live="polite"
          // The confirmed content stays readable underneath — the veil only
          // signals that it is being replaced, it does not hide it.
          className="absolute inset-0 z-10 flex items-start justify-center bg-[var(--surface-app)]/60 pt-8 backdrop-blur-[1px]"
        >
          <span className="sr-only">{label ?? t("loading")}</span>
          <Spinner aria-hidden className="text-xl text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
