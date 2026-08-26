"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelChip } from "@/components/ui/label-chip";
import {
  ApiError,
  createMailTemplate,
  patchMailTemplate,
  type MailTemplateDetailDto,
  type MailTemplateTagSummaryDto,
} from "./api";
import { RichTextEditor, type RichTextValue } from "./rich-text-editor";

export type TemplateEditorMode = "create" | "edit" | "duplicate";

export function MailTemplateEditorDialog({
  open,
  mode,
  template,
  tags,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: TemplateEditorMode;
  template: MailTemplateDetailDto | null;
  tags: MailTemplateTagSummaryDto[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return open ? (
    <TemplateEditor
      mode={mode}
      template={template}
      tags={tags}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  ) : null;
}

function TemplateEditor({
  mode,
  template,
  tags,
  onOpenChange,
  onSaved,
}: Omit<Parameters<typeof MailTemplateEditorDialog>[0], "open">) {
  const t = useTranslations("mail");
  const baseId = useId();
  const [name, setName] = useState(
    mode === "duplicate" ? "" : (template?.name ?? ""),
  );
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState<RichTextValue>({
    html: template?.bodyHtml ?? "<p></p>",
    text: template?.bodyText ?? "",
    isEmpty: !template?.bodyText.trim(),
  });
  const [starred, setStarred] = useState(
    mode === "duplicate" ? false : (template?.starred ?? false),
  );
  const [tagIds, setTagIds] = useState(
    new Set(template?.tags.map((tag) => tag.id) ?? []),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const title =
    mode === "edit"
      ? t("editTemplateTitle")
      : mode === "duplicate"
        ? t("duplicateTemplateTitle")
        : t("createTemplateTitle");

  function toggleTag(id: string, checked: boolean): void {
    setTagIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function translateError(error: unknown): string {
    if (!(error instanceof ApiError)) return t("templateGenericError");
    if (error.message === "TEMPLATE_NAME_CONFLICT") {
      return t("templateNameConflictError");
    }
    if (error.message === "TEMPLATE_LIMIT_REACHED") {
      return t("templateLimitError");
    }
    if (error.message === "INVALID_VARIABLE_NAME") {
      return t("templateVariableNameError");
    }
    if (error.message === "TOO_MANY_VARIABLES") {
      return t("templateVariableLimitError");
    }
    return error.message;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = t("templateValidationName");
    if (!subject.trim() && !body.text.trim()) {
      nextErrors.body = t("templateValidationContent");
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      const input = {
        name: name.trim(),
        subject,
        bodyText: body.text,
        bodyHtml: body.html,
        starred,
        tagIds: [...tagIds],
      };
      if (mode === "edit" && template) {
        await patchMailTemplate(template.id, input);
        toast.success(t("templateUpdatedToast"));
      } else {
        await createMailTemplate(input);
        toast.success(t("templateCreatedToast"));
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t("templateEditorDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-0.5 py-1">
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor={`${baseId}-name`}>
                {t("templateNameLabel")}
              </FieldLabel>
              <Input
                id={`${baseId}-name`}
                value={name}
                maxLength={100}
                autoFocus
                placeholder={t("templateNamePlaceholder")}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(errors.name)}
              />
              <FieldError>{errors.name}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${baseId}-subject`}>
                {t("templateSubjectLabel")}
              </FieldLabel>
              <Input
                id={`${baseId}-subject`}
                value={subject}
                maxLength={500}
                onChange={(event) => setSubject(event.target.value)}
              />
            </Field>

            <Field data-invalid={Boolean(errors.body)}>
              <FieldLabel id={`${baseId}-body-label`}>
                {t("templateBodyLabel")}
              </FieldLabel>
              <RichTextEditor
                id={`${baseId}-body`}
                labelledBy={`${baseId}-body-label`}
                initialHtml={template?.bodyHtml}
                invalid={Boolean(errors.body)}
                onChange={setBody}
                onSubmitShortcut={() => undefined}
                labels={{
                  toolbar: t("formatToolbarLabel"),
                  bold: t("formatBold"),
                  italic: t("formatItalic"),
                  underline: t("formatUnderline"),
                  bulletList: t("formatBulletList"),
                  orderedList: t("formatOrderedList"),
                  blockquote: t("formatBlockquote"),
                  link: t("formatLink"),
                  linkUrl: t("linkUrlLabel"),
                  applyLink: t("applyLinkButton"),
                  removeLink: t("removeLinkButton"),
                  clearFormatting: t("clearFormattingButton"),
                  undo: t("undoButton"),
                  redo: t("redoButton"),
                }}
              />
              <FieldError>{errors.body}</FieldError>
              <p className="text-xs text-muted-foreground">
                {t("templateVariablesHint", { example: "{{variable}}" })}
              </p>
            </Field>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t("templateTagsLabel")}
              </legend>
              {tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("templateNoTagsAvailable")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Label
                      key={tag.id}
                      htmlFor={`mail-template-tag-${tag.id}`}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-background-200 px-2.5 py-2"
                    >
                      <Checkbox
                        id={`mail-template-tag-${tag.id}`}
                        checked={tagIds.has(tag.id)}
                        onCheckedChange={(checked) =>
                          toggleTag(tag.id, checked === true)
                        }
                      />
                      <LabelChip label={tag} />
                    </Label>
                  ))}
                </div>
              )}
            </fieldset>

            <Label
              htmlFor="mail-template-starred"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-background-200 px-3 py-2.5 text-sm"
            >
              <Checkbox
                id="mail-template-starred"
                checked={starred}
                onCheckedChange={(checked) => setStarred(checked === true)}
              />
              {t("templateStarredLabel")}
            </Label>
          </div>

          <DialogFooter className="mt-5 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {t("cancelButton")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("savingTemplateLabel") : t("saveTemplateButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
