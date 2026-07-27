/**
 * Layout-matched skeleton presets (design.md §4.4: initial loading is a
 * skeleton shaped like the real content, never a spinner replacing the whole
 * area). Every preset is built from the `Skeleton` primitive, so
 * `motion-reduce:animate-none` and the sunken surface token come for free.
 *
 * These cover the three shapes the product actually repeats — a table, a grid
 * of metric cards, and a list of rows. A surface whose loading shape is
 * genuinely one-of-a-kind (the mail three-pane, the bookmarks board) keeps its
 * own markup; forcing it through a preset would only add props nobody reuses.
 *
 * Wrap any of these in `LoadingRegion` (src/components/ui/loading.tsx) so the
 * region carries `aria-busy` and an announced status text.
 */
import { CardGrid } from "@/components/shell/card-grid";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function times(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/** Title (+ optional description and action buttons) above a page's content. */
export function PageHeaderSkeleton({
  description = false,
  actions = 0,
  className,
}: {
  description?: boolean;
  actions?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36" />
        {description && <Skeleton className="h-4 w-56" />}
      </div>
      {actions > 0 && (
        <div className="flex shrink-0 gap-2">
          {times(actions).map((action) => (
            <Skeleton key={action} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Rows of a data table — logs, activity, alerts, every settings listing. */
export function TableSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {times(rows).map((row) => (
        <Skeleton key={row} className="h-8 w-full" />
      ))}
    </div>
  );
}

/** Grid of metric cards — servers and hosting inventories. */
export function CardGridSkeleton({
  cards = 6,
  metricRows = 5,
  footerActions = 2,
  columns,
  className,
}: {
  cards?: number;
  metricRows?: number;
  footerActions?: number;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <CardGrid columns={columns} className={className}>
      {times(cards).map((card) => (
        <Card key={card} size="sm" className="animate-fade-in">
          <CardHeader className="border-b">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <CardAction>
              <Skeleton className="h-6 w-20 rounded-full" />
            </CardAction>
          </CardHeader>
          {metricRows > 0 && (
            <CardContent className="flex flex-col gap-2">
              {times(metricRows).map((metric) => (
                <div key={metric} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </CardContent>
          )}
          {footerActions > 0 && (
            <CardFooter className="gap-2">
              {times(footerActions).map((action) => (
                <Skeleton key={action} className="h-7 w-16 rounded-lg" />
              ))}
            </CardFooter>
          )}
        </Card>
      ))}
    </CardGrid>
  );
}

/**
 * Rows of a scrollable list — the mail message list, the message timeline.
 * `dividers` switches from the gapped stack used inside cards to the
 * border-separated rows used by the mail/messages panes.
 */
export function ListSkeleton({
  rows = 6,
  avatar = false,
  dividers = false,
  trailing = false,
  className,
}: {
  rows?: number;
  avatar?: boolean;
  dividers?: boolean;
  /** Right-aligned meta column, e.g. the mail list's timestamp. */
  trailing?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", !dividers && "gap-3", className)}>
      {times(rows).map((row) => (
        <div
          key={row}
          className={cn(
            "flex items-center gap-3",
            dividers && "border-b border-background-100 px-4 py-3",
          )}
        >
          {avatar && <Skeleton className="size-8 shrink-0 rounded-full" />}
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-full max-w-56" />
          </div>
          {trailing && <Skeleton className="h-3 w-10 shrink-0" />}
        </div>
      ))}
    </div>
  );
}

/** Labelled form fields inside a settings card or a detail pane. */
export function FormSkeleton({
  fields = 3,
  action = true,
  className,
}: {
  fields?: number;
  action?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {times(fields).map((field) => (
        <div key={field} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      {action && <Skeleton className="h-9 w-32 rounded-lg" />}
    </div>
  );
}
