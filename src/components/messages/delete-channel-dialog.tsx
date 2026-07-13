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
      toast.success("Channel deleted.");
      onDeleted();
    } catch {
      toast.error("Couldn't delete channel. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={channel !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete &ldquo;#{channel?.name}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Messages in this channel will be removed. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Deleting…" : "Delete channel"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
