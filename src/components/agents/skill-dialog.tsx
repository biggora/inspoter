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
import type { SkillDetail } from "@/lib/services/skills";
import { AiDraftButton } from "./ai-draft-button";
import { ApiError, skillsApi } from "./api";
import { useAiDraft } from "./use-ai-draft";

export type SkillDialogState =
  { mode: "create" } | { mode: "edit"; skill: SkillDetail };

interface SkillDialogProps {
  state: SkillDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface FieldErrors {
  name?: string;
  description?: string;
  instructions?: string;
  toolNames?: string;
}

// One tool name per line is the only format that survives copy-paste from the
// tool catalogue; a comma-separated field would need trimming rules nobody
// remembers.
function parseToolNames(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function SkillDialog({
  state,
  onOpenChange,
  onSaved,
}: SkillDialogProps) {
  const t = useTranslations("agents");
  const nameId = useId();
  const nameErrorId = useId();
  const descriptionId = useId();
  const descriptionErrorId = useId();
  const instructionsId = useId();
  const instructionsErrorId = useId();
  const toolsId = useId();
  const toolsErrorId = useId();
  const activeId = useId();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [tools, setTools] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const ai = useAiDraft("SKILL", (field, text) => {
    if (field === "description") setDescription(text);
    else setInstructions(text);
  });
  const brief = { name, description, instructions };
  // A draft is written from what the operator has typed, so the name is the
  // floor: without it the first click would spend a model call on nothing.
  const aiDisabled =
    ai.busyField !== null || submitting || name.trim().length === 0;

  const isEdit = state?.mode === "edit";

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.mode === "edit") {
      setName(state.skill.name);
      setDescription(state.skill.description);
      setInstructions(state.skill.instructions);
      setTools(state.skill.toolNames.join("\n"));
      setIsActive(state.skill.isActive);
    } else if (state?.mode === "create") {
      setName("");
      setDescription("");
      setInstructions("");
      setTools("");
      setIsActive(true);
    }
    setErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
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
        description: trimmedDescription,
        instructions: trimmedInstructions,
        toolNames: parseToolNames(tools),
        isActive,
      };
      if (state?.mode === "edit") {
        await skillsApi.update(state.skill.id, payload);
        toast.success(t("skillUpdatedToast"));
      } else {
        await skillsApi.create(payload);
        toast.success(t("skillCreatedToast"));
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.unknownTools?.length) {
        setErrors({
          toolNames: t("unknownToolsError", {
            tools: err.unknownTools.join(", "),
          }),
        });
      } else if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors({
          name: err.fieldErrors.name,
          description: err.fieldErrors.description,
          instructions: err.fieldErrors.instructions,
          toolNames: err.fieldErrors.toolNames,
        });
      } else {
        toast.error(
          err instanceof ApiError ? err.message : t("saveSkillError"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  // A draft in flight is dropped when the dialog closes. It cannot be aborted
  // from the reset block above — that one runs during render.
  function handleOpenChange(open: boolean) {
    if (!open) ai.cancel();
    onOpenChange(open);
  }

  return (
    <Dialog open={state !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editSkillTitle") : t("createSkillTitle")}
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

            <Field data-invalid={!!errors.description || undefined}>
              {/* The button is a sibling of the label, never a child: a
                  <label> wrapping it would fold "Generate description" into
                  the input's accessible name. */}
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor={descriptionId}>
                  {t("skillDescriptionLabel")}
                </FieldLabel>
                {ai.enabled && (
                  <AiDraftButton
                    field="description"
                    busy={ai.busyField === "description"}
                    disabled={aiDisabled}
                    hint={t("aiNeedsNameHint")}
                    onClick={() => ai.generate("description", brief)}
                  />
                )}
              </div>
              <Input
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-required="true"
                aria-invalid={!!errors.description || undefined}
                aria-describedby={
                  errors.description ? descriptionErrorId : undefined
                }
              />
              <FieldDescription>{t("skillDescriptionHint")}</FieldDescription>
              <FieldError id={descriptionErrorId}>
                {errors.description}
              </FieldError>
            </Field>

            <Field data-invalid={!!errors.instructions || undefined}>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor={instructionsId}>
                  {t("skillInstructionsLabel")}
                </FieldLabel>
                {ai.enabled && (
                  <AiDraftButton
                    field="instructions"
                    busy={ai.busyField === "instructions"}
                    disabled={aiDisabled}
                    hint={t("aiNeedsNameHint")}
                    onClick={() => ai.generate("instructions", brief)}
                  />
                )}
              </div>
              <Textarea
                id={instructionsId}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={10}
                aria-required="true"
                aria-invalid={!!errors.instructions || undefined}
                aria-describedby={
                  errors.instructions ? instructionsErrorId : undefined
                }
              />
              <FieldDescription>{t("skillInstructionsHint")}</FieldDescription>
              <FieldError id={instructionsErrorId}>
                {errors.instructions}
              </FieldError>
            </Field>

            <Field data-invalid={!!errors.toolNames || undefined}>
              <FieldLabel htmlFor={toolsId}>{t("skillToolsLabel")}</FieldLabel>
              <Textarea
                id={toolsId}
                value={tools}
                onChange={(event) => setTools(event.target.value)}
                rows={4}
                spellCheck={false}
                aria-invalid={!!errors.toolNames || undefined}
                aria-describedby={errors.toolNames ? toolsErrorId : undefined}
              />
              <FieldDescription>{t("skillToolsHint")}</FieldDescription>
              <FieldError id={toolsErrorId}>{errors.toolNames}</FieldError>
            </Field>

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
