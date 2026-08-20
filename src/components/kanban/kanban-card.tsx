"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { LabelChip } from "@/components/ui/label-chip";
import { KANBAN_LINK_ICONS, kanbanLinkHref } from "@/lib/kanban/link-targets";
import type { KanbanCardDetail } from "@/lib/services/kanban";
import { cn } from "@/lib/utils";

// Priority is a tinted badge rather than a colored bar: the board already uses
// the column dot for status, and a second colored stripe would compete with it.
const PRIORITY_CLASS: Record<string, string> = {
  LOW: "bg-background-100 text-foreground-500",
  MEDIUM: "bg-secondary-100 text-secondary-700",
  HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  URGENT: "bg-primary-100 text-primary-700",
};

interface KanbanCardProps {
  card: KanbanCardDetail;
  dragDisabled: boolean;
  onOpen: () => void;
}

export function KanbanCard({ card, dragDisabled, onOpen }: KanbanCardProps) {
  const t = useTranslations("kanban");
  const format = useFormatter();

  // Reorder ownership (`onDragEnd`) lives in kanban-board-view.tsx; this
  // component only registers as a sortable item. `disabled: dragDisabled`
  // (true while a filter is active) makes dnd-kit drop both
  // `attributes["aria-disabled"]` and `listeners`, so the handle below becomes
  // inert by pointer AND keyboard automatically.
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: "card", columnId: card.columnId },
    disabled: dragDisabled,
  });

  const due = card.dueDate ? new Date(card.dueDate) : null;
  const overdue = card.isOverdue;
  const dueText = due
    ? format.dateTime(due, { day: "2-digit", month: "short" })
    : null;

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={card.title}
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border border-background-200 bg-background-50 p-3 transition-colors hover:border-background-300",
        isDragging && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onOpen}
          aria-label={t("openCardLabel", { title: card.title })}
          className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-left text-sm font-medium text-foreground-900 hover:bg-transparent hover:text-primary-600"
        >
          <span
            className={cn(
              "min-w-0",
              card.completedAt !== null &&
                "text-foreground-500 line-through decoration-1",
            )}
          >
            {card.title}
          </span>
        </Button>

        {/* Drag handle: an independent focus stop, separate from the title
            button above, mirroring bookmark-card.tsx. */}
        <Button
          ref={setActivatorNodeRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          {...attributes}
          {...listeners}
          aria-label={t("cardDragHandleLabel", { title: card.title })}
          className={cn(
            "shrink-0 touch-none opacity-70 transition-all hover:opacity-100 focus-visible:opacity-100",
            dragDisabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
        >
          <Icon name="ri-draggable" aria-hidden />
        </Button>
      </div>

      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      )}

      {card.linkedType && card.linkedId && (
        <Link
          href={kanbanLinkHref(card.linkedType, card.linkedId)}
          className="flex w-fit max-w-full items-center gap-1 rounded-md bg-background-100 px-1.5 py-0.5 text-xs text-foreground-600 no-underline transition-colors hover:text-primary-600 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon
            name={KANBAN_LINK_ICONS[card.linkedType]}
            aria-hidden
            className="shrink-0"
          />
          <span className="truncate">
            {card.linkedLabel ?? t(`linkTypes.${card.linkedType}`)}
          </span>
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-500">
        <Badge
          variant="secondary"
          className={cn("border-transparent", PRIORITY_CLASS[card.priority])}
        >
          {t(`priorities.${card.priority}`)}
        </Badge>

        {dueText && (
          <span
            className={cn(
              "flex items-center gap-1",
              overdue && "font-medium text-destructive",
            )}
            title={
              overdue
                ? t("cardOverdueLabel", { date: dueText })
                : t("cardDueLabel", { date: dueText })
            }
          >
            <Icon
              name={overdue ? "ri-alarm-warning-line" : "ri-calendar-line"}
              aria-hidden
            />
            {dueText}
          </span>
        )}

        {card.checklistTotal > 0 && (
          <span className="flex items-center gap-1">
            <Icon name="ri-checkbox-multiple-line" aria-hidden />
            {t("cardChecklistProgress", {
              done: card.checklistDone,
              total: card.checklistTotal,
            })}
          </span>
        )}

        {card.commentCount > 0 && (
          <span className="flex items-center gap-1">
            <Icon name="ri-chat-1-line" aria-hidden />
            {card.commentCount}
          </span>
        )}

        {card.assignee && (
          <span
            className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary-100 text-[0.65rem] font-semibold text-secondary-700 uppercase"
            title={t("cardAssigneeLabel", { name: card.assignee.username })}
          >
            {card.assignee.username.slice(0, 2)}
          </span>
        )}
      </div>
    </article>
  );
}
