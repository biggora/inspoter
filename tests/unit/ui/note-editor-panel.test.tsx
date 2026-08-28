// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import type { NoteDetail } from "@/lib/services/notes";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/components/notes/api", () => ({
  ApiError: class ApiError extends Error {},
  notesApi: { update: mocks.update },
}));

vi.mock("@/components/notes/note-markdown-editor", () => ({
  NoteMarkdownEditor: ({
    onChange,
  }: {
    onChange: (markdown: string) => void;
  }) => (
    <button type="button" onClick={() => onChange("# Updated")}>
      Change markdown
    </button>
  ),
}));

const now = new Date("2026-01-01T00:00:00.000Z");

const note: NoteDetail = {
  id: "note-1",
  title: "Original title",
  excerpt: "Original",
  folderId: null,
  isPinned: false,
  version: 1,
  createdAt: now,
  updatedAt: now,
  content: "Original",
};

describe("NoteEditorPanel", () => {
  it("saves Markdown content and resets the dirty state after success", async () => {
    const user = userEvent.setup();
    const updated = { ...note, content: "# Updated", version: 2 };
    mocks.update.mockResolvedValueOnce(updated);

    const { NoteEditorPanel } =
      await import("@/components/notes/note-editor-panel");
    renderWithIntl(<NoteEditorPanel note={note} />);

    await user.click(screen.getByRole("button", { name: "Change markdown" }));
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith("note-1", {
        title: "Original title",
        content: "# Updated",
        version: 1,
      }),
    );
    await waitFor(() => expect(saveButton).toBeDisabled());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
