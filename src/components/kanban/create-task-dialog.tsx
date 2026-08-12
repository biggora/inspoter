"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, boardsApi, cardsApi } from "./api";

// Entry point from another section (today: Alerts). It is deliberately not the
// full card dialog: the operator is mid-triage and wants a task filed, not a
// checklist and a comment thread. The card opens for editing on the board.

export interface CreateTaskTarget {
  title: string;
  linkedType: "SERVER" | "DOMAIN" | "SERVICE" | "ALERT" | "HOSTING_ACCOUNT";
  linkedId: string;
  linkedLabel: string;
}

interface CreateTaskDialogProps {
  target: CreateTaskTarget | null;
  onOpenChange: (open: boolean) => void;
}

export function CreateTaskDialog({
  target,
  onOpenChange,
}: CreateTaskDialogProps) {
  const t = useTranslations("kanban");
  const titleId = useId();
  const errorId = useId();

  const [title, setTitle] = useState("");
  const [boards, setBoards] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [boardId, setBoardId] = useState("");
  const [columns, setColumns] = useState<{ id: string; name: string }[]>([]);
  const [columnId, setColumnId] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    setTitle(target?.title ?? "");
    setError(undefined);
  }

  const open = target !== null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    boardsApi
      .list()
      .then((list) => {
        if (cancelled) return;
        setBoards(list.map((board) => ({ id: board.id, name: board.name })));
        // Preselect the first board so the common case is one click.
        if (list.length > 0) setBoardId((current) => current || list[0].id);
      })
      .catch(() => {
        if (!cancelled) setBoards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Columns follow the chosen board; the first one is the default landing
  // place, which is what "file this for later" means on a kanban board.
  useEffect(() => {
    if (!open || !boardId) return;
    let cancelled = false;
    boardsApi
      .get(boardId)
      .then((board) => {
        if (cancelled) return;
        const options = board.columns.map((column) => ({
          id: column.id,
          name: column.name,
        }));
        setColumns(options);
        setColumnId(options[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setColumns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, boardId]);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed || !columnId || !target) {
      setError(t("errors.LABEL_NAME_REQUIRED"));
      return;
    }

    setSubmitting(true);
    try {
      await cardsApi.create({
        columnId,
        title: trimmed,
        linkedType: target.linkedType,
        linkedId: target.linkedId,
        linkedLabel: target.linkedLabel,
      });
      toast.success(t("createdToast"));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.title) {
        setError(err.fieldErrors.title);
      } else {
        toast.error(t("genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const boardItems: Record<string, string> = Object.fromEntries(
    (boards ?? []).map((board) => [board.id, board.name]),
  );
  const columnItems: Record<string, string> = Object.fromEntries(
    columns.map((column) => [column.id, column.name]),
  );
  const noBoards = boards !== null && boards.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cardDialogCreateTitle")}</DialogTitle>
          <DialogDescription>{target?.linkedLabel}</DialogDescription>
        </DialogHeader>

        {noBoards ? (
          <p className="text-sm text-muted-foreground">
            {t("boardsEmptyDescription")}
          </p>
        ) : (
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={titleId}>
                {t("cardDialogTitleLabel")}
              </FieldLabel>
              <Input
                id={titleId}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-required="true"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus
              />
              <FieldError id={errorId}>{error}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${titleId}-board`}>
                {t("boardNameLabel")}
              </FieldLabel>
              <Select
                value={boardId}
                onValueChange={(value) => setBoardId(value as string)}
                items={boardItems}
              >
                <SelectTrigger
                  id={`${titleId}-board`}
                  aria-label={t("boardNameLabel")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(boards ?? []).map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${titleId}-column`}>
                {t("cardDialogColumnLabel")}
              </FieldLabel>
              <Select
                value={columnId}
                onValueChange={(value) => setColumnId(value as string)}
                items={columnItems}
              >
                <SelectTrigger
                  id={`${titleId}-column`}
                  aria-label={t("cardDialogColumnLabel")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {columns.map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            {t("cancelButton")}
          </DialogClose>
          <Button
            type="button"
            disabled={submitting || noBoards || !columnId}
            onClick={handleSubmit}
          >
            {submitting && <Spinner data-icon="inline-start" aria-hidden />}
            {t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
