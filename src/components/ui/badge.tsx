import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 focus-visible:ring-0 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-[oklch(var(--primary-100))] text-[oklch(var(--primary-700))] [a]:hover:bg-[oklch(var(--primary-200))]",
        secondary:
          "bg-[oklch(var(--secondary-100))] text-[oklch(var(--secondary-700))] [a]:hover:bg-[oklch(var(--secondary-200))]",
        destructive:
          "border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)] [a]:hover:brightness-95",
        info: "border-[var(--info-border)] bg-[var(--info-bg)] text-[var(--info-text)] [a]:hover:brightness-95",
        success:
          "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)] [a]:hover:brightness-95",
        warning:
          "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)] [a]:hover:brightness-95",
        error:
          "border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)] [a]:hover:brightness-95",
        critical:
          "border-[var(--critical-border)] bg-[var(--critical-bg)] text-[var(--critical-text)] [a]:hover:brightness-95",
        outline:
          "border-[var(--border-default)] text-[var(--text-body)] [a]:hover:bg-[var(--surface-hover)] [a]:hover:text-[var(--text-secondary)]",
        ghost:
          "hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
