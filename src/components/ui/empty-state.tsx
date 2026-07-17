import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
        default: "size-16 text-2xl [&_svg]:size-6",
        sm: "size-14 text-xl [&_svg]:size-5",
        xs: "size-14 text-xl [&_svg]:size-5",
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
  /** Lucide icon component. */
  icon?: LucideIcon;
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
  const Icon = icon;

  return (
    <Empty
      data-slot="empty-state"
      className={cn(
        "flex-none gap-3 rounded-lg p-0",
        align === "center"
          ? "items-center text-center"
          : "items-start text-left",
        bordered &&
          "rounded-lg border border-background-200 bg-background-50 px-6 py-16",
        className,
      )}
    >
      {Icon && (
        <EmptyMedia
          variant="default"
          className={cn(emptyStateIconVariants({ tone, size }))}
        >
          <Icon aria-hidden />
        </EmptyMedia>
      )}
      {(title || description) && (
        <EmptyHeader
          className={cn(
            "max-w-none gap-3",
            align === "start" && "items-start text-left",
          )}
        >
          {title && (
            <EmptyTitle className={cn(emptyStateTitleVariants({ size }))}>
              <h2>{title}</h2>
            </EmptyTitle>
          )}
          {description && (
            <EmptyDescription
              className={cn(emptyStateDescriptionVariants({ size }))}
            >
              <p>{description}</p>
            </EmptyDescription>
          )}
        </EmptyHeader>
      )}
      {action && (
        <EmptyContent
          className={cn(
            "max-w-none",
            align === "start" && "items-start text-left",
          )}
        >
          {action}
        </EmptyContent>
      )}
    </Empty>
  );
}
