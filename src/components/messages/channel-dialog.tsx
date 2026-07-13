"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, channelsApi, type ChannelDto } from "./api";

export type ChannelDialogState =
  | { mode: "create"; categoryId: string }
  | { mode: "edit"; channel: ChannelDto };

interface ChannelDialogProps {
  state: ChannelDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// AC-MSG-002/003: create/rename share one dialog, same lightweight
// name-only pattern as categories (design.md §6.4).
export function ChannelDialog({
  state,
  onOpenChange,
  onSaved,
}: ChannelDialogProps) {
  const nameId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = state?.mode === "edit";

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    setName(state?.mode === "edit" ? state.channel.name : "");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Название канала обязательно.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (state?.mode === "edit") {
        await channelsApi.rename(state.channel.id, trimmed);
        toast.success("Канал переименован.");
      } else if (state?.mode === "create") {
        await channelsApi.create(state.categoryId, trimmed);
        toast.success("Канал создан.");
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Не удалось сохранить канал. Попробуйте снова.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Переименовать канал" : "Новый канал"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>Название канала</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-required="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              autoFocus
            />
            {error && (
              <p id={errorId} className="text-sm text-(--error-text)">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit
                ? submitting
                  ? "Сохранение…"
                  : "Сохранить"
                : submitting
                  ? "Создание…"
                  : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
