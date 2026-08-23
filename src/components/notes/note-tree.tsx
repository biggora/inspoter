"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";

import type { NoteFolderNode } from "@/lib/services/note-folders";
import type { NoteSummary } from "@/lib/services/notes";
import { NoteTreeItem } from "./note-tree-item";

// A tree of arbitrary depth built from two flat lists (folders, notes) — see
// src/components/bookmarks/bookmarks-board.tsx's flattenCategories for the
// same "flat data, derive hierarchy in memory" idea, generalized here from
// one fixed level to N levels via a parentId -> children[] map.

export type NoteTreeNode =
  | { kind: "folder"; id: string; data: NoteFolderNode }
  | { kind: "note"; id: string; data: NoteSummary };

interface FlatNode {
  id: string;
  kind: "folder" | "note";
  level: number;
  parentId: string | null;
}

function buildChildrenMap(
  folders: NoteFolderNode[],
  notes: NoteSummary[],
): Map<string | null, NoteTreeNode[]> {
  const map = new Map<string | null, NoteTreeNode[]>();
  function bucket(parentId: string | null): NoteTreeNode[] {
    let arr = map.get(parentId);
    if (!arr) {
      arr = [];
      map.set(parentId, arr);
    }
    return arr;
  }
  // Folders first, in the position order listFolders already returns —
  // grouping by parentFolderId here preserves that relative order per
  // group even though the source array interleaves every parent's rows.
  for (const folder of folders) {
    bucket(folder.parentFolderId).push({
      kind: "folder",
      id: folder.id,
      data: folder,
    });
  }
  // Notes appended after folders in each bucket, alphabetically — there is
  // no manual note ordering in this slice (that is drag-and-drop, a later
  // slice), so title order is the only predictable one.
  const sortedNotes = [...notes].sort((a, b) => a.title.localeCompare(b.title));
  for (const note of sortedNotes) {
    bucket(note.folderId).push({ kind: "note", id: note.id, data: note });
  }
  return map;
}

function flattenVisible(
  childrenOf: (parentId: string | null) => NoteTreeNode[],
  expanded: Set<string>,
): FlatNode[] {
  const result: FlatNode[] = [];
  function walk(parentId: string | null, level: number) {
    for (const node of childrenOf(parentId)) {
      result.push({ id: node.id, kind: node.kind, level, parentId });
      if (node.kind === "folder" && expanded.has(node.id)) {
        walk(node.id, level + 1);
      }
    }
  }
  walk(null, 1);
  return result;
}

interface NoteTreeContextValue {
  childrenOf: (parentId: string | null) => NoteTreeNode[];
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  selectedNoteId: string | null;
  activeId: string | null;
  onFocusItem: (id: string) => void;
  registerItemRef: (id: string, el: HTMLElement | null) => void;
  onNavigate?: () => void;
  onCreateNote: (folderId: string | null) => void;
  onCreateFolder: (parentFolderId: string | null) => void;
  onRenameNote: (note: NoteSummary) => void;
  onRenameFolder: (folder: NoteFolderNode) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onDeleteFolder: (folder: NoteFolderNode) => void;
  onMoveNote: (note: NoteSummary) => void;
  onMoveFolder: (folder: NoteFolderNode) => void;
}

const NoteTreeContext = createContext<NoteTreeContextValue | null>(null);

export function useNoteTreeContext(): NoteTreeContextValue {
  const ctx = useContext(NoteTreeContext);
  if (!ctx) {
    throw new Error("useNoteTreeContext must be used within NoteTree");
  }
  return ctx;
}

interface NoteTreeProps {
  folders: NoteFolderNode[];
  notes: NoteSummary[];
  selectedNoteId: string | null;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onNavigate?: () => void;
  onCreateNote: (folderId: string | null) => void;
  onCreateFolder: (parentFolderId: string | null) => void;
  onRenameNote: (note: NoteSummary) => void;
  onRenameFolder: (folder: NoteFolderNode) => void;
  onDeleteNote: (note: NoteSummary) => void;
  onDeleteFolder: (folder: NoteFolderNode) => void;
  onMoveNote: (note: NoteSummary) => void;
  onMoveFolder: (folder: NoteFolderNode) => void;
  className?: string;
}

export function NoteTree({
  folders,
  notes,
  selectedNoteId,
  expanded,
  onToggleExpand,
  onNavigate,
  onCreateNote,
  onCreateFolder,
  onRenameNote,
  onRenameFolder,
  onDeleteNote,
  onDeleteFolder,
  onMoveNote,
  onMoveFolder,
  className,
}: NoteTreeProps) {
  const t = useTranslations("notes");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());

  const childrenByParent = useMemo(
    () => buildChildrenMap(folders, notes),
    [folders, notes],
  );
  const childrenOf = useCallback(
    (parentId: string | null) => childrenByParent.get(parentId) ?? [],
    [childrenByParent],
  );
  const rootItems = childrenOf(null);

  const visible = useMemo(
    () => flattenVisible(childrenOf, expanded),
    [childrenOf, expanded],
  );

  const activeId =
    focusedId && visible.some((node) => node.id === focusedId)
      ? focusedId
      : (selectedNoteId ?? visible[0]?.id ?? null);

  const registerItemRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  }, []);

  function focusVisibleIndex(index: number) {
    const target = visible[index];
    if (!target) return;
    setFocusedId(target.id);
    itemRefs.current.get(target.id)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const currentIndex = visible.findIndex((node) => node.id === activeId);
    if (currentIndex === -1) return;
    const current = visible[currentIndex]!;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusVisibleIndex(Math.min(currentIndex + 1, visible.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        focusVisibleIndex(Math.max(currentIndex - 1, 0));
        break;
      case "ArrowRight":
        if (current.kind === "folder") {
          event.preventDefault();
          if (!expanded.has(current.id)) {
            onToggleExpand(current.id);
          } else {
            focusVisibleIndex(currentIndex + 1);
          }
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (current.kind === "folder" && expanded.has(current.id)) {
          onToggleExpand(current.id);
        } else if (current.parentId) {
          const parentIndex = visible.findIndex(
            (node) => node.id === current.parentId,
          );
          focusVisibleIndex(parentIndex);
        }
        break;
      case "Enter":
        if (current.kind === "folder") {
          event.preventDefault();
          onToggleExpand(current.id);
        }
        break;
      default:
        break;
    }
  }

  const contextValue: NoteTreeContextValue = {
    childrenOf,
    expanded,
    onToggleExpand,
    selectedNoteId,
    activeId,
    onFocusItem: setFocusedId,
    registerItemRef,
    onNavigate,
    onCreateNote,
    onCreateFolder,
    onRenameNote,
    onRenameFolder,
    onDeleteNote,
    onDeleteFolder,
    onMoveNote,
    onMoveFolder,
  };

  return (
    <NoteTreeContext.Provider value={contextValue}>
      <ul
        role="tree"
        aria-label={t("treeRootLabel")}
        onKeyDown={handleKeyDown}
        className={className}
      >
        {rootItems.map((node) => (
          <NoteTreeItem key={node.id} node={node} level={1} />
        ))}
      </ul>
    </NoteTreeContext.Provider>
  );
}
