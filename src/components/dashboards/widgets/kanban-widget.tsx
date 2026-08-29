"use client";

import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { labelColorToHex } from "@/lib/label-color";
import { isLabelColor } from "@/lib/label-color";
import type { KanbanPayload } from "@/lib/dashboards/widget-payloads";
import { cn } from "@/lib/utils";

// A compact read-only slice of a board: one row per card, tinted with its
// column's colour so the status reads at a glance. Drag-and-drop and editing
// stay in the section — a 4×4 grid tile is not a place to move work around.

function columnHex(color: string): string {
  return isLabelColor(color) ? labelColorToHex(color) : "#616367";
}

export function KanbanWidget({ data }: { data: KanbanPayload }) {
  const t = useTranslations("dashboards");
  const format = useFormatter();

  if (data.boardName === null) {
    return (
      <p className="text-xs text-muted-foreground">{t("kanban.noBoard")}</p>
    );
  }
  if (data.cards.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("kanban.empty")}</p>;
  }

  const hidden = data.totalCount - data.cards.length;

  return (
    <div className="flex h-full flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {data.cards.map((card) => {
          const due = card.dueDate ? new Date(card.dueDate) : null;
          const overdue = card.isOverdue;
          return (
            <li key={card.id} className="min-w-0">
              <Link
                href="/kanban"
                className="flex items-center gap-2 rounded-md border border-[var(--border-default)] px-2 py-1.5 text-xs no-underline transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: columnHex(card.columnColor) }}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    card.isDone && "text-muted-foreground line-through",
                  )}
                >
                  {card.title}
                </span>
                {due && (
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      overdue ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {format.dateTime(due, { day: "2-digit", month: "2-digit" })}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("kanban.moreCount", { count: hidden })}
        </p>
      )}
    </div>
  );
}
