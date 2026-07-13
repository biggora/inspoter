import * as React from "react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Remix Icon class, e.g. "ri-moon-line". Required. */
  icon: string;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Add a 1px resting border (menu-trigger look). @default false */
  bordered?: boolean;
}

/**
 * Square icon-only button. Used across the topbar (theme toggle, menu),
 * table row actions, and dropdown triggers. Always pass `aria-label`.
 */
export function IconButton(props: IconButtonProps): React.JSX.Element;
