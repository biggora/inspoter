import * as React from "react";

export interface ModalProps {
  /** Controls visibility. */
  open: boolean;
  /** Called on scrim click, Escape, or close button. */
  onClose?: () => void;
  /** Header title. */
  title: string;
  /** @default "md" (448px) — sm 360 · lg 560 */
  size?: "sm" | "md" | "lg";
  /** Footer action row (usually cancel + confirm Buttons). */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Centered dialog: scrim + header (title/close) + body + optional footer.
 * Opens 10vh from the top, scale-in animation, modal shadow. Wire the footer
 * with a ghost "Отмена" and a primary confirm.
 */
export function Modal(props: ModalProps): React.JSX.Element | null;
