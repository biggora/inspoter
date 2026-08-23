"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { type NoteTreeNode, useNoteTreeContext } from "./note-tree";

interface NoteTreeItemProps {
  node: NoteTreeNode;
  level: number;
}

// A single row (folder or note) plus, for an expanded folder, the nested
// <ul role="group"> of its children — so this component recurses into
// itself for arbitrary-depth folders. The <li> stays a pure container (no
// handlers of its own): scripts/check-native-controls.mjs forbids
// interactive <li>, so every click/keydown target here is a Button.
export function NoteTreeItem({ node, level }: NoteTreeItemProps) {
  const t = useTranslations("notes");
  const ctx = useNoteTreeContext();

  const isFolder = node.kind === "folder";
  const isExpanded = isFolder && ctx.expanded.has(node.id);
  const children = isFolder ? ctx.childrenOf(node.id) : [];
  const isFocused = ctx.activeId === node.id;
  const isSelected = node.kind === "note" && node.id === ctx.selectedNoteId;
  const tabIndex = isFocused ? 0 : -1;

  // An explicit aria-label, not name-from-content: without it, an expanded
  // folder's accessible name would swallow every descendant row's text
  // (nested treeitems have no aria-owns boundary), making ancestor and
  // descendant rows indistinguishable by accessible name.
  const label = isFolder ? node.data.name : node.data.title;

  return (
    <li
      role="treeitem"
      aria-label={label}
      aria-level={level}
      aria-expanded={isFolder ? isExpanded : undefined}
      aria-selected={node.kind === "note" ? isSelected : undefined}
    >
      <div className="group/tree-row flex items-center gap-0.5 rounded-md pr-0.5 hover:bg-background-100">
        {node.kind === "folder" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            tabIndex={tabIndex}
            ref={(el) => ctx.registerItemRef(node.id, el)}
            onFocus={() => ctx.onFocusItem(node.id)}
            onClick={() => {
              ctx.onFocusItem(node.id);
              ctx.onToggleExpand(node.id);
            }}
            className="min-w-0 flex-1 justify-start gap-1.5 px-1.5 text-foreground-700 hover:bg-transparent hover:text-foreground-900"
          >
            <Icon
              name={isExpanded ? "ri-folder-open-line" : "ri-folder-line"}
              aria-hidden
              data-icon="inline-start"
              className="shrink-0 text-foreground-400"
            />
            <span className="truncate">{node.data.name}</span>
            <span className="ml-auto shrink-0 text-xs text-foreground-400">
              {t("folderNoteCount", { count: node.data.noteCount })}
            </span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={
              <Link href={`/notes/${node.id}`} onClick={ctx.onNavigate} />
            }
            aria-current={isSelected ? "page" : undefined}
            tabIndex={tabIndex}
            ref={(el) => ctx.registerItemRef(node.id, el)}
            onFocus={() => ctx.onFocusItem(node.id)}
            className={cn(
              "min-w-0 flex-1 justify-start gap-1.5 px-1.5 font-normal text-foreground-700 no-underline hover:bg-transparent hover:text-foreground-900",
              isSelected && "bg-secondary-100 text-foreground-900",
            )}
          >
            <Icon
              name="ri-file-text-line"
              aria-hidden
              data-icon="inline-start"
              className="shrink-0 text-foreground-400"
            />
            <span className="truncate">{node.data.title}</span>
            {node.data.isPinned && (
              <Icon
                name="ri-pushpin-2-fill"
                aria-hidden={false}
                aria-label={t("pinnedLabel")}
                className="ml-auto shrink-0 text-foreground-400"
              />
            )}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t(isFolder ? "folderMenuLabel" : "noteMenuLabel")}
                className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover/tree-row:opacity-100 data-popup-open:opacity-100"
              />
            }
          >
            <Icon name="ri-more-2-fill" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {node.kind === "folder" ? (
              <>
                <DropdownMenuItem onClick={() => ctx.onCreateNote(node.id)}>
                  {t("createNoteAction")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => ctx.onCreateFolder(node.id)}>
                  {t("createSubfolderAction")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => ctx.onRenameFolder(node.data)}>
                  {t("renameFolderAction")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => ctx.onMoveFolder(node.data)}>
                  {t("moveToFolderAction")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => ctx.onDeleteFolder(node.data)}
                >
                  {t("deleteFolderAction")}
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => ctx.onRenameNote(node.data)}>
                  {t("renameNoteAction")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => ctx.onMoveNote(node.data)}>
                  {t("moveToFolderAction")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => ctx.onDeleteNote(node.data)}
                >
                  {t("deleteNoteAction")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isFolder && isExpanded && children.length > 0 && (
        <ul role="group" className="pl-4">
          {children.map((child) => (
            <NoteTreeItem key={child.id} node={child} level={level + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
