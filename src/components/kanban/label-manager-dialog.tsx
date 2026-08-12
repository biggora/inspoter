"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { LabelChip } from "@/components/ui/label-chip";
import { LabelColorField } from "@/components/ui/label-color-field";
import { Spinner } from "@/components/ui/spinner";
import type { LabelColor, LabelPresetColor } from "@/lib/label-color";
import type { KanbanLabelListItem } from "@/lib/services/kanban-labels";
import { ApiError, kanbanLabelsApi } from "./api";
import { useLabelColorCopy } from "./use-label-color-copy";

const DEFAULT_COLOR: LabelPresetColor = "BLUE";

interface LabelManagerDialogProps {
  open: boolean;
  labels: KanbanLabelListItem[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function LabelManagerDialog({
  open,
  labels,
  onOpenChange,
  onChanged,
}: LabelManagerDialogProps) {
  const t = useTranslations("kanban");
  const colorCopy = useLabelColorCopy();
  const nameId = useId();
  const errorId = useId();

  // One editor serves both "add" and "edit": `editingId === null` means the
  // form creates, otherwise it updates that label. Keeping a single form
  // avoids two copies of the same colour picker inside one dialog.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>(DEFAULT_COLOR);
  const [colorValid, setColorValid] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName("");
    setColor(DEFAULT_COLOR);
    setColorValid(true);
    setError(undefined);
  }

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) resetForm();
  }

  // The label routes answer with machine-readable codes so each locale can
  // phrase the conflict its own way (same contract as the service labels).
  function messageFor(err: unknown): string {
    if (err instanceof ApiError && err.code) {
      const known = [
        "LABEL_NAME_REQUIRED",
        "LABEL_NAME_TOO_LONG",
        "LABEL_COLOR_INVALID",
        "LABEL_UPDATE_REQUIRED",
        "LABEL_NAME_CONFLICT",
        "LABEL_LIMIT_REACHED",
      ] as const;
      const match = known.find((code) => code === err.code);
      if (match) return t(`errors.${match}`);
    }
    return t("genericError");
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("errors.LABEL_NAME_REQUIRED"));
      return;
    }
    if (!colorValid) return;

    setSubmitting(true);
    try {
      if (editingId) {
        await kanbanLabelsApi.update(editingId, { name: trimmed, color });
      } else {
        await kanbanLabelsApi.create(trimmed, color);
      }
      resetForm();
      onChanged();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await kanbanLabelsApi.remove(id);
      if (editingId === id) resetForm();
      onChanged();
    } catch (err) {
      toast.error(messageFor(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("labelsDialogTitle")}</DialogTitle>
          <DialogDescription>{t("labelsDialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {labels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("labelsEmpty")}</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {labels.map((label) => (
                <li
                  key={label.id}
                  className="flex items-center gap-2 rounded-md px-1 py-1"
                >
                  <LabelChip label={label} />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground-500">
                    {t("labelCardCount", { count: label.cardCount })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("labelEditLabel", { name: label.name })}
                    onClick={() => {
                      setEditingId(label.id);
                      setName(label.name);
                      setColor(label.color);
                      setColorValid(true);
                      setError(undefined);
                    }}
                  >
                    <Icon name="ri-pencil-line" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("labelDeleteLabel", { name: label.name })}
                    onClick={() => handleDelete(label.id)}
                  >
                    <Icon name="ri-delete-bin-line" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-3 rounded-lg border border-background-200 p-3">
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={nameId}>{t("labelNameLabel")}</FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={!!error || undefined}
                aria-describedby={error ? errorId : undefined}
              />
              <FieldError id={errorId}>{error}</FieldError>
            </Field>

            <LabelColorField
              value={color}
              onChange={setColor}
              onValidityChange={setColorValid}
              disabled={submitting}
              copy={colorCopy}
            />

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={submitting || !colorValid}
                onClick={handleSave}
              >
                {submitting && <Spinner data-icon="inline-start" aria-hidden />}
                {editingId ? t("labelSaveButton") : t("labelAddButton")}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={resetForm}
                >
                  {t("labelCancelButton")}
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            {t("cancelButton")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
