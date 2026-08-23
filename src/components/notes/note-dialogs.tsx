"use client";

import { useId, useState, type FormEvent } from "react";
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
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { NoteFolderNode } from "@/lib/services/note-folders";
import type { NoteDetail, NoteSummary } from "@/lib/services/notes";
import { ApiError, noteFoldersApi, notesApi } from "./api";

// Every dialog the tree needs (create/rename note & folder, delete
// confirmations, move-to-folder) lives here — they share the same small
// shape (one Field, Save/Cancel, submitting state) that
// src/components/kanban/board-dialog.tsx and delete-dialogs.tsx use.

// --- Create / rename note ---

export type NoteFormDialogState =
  | { mode: "create"; folderId: string | null }
  | { mode: "rename"; note: NoteSummary };

interface NoteFormDialogProps {
  state: NoteFormDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (note: NoteDetail) => void;
}

export function NoteFormDialog({
  state,
  onOpenChange,
  onSaved,
}: NoteFormDialogProps) {
  const t = useTranslations("notes");
  const titleId = useId();
  const errorId = useId();

  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [suggestedTitle, setSuggestedTitle] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    setTitle(state?.mode === "rename" ? state.note.title : "");
    setError(undefined);
    setSuggestedTitle(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!state) return;

    setSubmitting(true);
    setError(undefined);
    setSuggestedTitle(undefined);
    try {
      const note =
        state.mode === "rename"
          ? await notesApi.update(state.note.id, {
              title: trimmed,
              version: state.note.version,
            })
          : await notesApi.create({
              title: trimmed,
              folderId: state.folderId,
            });
      toast.success(
        t(state.mode === "rename" ? "noteRenamedToast" : "noteCreatedToast"),
      );
      onSaved(note);
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOTE_TITLE_CONFLICT") {
        setError(
          t(state.mode === "rename" ? "renameNoteError" : "createNoteError"),
        );
        setSuggestedTitle(err.suggestedTitle);
      } else if (err instanceof ApiError && err.fieldErrors?.title) {
        setError(err.fieldErrors.title);
      } else if (
        err instanceof ApiError &&
        err.code === "NOTE_VERSION_CONFLICT"
      ) {
        toast.error(t("noteVersionConflictToast"));
      } else {
        toast.error(
          t(state.mode === "rename" ? "renameNoteError" : "createNoteError"),
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
            {state?.mode === "rename"
              ? t("noteDialogRenameTitle")
              : t("noteDialogCreateTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={titleId}>
                {t("noteDialogTitleLabel")}
              </FieldLabel>
              <Input
                id={titleId}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setSuggestedTitle(undefined);
                }}
                placeholder={t("noteDialogTitlePlaceholder")}
                aria-required="true"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus
              />
              <FieldError id={errorId}>{error}</FieldError>
              {suggestedTitle && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    setTitle(suggestedTitle);
                    setError(undefined);
                    setSuggestedTitle(undefined);
                  }}
                >
                  {t("useSuggestedTitleAction", { title: suggestedTitle })}
                </Button>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" aria-hidden />}
              {state?.mode === "rename" ? t("saveButton") : t("createButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Create / rename folder ---

export type FolderFormDialogState =
  | { mode: "create"; parentFolderId: string | null }
  | { mode: "rename"; folder: NoteFolderNode };

interface FolderFormDialogProps {
  state: FolderFormDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (folder: NoteFolderNode) => void;
}

export function FolderFormDialog({
  state,
  onOpenChange,
  onSaved,
}: FolderFormDialogProps) {
  const t = useTranslations("notes");
  const nameId = useId();
  const errorId = useId();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    setName(state?.mode === "rename" ? state.folder.name : "");
    setError(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!state) return;

    setSubmitting(true);
    setError(undefined);
    try {
      const folder =
        state.mode === "rename"
          ? await noteFoldersApi.update(state.folder.id, { name: trimmed })
          : await noteFoldersApi.create({
              name: trimmed,
              parentFolderId: state.parentFolderId,
            });
      toast.success(
        t(
          state.mode === "rename" ? "folderRenamedToast" : "folderCreatedToast",
        ),
      );
      onSaved(folder);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else if (
        err instanceof ApiError &&
        err.code === "NOTE_FOLDER_NAME_CONFLICT"
      ) {
        setError(
          t(
            state.mode === "rename" ? "renameFolderError" : "createFolderError",
          ),
        );
      } else {
        toast.error(
          t(
            state.mode === "rename" ? "renameFolderError" : "createFolderError",
          ),
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
            {state?.mode === "rename"
              ? t("folderDialogRenameTitle")
              : t("folderDialogCreateTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={nameId}>
                {t("folderDialogNameLabel")}
              </FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("folderDialogNamePlaceholder")}
                aria-required="true"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus
              />
              <FieldError id={errorId}>{error}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" aria-hidden />}
              {state?.mode === "rename" ? t("saveButton") : t("createButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Delete confirmations ---
// Same shared shape as src/components/kanban/delete-dialogs.tsx's
// ConfirmDelete: title, «name» in the description, one red action.

interface ConfirmDeleteProps {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

function ConfirmDelete({
  title,
  description,
  open,
  onOpenChange,
  onConfirm,
}: ConfirmDeleteProps) {
  const t = useTranslations("notes");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {t("deleteButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteNoteDialog({
  note,
  onOpenChange,
  onDeleted,
}: {
  note: { id: string; title: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("notes");

  return (
    <ConfirmDelete
      open={note !== null}
      onOpenChange={onOpenChange}
      title={t("deleteNoteTitle")}
      description={t("deleteNoteDescription", { title: note?.title ?? "" })}
      onConfirm={async () => {
        if (!note) return;
        try {
          await notesApi.remove(note.id);
          toast.success(t("noteDeletedToast"));
          onDeleted(note.id);
        } catch {
          toast.error(t("deleteNoteError"));
        }
      }}
    />
  );
}

export function DeleteFolderDialog({
  folder,
  onOpenChange,
  onDeleted,
}: {
  folder: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("notes");

  return (
    <ConfirmDelete
      open={folder !== null}
      onOpenChange={onOpenChange}
      title={t("deleteFolderTitle")}
      description={t("deleteFolderDescription", { name: folder?.name ?? "" })}
      onConfirm={async () => {
        if (!folder) return;
        try {
          await noteFoldersApi.remove(folder.id);
          toast.success(t("folderDeletedToast"));
          onDeleted(folder.id);
        } catch {
          toast.error(t("deleteFolderError"));
        }
      }}
    />
  );
}

// --- Move to folder ---

export type MoveDialogState =
  | { kind: "note"; note: NoteSummary }
  | { kind: "folder"; folder: NoteFolderNode };

const ROOT_VALUE = "__root__";

// A folder can't be moved into itself or into one of its own descendants —
// the server re-checks this (400, see note-folders.ts's updateFolder), but
// filtering the option list client-side avoids an obviously-doomed pick.
function collectDescendantIds(
  folders: NoteFolderNode[],
  rootId: string,
): Set<string> {
  const byParent = new Map<string | null, NoteFolderNode[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parentFolderId) ?? [];
    list.push(folder);
    byParent.set(folder.parentFolderId, list);
  }
  const result = new Set<string>();
  function walk(id: string) {
    for (const child of byParent.get(id) ?? []) {
      result.add(child.id);
      walk(child.id);
    }
  }
  walk(rootId);
  return result;
}

export function MoveItemDialog({
  state,
  folders,
  onOpenChange,
  onMoved,
}: {
  state: MoveDialogState | null;
  folders: NoteFolderNode[];
  onOpenChange: (open: boolean) => void;
  onMoved: () => void;
}) {
  const t = useTranslations("notes");
  const [target, setTarget] = useState<string>(ROOT_VALUE);
  const [submitting, setSubmitting] = useState(false);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    const currentFolderId =
      state?.kind === "note"
        ? state.note.folderId
        : (state?.folder.parentFolderId ?? null);
    setTarget(currentFolderId ?? ROOT_VALUE);
  }

  const excluded =
    state?.kind === "folder"
      ? new Set([
          state.folder.id,
          ...collectDescendantIds(folders, state.folder.id),
        ])
      : new Set<string>();
  const options = folders.filter((folder) => !excluded.has(folder.id));

  async function handleMove() {
    if (!state) return;
    const folderId = target === ROOT_VALUE ? null : target;

    setSubmitting(true);
    try {
      if (state.kind === "note") {
        await notesApi.move(state.note.id, folderId);
        toast.success(t("noteMovedToast"));
      } else {
        await noteFoldersApi.update(state.folder.id, {
          parentFolderId: folderId,
        });
        toast.success(t("folderMovedToast"));
      }
      onMoved();
    } catch {
      toast.error(t("moveError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("moveToFolderAction")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="note-move-target">
              {t("moveToFolderAction")}
            </FieldLabel>
            <Select
              value={target}
              onValueChange={(value) => setTarget(value as string)}
            >
              <SelectTrigger id="note-move-target" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ROOT_VALUE}>
                    {t("treeRootLabel")}
                  </SelectItem>
                  {options.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {"— ".repeat(folder.depth)}
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            {t("cancelButton")}
          </DialogClose>
          <Button type="button" disabled={submitting} onClick={handleMove}>
            {submitting && <Spinner data-icon="inline-start" aria-hidden />}
            {t("saveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
