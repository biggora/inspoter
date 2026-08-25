"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { AgentDetail } from "@/lib/services/agents";
import { agentsApi, ApiError } from "./api";

export type AgentDialogState =
  { mode: "create" } | { mode: "edit"; agent: AgentDetail };

interface AgentDialogProps {
  state: AgentDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface FieldErrors {
  name?: string;
  instructions?: string;
}

const DEFAULT_MAX_STEPS = 8;
const DEFAULT_MAX_TOKENS = 20_000;
const DEFAULT_TIMEOUT_SECONDS = 300;

export function AgentDialog({
  state,
  onOpenChange,
  onSaved,
}: AgentDialogProps) {
  const t = useTranslations("agents");
  const nameId = useId();
  const nameErrorId = useId();
  const descriptionId = useId();
  const instructionsId = useId();
  const instructionsErrorId = useId();
  const maxStepsId = useId();
  const maxTokensId = useId();
  const timeoutId = useId();
  const reportId = useId();
  const activeId = useId();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [maxSteps, setMaxSteps] = useState(String(DEFAULT_MAX_STEPS));
  const [maxTokens, setMaxTokens] = useState(String(DEFAULT_MAX_TOKENS));
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    String(DEFAULT_TIMEOUT_SECONDS),
  );
  const [reportOnCompletion, setReportOnCompletion] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const isEdit = state?.mode === "edit";

  // Reset when the dialog target changes, using React's "adjust state while
  // rendering on prop change" pattern instead of an effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.mode === "edit") {
      const agent = state.agent;
      setName(agent.name);
      setDescription(agent.description ?? "");
      setInstructions(agent.instructions);
      setMaxSteps(String(agent.maxSteps));
      setMaxTokens(String(agent.maxTokens));
      setTimeoutSeconds(String(agent.timeoutSeconds));
      setReportOnCompletion(agent.reportOnCompletion);
      setIsActive(agent.isActive);
    } else if (state?.mode === "create") {
      setName("");
      setDescription("");
      setInstructions("");
      setMaxSteps(String(DEFAULT_MAX_STEPS));
      setMaxTokens(String(DEFAULT_MAX_TOKENS));
      setTimeoutSeconds(String(DEFAULT_TIMEOUT_SECONDS));
      setReportOnCompletion(false);
      setIsActive(true);
    }
    setErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedInstructions = instructions.trim();
    const nextErrors: FieldErrors = {};
    if (!trimmedName) nextErrors.name = t("nameRequiredError");
    if (!trimmedInstructions) {
      nextErrors.instructions = t("instructionsRequiredError");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        description: description.trim(),
        instructions: trimmedInstructions,
        maxSteps: Number(maxSteps),
        maxTokens: Number(maxTokens),
        timeoutSeconds: Number(timeoutSeconds),
        reportOnCompletion,
        isActive,
      };
      if (state?.mode === "edit") {
        await agentsApi.update(state.agent.id, payload);
        toast.success(t("agentUpdatedToast"));
      } else {
        await agentsApi.create(payload);
        toast.success(t("agentCreatedToast"));
      }
      onSaved();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors({
          name: err.fieldErrors.name,
          instructions: err.fieldErrors.instructions,
        });
      } else {
        toast.error(
          err instanceof ApiError ? err.message : t("saveAgentError"),
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
            {isEdit ? t("editAgentTitle") : t("createAgentTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!errors.name || undefined}>
              <FieldLabel htmlFor={nameId}>{t("nameLabel")}</FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-required="true"
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? nameErrorId : undefined}
                autoFocus
              />
              <FieldError id={nameErrorId}>{errors.name}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={descriptionId}>
                {t("descriptionLabel")}
              </FieldLabel>
              <Input
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <Field data-invalid={!!errors.instructions || undefined}>
              <FieldLabel htmlFor={instructionsId}>
                {t("instructionsLabel")}
              </FieldLabel>
              <Textarea
                id={instructionsId}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={8}
                aria-required="true"
                aria-invalid={!!errors.instructions || undefined}
                aria-describedby={
                  errors.instructions ? instructionsErrorId : undefined
                }
              />
              <FieldDescription>{t("instructionsHint")}</FieldDescription>
              <FieldError id={instructionsErrorId}>
                {errors.instructions}
              </FieldError>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor={maxStepsId}>
                  {t("maxStepsLabel")}
                </FieldLabel>
                <Input
                  id={maxStepsId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={24}
                  value={maxSteps}
                  onChange={(event) => setMaxSteps(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={maxTokensId}>
                  {t("maxTokensLabel")}
                </FieldLabel>
                <Input
                  id={maxTokensId}
                  type="number"
                  inputMode="numeric"
                  min={1000}
                  max={200000}
                  step={1000}
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={timeoutId}>{t("timeoutLabel")}</FieldLabel>
                <Input
                  id={timeoutId}
                  type="number"
                  inputMode="numeric"
                  min={30}
                  max={1800}
                  step={30}
                  value={timeoutSeconds}
                  onChange={(event) => setTimeoutSeconds(event.target.value)}
                />
              </Field>
            </div>
            <FieldDescription>{t("limitsHint")}</FieldDescription>

            <Field orientation="horizontal">
              <Checkbox
                id={reportId}
                checked={reportOnCompletion}
                onCheckedChange={(checked) =>
                  setReportOnCompletion(checked === true)
                }
              />
              <FieldLabel
                htmlFor={reportId}
                className="cursor-pointer font-normal"
              >
                {t("reportOnCompletionLabel")}
              </FieldLabel>
            </Field>
            <FieldDescription>{t("reportOnCompletionHint")}</FieldDescription>

            <Field orientation="horizontal">
              <Checkbox
                id={activeId}
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <FieldLabel
                htmlFor={activeId}
                className="cursor-pointer font-normal"
              >
                {t("activeLabel")}
              </FieldLabel>
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
                  {isEdit ? t("savingButton") : t("creatingButton")}
                </>
              ) : isEdit ? (
                t("saveChangesButton")
              ) : (
                t("createButton")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
