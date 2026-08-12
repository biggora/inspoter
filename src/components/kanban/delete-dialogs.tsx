"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { boardsApi, cardsApi, columnsApi } from "./api";

// The three destructive confirmations share one shape — title, «name» in the
// description, one red action — so they live in one file rather than three
// near-identical ones.

interface ConfirmProps {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

function ConfirmDelete({
  title,
  description,
  open,
  onOpenChange,
  onConfirm,
}: ConfirmProps) {
  const t = useTranslations("kanban");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {t("deleteButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteBoardDialog({
  board,
  onOpenChange,
  onDeleted,
}: {
  board: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("kanban");

  return (
    <ConfirmDelete
      open={board !== null}
      onOpenChange={onOpenChange}
      title={t("deleteBoardTitle")}
      description={t("deleteBoardDescription", { name: board?.name ?? "" })}
      onConfirm={async () => {
        if (!board) return;
        try {
          await boardsApi.remove(board.id);
          toast.success(t("deletedToast"));
          onDeleted();
        } catch {
          toast.error(t("genericError"));
        }
      }}
    />
  );
}

export function DeleteColumnDialog({
  column,
  onOpenChange,
  onDeleted,
}: {
  column: { id: string; name: string; cardCount: number } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("kanban");

  return (
    <ConfirmDelete
      open={column !== null}
      onOpenChange={onOpenChange}
      title={t("deleteColumnTitle")}
      description={t("deleteColumnDescription", {
        name: column?.name ?? "",
        count: column?.cardCount ?? 0,
      })}
      onConfirm={async () => {
        if (!column) return;
        try {
          await columnsApi.remove(column.id);
          toast.success(t("deletedToast"));
          onDeleted();
        } catch {
          toast.error(t("genericError"));
        }
      }}
    />
  );
}

export function DeleteCardDialog({
  card,
  onOpenChange,
  onDeleted,
}: {
  card: { id: string; title: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("kanban");

  return (
    <ConfirmDelete
      open={card !== null}
      onOpenChange={onOpenChange}
      title={t("deleteCardTitle")}
      description={t("deleteCardDescription", { title: card?.title ?? "" })}
      onConfirm={async () => {
        if (!card) return;
        try {
          await cardsApi.remove(card.id);
          toast.success(t("deletedToast"));
          onDeleted();
        } catch {
          toast.error(t("genericError"));
        }
      }}
    />
  );
}
