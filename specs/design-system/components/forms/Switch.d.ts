import * as React from 'react';

export interface SwitchProps {
  /** On/off state. @default false */
  checked?: boolean;
  /** Called with the next boolean when toggled. */
  onChange?: (next: boolean) => void;
  /** @default false */
  disabled?: boolean;
  /** Row title. When set (with/without description) renders a full settings row. */
  label?: string;
  /** Muted description under the title. */
  description?: string;
  className?: string;
}

/**
 * Toggle switch (44×24). Teal when on. With `label`/`description` it renders the
 * standard Settings row (text left, switch right); without them it's a bare toggle.
 */
export function Switch(props: SwitchProps): React.JSX.Element;
