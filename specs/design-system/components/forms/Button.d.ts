import * as React from 'react';

/**
 * Inspot action button. Terracotta `primary` for the single main action per view,
 * `secondary` outline for supporting actions, `ghost` for toolbar/inline actions.
 *
 * @startingPoint section="Forms" subtitle="Primary / secondary / ghost action buttons" viewport="700x120"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "primary" */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Control height. @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Remix Icon class shown before the label, e.g. "ri-add-line". */
  icon?: string;
  /** Remix Icon class shown after the label, e.g. "ri-arrow-right-line". */
  iconRight?: string;
  /** Stretch to full width of the container. @default false */
  block?: boolean;
  /** Swap the leading icon for a spinner and disable. @default false */
  loading?: boolean;
  children?: React.ReactNode;
}

/**
 * Inspot action button.
 */
export function Button(props: ButtonProps): React.JSX.Element;
