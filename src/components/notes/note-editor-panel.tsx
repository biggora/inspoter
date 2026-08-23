"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { NoteDetail } from "@/lib/services/notes";
import { ApiError, notesApi } from "./api";

interface NoteEditorPanelProps {
  note: NoteDetail;
}

// Slice 1 editor: a title field and a plain Textarea, an explicit Save
// button, no autosave. The Markdown editor (TipTap) and its live wiki-link
// parsing land in a later slice — see the layout comment in
// src/lib/services/notes.ts's searchNotes for the same "not yet" marker on
// the search side.
//
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
  const [version, setVersion] = useState(note.version);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [suggestedTitle, setSuggestedTitle] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const dirty = title !== note.title || content !== note.content;
  const titleId = `note-${note.id}-title`;
  const contentId = `note-${note.id}-content`;

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
        <FieldLabel htmlFor={contentId} className="sr-only">
          {t("pageTitle")}
        </FieldLabel>
        <Textarea
          id={contentId}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="h-full min-h-0 flex-1 resize-none font-mono text-sm"
        />
      </Field>
    </div>
  );
}
