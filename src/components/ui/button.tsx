import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--action-primary)] text-[var(--text-on-accent)] hover:bg-[var(--action-primary-hover)]",
        outline:
          "border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] aria-expanded:bg-[var(--surface-hover)] aria-expanded:text-[var(--text-primary)]",
        secondary:
          "bg-[oklch(var(--secondary-100))] text-[var(--text-body)] hover:bg-[oklch(var(--secondary-200))] aria-expanded:bg-[oklch(var(--secondary-100))] aria-expanded:text-[var(--text-body)]",
        ghost:
          "hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] aria-expanded:bg-[var(--surface-hover)] aria-expanded:text-[var(--text-primary)]",
        destructive:
          "bg-[oklch(var(--primary-100))] text-[oklch(var(--primary-700))] hover:bg-[oklch(var(--primary-200))]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--control-md)] gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-[var(--control-sm)] gap-1 rounded-[var(--radius-lg)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[var(--control-sm)] gap-1 rounded-[var(--radius-lg)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[var(--control-lg)] gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-[var(--control-md)]",
        "icon-xs":
          "size-[var(--control-sm)] rounded-[var(--radius-lg)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-[var(--control-sm)] rounded-[var(--radius-lg)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-[var(--control-lg)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
