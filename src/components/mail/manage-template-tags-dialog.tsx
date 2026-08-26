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
import {
  DEFAULT_LABEL_CUSTOM_COLOR,
  type LabelColor,
  type LabelPresetColor,
} from "@/lib/label-color";
import {
  ApiError,
  createMailTemplateTag,
  deleteMailTemplateTag,
  patchMailTemplateTag,
  type MailTemplateTagSummaryDto,
} from "./api";

type EditorState =
  { mode: "create" } | { mode: "edit"; tag: MailTemplateTagSummaryDto } | null;

const LABEL_COLOR_MESSAGE_KEYS = {
  SLATE: "labelColorSLATE",
  RED: "labelColorRED",
  AMBER: "labelColorAMBER",
  GREEN: "labelColorGREEN",
  BLUE: "labelColorBLUE",
  VIOLET: "labelColorVIOLET",
} as const satisfies Record<LabelPresetColor, string>;

export function ManageTemplateTagsDialog({
  open,
  tags,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  tags: MailTemplateTagSummaryDto[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  return open ? (
    <TagManager tags={tags} onOpenChange={onOpenChange} onChanged={onChanged} />
  ) : null;
}

function TagManager({
  tags,
  onOpenChange,
  onChanged,
}: Omit<Parameters<typeof ManageTemplateTagsDialog>[0], "open">) {
  const t = useTranslations("mail");
  const [editor, setEditor] = useState<EditorState>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>(DEFAULT_LABEL_CUSTOM_COLOR);
  const [colorValid, setColorValid] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<MailTemplateTagSummaryDto | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function startCreate(): void {
    setEditor({ mode: "create" });
    setName("");
    setColor(DEFAULT_LABEL_CUSTOM_COLOR);
    setNameError(null);
  }

  function startEdit(tag: MailTemplateTagSummaryDto): void {
    setEditor({ mode: "edit", tag });
    setName(tag.name);
    setColor(tag.color);
    setNameError(null);
  }

  function translateError(error: unknown): string {
    if (!(error instanceof ApiError)) return t("templateGenericError");
    if (error.message === "TEMPLATE_TAG_NAME_CONFLICT") {
      return t("templateTagNameConflictError");
    }
    if (error.message === "TEMPLATE_TAG_LIMIT_REACHED") {
      return t("templateTagLimitError");
    }
    return error.message;
  }

  async function save(): Promise<void> {
    if (!editor) return;
    if (!name.trim()) {
      setNameError(t("templateTagNameLabel"));
      return;
    }
    setSubmitting(true);
    try {
      if (editor.mode === "create") {
        await createMailTemplateTag({ name: name.trim(), color });
        toast.success(t("templateTagCreatedToast"));
      } else {
        await patchMailTemplateTag(editor.tag.id, {
          name: name.trim(),
          color,
        });
        toast.success(t("templateTagUpdatedToast"));
      }
      setEditor(null);
      onChanged();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(): Promise<void> {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteMailTemplateTag(deleteTarget.id);
      toast.success(t("templateTagDeletedToast"));
      setDeleteTarget(null);
      onChanged();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("manageTemplateTagsTitle")}</DialogTitle>
            <DialogDescription>
              {t("manageTemplateTagsDescription")}
            </DialogDescription>
          </DialogHeader>

          {editor === null ? (
            <div className="flex flex-col gap-3">
              <Button type="button" className="w-fit" onClick={startCreate}>
                <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
                {t("createTemplateTagButton")}
              </Button>
              {tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noTemplateTags")}
                </p>
              ) : (
                <ul className="divide-y divide-background-100">
                  {tags.map((tag) => (
                    <li key={tag.id} className="flex items-center gap-2 py-2">
                      <LabelChip label={tag} />
                      <span className="flex-1 text-xs text-muted-foreground">
                        {t("templateTagCount", { count: tag.templateCount })}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("templateEditButton", { name: tag.name })}
                        onClick={() => startEdit(tag)}
                      >
                        <Icon name="ri-pencil-line" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("templateDeleteButton", {
                          name: tag.name,
                        })}
                        onClick={() => setDeleteTarget(tag)}
                      >
                        <Icon name="ri-delete-bin-line" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Field data-invalid={Boolean(nameError)}>
                <FieldLabel htmlFor="mail-template-tag-name">
                  {t("templateTagNameLabel")}
                </FieldLabel>
                <Input
                  id="mail-template-tag-name"
                  value={name}
                  maxLength={40}
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
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
                  presetColorName: (preset) =>
                    t(LABEL_COLOR_MESSAGE_KEYS[preset]),
                  customTitle: t("labelCustomColorLabel"),
                  customPickerLabel: t("labelCustomColorPickerLabel"),
                  customHexLabel: t("labelCustomColorHexLabel"),
                  customDescription: t("labelCustomColorDescription"),
                  invalidColor: t("validationLabelColorInvalid"),
                }}
              />
              <div className="rounded-lg border border-background-200 bg-background-50 p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  {t("templateTagPreview")}
                </p>
                <LabelChip
                  label={{
                    name: name.trim() || t("templateTagNameLabel"),
                    color,
                  }}
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
                  disabled={submitting}
                  onClick={() => setEditor(null)}
                >
                  {t("cancelButton")}
                </Button>
                <Button
                  type="button"
                  disabled={submitting || !colorValid}
                  onClick={save}
                >
                  {t("saveTemplateTagButton")}
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
            <AlertDialogTitle>{t("templateTagDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("templateTagDeleteDescription", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={submitting}
              onClick={remove}
            >
              {t("templateTagDeleteConfirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
