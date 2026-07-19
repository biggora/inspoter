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
  const t = useTranslations("messages");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!channel) return;
    setSubmitting(true);
    try {
      await channelsApi.remove(channel.id);
      toast.success(t("channelDeletedToast"));
      onDeleted();
    } catch {
      toast.error(t("deleteChannelError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={channel !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteChannelTitle", { name: channel?.name ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteChannelDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? t("deletingButton") : t("deleteChannelAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
