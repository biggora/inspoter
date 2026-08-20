"use client";

import { useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { labelColorToHex } from "@/lib/label-color";
import type { KanbanColumnWithCards } from "@/lib/services/kanban";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";

interface KanbanColumnProps {
  column: KanbanColumnWithCards;
  /** Cards after the board's filters — may be fewer than `column.cards`. */
  cards: KanbanColumnWithCards["cards"];
  dragDisabled: boolean;
  onAddCard: () => void;
  onOpenCard: (cardId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function KanbanColumn({
  column,
  cards,
  dragDisabled,
  onAddCard,
  onOpenCard,
  onEdit,
  onDelete,
}: KanbanColumnProps) {
  const t = useTranslations("kanban");

  // Two dnd-kit registrations on one element: the column is itself sortable
  // (operators reorder statuses) and it is a drop target for cards. The
  // droppable is what lets a card land in a column that has no cards left —
  // a SortableContext with an empty item list has nothing to collide with.
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: "column" },
    disabled: dragDisabled,
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `column-drop-${column.id}`,
    data: { type: "column-drop", columnId: column.id },
  });

  const overWipLimit =
    column.wipLimit !== null && column.cards.length > column.wipLimit;
  const accent = labelColorToHex(column.color);

  return (
    <section
      ref={setSortableRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={column.name}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-3 rounded-xl border border-background-200 bg-background-100/60 p-3",
        isDragging && "opacity-60",
        isOver && "border-primary-300",
      )}
    >
      <header className="group flex items-center gap-2">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground-900">
          {column.name}
        </h2>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
            overWipLimit
              ? "bg-primary-100 font-medium text-primary-700"
              : "text-foreground-500",
          )}
          title={overWipLimit ? t("columnOverWipLimit") : undefined}
        >
          {column.wipLimit !== null
            ? t("columnWipCount", {
                count: column.cards.length,
                limit: column.wipLimit,
              })
            : t("columnCardCount", { count: column.cards.length })}
        </span>

        <Button
          ref={setActivatorNodeRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          {...attributes}
          {...listeners}
          aria-label={t("columnDragHandleLabel", { name: column.name })}
          className={cn(
            "shrink-0 touch-none opacity-70 transition-all hover:opacity-100 focus-visible:opacity-100",
            dragDisabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
        >
          <Icon name="ri-draggable" aria-hidden />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("columnMenuLabel")}
                className="shrink-0"
              />
            }
          >
            <Icon name="ri-more-2-fill" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onEdit}>
                {t("editColumnAction")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                {t("deleteColumnAction")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div ref={setDroppableRef} className="flex min-h-16 flex-col gap-2">
        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              dragDisabled={dragDisabled}
              onOpen={() => onOpenCard(card.id)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <p className="px-1 py-3 text-xs text-foreground-400">
            {t("columnEmptyHint")}
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAddCard}
        className="w-full justify-start text-foreground-500"
      >
        <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
        {t("addCardButton")}
      </Button>
    </section>
  );
}
