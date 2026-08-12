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
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { DEFAULT_LABEL_CUSTOM_COLOR, type LabelColor } from "@/lib/label-color";
import { contactLabelsApi, type ContactLabelSummary } from "./api";

// Machine-readable codes from the contact-labels service, mapped to copy —
// the same contract mail/manage-labels-dialog.tsx and the services one use.
const ERROR_TRANSLATION_KEYS: Record<string, string> = {
  LABEL_NAME_CONFLICT: "labelNameConflict",
  LABEL_LIMIT_REACHED: "labelLimitReached",
};

type EditorState =
  { mode: "create" } | { mode: "edit"; label: ContactLabelSummary } | null;

export function ManageContactLabelsDialog({
  open,
  labels,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  labels: ContactLabelSummary[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  // Keyed by the open flag so closing the dialog discards the half-filled
  // editor rather than an effect having to clear it.
  return open ? (
    <LabelsManager
      labels={labels}
      onOpenChange={onOpenChange}
      onChanged={onChanged}
    />
  ) : null;
}

function LabelsManager({
  labels,
  onOpenChange,
  onChanged,
}: {
  labels: ContactLabelSummary[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("contacts");
  const [editor, setEditor] = useState<EditorState>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("SLATE");
  const [colorValid, setColorValid] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContactLabelSummary | null>(
    null,
  );

  function startCreate(): void {
    setEditor({ mode: "create" });
    setName("");
    setColor(DEFAULT_LABEL_CUSTOM_COLOR);
    setNameError(null);
  }

  function startEdit(label: ContactLabelSummary): void {
    setEditor({ mode: "edit", label });
    setName(label.name);
    setColor(label.color as LabelColor);
    setNameError(null);
  }

  function translateError(message: string): string {
    const key = ERROR_TRANSLATION_KEYS[message];
    return key ? t(key as "labelNameConflict") : message;
  }

  async function handleSave(): Promise<void> {
    if (editor === null) return;
    if (name.trim().length === 0) {
      setNameError(t("labelNameLabel"));
      return;
    }
    setSubmitting(true);
    try {
      if (editor.mode === "create") {
        await contactLabelsApi.create(name.trim(), color);
        toast.success(t("labelCreatedToast"));
      } else {
        await contactLabelsApi.update(editor.label.id, {
          name: name.trim(),
          color,
        });
        toast.success(t("labelUpdatedToast"));
      }
      setEditor(null);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? translateError(error.message)
          : t("genericError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (deleteTarget === null) return;
    setSubmitting(true);
    try {
      await contactLabelsApi.remove(deleteTarget.id);
      toast.success(t("labelDeletedToast"));
      setDeleteTarget(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("manageLabelsTitle")}</DialogTitle>
            <DialogDescription>
              {t("manageLabelsDescription")}
            </DialogDescription>
          </DialogHeader>

          {editor === null ? (
            <div className="flex flex-col gap-3">
              <Button type="button" onClick={startCreate} className="w-fit">
                <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
                {t("createLabelButton")}
              </Button>
              {labels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noLabelsYet")}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-background-100">
                  {labels.map((label) => (
                    <li key={label.id} className="flex items-center gap-2 py-2">
                      <LabelChip
                        label={{
                          name: label.name,
                          color: label.color as LabelColor,
                        }}
                      />
                      <span className="flex-1 text-xs text-muted-foreground">
                        {t("labelContactCount", { count: label.contactCount })}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("renameLabelLabel", { name: label.name })}
                        onClick={() => startEdit(label)}
                      >
                        <Icon name="ri-pencil-line" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("deleteLabelLabel", { name: label.name })}
                        onClick={() => setDeleteTarget(label)}
                      >
                        <Icon name="ri-delete-bin-line" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Field data-invalid={Boolean(nameError)}>
                <FieldLabel htmlFor="contact-label-name">
                  {t("labelNameLabel")}
                </FieldLabel>
                <Input
                  id="contact-label-name"
                  value={name}
                  maxLength={60}
                  placeholder={t("labelNamePlaceholder")}
                  onChange={(event) => setName(event.target.value)}
                  disabled={submitting}
                  aria-invalid={Boolean(nameError)}
                />
                <FieldError>{nameError}</FieldError>
              </Field>
              <LabelColorField
                value={color}
                onChange={setColor}
                onValidityChange={setColorValid}
                disabled={submitting}
                copy={{
                  groupLabel: t("labelColorLabel"),
                  presetColorName: (preset) =>
                    t(`labelColor${preset}` as "labelColorSLATE"),
                  customTitle: t("labelCustomColorLabel"),
                  customPickerLabel: t("labelCustomColorPickerLabel"),
                  customHexLabel: t("labelCustomColorHexLabel"),
                  customDescription: t("labelCustomColorDescription"),
                  invalidColor: t("validationLabelColorInvalid"),
                }}
              />
              <div className="rounded-lg border border-background-200 bg-background-50 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("labelPreviewLabel")}
                </p>
                <LabelChip
                  label={{
                    name: name.trim() || t("labelPreviewFallback"),
                    color,
                  }}
                  className="max-w-full"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {editor === null ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("closeButton")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditor(null)}
                  disabled={submitting}
                >
                  {t("cancelButton")}
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={submitting || !colorValid}
                >
                  {submitting ? t("savingButton") : t("saveLabelButton")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteLabelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteLabelDescription", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? t("deletingButton") : t("deleteConfirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
