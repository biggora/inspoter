"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

interface NoteTreeToolbarProps {
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

// Root-level actions above the tree: new note/folder land at the vault
// root (folderId/parentFolderId null) — per-folder creation lives in each
// folder row's kebab menu (note-tree-item.tsx).
export function NoteTreeToolbar({
  onCreateNote,
  onCreateFolder,
  onExpandAll,
  onCollapseAll,
}: NoteTreeToolbarProps) {
  const t = useTranslations("notes");

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-background-200 p-2">
      <Button type="button" variant="ghost" size="sm" onClick={onCreateNote}>
        <Icon name="ri-file-add-line" aria-hidden data-icon="inline-start" />
        {t("createNoteAction")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("createFolderAction")}
        title={t("createFolderAction")}
        onClick={onCreateFolder}
      >
        <Icon name="ri-folder-add-line" aria-hidden />
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("expandAllAction")}
          title={t("expandAllAction")}
          onClick={onExpandAll}
        >
          <Icon name="ri-expand-height-line" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("collapseAllAction")}
          title={t("collapseAllAction")}
          onClick={onCollapseAll}
        >
          <Icon name="ri-collapse-diagonal-line" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
