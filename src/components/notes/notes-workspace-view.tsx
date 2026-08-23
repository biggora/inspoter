"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { NoteFolderNode } from "@/lib/services/note-folders";
import type { NoteSummary } from "@/lib/services/notes";
import {
  DeleteFolderDialog,
  DeleteNoteDialog,
  FolderFormDialog,
  MoveItemDialog,
  NoteFormDialog,
  type FolderFormDialogState,
  type MoveDialogState,
  type NoteFormDialogState,
} from "./note-dialogs";
import { NoteTree } from "./note-tree";
import { NoteTreeToolbar } from "./note-tree-toolbar";

interface NotesWorkspaceViewProps {
  folders: NoteFolderNode[];
  notes: NoteSummary[];
  children: ReactNode;
}

// The frame every /notes/** route shares: a folder tree panel (persistent
// rail from lg upward, a Sheet below it — the same split
// src/components/mail/mail-client-view.tsx uses for its account sidebar)
// plus the routed content on the right (empty state or the note editor).
// Rendered from the section layout so the tree never remounts while
// navigating between notes — only `children` (the routed page) changes.
export function NotesWorkspaceView({
  folders,
  notes,
  children,
}: NotesWorkspaceViewProps) {
  const t = useTranslations("notes");
  const router = useRouter();
  const pathname = usePathname();

  const selectedNoteId = useMemo(() => {
    const match = /^\/notes\/([^/]+)$/.exec(pathname);
    return match ? match[1]! : null;
  }, [pathname]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);

  const [noteDialog, setNoteDialog] = useState<NoteFormDialogState | null>(
    null,
  );
  const [folderDialog, setFolderDialog] =
    useState<FolderFormDialogState | null>(null);
  const [deleteNote, setDeleteNote] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialogState | null>(null);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(folders.map((folder) => folder.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  const treeProps = {
    folders,
    notes,
    selectedNoteId,
    expanded,
    onToggleExpand: toggleExpand,
    onCreateNote: (folderId: string | null) =>
      setNoteDialog({ mode: "create", folderId }),
    onCreateFolder: (parentFolderId: string | null) =>
      setFolderDialog({ mode: "create", parentFolderId }),
    onRenameNote: (note: NoteSummary) =>
      setNoteDialog({ mode: "rename", note }),
    onRenameFolder: (folder: NoteFolderNode) =>
      setFolderDialog({ mode: "rename", folder }),
    onDeleteNote: (note: NoteSummary) =>
      setDeleteNote({ id: note.id, title: note.title }),
    onDeleteFolder: (folder: NoteFolderNode) =>
      setDeleteFolder({ id: folder.id, name: folder.name }),
    onMoveNote: (note: NoteSummary) => setMoveDialog({ kind: "note", note }),
    onMoveFolder: (folder: NoteFolderNode) =>
      setMoveDialog({ kind: "folder", folder }),
  };

  return (
    <PageBody fullBleed>
      <div className="shrink-0 border-b border-background-200 px-6 pt-6 pb-4">
        <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[260px] shrink-0 flex-col border-r border-background-200 bg-background-50 max-lg:hidden">
          <NoteTreeToolbar
            onCreateNote={() =>
              setNoteDialog({ mode: "create", folderId: null })
            }
            onCreateFolder={() =>
              setFolderDialog({ mode: "create", parentFolderId: null })
            }
            onExpandAll={expandAll}
            onCollapseAll={collapseAll}
          />
          <NoteTree
            {...treeProps}
            className="min-h-0 flex-1 overflow-y-auto p-2"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-background-200 p-2 lg:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMobileTreeOpen(true)}
            >
              <Icon
                name="ri-folder-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("pageTitle")}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>

      <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
        <SheetContent
          side="left"
          className="flex w-3/4 flex-col gap-0 p-0 sm:max-w-xs"
        >
          <SheetHeader className="border-b border-background-200">
            <SheetTitle>{t("pageTitle")}</SheetTitle>
          </SheetHeader>
          <NoteTreeToolbar
            onCreateNote={() =>
              setNoteDialog({ mode: "create", folderId: null })
            }
            onCreateFolder={() =>
              setFolderDialog({ mode: "create", parentFolderId: null })
            }
            onExpandAll={expandAll}
            onCollapseAll={collapseAll}
          />
          <NoteTree
            {...treeProps}
            onNavigate={() => setMobileTreeOpen(false)}
            className="min-h-0 flex-1 overflow-y-auto p-2"
          />
        </SheetContent>
      </Sheet>

      <NoteFormDialog
        state={noteDialog}
        onOpenChange={(open) => !open && setNoteDialog(null)}
        onSaved={(note) => {
          const wasCreate = noteDialog?.mode === "create";
          setNoteDialog(null);
          if (wasCreate) {
            router.push(`/notes/${note.id}`);
          } else {
            router.refresh();
          }
        }}
      />
      <FolderFormDialog
        state={folderDialog}
        onOpenChange={(open) => !open && setFolderDialog(null)}
        onSaved={(folder) => {
          setFolderDialog(null);
          setExpanded((prev) => new Set(prev).add(folder.id));
          router.refresh();
        }}
      />
      <DeleteNoteDialog
        note={deleteNote}
        onOpenChange={(open) => !open && setDeleteNote(null)}
        onDeleted={(id) => {
          setDeleteNote(null);
          if (id === selectedNoteId) router.push("/notes");
          router.refresh();
        }}
      />
      <DeleteFolderDialog
        folder={deleteFolder}
        onOpenChange={(open) => !open && setDeleteFolder(null)}
        onDeleted={() => {
          setDeleteFolder(null);
          router.refresh();
        }}
      />
      <MoveItemDialog
        state={moveDialog}
        folders={folders}
        onOpenChange={(open) => !open && setMoveDialog(null)}
        onMoved={() => {
          setMoveDialog(null);
          router.refresh();
        }}
      />
    </PageBody>
  );
}
