import * as React from 'react';

export interface SegmentOption {
  value: string;
  label: string;
  /** Optional Remix Icon class. */
  icon?: string;
}

export interface SegmentedControlProps {
  options: SegmentOption[];
  /** Currently selected value. */
  value: string;
  onChange?: (value: string) => void;
  /** "pill" = rounded time-range switch · "underline" = page tabs. @default "pill" */
  variant?: 'pill' | 'underline';
  className?: string;
}

/**
 * Single-select control. Use `pill` for compact filters (time ranges,
 * refresh intervals) and `underline` for switching page sections (Settings).
 */
export function SegmentedControl(props: SegmentedControlProps): React.JSX.Element;
