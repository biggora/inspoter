import * as React from 'react';

export interface IconTileProps {
  /** Remix Icon class. Required. */
  icon: string;
  /** Tint. @default "secondary" */
  tone?: 'primary' | 'accent' | 'secondary' | 'amber' | 'red' | 'neutral';
  /** sm 28 · md 32 · lg 36 · xl 64 (empty-state well). @default "md" */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

/**
 * Tinted rounded icon square — the recurring motif in front of widget titles,
 * list items and stat cards. `secondary` (sand) is the neutral default;
 * pick a tone that matches the section's meaning.
 */
export function IconTile(props: IconTileProps): React.JSX.Element;
