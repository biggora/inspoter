"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
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
      toast.success("Member removed.");
      setRemoveTarget(null);
      router.refresh();
    } catch {
      toast.error("Couldn't remove member. Try again.");
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
              aria-label={`Remove ${member.operator.username}`}
              onClick={() => setRemoveTarget(member)}
              disabled={members.length <= 1}
            >
              <UserMinus aria-hidden className="size-4" />
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
              Remove &ldquo;{removeTarget?.operator.username}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This member will lose access to the workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={submitting}
            >
              {submitting ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
