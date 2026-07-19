import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface PaginationProps {
  /** 1-based page number shown to the user. */
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Disables both buttons, e.g. while a page is loading. */
  disabled?: boolean;
  className?: string;
}

export function Pagination({
  page,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  disabled,
  className,
}: PaginationProps) {
  return (
    <div
      data-slot="pagination"
      className={cn("flex items-center justify-center gap-4", className)}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={!hasPrevious || disabled}
      >
        <Icon
          name="ri-arrow-left-s-line"
          aria-hidden
          data-icon="inline-start"
        />
        Назад
      </Button>
      <span className="text-sm text-muted-foreground">Страница {page}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={!hasNext || disabled}
      >
        Далее
        <Icon
          name="ri-arrow-right-s-line"
          aria-hidden
          data-icon="inline-end"
        />
      </Button>
    </div>
  );
}
