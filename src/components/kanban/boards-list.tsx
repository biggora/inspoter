"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { KanbanBoardSummary } from "@/lib/services/kanban";
import { BoardDialog, type BoardDialogState } from "./board-dialog";
import { DeleteBoardDialog } from "./delete-dialogs";

interface BoardsListProps {
  boards: KanbanBoardSummary[];
  /** Owners may delete a board; members may not (see the DELETE route). */
  canDelete: boolean;
}

export function BoardsList({ boards, canDelete }: BoardsListProps) {
  const t = useTranslations("kanban");
  const router = useRouter();
  const [dialog, setDialog] = useState<BoardDialogState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  function refresh() {
    setDialog(null);
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <PageBody>
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={
          <Button type="button" onClick={() => setDialog({ mode: "create" })}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("createBoardButton")}
          </Button>
        }
      />

      {boards.length === 0 ? (
        <EmptyState
          icon="ri-kanban-view"
          title={t("boardsEmptyTitle")}
          description={t("boardsEmptyDescription")}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <li key={board.id} className="min-w-0">
              <article className="group relative flex items-start gap-3 rounded-xl border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700"
                >
                  <Icon name="ri-kanban-view" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/kanban/${board.id}`}
                    aria-label={t("openBoardLabel", { name: board.name })}
                    className="block truncate py-1.5 text-sm font-medium text-foreground-900 no-underline transition-colors hover:text-primary-600 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
                  >
                    {board.name}
                  </Link>
                  <p className="mt-1 text-xs text-foreground-500">
                    {t("boardCardSummary", {
                      columns: board.columnCount,
                      cards: board.cardCount,
                    })}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("boardMenuLabel")}
                      />
                    }
                  >
                    <Icon name="ri-more-2-line" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setDialog({ mode: "rename", board })}
                    >
                      {t("renameBoardAction")}
                    </DropdownMenuItem>
                    {canDelete && (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setPendingDelete(board)}
                      >
                        {t("deleteBoardAction")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </article>
            </li>
          ))}
        </ul>
      )}

      <BoardDialog
        state={dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        onSaved={refresh}
      />
      <DeleteBoardDialog
        board={pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onDeleted={refresh}
      />
    </PageBody>
  );
}
