// @vitest-environment jsdom

import { Editor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";

import { NoteImage } from "@/components/notes/note-image-extension";

const ALLOWED = "/api/notes/images/cm12345678901234567890123";

const editors: Editor[] = [];

function createEditor(markdown: string): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, NoteImage, Markdown],
    content: markdown,
    contentType: "markdown",
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

describe("NoteImage", () => {
  it("renders a note image URL as an <img>", () => {
    const editor = createEditor(`# T\n\n![Contact sheet](${ALLOWED})\n`);

    const img = editor.view.dom.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", ALLOWED);
    expect(img).toHaveAttribute("alt", "Contact sheet");
    expect(
      editor.view.dom.querySelector("[data-note-image-blocked]"),
    ).toBeNull();
  });

  it.each([
    ["external https", "https://evil.example/p.png"],
    ["external http", "http://evil.example/p.png"],
    ["protocol-relative", "//evil.example/p.png"],
    ["data URL", "data:image/png;base64,iVBORw0KGgo="],
    ["javascript URL", "javascript:alert(1)"],
    ["other relative path", "/uploads/p.png"],
    ["note image with query", `${ALLOWED}?x=1`],
    ["note image with a malformed id", "/api/notes/images/not-a-cuid"],
  ])("renders no <img> for a %s source and keeps the Markdown", (_, src) => {
    const markdown = `![x](${src})`;
    const editor = createEditor(markdown);

    expect(editor.view.dom.querySelector("img")).toBeNull();
    const placeholder = editor.view.dom.querySelector(
      "[data-note-image-blocked]",
    );
    expect(placeholder).toHaveTextContent("x");
    expect(placeholder?.getAttribute("src")).toBeNull();
    expect(editor.getMarkdown().trim()).toBe(markdown);
  });

  it("falls back to the source text when the alt text is empty", () => {
    const editor = createEditor("![](https://evil.example/p.png)");

    expect(editor.view.dom.querySelector("img")).toBeNull();
    expect(
      editor.view.dom.querySelector("[data-note-image-blocked]"),
    ).toHaveTextContent("https://evil.example/p.png");
  });

  it("round-trips a note image alongside other content", () => {
    const markdown = `# T\n\n![Contact sheet](${ALLOWED})\n\nAfter the image.`;
    const editor = createEditor(markdown);

    expect(editor.getMarkdown().trim()).toBe(markdown);
  });

  it("round-trips an inline image inside a paragraph without dropping it", () => {
    const editor = createEditor(`Before ![a](${ALLOWED}) after`);

    expect(editor.getMarkdown()).toContain(`![a](${ALLOWED})`);
    expect(editor.getMarkdown()).toContain("Before");
    expect(editor.getMarkdown()).toContain("after");
  });
});
