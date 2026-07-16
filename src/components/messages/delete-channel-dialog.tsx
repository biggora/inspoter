"use client";

import { useState } from "react";
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
import { channelsApi, type ChannelDto } from "./api";

interface DeleteChannelDialogProps {
  channel: ChannelDto | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

// AC-MSG-003: confirm before deleting a channel; messages within it are
// removed along with it.
export function DeleteChannelDialog({
  channel,
  onOpenChange,
  onDeleted,
}: DeleteChannelDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!channel) return;
    setSubmitting(true);
    try {
      await channelsApi.remove(channel.id);
      toast.success("Канал удалён.");
      onDeleted();
    } catch {
      toast.error("Не удалось удалить канал. Попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={channel !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить #{channel?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Сообщения этого канала будут удалены. Это действие необратимо.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Удаление…" : "Удалить канал"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
