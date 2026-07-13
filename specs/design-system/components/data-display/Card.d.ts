import * as React from "react";

/**
 * The surface primitive — border-defined, 12px radius, flat (no shadow).
 *
 * @startingPoint section="Data display" subtitle="Bordered surface / widget panel" viewport="700x220"
 */
export interface CardProps {
  /** When set, renders the header row (title + optional icon/action) above a padded body. */
  title?: string;
  /** Node rendered left of the title — typically an <IconTile>. */
  icon?: React.ReactNode;
  /** Node rendered at the right of the header — a link or button. */
  action?: React.ReactNode;
  /** Hover border highlight. @default false */
  hover?: boolean;
  /** Makes the whole card a button. */
  onClick?: () => void;
  /** Body inset when no `title`. @default "md" (20px) */
  padding?: "none" | "sm" | "md";
  children?: React.ReactNode;
  className?: string;
}

/**
 * The surface primitive — every widget/panel is a Card. With `title` you get
 * the header/body split; without it, a plain padded container.
 */
export function Card(props: CardProps): React.JSX.Element;
