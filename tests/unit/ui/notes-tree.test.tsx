// @vitest-environment jsdom

import { useState } from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { NoteTree } from "@/components/notes/note-tree";
import type { NoteFolderNode } from "@/lib/services/note-folders";
import type { NoteSummary } from "@/lib/services/notes";

// next-intl's Link renders no <a> under jsdom without a mocked router
// context (only its text reaches the DOM) — the same quirk
// src/components/dashboards/dashboard-widget-frame.tsx's test works around,
// so the mock below mirrors tests/unit/ui/dashboard-widgets.test.tsx.
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const now = new Date("2026-01-01T00:00:00.000Z");

function makeFolder(overrides: Partial<NoteFolderNode>): NoteFolderNode {
  return {
    id: "folder",
    name: "Folder",
    parentFolderId: null,
    depth: 0,
    position: 0,
    noteCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeNote(overrides: Partial<NoteSummary>): NoteSummary {
  return {
    id: "note",
    title: "Note",
    excerpt: "",
    folderId: null,
    isPinned: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Work (root folder)
//   Projects (nested subfolder, depth 2)
//   Work Note (note inside Work)
// Root Note (root-level note)
const folders: NoteFolderNode[] = [
  makeFolder({ id: "f1", name: "Work", position: 0, noteCount: 1 }),
  makeFolder({
    id: "f2",
    name: "Projects",
    parentFolderId: "f1",
    depth: 1,
    position: 0,
  }),
];

const notes: NoteSummary[] = [
  makeNote({ id: "n1", title: "Root Note" }),
  makeNote({ id: "n2", title: "Work Note", folderId: "f1" }),
];

const noop = () => {};

function Harness() {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function onToggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <NoteTree
      folders={folders}
      notes={notes}
      selectedNoteId={null}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      onCreateNote={noop}
      onCreateFolder={noop}
      onRenameNote={noop}
      onRenameFolder={noop}
      onDeleteNote={noop}
      onDeleteFolder={noop}
      onMoveNote={noop}
      onMoveFolder={noop}
    />
  );
}

// Each row renders two buttons (the primary row control, then the kebab
// "…Actions" menu trigger) — the primary control is always first, and its
// accessible name includes translated, interpolated text (the note count),
// so tests target it structurally instead of matching that text.
function rowControl(item: HTMLElement): HTMLElement {
  return within(item).getAllByRole("button")[0]!;
}

describe("NoteTree", () => {
  it("renders role=tree with a treeitem for every visible folder and note", () => {
    renderWithIntl(<Harness />);

    expect(screen.getByRole("tree")).toBeInTheDocument();
    // Collapsed by default: only the two root-level rows are visible —
    // "Projects" is nested under "Work" and not rendered yet.
    expect(screen.getAllByRole("treeitem")).toHaveLength(2);
    expect(screen.getByRole("treeitem", { name: "Work" })).toBeInTheDocument();
    expect(
      screen.getByRole("treeitem", { name: "Root Note" }),
    ).toBeInTheDocument();
  });

  it("toggles aria-expanded when the folder row (the disclosure control) is clicked", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Harness />);

    const folderItem = screen.getByRole("treeitem", { name: "Work" });
    expect(folderItem).toHaveAttribute("aria-expanded", "false");

    await user.click(rowControl(folderItem));

    expect(folderItem).toHaveAttribute("aria-expanded", "true");
    // Expanding reveals the nested folder and the note inside it.
    expect(
      screen.getByRole("treeitem", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("treeitem", { name: "Work Note" }),
    ).toBeInTheDocument();

    await user.click(rowControl(folderItem));
    expect(folderItem).toHaveAttribute("aria-expanded", "false");
  });

  it("reflects nesting depth via aria-level and renders the nested folder inside its parent's DOM subtree", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Harness />);

    const workItem = screen.getByRole("treeitem", { name: "Work" });
    await user.click(rowControl(workItem));

    const projectsItem = screen.getByRole("treeitem", { name: "Projects" });

    expect(workItem).toHaveAttribute("aria-level", "1");
    expect(projectsItem).toHaveAttribute("aria-level", "2");

    // "Projects" is a DOM descendant of "Work"'s <li>, not a sibling.
    expect(within(workItem).getByRole("treeitem", { name: "Projects" })).toBe(
      projectsItem,
    );
  });

  it("moves focus between rows with the arrow keys", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Harness />);

    const workRow = rowControl(screen.getByRole("treeitem", { name: "Work" }));
    workRow.focus();
    expect(workRow).toHaveFocus();

    // The note row is a next-intl Link rendered through Button's `render`
    // prop (see note-tree-item.tsx) — Base UI's Button always presents
    // role="button" for a11y consistency, even over an <a>.
    await user.keyboard("{ArrowDown}");
    const rootNoteRow = rowControl(
      screen.getByRole("treeitem", { name: "Root Note" }),
    );
    expect(rootNoteRow).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(workRow).toHaveFocus();
  });
});
