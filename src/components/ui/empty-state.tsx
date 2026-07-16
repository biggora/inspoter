import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const emptyStateIconVariants = cva(
  "flex shrink-0 items-center justify-center rounded-2xl",
  {
    variants: {
      tone: {
        neutral: "bg-secondary-100 text-secondary-600",
        danger: "bg-primary-100 text-primary-600",
      },
      size: {
        default: "size-16 text-2xl",
        sm: "size-14 text-xl",
        xs: "size-14 text-xl",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "default",
    },
  },
);

const emptyStateTitleVariants = cva(
  "font-heading font-semibold text-foreground-900",
  {
    variants: {
      size: {
        default: "text-lg",
        sm: "text-base",
        xs: "text-base",
      },
    },
    defaultVariants: { size: "default" },
  },
);

const emptyStateDescriptionVariants = cva("", {
  variants: {
    size: {
      default: "max-w-sm text-sm text-foreground-500",
      sm: "max-w-sm text-xs text-foreground-500",
      xs: "text-xs text-foreground-400",
    },
  },
  defaultVariants: { size: "default" },
});

interface EmptyStateProps extends VariantProps<typeof emptyStateIconVariants> {
  /** RemixIcon class name, e.g. "ri-pulse-line". Omit to render without an icon well. */
  icon?: string;
  align?: "center" | "start";
  /** Wraps content in the standard card (border + background + padding). */
  bordered?: boolean;
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  tone,
  size = "default",
  align = "center",
  bordered = true,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col gap-3",
        align === "center"
          ? "items-center text-center"
          : "items-start text-left",
        bordered &&
          "rounded-lg border border-background-200 bg-background-50 px-6 py-16",
        className,
      )}
    >
      {icon && (
        <div className={cn(emptyStateIconVariants({ tone, size }))}>
          <i className={icon} aria-hidden />
        </div>
      )}
      {title && (
        <h2 className={cn(emptyStateTitleVariants({ size }))}>{title}</h2>
      )}
      {description && (
        <p className={cn(emptyStateDescriptionVariants({ size }))}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
