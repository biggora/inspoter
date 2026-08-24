"use client";

import {
  startTransition,
  useDeferredValue,
  useId,
  useOptimistic,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Icon } from "@/components/ui/icon";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWebMcpTool } from "@/hooks/use-web-mcp-tool";
import type {
  KanbanBoardDetail,
  KanbanCardDetail,
  KanbanColumnWithCards,
} from "@/lib/services/kanban";
import type { KanbanLabelListItem } from "@/lib/services/kanban-labels";
import { cardsApi, columnsApi } from "./api";
import { BoardDialog, type BoardDialogState } from "./board-dialog";
import { CardDetailDialog, type CardDialogState } from "./card-detail-dialog";
import { ColumnDialog, type ColumnDialogState } from "./column-dialog";
import { DeleteCardDialog, DeleteColumnDialog } from "./delete-dialogs";
import { KanbanColumn } from "./kanban-column";
import { LabelManagerDialog } from "./label-manager-dialog";
import { createCreateCardTool, createMoveCardTool } from "./web-mcp-tools";

const ALL = "all";

// Columns and cards share one DndContext, but they must never compete for the
// same collision. Without filtering, a card dragged over a column can resolve
// to the column's sortable container (`type: "column"`) instead of its card
// drop zone. `handleDragEnd` then has no destination and silently does nothing.
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type;
  const acceptedTypes =
    activeType === "card"
      ? new Set(["card", "column-drop"])
      : new Set(["column"]);
  const droppableContainers = args.droppableContainers.filter((container) =>
    acceptedTypes.has(String(container.data.current?.type)),
  );
  const scopedArgs = { ...args, droppableContainers };

  // Pointer position gives natural card placement. Keyboard drags have no
  // pointer coordinates, so fall back to geometry for Arrow-key movement.
  const pointerCollisions = pointerWithin(scopedArgs);
  return pointerCollisions.length > 0
    ? pointerCollisions
    : closestCorners(scopedArgs);
};

type ReorderAction =
  | { type: "columns"; order: string[] }
  | { type: "cards"; columns: { columnId: string; cardIds: string[] }[] };

// Pure reducer for `useOptimistic` — never called directly.
function applyReorder(
  state: KanbanColumnWithCards[],
  action: ReorderAction,
): KanbanColumnWithCards[] {
  if (action.type === "columns") {
    const byId = new Map(state.map((column) => [column.id, column]));
    return action.order
      .map((id) => byId.get(id))
      .filter((column): column is KanbanColumnWithCards => Boolean(column));
  }

  // Look up cards across ALL columns, not just the target one: a cross-column
  // move has to find the dragged card even though it is not yet a member of
  // its destination column's array.
  const cardById = new Map<string, KanbanCardDetail>();
  for (const column of state) {
    for (const card of column.cards) cardById.set(card.id, card);
  }
  const updates = new Map(
    action.columns.map((entry) => [entry.columnId, entry.cardIds]),
  );

  return state.map((column) => {
    const cardIds = updates.get(column.id);
    if (!cardIds) return column;
    return {
      ...column,
      cards: cardIds
        .map((id) => cardById.get(id))
        .filter((card): card is KanbanCardDetail => Boolean(card))
        // Keep `card.columnId` consistent with the optimistic container so
        // anything reading it mid-flight is not stale.
        .map((card) =>
          card.columnId === column.id ? card : { ...card, columnId: column.id },
        ),
    };
  });
}

interface KanbanBoardViewProps {
  board: KanbanBoardDetail;
  labels: KanbanLabelListItem[];
  members: { operatorId: string; username: string }[];
}

// Top-level board orchestrator, modeled on BookmarksBoard. Holds dialog and
// filter state only — the board itself is server data, re-fetched through
// `router.refresh()` after every mutation.
//
// The one deliberate exception is drag-and-drop, which additionally uses
// `useOptimistic` so a drop repaints instantly: a refresh round-trip cannot
// keep up with direct manipulation. That state always collapses back onto the
// `board` prop once the server data lands, and self-reverts on failure.
export function KanbanBoardView({
  board,
  labels,
  members,
}: KanbanBoardViewProps) {
  const t = useTranslations("kanban");
  const router = useRouter();
  const searchId = useId();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [labelFilter, setLabelFilter] = useState(ALL);
  const [assigneeFilter, setAssigneeFilter] = useState(ALL);

  const [boardDialog, setBoardDialog] = useState<BoardDialogState | null>(null);
  const [columnDialog, setColumnDialog] = useState<ColumnDialogState | null>(
    null,
  );
  const [cardDialog, setCardDialog] = useState<CardDialogState | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [deleteColumn, setDeleteColumn] = useState<{
    id: string;
    name: string;
    cardCount: number;
  } | null>(null);
  const [deleteCard, setDeleteCard] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const [optimisticColumns, applyOptimisticReorder] = useOptimistic(
    board.columns,
    applyReorder,
  );

  // dnd-kit's "multiple containers" pattern needs ONE top-level DndContext:
  // moving a card between columns requires simultaneous knowledge of both
  // columns' item lists, which a column-local handler cannot see. The 4px
  // activation distance keeps ordinary clicks (menus, card titles, buttons)
  // from being read as drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const isFiltering =
    normalizedQuery !== "" || labelFilter !== ALL || assigneeFilter !== ALL;

  useWebMcpTool(
    createMoveCardTool({
      boardId: board.id,
      columns: optimisticColumns,
      isFiltering,
      applyOptimisticReorder,
      move: cardsApi.move,
      refresh: () => router.refresh(),
    }),
  );
  useWebMcpTool(
    createCreateCardTool({
      columns: optimisticColumns,
      create: cardsApi.create,
      refresh: () => router.refresh(),
    }),
  );

  function matches(card: KanbanCardDetail): boolean {
    if (
      normalizedQuery &&
      !card.title.toLowerCase().includes(normalizedQuery) &&
      !(card.linkedLabel ?? "").toLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }
    if (
      labelFilter !== ALL &&
      !card.labels.some((label) => label.id === labelFilter)
    ) {
      return false;
    }
    if (
      assigneeFilter !== ALL &&
      card.assignee?.operatorId !== assigneeFilter
    ) {
      return false;
    }
    return true;
  }

  const visibleCardsByColumn = new Map(
    optimisticColumns.map((column) => [
      column.id,
      isFiltering ? column.cards.filter(matches) : column.cards,
    ]),
  );
  const visibleCardCount = [...visibleCardsByColumn.values()].reduce(
    (sum, cards) => sum + cards.length,
    0,
  );

  function handleDragEnd(event: DragEndEvent) {
    // Reordering a filtered board would persist an order derived from a
    // partial list, so drag is disabled while filters are on.
    if (isFiltering) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as
      { type: "column" } | { type: "card"; columnId: string } | undefined;
    const overData = over.data.current as
      | { type: "column" }
      | { type: "card"; columnId: string }
      | { type: "column-drop"; columnId: string }
      | undefined;
    if (!activeData) return;

    if (activeData.type === "column") {
      if (overData?.type !== "column") return;
      const oldIndex = optimisticColumns.findIndex(
        (column) => column.id === active.id,
      );
      const newIndex = optimisticColumns.findIndex(
        (column) => column.id === over.id,
      );
      if (oldIndex === -1 || newIndex === -1) return;
      const order = arrayMove(optimisticColumns, oldIndex, newIndex).map(
        (column) => column.id,
      );

      startTransition(async () => {
        applyOptimisticReorder({ type: "columns", order });
        try {
          await columnsApi.reorder(board.id, order);
        } catch {
          toast.error(t("reorderError"));
        }
        router.refresh();
      });
      return;
    }

    // Card drag: within one column (plain arrayMove) or across two (source
    // loses the id, destination gains it at the drop position). The payload
    // always carries exactly the affected columns — at most two, which is what
    // PATCH /api/kanban/cards/move accepts.
    const sourceId = activeData.columnId;
    const destinationId =
      overData?.type === "card"
        ? overData.columnId
        : overData?.type === "column-drop"
          ? overData.columnId
          : undefined;
    if (!destinationId) return;

    const byId = new Map(
      optimisticColumns.map((column) => [column.id, column]),
    );
    const source = byId.get(sourceId);
    const destination = byId.get(destinationId);
    if (!source || !destination) return;

    let payload: { columnId: string; cardIds: string[] }[];
    if (sourceId === destinationId) {
      const oldIndex = source.cards.findIndex((card) => card.id === active.id);
      const newIndex =
        overData?.type === "card"
          ? source.cards.findIndex((card) => card.id === over.id)
          : source.cards.length - 1;
      if (oldIndex === -1 || newIndex === -1) return;
      payload = [
        {
          columnId: sourceId,
          cardIds: arrayMove(source.cards, oldIndex, newIndex).map(
            (card) => card.id,
          ),
        },
      ];
    } else {
      const remaining = source.cards
        .filter((card) => card.id !== active.id)
        .map((card) => card.id);
      const targetIds = destination.cards.map((card) => card.id);
      const insertAt =
        overData?.type === "card"
          ? targetIds.indexOf(String(over.id))
          : targetIds.length;
      targetIds.splice(
        insertAt === -1 ? targetIds.length : insertAt,
        0,
        String(active.id),
      );
      payload = [
        { columnId: sourceId, cardIds: remaining },
        { columnId: destinationId, cardIds: targetIds },
      ];
    }

    startTransition(async () => {
      applyOptimisticReorder({ type: "cards", columns: payload });
      try {
        await cardsApi.move(board.id, payload);
      } catch {
        toast.error(t("reorderError"));
      }
      router.refresh();
    });
  }

  function refresh() {
    setColumnDialog(null);
    setCardDialog(null);
    setBoardDialog(null);
    setDeleteColumn(null);
    setDeleteCard(null);
    setLabelsOpen(false);
    router.refresh();
  }

  const labelFilterItems: Record<string, string> = {
    [ALL]: t("filterAllLabels"),
    ...Object.fromEntries(labels.map((label) => [label.id, label.name])),
  };
  const assigneeFilterItems: Record<string, string> = {
    [ALL]: t("filterAllAssignees"),
    ...Object.fromEntries(
      members.map((member) => [member.operatorId, member.username]),
    ),
  };
  const columnOptions = optimisticColumns.map((column) => ({
    id: column.id,
    name: column.name,
  }));

  return (
    <PageBody>
      <PageHeader
        back={{ href: "/kanban", label: t("backToBoardsLabel") }}
        title={board.name}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLabelsOpen(true)}
            >
              <Icon
                name="ri-price-tag-3-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("manageLabelsButton")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBoardDialog({ mode: "rename", board })}
            >
              {t("renameBoardAction")}
            </Button>
            <Button
              type="button"
              onClick={() =>
                setColumnDialog({ mode: "create", boardId: board.id })
              }
            >
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("addColumnButton")}
            </Button>
          </>
        }
      >
        <FilterBar>
          <InputGroup>
            <InputGroupInput
              id={searchId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("filterSearchPlaceholder")}
              aria-label={t("filterSearchLabel")}
            />
            <InputGroupAddon align="inline-end">
              {query !== "" && (
                <InputGroupButton
                  type="button"
                  aria-label={t("filterClearLabel")}
                  onClick={() => setQuery("")}
                >
                  <Icon name="ri-close-line" aria-hidden />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>

          <Select
            value={labelFilter}
            onValueChange={(value) => setLabelFilter(value as string)}
            items={labelFilterItems}
          >
            <SelectTrigger size="sm" aria-label={t("filterLabelLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(labelFilterItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            value={assigneeFilter}
            onValueChange={(value) => setAssigneeFilter(value as string)}
            items={assigneeFilterItems}
          >
            <SelectTrigger size="sm" aria-label={t("filterAssigneeLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(assigneeFilterItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {isFiltering && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setLabelFilter(ALL);
                setAssigneeFilter(ALL);
              }}
            >
              {t("filterResetButton")}
            </Button>
          )}
        </FilterBar>
      </PageHeader>

      {isFiltering && (
        <p className="text-xs text-muted-foreground">
          {t("filterDragDisabledHint")}
        </p>
      )}

      {isFiltering && visibleCardCount === 0 ? (
        <EmptyState
          icon="ri-search-line"
          title={t("filterEmptyTitle")}
          description={t("filterEmptyDescription")}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={kanbanCollisionDetection}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={optimisticColumns.map((column) => column.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex items-start gap-4 overflow-x-auto pb-2">
              {optimisticColumns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={visibleCardsByColumn.get(column.id) ?? []}
                  dragDisabled={isFiltering}
                  onAddCard={() =>
                    setCardDialog({ mode: "create", columnId: column.id })
                  }
                  onOpenCard={(cardId) => {
                    const card = column.cards.find(
                      (entry) => entry.id === cardId,
                    );
                    if (card) setCardDialog({ mode: "edit", card });
                  }}
                  onEdit={() => setColumnDialog({ mode: "edit", column })}
                  onDelete={() =>
                    setDeleteColumn({
                      id: column.id,
                      name: column.name,
                      cardCount: column.cards.length,
                    })
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <BoardDialog
        state={boardDialog}
        onOpenChange={(open) => !open && setBoardDialog(null)}
        onSaved={refresh}
      />
      <ColumnDialog
        state={columnDialog}
        onOpenChange={(open) => !open && setColumnDialog(null)}
        onSaved={refresh}
      />
      <CardDetailDialog
        state={cardDialog}
        columns={columnOptions}
        labels={labels}
        members={members}
        onOpenChange={(open) => !open && setCardDialog(null)}
        onSaved={refresh}
        onRequestDelete={(card) => {
          setCardDialog(null);
          setDeleteCard(card);
        }}
      />
      <LabelManagerDialog
        open={labelsOpen}
        labels={labels}
        onOpenChange={setLabelsOpen}
        onChanged={() => router.refresh()}
      />
      <DeleteColumnDialog
        column={deleteColumn}
        onOpenChange={(open) => !open && setDeleteColumn(null)}
        onDeleted={refresh}
      />
      <DeleteCardDialog
        card={deleteCard}
        onOpenChange={(open) => !open && setDeleteCard(null)}
        onDeleted={refresh}
      />
    </PageBody>
  );
}
