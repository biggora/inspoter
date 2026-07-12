import * as React from 'react';

export interface ToastProps {
  /** @default "success" */
  variant?: 'success' | 'error' | 'info';
  /** Override the default variant icon (Remix Icon class). */
  icon?: string;
  /** Position fixed top-right. @default true */
  fixed?: boolean;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Transient notification, slides in from the right. Success = teal tint,
 * error = terracotta tint, info = sand. Render it conditionally and clear on a
 * ~3.5s timer (the app convention). Flat — no shadow.
 */
export function Toast(props: ToastProps): React.JSX.Element;
