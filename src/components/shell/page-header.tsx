import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderBack =
  { href: string; label: string } | { onClick: () => void; label: string };

interface PageHeaderProps {
  title?: string; // optional — some pages use only `back` (e.g. service detail)
  description?: ReactNode; // always wrapped in <p className="text-sm text-muted-foreground">
  actions?: ReactNode; // one Button or a Fragment of several — rendered right-aligned
  back?: PageHeaderBack; // back link/button rendered above the title row
  className?: string;
  children?: ReactNode; // secondary row (search/filters) rendered below the title row
}

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
  children,
}: PageHeaderProps) {
  const backClassName =
    "inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground";
  return (
    <div
      data-slot="page-header"
      className={cn("flex flex-col gap-4", className)}
    >
      {back &&
        ("href" in back ? (
          <Link href={back.href} className={backClassName}>
            <ChevronLeft aria-hidden className="size-4" />
            {back.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={back.onClick}
            className={backClassName}
          >
            <ChevronLeft aria-hidden className="size-4" />
            {back.label}
          </button>
        ))}
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4">
          {title && (
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground">{title}</h1>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          )}
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
