"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// A step is a link where the page lives in the URL, so the operator can
// middle-click it, share it, and return to it from a detail page; it stays a
// callback where paging is client-held state (the mail client). Same union as
// `PageHeader.back` (shell/page-header.tsx).
type PaginationTarget = { href: string } | { onClick: () => void };

interface PaginationProps {
  /** 1-based page number shown to the user. */
  page: number;
  /** `null`/absent when there is no page in that direction. */
  previous?: PaginationTarget | null;
  next?: PaginationTarget | null;
  /** Disables both steps, e.g. while a page is loading. */
  disabled?: boolean;
  className?: string;
}

function Step({
  target,
  label,
  disabled,
  icon,
}: {
  target: PaginationTarget | null | undefined;
  label: string;
  disabled: boolean;
  icon: "previous" | "next";
}) {
  const glyph =
    icon === "previous" ? (
      <Icon name="ri-arrow-left-s-line" aria-hidden data-icon="inline-start" />
    ) : (
      <Icon name="ri-arrow-right-s-line" aria-hidden data-icon="inline-end" />
    );
  const content =
    icon === "previous" ? (
      <>
        {glyph}
        {label}
      </>
    ) : (
      <>
        {label}
        {glyph}
      </>
    );

  // A missing or disabled step renders a button, never a dead link — an
  // anchor without an href is not focusable and cannot express "disabled".
  if (!target || disabled) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        {content}
      </Button>
    );
  }

  if ("href" in target) {
    return (
      <Button
        render={<Link href={target.href} />}
        nativeButton={false}
        variant="outline"
        size="sm"
      >
        {content}
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={target.onClick}>
      {content}
    </Button>
  );
}

export function Pagination({
  page,
  previous,
  next,
  disabled,
  className,
}: PaginationProps) {
  const t = useTranslations("shell");

  // Nothing to navigate to in either direction — a lone "Page 1" is noise.
  if (!previous && !next) {
    return null;
  }

  return (
    <div
      data-slot="pagination"
      className={cn("flex items-center justify-center gap-4", className)}
    >
      <Step
        target={previous}
        label={t("paginationPrevious")}
        disabled={Boolean(disabled)}
        icon="previous"
      />
      <span className="text-sm text-muted-foreground">
        {t("paginationPage", { page })}
      </span>
      <Step
        target={next}
        label={t("paginationNext")}
        disabled={Boolean(disabled)}
        icon="next"
      />
    </div>
  );
}
