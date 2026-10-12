// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { notesApi } from "@/components/notes/api";
import { NoteMarkdownEditor } from "@/components/notes/note-markdown-editor";
import { NOTE_IMAGE_MAX_BYTES } from "@/lib/notes/images";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const URL_A = "/api/notes/images/cm12345678901234567890123";

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
  image: "Insert image",
  imageUnsupportedType: "Unsupported image type",
  imageTooLarge: (maxMegabytes: number) => `Image over ${maxMegabytes} MB`,
  imageUploadFailed: "Image upload failed",
  link: "Link",
  linkUrl: "Link URL",
  applyLink: "Apply",
  removeLink: "Remove link",
  undo: "Undo",
  redo: "Redo",
};

// See note-markdown-editor.test.tsx: ProseMirror needs these layout APIs.
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
  return render(
    <NoteMarkdownEditor
      id="note-content"
      labelledBy="note-content-label"
      initialMarkdown={initialMarkdown}
      labels={labels}
      onChange={onChange}
    />,
  );
}

function file(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

function pasteFiles(
  target: Element,
  files: File[],
  text: { plain?: string; html?: string } = {},
) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      files,
      getData: (type: string) =>
        (type === "text/plain"
          ? text.plain
          : type === "text/html"
            ? text.html
            : "") ?? "",
      types: ["Files"],
    },
  });
  target.dispatchEvent(event);
  return event;
}

let uploadImage: MockInstance<typeof notesApi.uploadImage>;

beforeEach(() => {
  uploadImage = vi.spyOn(notesApi, "uploadImage").mockResolvedValue({
    id: "cm12345678901234567890123",
    url: URL_A,
    markdown: `![shot](${URL_A})`,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  toastError.mockClear();
});

describe("NoteMarkdownEditor images", () => {
  it("renders a stored image and shows no <img> for a foreign one", async () => {
    renderEditor(
      `![Mine](${URL_A})\n\n![Theirs](https://evil.example/p.png)\n\n![Inline](data:image/png;base64,AAAA)`,
    );

    const textbox = await screen.findByRole("textbox");

    const images = textbox.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", URL_A);
    expect(textbox.querySelectorAll("[data-note-image-blocked]")).toHaveLength(
      2,
    );
  });

  it("exposes a labelled toolbar button backed by a hidden image file input", async () => {
    renderEditor("Hello");

    const button = await screen.findByRole("button", { name: labels.image });
    const input = document.querySelector<HTMLInputElement>("input[type=file]");

    expect(button).toBeInTheDocument();
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    expect(input).toBeInTheDocument();
    expect(input).not.toBeVisible();
  });

  it("uploads a picked file and inserts the image", async () => {
    renderEditor("Hello");
    await screen.findByRole("textbox");
    const input = document.querySelector<HTMLInputElement>(
      "input[type=file]",
    ) as HTMLInputElement;

    await userEvent.upload(input, file("shot.png", "image/png"));

    await waitFor(() =>
      expect(screen.getByRole("textbox").querySelector("img")).toHaveAttribute(
        "src",
        URL_A,
      ),
    );
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("saves an image at the end of a note without &nbsp; or trailing blank lines", async () => {
    const onChange = vi.fn<(markdown: string) => void>();
    renderEditor("", onChange);
    await screen.findByRole("textbox");
    const input = document.querySelector<HTMLInputElement>(
      "input[type=file]",
    ) as HTMLInputElement;

    await userEvent.upload(input, file("t5.png", "image/png"));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith(`![t5](${URL_A})`);
    expect(onChange.mock.lastCall?.[0]).not.toContain("&nbsp;");
  });

  it("reports an unsupported picked file without uploading", async () => {
    renderEditor("Hello");
    await screen.findByRole("textbox");
    const input = document.querySelector<HTMLInputElement>(
      "input[type=file]",
    ) as HTMLInputElement;

    await userEvent
      .setup({ applyAccept: false })
      .upload(input, file("anim.gif", "image/gif"));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(labels.imageUnsupportedType),
    );
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("reports an oversized picked file with the size limit", async () => {
    renderEditor("Hello");
    await screen.findByRole("textbox");
    const input = document.querySelector<HTMLInputElement>(
      "input[type=file]",
    ) as HTMLInputElement;

    await userEvent.upload(
      input,
      file("big.png", "image/png", NOTE_IMAGE_MAX_BYTES + 1),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(labels.imageTooLarge(2)),
    );
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("uploads image files pasted from the clipboard and suppresses the default paste", async () => {
    renderEditor("Hello");
    const textbox = await screen.findByRole("textbox");

    const event = pasteFiles(textbox, [file("clip.png", "image/png")]);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(textbox.querySelector("img")).not.toBeNull());
    expect(uploadImage).toHaveBeenCalledTimes(1);
  });

  it("keeps the default paste when an image file comes with text/html", async () => {
    renderEditor("Hello");
    const textbox = await screen.findByRole("textbox");

    pasteFiles(textbox, [file("preview.png", "image/png")], {
      plain: "Quarter totals",
      html: "<p>Quarter totals</p>",
    });

    await waitFor(() => expect(textbox).toHaveTextContent("Quarter totals"));
    expect(uploadImage).not.toHaveBeenCalled();
    expect(textbox.querySelector("img")).toBeNull();
  });

  it("keeps the default paste when an image file comes with only text/html", async () => {
    renderEditor("Hello");
    const textbox = await screen.findByRole("textbox");

    pasteFiles(textbox, [file("preview.png", "image/png")], {
      html: "<table><tr><td>Q3 totals</td></tr></table>",
    });

    await waitFor(() => expect(textbox).toHaveTextContent("Q3 totals"));
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("uploads a copied image whose HTML is only an <img> tag", async () => {
    renderEditor("Hello");
    const textbox = await screen.findByRole("textbox");

    const event = pasteFiles(textbox, [file("copy.png", "image/png")], {
      html: `<meta charset="utf-8"><img src="https://example.com/p.png">`,
    });

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1));
  });

  it("leaves a paste without image files to Tiptap", async () => {
    renderEditor("Hello");
    const textbox = await screen.findByRole("textbox");

    fireEvent.paste(textbox, {
      clipboardData: { files: [], getData: () => "" },
    });
    pasteFiles(textbox, [file("notes.txt", "text/plain")]);

    expect(uploadImage).not.toHaveBeenCalled();
  });
});
