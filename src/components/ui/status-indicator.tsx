import { Badge } from "@/components/ui/badge";

// Single status indicator for every card surface (design.md §2.5): a badge whose
// leading dot inherits the variant colour via bg-current, so feature components
// never hardcode a state colour. `pulse` adds an expanding halo for live and
// transitional states only; reduced motion removes it (design.md §2.6).
export type StatusIndicatorVariant =
  "success" | "warning" | "critical" | "error" | "info" | "secondary";

export function StatusIndicator({
  variant,
  label,
  pulse = false,
  className,
}: {
  variant: StatusIndicatorVariant;
  label: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <Badge variant={variant} className={className}>
      <span className="relative flex size-1.5 shrink-0" aria-hidden="true">
        {pulse && (
          <span className="absolute inset-0 animate-status-ping rounded-full bg-current motion-reduce:animate-none" />
        )}
        <span className="relative size-1.5 rounded-full bg-current" />
      </span>
      {label}
    </Badge>
  );
}
