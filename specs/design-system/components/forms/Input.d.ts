import * as React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Field label rendered above the control. */
  label?: string;
  /** Remix Icon class shown inside the field, left. */
  leadingIcon?: string;
  /** Remix Icon class for a trailing action button (reveal, clear). */
  trailingIcon?: string;
  /** Click handler for the trailing action. */
  onTrailingClick?: () => void;
  /** Muted helper text below the field. */
  hint?: string;
  /** Error text; also turns the border to the primary/danger hue. */
  error?: string;
}

/**
 * Text input used for login, search, and settings forms. Focus ring is a
 * 1px terracotta glow. Compose the search variant with `leadingIcon="ri-search-line"`
 * and a trailing clear button.
 */
export function Input(props: InputProps): React.JSX.Element;
