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
import { LabelColorField } from "@/components/ui/label-color-field";
import { Spinner } from "@/components/ui/spinner";
import type { LabelColor, LabelPresetColor } from "@/lib/label-color";
import { ApiError, columnsApi } from "./api";
import { useLabelColorCopy } from "./use-label-color-copy";

export type ColumnDialogState =
  | { mode: "create"; boardId: string }
  | {
      mode: "edit";
      column: {
        id: string;
        name: string;
        color: LabelColor;
        wipLimit: number | null;
        isDone: boolean;
      };
    };

interface ColumnDialogProps {
  state: ColumnDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const DEFAULT_COLOR: LabelPresetColor = "SLATE";

export function ColumnDialog({
  state,
  onOpenChange,
  onSaved,
}: ColumnDialogProps) {
  const t = useTranslations("kanban");
  const colorCopy = useLabelColorCopy();
  const nameId = useId();
  const wipId = useId();
  const doneId = useId();
  const errorId = useId();

  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>(DEFAULT_COLOR);
  const [colorValid, setColorValid] = useState(true);
  const [wipLimit, setWipLimit] = useState("");
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    const column = state?.mode === "edit" ? state.column : null;
    setName(column?.name ?? "");
    setColor(column?.color ?? DEFAULT_COLOR);
    setColorValid(true);
    setWipLimit(column?.wipLimit != null ? String(column.wipLimit) : "");
    setIsDone(column?.isDone ?? false);
    setError(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("errors.LABEL_NAME_REQUIRED"));
      return;
    }
    if (!colorValid) return;

    // An empty field means "no limit"; anything non-numeric is rejected here
    // rather than sent as NaN.
    const parsedWip = wipLimit.trim() === "" ? null : Number(wipLimit);
    if (parsedWip !== null && !Number.isInteger(parsedWip)) {
      setError(t("genericError"));
      return;
    }

    setSubmitting(true);
    try {
      if (state?.mode === "edit") {
        await columnsApi.update(state.column.id, {
          name: trimmed,
          color,
          wipLimit: parsedWip,
          isDone,
        });
      } else if (state) {
        await columnsApi.create({
          boardId: state.boardId,
          name: trimmed,
          color,
          wipLimit: parsedWip,
          isDone,
        });
      }
      toast.success(t("updatedToast"));
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setError(
          err.fieldErrors.name ?? err.fieldErrors.wipLimit ?? err.message,
        );
      } else {
        toast.error(t("genericError"));
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
            {state?.mode === "edit"
              ? t("columnDialogEditTitle")
              : t("columnDialogCreateTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={nameId}>{t("columnNameLabel")}</FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("columnNamePlaceholder")}
                aria-required="true"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus
              />
              <FieldError id={errorId}>{error}</FieldError>
            </Field>

            <LabelColorField
              value={color}
              onChange={setColor}
              onValidityChange={setColorValid}
              copy={colorCopy}
            />

            <Field>
              <FieldLabel htmlFor={wipId}>
                {t("columnWipLimitLabel")}
              </FieldLabel>
              <Input
                id={wipId}
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                value={wipLimit}
                onChange={(event) => setWipLimit(event.target.value)}
              />
              <FieldDescription>{t("columnWipLimitHint")}</FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id={doneId}
                checked={isDone}
                onCheckedChange={(checked) => setIsDone(checked === true)}
              />
              <div className="min-w-0">
                <FieldLabel htmlFor={doneId}>
                  {t("columnIsDoneLabel")}
                </FieldLabel>
                <FieldDescription>{t("columnIsDoneHint")}</FieldDescription>
              </div>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting || !colorValid}>
              {submitting && <Spinner data-icon="inline-start" aria-hidden />}
              {t("saveButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
