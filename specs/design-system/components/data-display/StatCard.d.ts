import * as React from 'react';

/**
 * Dashboard KPI tile.
 *
 * @startingPoint section="Data display" subtitle="Dashboard KPI stat tile" viewport="360x150"
 */
export interface StatCardProps {
  /** Remix Icon class for the tinted tile. */
  icon: string;
  /** Uppercase KPI label. */
  label: string;
  /** The primary number (string or number). */
  value: React.ReactNode;
  /** Optional denominator rendered muted as "/sub" (e.g. total). */
  sub?: React.ReactNode;
  /** Small caption under the number. */
  subtitle?: string;
  /** Icon-tile + accent tone. @default "primary" */
  tone?: 'primary' | 'accent' | 'secondary' | 'amber' | 'red';
  /** Makes the tile a button (dashboards navigate on click). */
  onClick?: () => void;
  /** Extra content slot below the number (dot legends, <ProgressBar/>). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Dashboard KPI tile. `value` is the big Plus-Jakarta number; put a total in
 * `sub` to render "12/16". Use `children` for the dot legend or a progress bar.
 */
export function StatCard(props: StatCardProps): React.JSX.Element;
