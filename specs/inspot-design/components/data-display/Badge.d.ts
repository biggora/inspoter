import * as React from "react";

/**
 * Status pill used for server/domain/log states.
 *
 * @startingPoint section="Data display" subtitle="Status pills & badges" viewport="700x120"
 */
export interface BadgeProps {
  /** Semantic tone. @default "neutral" */
  tone?: "accent" | "amber" | "red" | "primary" | "secondary" | "neutral";
  /** @default "md" */
  size?: "sm" | "md";
  /** Show a leading status dot. @default false */
  dot?: boolean;
  /** Pulse the dot (transitional / live states). @default false */
  pulse?: boolean;
  /** Remix Icon class shown before the label (alternative to dot). */
  icon?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Status pill used for server/domain/log states. `accent` = online/ok,
 * `amber` = degraded/warning, `red` = offline/error, `secondary` = idle/stopped.
 */
export function Badge(props: BadgeProps): React.JSX.Element;
