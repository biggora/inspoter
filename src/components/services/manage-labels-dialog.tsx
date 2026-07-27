"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { LabelChip } from "@/components/ui/label-chip";
import { LabelColorField } from "@/components/ui/label-color-field";
import { Spinner } from "@/components/ui/spinner";
import type { LabelColor } from "@/lib/label-color";
import {
  ApiError,
  serviceLabelsApi,
  type ServiceLabelListItemDto,
} from "./api";

// Machine-readable codes from @/lib/validation/services and
// @/lib/services/service-labels, mapped to locale-aware copy — same contract
// as mail/manage-labels-dialog.tsx.
const ERROR_TRANSLATION_KEYS: Record<string, string> = {
  LABEL_NAME_REQUIRED: "validationLabelNameRequired",
  LABEL_NAME_TOO_LONG: "validationLabelNameTooLong",
  LABEL_COLOR_INVALID: "validationLabelColorInvalid",
  LABEL_NAME_CONFLICT: "errorLabelNameConflict",
  LABEL_LIMIT_REACHED: "errorLabelLimitReached",
  RESOURCE_NOT_FOUND: "errorLabelNotFound",
  WORKSPACE_MEMBER_REQUIRED: "errorMembershipRequired",
};

type EditorState =
  { mode: "create" } | { mode: "edit"; label: ServiceLabelListItemDto } | null;

export interface ManageServiceLabelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: ServiceLabelListItemDto[];
  onChanged: (change?: { deletedId?: string }) => void;
}

export function ManageServiceLabelsDialog({
  open,
  onOpenChange,
  labels,
  onChanged,
}: ManageServiceLabelsDialogProps) {
  const t = useTranslations("services");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("SLATE");
  const [colorValid, setColorValid] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingLabelId, setPendingLabelId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<ServiceLabelListItemDto | null>(null);

  useEffect(() => {
    if (!editor) return;
    const frame = requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editor]);

  function translatedError(message: string): string {
    const key = ERROR_TRANSLATION_KEYS[message];
    return key ? t(key) : message;
  }

  function startCreate(event: MouseEvent<HTMLButtonElement>) {
    editorTriggerRef.current = event.currentTarget;
    setName("");
    setColor("SLATE");
    setColorValid(true);
    setNameError(null);
    setEditor({ mode: "create" });
  }

  function startEdit(
    event: MouseEvent<HTMLButtonElement>,
    label: ServiceLabelListItemDto,
  ) {
    editorTriggerRef.current = event.currentTarget;
    setName(label.name);
    setColor(label.color);
    setColorValid(true);
    setNameError(null);
    setEditor({ mode: "edit", label });
  }

  function closeEditor({ restoreFocus = true } = {}) {
    setEditor(null);
    setNameError(null);
    if (restoreFocus) {
      requestAnimationFrame(() => editorTriggerRef.current?.focus());
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || submitting || !colorValid) return;
    setSubmitting(true);
    setNameError(null);
    try {
      if (editor.mode === "create") {
        await serviceLabelsApi.create({ name, color });
        toast.success(t("labelCreatedToast"));
      } else {
        await serviceLabelsApi.update(editor.label.id, { name, color });
        toast.success(t("labelUpdatedToast"));
      }
      closeEditor();
      onChanged();
    } catch (mutationError) {
      if (mutationError instanceof ApiError) {
        const fieldMessage = mutationError.fieldErrors?.name;
        if (fieldMessage) {
          setNameError(translatedError(fieldMessage));
        } else if (mutationError.fieldErrors?.color) {
          toast.error(translatedError(mutationError.fieldErrors.color));
        } else {
          toast.error(translatedError(mutationError.message));
        }
      } else {
        toast.error(
          editor.mode === "create"
            ? t("errorCreateLabel")
            : t("errorUpdateLabel"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function requestDelete(
    event: MouseEvent<HTMLButtonElement>,
    label: ServiceLabelListItemDto,
  ) {
    deleteTriggerRef.current = event.currentTarget;
    setDeleteTarget(label);
  }

  function closeDelete() {
    setDeleteTarget(null);
    requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }

  async function confirmDelete() {
    if (!deleteTarget || pendingLabelId) return;
    const label = deleteTarget;
    setPendingLabelId(label.id);
    try {
      await serviceLabelsApi.remove(label.id);
      setDeleteTarget(null);
      toast.success(t("labelDeletedToast"));
      onChanged({ deletedId: label.id });
    } catch (mutationError) {
      toast.error(
        mutationError instanceof ApiError
          ? translatedError(mutationError.message)
          : t("errorDeleteLabel"),
      );
    } finally {
      setPendingLabelId(null);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && (submitting || pendingLabelId)) return;
    if (!nextOpen) {
      setEditor(null);
      setDeleteTarget(null);
      setNameError(null);
    }
    onOpenChange(nextOpen);
  }

  const disabled = submitting || pendingLabelId !== null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="gap-0 p-0 sm:max-w-xl">
          <DialogHeader className="border-b border-background-100 p-4 pr-12">
            <DialogTitle>{t("manageLabelsTitle")}</DialogTitle>
            <DialogDescription>
              {t("manageLabelsDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="p-4">
            {editor ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h3 className="font-heading text-sm font-semibold text-foreground-900">
                    {editor.mode === "create"
                      ? t("createLabelTitle")
                      : t("editLabelTitle", { name: editor.label.name })}
                  </h3>
                </div>

                <Field data-invalid={Boolean(nameError)}>
                  <FieldLabel htmlFor="manage-service-label-name">
                    {t("newLabelNameLabel")}
                  </FieldLabel>
                  <Input
                    ref={nameInputRef}
                    id="manage-service-label-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={40}
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
                    groupLabel: t("newLabelColorLabel"),
                    presetColorName: (preset) => t(`labelColor${preset}`),
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

                <div className="flex flex-col-reverse gap-2 border-t border-background-100 pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => closeEditor()}
                  >
                    {t("cancelButton")}
                  </Button>
                  <Button type="submit" disabled={submitting || !colorValid}>
                    {submitting && (
                      <Spinner aria-hidden data-icon="inline-start" />
                    )}
                    {submitting
                      ? t("savingLabelLabel")
                      : editor.mode === "create"
                        ? t("createLabelButton")
                        : t("updateLabelButton")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <Button type="button" onClick={startCreate} disabled={disabled}>
                  <Icon
                    name="ri-add-line"
                    aria-hidden
                    data-icon="inline-start"
                  />
                  {t("createLabelButton")}
                </Button>

                {labels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-background-200 p-5 text-center">
                    <p className="font-medium text-foreground-900">
                      {t("labelsManagerEmptyTitle")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("labelsManagerEmptyDescription")}
                    </p>
                  </div>
                ) : (
                  <ul
                    aria-label={t("labelsManagerListLabel")}
                    className="space-y-2"
                  >
                    {labels.map((label) => {
                      const pending = pendingLabelId === label.id;
                      return (
                        <li
                          key={label.id}
                          className="flex min-w-0 items-center gap-2 rounded-lg border border-background-200 bg-background-50 p-2"
                        >
                          <LabelChip label={label} className="max-w-44" />
                          <span className="mr-auto text-xs text-muted-foreground">
                            {t("labelServiceCount", {
                              count: label.serviceCount,
                            })}
                          </span>
                          {pending && (
                            <Spinner aria-label={t("updatingLabelLabel")} />
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={disabled}
                            aria-label={t("editLabelButton", {
                              name: label.name,
                            })}
                            onClick={(event) => startEdit(event, label)}
                          >
                            <Icon name="ri-edit-line" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={disabled}
                            aria-label={t("deleteLabelButton", {
                              name: label.name,
                            })}
                            onClick={(event) => requestDelete(event, label)}
                          >
                            <Icon name="ri-delete-bin-line" aria-hidden />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !pendingLabelId) closeDelete();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteLabelTitle", { name: deleteTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteLabelDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingLabelId)}>
              {t("cancelButton")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(pendingLabelId)}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {pendingLabelId && (
                <Spinner aria-hidden data-icon="inline-start" />
              )}
              {t("deleteLabelConfirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
