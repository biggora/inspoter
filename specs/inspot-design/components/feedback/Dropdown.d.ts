import * as React from "react";

export interface DropdownProps {
  /** The clickable trigger node (IconButton, Button, avatar…). */
  trigger: React.ReactNode;
  /** Menu edge alignment. @default "left" */
  align?: "left" | "right";
  /** DropdownItem / DropdownSep / DropdownLabel children. */
  children?: React.ReactNode;
  className?: string;
}

export interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Remix Icon class. */
  icon?: string;
  /** Highlighted/selected row. @default false */
  active?: boolean;
  /** Terracotta destructive styling (e.g. logout, delete). @default false */
  danger?: boolean;
  children?: React.ReactNode;
}

/**
 * Anchored menu (topbar user menu, log filters, row actions). Self-managed open
 * state; closes on outside-click and selection. Build rows with DropdownItem,
 * group with DropdownLabel, divide with DropdownSep.
 */
export function Dropdown(props: DropdownProps): React.JSX.Element;
export function DropdownItem(props: DropdownItemProps): React.JSX.Element;
export function DropdownSep(): React.JSX.Element;
export function DropdownLabel(props: {
  children?: React.ReactNode;
}): React.JSX.Element;
