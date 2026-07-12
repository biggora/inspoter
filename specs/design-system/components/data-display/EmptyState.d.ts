import * as React from 'react';

export interface EmptyStateProps {
  /** Remix Icon class shown in the 64px well. */
  icon: string;
  /** Well tint: secondary (empty) · primary (error) · accent (all-clear). @default "secondary" */
  tone?: 'primary' | 'secondary' | 'accent';
  title?: string;
  description?: string;
  /** Optional action node (usually a <Button>). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Centered empty / error / not-found state. Convention: `secondary` well for
 * "nothing here", `primary` for load failures (+ a retry Button), `accent`
 * for "all systems normal".
 */
export function EmptyState(props: EmptyStateProps): React.JSX.Element;
