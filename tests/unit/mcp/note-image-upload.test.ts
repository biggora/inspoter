import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNoteImage: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/config/env", () => ({
  env: { LIST_PAGE_SIZE: 50, MAIL_SEND_RATE_LIMIT: 10 },
}));
vi.mock("@/lib/services/logs", () => ({ logError: mocks.logError }));
// Keep the real error classes: the MCP error mapping recognizes them by
// identity, so only the one function that touches the database is replaced.
vi.mock("@/lib/services/note-images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/note-images")>()),
  createNoteImage: mocks.createNoteImage,
}));

import { NOTE_IMAGE_MAX_BYTES } from "@/lib/notes/images";
import { findTool, selectTools } from "@/lib/mcp/server";
import {
  NoteImageInvalidError,
  NoteImageTooLargeError,
  NoteImageUnsupportedTypeError,
} from "@/lib/services/note-images";
import { NoteNotFoundError } from "@/lib/services/notes";

const TOOL = "note_image_upload";
const CONTEXT = {
  workspaceId: "ws-1",
  scopes: ["notes:write"] as const,
  tokenId: "token-1",
  tokenName: "test token",
};
const MAX_BASE64_LENGTH = Math.ceil(NOTE_IMAGE_MAX_BYTES / 3) * 4;
// PNG signature plus two bytes, enough to survive a base64 round trip.
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02,
]);

function tool() {
  const found = findTool(TOOL);
  if (!found) throw new Error(`${TOOL} is not registered`);
  return found;
}

function textOf(result: { content: unknown[] }): string {
  return (result.content[0] as { text: string }).text;
}

describe("note_image_upload scope", () => {
  it("is advertised to a token holding notes:write", () => {
    const names = selectTools(["notes:write"]).map((entry) => entry.name);

    expect(names).toContain(TOOL);
  });

  it("is hidden from a notes:read token", () => {
    const names = selectTools(["notes:read"]).map((entry) => entry.name);

    expect(names).not.toContain(TOOL);
    expect(names).toContain("notes_get");
  });

  it("is a non-read-only write tool that tells the caller how to use it", () => {
    expect(tool().scope).toBe("notes:write");
    expect(tool().readOnly).toBe(false);
    expect(tool().title).toBe("Upload a note image");
    expect(tool().description).toContain("PNG, JPEG or WebP");
    expect(tool().description).toContain("2 MiB");
    expect(tool().description).toContain("notes_create or notes_update");
    expect(tool().description).toContain("24 hours");
    expect(tool().description).toContain("notes_get");
  });
});

describe("note_image_upload input schema", () => {
  const schema = () => tool().inputSchema;

  it("accepts standard base64 with optional alt and noteId", () => {
    const base64 = Buffer.from(PNG_BYTES).toString("base64");

    expect(schema().safeParse({ base64 }).success).toBe(true);
    expect(
      schema().safeParse({ base64, alt: "Diagram", noteId: "note-1" }).success,
    ).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["a data URL", "data:image/png;base64,iVBORw0KGgo="],
    ["URL-safe base64", "iVBO-_8="],
    ["a wrong padding length", "iVBORw"],
    ["text", "not base64 at all!"],
  ])("rejects %s", (_label, base64) => {
    expect(schema().safeParse({ base64 }).success).toBe(false);
  });

  it("rejects a missing base64 field and an over-long alt", () => {
    expect(schema().safeParse({}).success).toBe(false);
    expect(
      schema().safeParse({ base64: "AAAA", alt: "a".repeat(201) }).success,
    ).toBe(false);
  });

  it("rejects an oversize payload before it is ever decoded", () => {
    expect(
      schema().safeParse({ base64: "A".repeat(MAX_BASE64_LENGTH) }).success,
    ).toBe(true);
    expect(
      schema().safeParse({ base64: "A".repeat(MAX_BASE64_LENGTH + 4) }).success,
    ).toBe(false);
    expect(mocks.createNoteImage).not.toHaveBeenCalled();
  });
});

describe("note_image_upload handler", () => {
  beforeEach(() => {
    mocks.createNoteImage.mockReset();
    mocks.logError.mockClear();
  });

  it("decodes the base64 and returns the service's reference", async () => {
    const ref = {
      id: "img-1",
      url: "/api/notes/images/img-1",
      markdown: "![Contact sheet](/api/notes/images/img-1)",
    };
    mocks.createNoteImage.mockResolvedValue(ref);

    const result = await tool().invoke(
      {
        base64: Buffer.from(PNG_BYTES).toString("base64"),
        alt: "Contact sheet",
        noteId: "note-1",
      },
      CONTEXT,
    );

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual(ref);
    expect(mocks.createNoteImage).toHaveBeenCalledTimes(1);
    const [workspaceId, input] = mocks.createNoteImage.mock.calls[0];
    expect(workspaceId).toBe("ws-1");
    expect(input.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(input.bytes as Uint8Array)).toEqual(
      Array.from(PNG_BYTES),
    );
    expect(input.alt).toBe("Contact sheet");
    expect(input.noteId).toBe("note-1");
  });

  it.each([
    [
      "an unsupported type such as SVG",
      new NoteImageUnsupportedTypeError(),
      "Only PNG, JPEG and WebP images are supported.",
    ],
    [
      "an oversize image",
      new NoteImageTooLargeError(),
      "Image exceeds the maximum size.",
    ],
    [
      "a malformed image",
      new NoteImageInvalidError(),
      "The image is empty or malformed.",
    ],
  ])(
    "answers %s with its own message, not a crash",
    async (_l, error, text) => {
      mocks.createNoteImage.mockRejectedValue(error);

      const result = await tool().invoke(
        { base64: Buffer.from("<svg/>").toString("base64") },
        CONTEXT,
      );

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(text);
      expect(mocks.logError).not.toHaveBeenCalled();
    },
  );

  it("reports an unknown noteId as a not-found tool error", async () => {
    mocks.createNoteImage.mockRejectedValue(new NoteNotFoundError());

    const result = await tool().invoke(
      {
        base64: Buffer.from(PNG_BYTES).toString("base64"),
        noteId: "missing-note",
      },
      CONTEXT,
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Note not found: missing-note");
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("still logs and hides an unexpected failure", async () => {
    mocks.createNoteImage.mockRejectedValue(new Error("connection refused"));

    const result = await tool().invoke(
      { base64: Buffer.from(PNG_BYTES).toString("base64") },
      CONTEXT,
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain("connection refused");
    expect(mocks.logError).toHaveBeenCalledTimes(1);
  });
});
