// @vitest-environment jsdom

import { Editor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { ApiError, notesApi } from "@/components/notes/api";
import { NoteImage } from "@/components/notes/note-image-extension";
import {
  checkNoteImageFile,
  clipboardHasText,
  imageFilesFrom,
  insertNoteImages,
  noteMarkdown,
  noteImageAlt,
} from "@/components/notes/note-image-upload";
import { NOTE_IMAGE_MAX_BYTES } from "@/lib/notes/images";

const URL_A = "/api/notes/images/cm12345678901234567890123";
const URL_B = "/api/notes/images/cm22345678901234567890123";

const editors: Editor[] = [];

function createEditor(markdown = "Hello world"): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, NoteImage, Markdown],
    content: markdown,
    contentType: "markdown",
  });
  editors.push(editor);
  return editor;
}

function file(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

let uploadImage: MockInstance<typeof notesApi.uploadImage>;

beforeEach(() => {
  uploadImage = vi.spyOn(notesApi, "uploadImage");
});

afterEach(() => {
  vi.restoreAllMocks();
  while (editors.length) editors.pop()?.destroy();
});

describe("checkNoteImageFile", () => {
  it("accepts PNG, JPEG and WebP within the size limit", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(checkNoteImageFile(file("a", type))).toBeNull();
    }
    expect(
      checkNoteImageFile(file("a", "image/png", NOTE_IMAGE_MAX_BYTES)),
    ).toBeNull();
  });

  it("rejects other types, including SVG and GIF", () => {
    for (const type of ["image/svg+xml", "image/gif", "text/html", ""]) {
      expect(checkNoteImageFile(file("a", type))).toBe("unsupportedType");
    }
  });

  it("rejects files over the size limit", () => {
    expect(
      checkNoteImageFile(file("a", "image/png", NOTE_IMAGE_MAX_BYTES + 1)),
    ).toBe("tooLarge");
  });
});

describe("clipboardHasText", () => {
  const data = (plain: string, html: string) =>
    ({
      getData: (type: string) => (type === "text/plain" ? plain : html),
    }) as unknown as DataTransfer;

  it("is false for a bare image copy", () => {
    expect(clipboardHasText(null)).toBe(false);
    expect(clipboardHasText(data("", ""))).toBe(false);
    expect(clipboardHasText(data("  \n", ""))).toBe(false);
    expect(
      clipboardHasText(data("", `<meta charset="utf-8"><img src="x">`)),
    ).toBe(false);
  });

  it("is true for plain text or HTML with visible text", () => {
    expect(clipboardHasText(data("Hello", ""))).toBe(true);
    expect(clipboardHasText(data("", "<table><td>Q3</td></table>"))).toBe(true);
  });
});

describe("noteImageAlt", () => {
  it("drops the extension and characters that would break the Markdown", () => {
    expect(noteImageAlt("Contact sheet.final.png")).toBe("Contact sheet.final");
    expect(noteImageAlt("a[b]\\c.png")).toBe("a b c");
    expect(noteImageAlt("noext")).toBe("noext");
  });
});

describe("imageFilesFrom", () => {
  it("keeps only image files and tolerates a missing list", () => {
    const list = [
      file("a.png", "image/png"),
      file("b.txt", "text/plain"),
      file("c.svg", "image/svg+xml"),
    ];
    expect(
      imageFilesFrom(list as unknown as FileList).map((f) => f.name),
    ).toEqual(["a.png", "c.svg"]);
    expect(imageFilesFrom(null)).toEqual([]);
    expect(imageFilesFrom(undefined)).toEqual([]);
  });
});

describe("insertNoteImages", () => {
  it("rejects a wrong type and an oversized file before uploading", async () => {
    const editor = createEditor();
    const onFailure = vi.fn();

    await insertNoteImages(
      editor,
      [
        file("a.svg", "image/svg+xml"),
        file("b.png", "image/png", NOTE_IMAGE_MAX_BYTES + 1),
      ],
      onFailure,
    );

    expect(uploadImage).not.toHaveBeenCalled();
    expect(onFailure.mock.calls).toEqual([["unsupportedType"], ["tooLarge"]]);
    expect(editor.view.dom.querySelector("img")).toBeNull();
  });

  it("uploads and inserts an image node at the cursor", async () => {
    const editor = createEditor();
    uploadImage.mockResolvedValue({
      id: "cm12345678901234567890123",
      url: URL_A,
      markdown: `![shot](${URL_A})`,
    });
    const onFailure = vi.fn();

    await insertNoteImages(editor, [file("shot.png", "image/png")], onFailure);

    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    const img = editor.view.dom.querySelector("img");
    expect(img).toHaveAttribute("src", URL_A);
    expect(img).toHaveAttribute("alt", "shot");
    expect(editor.getMarkdown()).toContain(`![shot](${URL_A})`);
    expect(editor.getMarkdown()).toContain("Hello world");
  });

  it("inserts at the given position, clamped to the document", async () => {
    const editor = createEditor("Hello world");
    uploadImage.mockResolvedValue({ id: "x", url: URL_A, markdown: "" });

    // Position 6 is between "Hello" and " world".
    await insertNoteImages(editor, [file("a.png", "image/png")], vi.fn(), 6);
    expect(editor.getMarkdown()).toBe(`Hello\n\n![a](${URL_A})\n\n world`);

    const second = createEditor("Hi");
    await insertNoteImages(second, [file("b.png", "image/png")], vi.fn(), 9999);
    expect(second.getMarkdown()).toContain(`![b](${URL_A})`);
  });

  it("inserts several files in order and keeps going after a failure", async () => {
    const editor = createEditor("");
    uploadImage
      .mockResolvedValueOnce({ id: "1", url: URL_A, markdown: "" })
      .mockRejectedValueOnce(new ApiError("boom"))
      .mockResolvedValueOnce({ id: "2", url: URL_B, markdown: "" });
    const onFailure = vi.fn();

    await insertNoteImages(
      editor,
      [
        file("one.png", "image/png"),
        file("two.png", "image/png"),
        file("three.png", "image/png"),
      ],
      onFailure,
    );

    expect(onFailure.mock.calls).toEqual([["uploadFailed"]]);
    const markdown = editor.getMarkdown();
    const first = markdown.indexOf(`![one](${URL_A})`);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(markdown.indexOf(`![three](${URL_B})`)).toBeGreaterThan(first);
    expect(markdown).not.toContain("two");
  });

  it("leaves the cursor after the image so typing does not replace it", async () => {
    const editor = createEditor("");
    uploadImage.mockResolvedValue({ id: "x", url: URL_A, markdown: "" });

    await insertNoteImages(editor, [file("a.png", "image/png")], vi.fn());
    editor.chain().insertContent("caption").run();

    expect(noteMarkdown(editor)).toContain(`![a](${URL_A})`);
    expect(noteMarkdown(editor)).toContain("caption");
  });

  it("saves no &nbsp; or trailing blank lines for an image at the end", async () => {
    const editor = createEditor("only text");
    uploadImage.mockResolvedValue({ id: "x", url: URL_A, markdown: "" });
    editor.commands.focus("end");

    await insertNoteImages(editor, [file("t5.png", "image/png")], vi.fn());

    expect(noteMarkdown(editor)).toBe(`only text

![t5](${URL_A})`);
    expect(noteMarkdown(editor)).not.toContain("&nbsp;");
  });

  it("saves no &nbsp; for several images at the end of a note", async () => {
    const editor = createEditor("only text");
    uploadImage
      .mockResolvedValueOnce({ id: "1", url: URL_A, markdown: "" })
      .mockResolvedValueOnce({ id: "2", url: URL_B, markdown: "" });
    editor.commands.focus("end");

    await insertNoteImages(
      editor,
      [file("a.png", "image/png"), file("b.png", "image/png")],
      vi.fn(),
    );

    expect(noteMarkdown(editor)).toBe(
      `only text

![a](${URL_A})

![b](${URL_B})`,
    );
  });

  it("starts a new paragraph when typing at the cursor after a trailing image", async () => {
    const editor = createEditor("only text");
    uploadImage.mockResolvedValue({ id: "x", url: URL_A, markdown: "" });
    editor.commands.focus("end");

    await insertNoteImages(editor, [file("a.png", "image/png")], vi.fn());
    editor.chain().insertContent("caption").run();

    expect(noteMarkdown(editor)).toBe(
      `only text

![a](${URL_A})

caption`,
    );
  });

  it.each([
    ["NOTE_IMAGE_TOO_LARGE", "tooLarge"],
    ["NOTE_IMAGE_UNSUPPORTED_TYPE", "unsupportedType"],
    ["NOTE_IMAGE_INVALID", "uploadFailed"],
  ])("maps the %s server error to %s", async (code, expected) => {
    const editor = createEditor();
    uploadImage.mockRejectedValue(new ApiError(code, { code }));
    const onFailure = vi.fn();

    await insertNoteImages(editor, [file("a.png", "image/png")], onFailure);

    expect(onFailure.mock.calls).toEqual([[expected]]);
    expect(editor.view.dom.querySelector("img")).toBeNull();
  });

  it("refuses to insert a URL that is not a note image URL", async () => {
    const editor = createEditor();
    uploadImage.mockResolvedValue({
      id: "x",
      url: "https://evil.example/p.png",
      markdown: "",
    });
    const onFailure = vi.fn();

    await insertNoteImages(editor, [file("a.png", "image/png")], onFailure);

    expect(onFailure.mock.calls).toEqual([["uploadFailed"]]);
    expect(editor.getMarkdown()).not.toContain("evil.example");
  });
});

describe("notesApi.uploadImage", () => {
  it("posts multipart form data without forcing a JSON content type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: "x", url: URL_A, markdown: `![a](${URL_A})` }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const upload = file("a.png", "image/png");

    const result = await notesApi.uploadImage(upload);

    expect(result.url).toBe(URL_A);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/notes/images");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init.headers).not.toHaveProperty("Content-Type");
    vi.unstubAllGlobals();
  });

  it("surfaces the server error code as an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "NOTE_IMAGE_TOO_LARGE" }), {
          status: 413,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      notesApi.uploadImage(file("a.png", "image/png")),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "NOTE_IMAGE_TOO_LARGE",
    });
    vi.unstubAllGlobals();
  });
});
