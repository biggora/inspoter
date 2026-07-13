import * as React from "react";

export interface ProgressBarProps {
  /** 0–100. Clamped. */
  value: number;
  /** Fill colour. @default "accent" */
  tone?: "primary" | "accent" | "secondary" | "amber" | "red";
  /** Track height. @default "sm" */
  size?: "sm" | "md";
  /** Auto-colour by load: green <60, amber <85, red ≥85. Overrides `tone`. @default false */
  auto?: boolean;
  className?: string;
}

/**
 * Thin utilisation meter (CPU, RAM, disk, mail-read progress). Set `auto`
 * for resource bars so the colour tracks severity.
 */
export function ProgressBar(props: ProgressBarProps): React.JSX.Element;
