"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { NoteDetail } from "@/lib/services/notes";
import { ApiError, notesApi } from "./api";
import { NoteMarkdownEditor } from "./note-markdown-editor";

interface NoteEditorPanelProps {
  note: NoteDetail;
}

// Rendered with `key={note.id}` by the [id] page below, so navigating
// between notes remounts this component instead of needing a
// reset-on-prop-change effect — the same simplification the mail composer
// uses for switching drafts.
export function NoteEditorPanel({ note }: NoteEditorPanelProps) {
  const t = useTranslations("notes");
  const format = useFormatter();
  const router = useRouter();

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [savedContent, setSavedContent] = useState(note.content);
  const [version, setVersion] = useState(note.version);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [suggestedTitle, setSuggestedTitle] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const dirty = title !== note.title || content !== savedContent;
  const titleId = `note-${note.id}-title`;
  const contentId = `note-${note.id}-content`;
  const contentLabelId = `${contentId}-label`;

  async function handleSave() {
    setSubmitting(true);
    setTitleError(undefined);
    setSuggestedTitle(undefined);
    try {
      const updated = await notesApi.update(note.id, {
        title: title.trim(),
        content,
        version,
      });
      setVersion(updated.version);
      setTitle(updated.title);
      setSavedContent(updated.content);
      setContent(updated.content);
      toast.success(t("noteSavedToast"));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOTE_VERSION_CONFLICT") {
        toast.error(t("noteVersionConflictToast"));
      } else if (
        err instanceof ApiError &&
        err.code === "NOTE_TITLE_CONFLICT"
      ) {
        setTitleError(t("renameNoteError"));
        setSuggestedTitle(err.suggestedTitle);
      } else if (err instanceof ApiError && err.fieldErrors?.title) {
        setTitleError(err.fieldErrors.title);
      } else {
        toast.error(t("genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Field
          className="min-w-0 flex-1"
          data-invalid={!!titleError || undefined}
        >
          <FieldLabel htmlFor={titleId} className="sr-only">
            {t("noteDialogTitleLabel")}
          </FieldLabel>
          <Input
            id={titleId}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleError(undefined);
              setSuggestedTitle(undefined);
            }}
            placeholder={t("noteDialogTitlePlaceholder")}
            aria-invalid={!!titleError || undefined}
            className="text-lg font-semibold"
          />
          <FieldError>{titleError}</FieldError>
          {suggestedTitle && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                setTitle(suggestedTitle);
                setTitleError(undefined);
                setSuggestedTitle(undefined);
              }}
            >
              {t("useSuggestedTitleAction", { title: suggestedTitle })}
            </Button>
          )}
        </Field>
        <Button
          type="button"
          onClick={handleSave}
          disabled={submitting || !dirty}
        >
          {submitting && <Spinner data-icon="inline-start" aria-hidden />}
          {t("saveButton")}
        </Button>
      </div>

      <p className="shrink-0 text-xs text-foreground-400">
        {t("updatedLabel", {
          date: format.dateTime(new Date(note.updatedAt), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })}
      </p>

      <Field className="min-h-0 flex-1">
        <FieldLabel id={contentLabelId} htmlFor={contentId} className="sr-only">
          {t("pageTitle")}
        </FieldLabel>
        <NoteMarkdownEditor
          id={contentId}
          labelledBy={contentLabelId}
          initialMarkdown={note.content}
          labels={{
            toolbar: t("editorToolbarLabel"),
            blockType: t("editorBlockType"),
            paragraph: t("editorParagraph"),
            heading: (level) => t("editorHeading", { level }),
            bold: t("editorBold"),
            italic: t("editorItalic"),
            strike: t("editorStrike"),
            code: t("editorCode"),
            bulletList: t("editorBulletList"),
            orderedList: t("editorOrderedList"),
            blockquote: t("editorBlockquote"),
            codeBlock: t("editorCodeBlock"),
            horizontalRule: t("editorHorizontalRule"),
            link: t("editorLink"),
            linkUrl: t("editorLinkUrl"),
            applyLink: t("editorApplyLink"),
            removeLink: t("editorRemoveLink"),
            undo: t("editorUndo"),
            redo: t("editorRedo"),
          }}
          onChange={setContent}
        />
      </Field>
    </div>
  );
}
