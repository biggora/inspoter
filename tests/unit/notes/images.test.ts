import { describe, expect, it } from "vitest";
import {
  NOTE_IMAGE_CONTENT_TYPES,
  NOTE_IMAGE_MAX_BYTES,
  NOTE_IMAGE_URL_PREFIX,
  detectNoteImageType,
  extractNoteImageIds,
  isNoteImageUrl,
  noteImageMarkdown,
  noteImageUrl,
} from "@/lib/notes/images";

const ID = "ca1b2c3d4e5f6g7h8i9j0k1l2";
const OTHER_ID = "cz9y8x7w6v5u4t3s2r1q0p9o8";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const WEBP = [
  ...Buffer.from("RIFF"),
  0x24,
  0x00,
  0x00,
  0x00,
  ...Buffer.from("WEBPVP8 "),
];

function bytes(values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function text(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value));
}

describe("constants", () => {
  it("caps images at 2 MiB and allows exactly PNG, JPEG and WebP", () => {
    expect(NOTE_IMAGE_MAX_BYTES).toBe(2_097_152);
    expect([...NOTE_IMAGE_CONTENT_TYPES]).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });
});

describe("detectNoteImageType", () => {
  it("accepts PNG, JPEG and WebP by their magic bytes", () => {
    expect(detectNoteImageType(bytes(PNG))).toBe("image/png");
    expect(detectNoteImageType(bytes(JPEG))).toBe("image/jpeg");
    expect(detectNoteImageType(bytes(WEBP))).toBe("image/webp");
  });

  it("rejects SVG, even when it is well-formed", () => {
    expect(
      detectNoteImageType(
        text('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
      ),
    ).toBeNull();
    expect(
      detectNoteImageType(text('<?xml version="1.0"?><svg></svg>')),
    ).toBeNull();
  });

  it("rejects text and HTML regardless of what the upload claims to be", () => {
    // The function takes no filename or declared type: a file named .png or
    // sent as image/png is judged by its bytes alone.
    expect(detectNoteImageType(text("not really a png"))).toBeNull();
    expect(detectNoteImageType(text("<html><body>x</body></html>"))).toBeNull();
    expect(detectNoteImageType(text("GIF89a......"))).toBeNull();
  });

  it("rejects empty input and truncated headers", () => {
    expect(detectNoteImageType(new Uint8Array(0))).toBeNull();
    expect(detectNoteImageType(bytes(PNG.slice(0, 7)))).toBeNull();
    expect(detectNoteImageType(bytes([0xff, 0xd8]))).toBeNull();
    expect(detectNoteImageType(bytes(WEBP.slice(0, 11)))).toBeNull();
  });

  it("rejects a RIFF container that is not WebP", () => {
    const wave = [
      ...Buffer.from("RIFF"),
      0x24,
      0x00,
      0x00,
      0x00,
      ...Buffer.from("WAVEfmt "),
    ];
    expect(detectNoteImageType(bytes(wave))).toBeNull();
  });
});

describe("noteImageUrl / isNoteImageUrl", () => {
  it("builds the relative authenticated-route URL", () => {
    expect(NOTE_IMAGE_URL_PREFIX).toBe("/api/notes/images/");
    expect(noteImageUrl(ID)).toBe(`/api/notes/images/${ID}`);
  });

  it("accepts only the exact relative form", () => {
    expect(isNoteImageUrl(`/api/notes/images/${ID}`)).toBe(true);
  });

  it("rejects absolute, protocol-relative and data URLs", () => {
    expect(isNoteImageUrl(`https://example.com/api/notes/images/${ID}`)).toBe(
      false,
    );
    expect(isNoteImageUrl(`http://localhost/api/notes/images/${ID}`)).toBe(
      false,
    );
    expect(isNoteImageUrl(`//evil.test/api/notes/images/${ID}`)).toBe(false);
    expect(isNoteImageUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
    expect(isNoteImageUrl(`javascript:/api/notes/images/${ID}`)).toBe(false);
  });

  it("rejects query strings, fragments, traversal and trailing segments", () => {
    expect(isNoteImageUrl(`/api/notes/images/${ID}?x=1`)).toBe(false);
    expect(isNoteImageUrl(`/api/notes/images/${ID}#frag`)).toBe(false);
    expect(isNoteImageUrl(`/api/notes/images/${ID}/`)).toBe(false);
    expect(isNoteImageUrl(`/api/notes/images/${ID}/extra`)).toBe(false);
    expect(isNoteImageUrl(`/api/notes/images/../${ID}`)).toBe(false);
    expect(isNoteImageUrl(`/api/notes/images/..%2F${ID}`)).toBe(false);
    expect(isNoteImageUrl(`/x/../api/notes/images/${ID}`)).toBe(false);
    expect(isNoteImageUrl(` /api/notes/images/${ID}`)).toBe(false);
    expect(isNoteImageUrl(`/api/notes/images/${ID}\n`)).toBe(false);
  });

  it("rejects ids that do not have the cuid shape", () => {
    expect(isNoteImageUrl("/api/notes/images/")).toBe(false);
    expect(isNoteImageUrl("/api/notes/images/abc")).toBe(false);
    expect(isNoteImageUrl(`/api/notes/images/${ID.toUpperCase()}`)).toBe(false);
    expect(isNoteImageUrl(`/api/notes/images/${ID}x`)).toBe(false);
    expect(isNoteImageUrl(`/api/notes/images/${ID.slice(1)}`)).toBe(false);
  });
});

describe("noteImageMarkdown", () => {
  it("renders an image with the given alt text", () => {
    expect(noteImageMarkdown(ID, "Contact sheet")).toBe(
      `![Contact sheet](/api/notes/images/${ID})`,
    );
    expect(noteImageMarkdown(ID)).toBe(`![](/api/notes/images/${ID})`);
  });

  it("drops brackets so hostile alt text cannot close the image or open a link", () => {
    const markdown = noteImageMarkdown(ID, "a](https://evil.test) [b]");
    expect(markdown).toBe(
      String.raw`![a \(https://evil.test\) b](/api/notes/images/${ID})`,
    );
    // Exactly one image, pointing at the note image itself.
    expect(extractNoteImageIds(markdown)).toEqual([ID]);
    expect(markdown.match(/\]\(/g)).toHaveLength(1);
  });

  it("leaves no bracket or backslash in the alt, so the editor round trip is lossless", () => {
    for (const alt of ["[x]", "a]b[c", "back\\slash", "ends with\\", "\\]"]) {
      const markdown = noteImageMarkdown(ID, alt);
      const rendered = markdown.slice(2, markdown.indexOf("](/api/"));
      expect(rendered).not.toMatch(/[[\]\\]/);
      expect(extractNoteImageIds(markdown)).toEqual([ID]);
    }
    expect(noteImageMarkdown(ID, "back\\slash")).toBe(
      `![back slash](/api/notes/images/${ID})`,
    );
    expect(noteImageMarkdown(ID, "ends with\\")).toBe(
      `![ends with](/api/notes/images/${ID})`,
    );
  });

  it("collapses line breaks and tabs", () => {
    expect(noteImageMarkdown(ID, "one\r\ntwo\nthree\t four")).toBe(
      `![one two three four](/api/notes/images/${ID})`,
    );
  });
});

describe("extractNoteImageIds", () => {
  it("returns unique ids in order of first appearance", () => {
    const markdown = [
      `![one](/api/notes/images/${ID})`,
      "text between",
      `![two](/api/notes/images/${OTHER_ID})`,
      `![again](/api/notes/images/${ID})`,
    ].join("\n");
    expect(extractNoteImageIds(markdown)).toEqual([ID, OTHER_ID]);
  });

  it("ignores external, data and lookalike images", () => {
    const markdown = [
      "![ext](https://example.com/a.png)",
      `![abs](https://example.com/api/notes/images/${ID})`,
      "![data](data:image/png;base64,iVBORw0KGgo=)",
      `![query](/api/notes/images/${ID}?x=1)`,
      "![short](/api/notes/images/abc)",
      `[not an image](/api/notes/images/${ID})`,
    ].join("\n");
    expect(extractNoteImageIds(markdown)).toEqual([]);
  });

  it("accepts an optional title and handles an escaped bracket in alt", () => {
    expect(
      extractNoteImageIds(
        String.raw`![a \] b](/api/notes/images/${ID} "Title")`,
      ),
    ).toEqual([ID]);
  });

  it("returns an empty list for plain text", () => {
    expect(extractNoteImageIds("")).toEqual([]);
    expect(extractNoteImageIds("just some **markdown**")).toEqual([]);
  });
});
