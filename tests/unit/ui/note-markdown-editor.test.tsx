// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NoteMarkdownEditor } from "@/components/notes/note-markdown-editor";

const labels = {
  toolbar: "Note formatting",
  blockType: "Text style",
  paragraph: "Paragraph",
  heading: (level: number) => `Heading ${level}`,
  bold: "Bold",
  italic: "Italic",
  strike: "Strikethrough",
  code: "Inline code",
  bulletList: "Bulleted list",
  orderedList: "Numbered list",
  blockquote: "Blockquote",
  codeBlock: "Code block",
  horizontalRule: "Horizontal rule",
  link: "Link",
  linkUrl: "Link URL",
  applyLink: "Apply",
  removeLink: "Remove link",
  undo: "Undo",
  redo: "Redo",
};

// ProseMirror uses layout APIs that jsdom does not implement. Returning the
// zero-sized jsdom rectangles is enough for keyboard-selection handling while
// keeping this test focused on the editor's document and Markdown output.
Object.defineProperty(Element.prototype, "getClientRects", {
  configurable: true,
  value() {
    return [this.getBoundingClientRect()];
  },
});
Object.defineProperty(Text.prototype, "getClientRects", {
  configurable: true,
  value() {
    return [this.parentElement?.getBoundingClientRect() ?? new DOMRect()];
  },
});
Object.defineProperty(Range.prototype, "getClientRects", {
  configurable: true,
  value() {
    return [new DOMRect()];
  },
});
Object.defineProperty(Range.prototype, "getBoundingClientRect", {
  configurable: true,
  value: () => new DOMRect(),
});
Object.defineProperty(document, "elementFromPoint", {
  configurable: true,
  value: () => null,
});

function renderEditor(
  initialMarkdown: string,
  onChange = vi.fn<(markdown: string) => void>(),
) {
  return {
    onChange,
    ...render(
      <NoteMarkdownEditor
        id="note-content"
        labelledBy="note-content-label"
        initialMarkdown={initialMarkdown}
        labels={labels}
        onChange={onChange}
      />,
    ),
  };
}

describe("NoteMarkdownEditor", () => {
  it("renders CommonMark as formatted editor content", async () => {
    renderEditor(
      "# Title\n\n**bold** and *italic*\n\n- item\n- another\n\n> quote\n\n```ts\nconst answer = 42;\n```",
    );

    const textbox = await screen.findByRole("textbox");

    expect(textbox).toHaveAttribute("aria-multiline", "true");
    expect(textbox).toHaveAttribute("aria-labelledby", "note-content-label");
    expect(textbox.querySelector("h1")).toHaveTextContent("Title");
    expect(textbox.querySelector("strong")).toHaveTextContent("bold");
    expect(textbox.querySelector("em")).toHaveTextContent("italic");
    expect(textbox.querySelectorAll("li")).toHaveLength(2);
    expect(textbox.querySelector("blockquote")).toHaveTextContent("quote");
    expect(textbox.querySelector("pre")).toHaveTextContent(
      "const answer = 42;",
    );
  });

  it("exposes an accessible formatting toolbar and serializes edits as Markdown", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(markdown: string) => void>();
    renderEditor("Title", onChange);

    expect(
      await screen.findByRole("toolbar", { name: labels.toolbar }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: labels.bold }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: labels.codeBlock }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: labels.blockType }),
    ).toBeInTheDocument();

    const textbox = screen.getByRole("textbox");
    textbox.focus();
    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("{Control>}b{/Control}");

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("**Title**"));
  });
});
