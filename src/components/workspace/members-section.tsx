"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { MemberWithOperator } from "@/lib/services/workspaces";
import { workspacesApi } from "./api";

interface MembersSectionProps {
  workspaceId: string;
  members: MemberWithOperator[];
}

// AC scope: Settings > Workspace, members list with remove (task spec item
// 2). Removal reuses the Bookmarks "lighter-weight confirm" AlertDialog
// pattern (src/components/bookmarks/delete-bookmark-dialog.tsx) rather than
// a full Dialog, since removing a member is a single, low-cost destructive
// action.
export function MembersSection({ workspaceId, members }: MembersSectionProps) {
  const router = useRouter();
  const [removeTarget, setRemoveTarget] = useState<MemberWithOperator | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirmRemove() {
    if (!removeTarget) return;
    setSubmitting(true);
    try {
      await workspacesApi.removeMember(workspaceId, removeTarget.id);
      toast.success("Участник удалён.");
      setRemoveTarget(null);
      router.refresh();
    } catch {
      toast.error("Не удалось удалить участника. Попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">
                {member.operator.username}
              </span>
              <span className="text-xs text-muted-foreground capitalize">
                {member.role}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Удалить ${member.operator.username}`}
              onClick={() => setRemoveTarget(member)}
              disabled={members.length <= 1}
            >
              <Icon name="ri-user-unfollow-line" aria-hidden className="text-base" />
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Удалить «{removeTarget?.operator.username}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Этот участник потеряет доступ к рабочему пространству.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={submitting}
            >
              {submitting ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
