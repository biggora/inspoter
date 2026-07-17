import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  return (
    <div
      data-slot="page-header"
      className={cn("flex flex-col gap-4", className)}
    >
      {back &&
        ("href" in back ? (
          <Button
            render={<Link href={back.href} />}
            nativeButton={false}
            variant="ghost"
            size="sm"
            className="w-fit"
          >
            <ChevronLeft aria-hidden data-icon="inline-start" />
            {back.label}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={back.onClick}
            className="w-fit"
          >
            <ChevronLeft aria-hidden data-icon="inline-start" />
            {back.label}
          </Button>
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
