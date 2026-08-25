"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { agentsApi, ApiError } from "./api";

interface RunDialogProps {
  agentId: string;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Starting a run queues it; the scheduler executes it. The dialog therefore
// navigates to the run page rather than waiting for an answer that will not
// arrive inside the request.
export function RunDialog({
  agentId,
  agentName,
  open,
  onOpenChange,
}: RunDialogProps) {
  const t = useTranslations("agents");
  const router = useRouter();
  const taskId = useId();
  const [task, setTask] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const run = await agentsApi.run(agentId, task.trim() || undefined);
      toast.success(t("runQueuedToast"));
      onOpenChange(false);
      setTask("");
      router.push(`/agents/runs/${run.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("runError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("startRunTitle", { name: agentName })}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={taskId}>{t("runTaskLabel")}</FieldLabel>
              <Textarea
                id={taskId}
                value={task}
                onChange={(event) => setTask(event.target.value)}
                rows={4}
                autoFocus
              />
              <FieldDescription>{t("runTaskHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  {t("savingButton")}
                </>
              ) : (
                t("startRunButton")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
