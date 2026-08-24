import { describe, expect, it, vi } from "vitest";

import {
  createCreateNoteTool,
  createSearchNotesTool,
  type CreateNoteToolContext,
  type SearchNotesToolContext,
} from "@/components/notes/web-mcp-tools";
import type { WebMcpToolResult } from "@/lib/web-mcp/define-tool";
import type { NoteFolderNode } from "@/lib/services/note-folders";
import type { NoteSummary } from "@/lib/services/notes";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function makeNote(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "note-1",
    title: "Runbook",
    excerpt: "How to restart the edge nodes.",
    folderId: null,
    isPinned: false,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeFolder(overrides: Partial<NoteFolderNode> = {}): NoteFolderNode {
  return {
    id: "folder-1",
    name: "Operations",
    parentFolderId: null,
    depth: 0,
    position: 0,
    noteCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Unwraps the JSON payload the tool result carries in its text content. */
function payload(result: WebMcpToolResult): unknown {
  return JSON.parse(result.content[0].text);
}

function text(result: WebMcpToolResult): string {
  return result.content[0].text;
}

describe("createSearchNotesTool", () => {
  function makeCtx(
    overrides: Partial<SearchNotesToolContext> = {},
  ): SearchNotesToolContext {
    return {
      search: vi.fn().mockResolvedValue({
        items: [makeNote(), makeNote({ id: "note-2", title: "Postmortem" })],
        total: 2,
      }),
      ...overrides,
    };
  }

  it("returns a compact projection of the matched notes", async () => {
    const ctx = makeCtx();
    const tool = createSearchNotesTool(ctx);

    const result = await tool.execute({ query: "runbook" });

    expect(result.isError).toBeUndefined();
    expect(payload(result)).toEqual({
      total: 2,
      notes: [
        {
          id: "note-1",
          title: "Runbook",
          excerpt: "How to restart the edge nodes.",
          folderId: null,
        },
        {
          id: "note-2",
          title: "Postmortem",
          excerpt: "How to restart the edge nodes.",
          folderId: null,
        },
      ],
    });
  });

  it("omits note content from the projection", async () => {
    const ctx = makeCtx();
    const tool = createSearchNotesTool(ctx);

    const result = await tool.execute({ query: "runbook" });
    const { notes } = payload(result) as { notes: Record<string, unknown>[] };

    expect(Object.keys(notes[0])).toEqual([
      "id",
      "title",
      "excerpt",
      "folderId",
    ]);
  });

  it("passes the query, limit and updatedAt sort through to search", async () => {
    const ctx = makeCtx();
    const tool = createSearchNotesTool(ctx);

    await tool.execute({ query: "edge", limit: 3 });

    expect(ctx.search).toHaveBeenCalledWith({
      query: "edge",
      limit: 3,
      sort: "updatedAt",
    });
  });

  it("defaults the limit to 10 when omitted", async () => {
    const ctx = makeCtx();
    const tool = createSearchNotesTool(ctx);

    await tool.execute({});

    expect(ctx.search).toHaveBeenCalledWith({
      query: undefined,
      limit: 10,
      sort: "updatedAt",
    });
  });

  it("rejects a limit above 25 via schema validation, without calling search", async () => {
    const ctx = makeCtx();
    const tool = createSearchNotesTool(ctx);

    const result = await tool.execute({ limit: 26 });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Invalid input");
    expect(ctx.search).not.toHaveBeenCalled();
  });

  it("trims long excerpts to keep the output small", async () => {
    const ctx = makeCtx({
      search: vi.fn().mockResolvedValue({
        items: [makeNote({ excerpt: "x".repeat(500) })],
        total: 1,
      }),
    });
    const tool = createSearchNotesTool(ctx);

    const result = await tool.execute({});
    const { notes } = payload(result) as { notes: { excerpt: string }[] };

    expect(notes[0].excerpt).toHaveLength(121);
    expect(notes[0].excerpt.endsWith("…")).toBe(true);
  });

  it("flags its output as untrusted, since note bodies are user-authored", () => {
    const tool = createSearchNotesTool(makeCtx());

    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
  });
});

describe("createCreateNoteTool", () => {
  function makeCtx(
    overrides: Partial<CreateNoteToolContext> = {},
  ): CreateNoteToolContext {
    return {
      listFolders: vi.fn().mockResolvedValue({
        folders: [
          makeFolder(),
          makeFolder({ id: "folder-2", name: "Incidents" }),
        ],
      }),
      create: vi.fn().mockImplementation(async (input) => ({
        ...makeNote(),
        id: "note-new",
        title: input.title,
        folderId: input.folderId ?? null,
        content: input.content ?? "",
      })),
      refresh: vi.fn(),
      ...overrides,
    };
  }

  it("creates a root note when no folder is given, without listing folders", async () => {
    const ctx = makeCtx();
    const tool = createCreateNoteTool(ctx);

    const result = await tool.execute({ title: "Scratch", content: "# hi" });

    expect(ctx.listFolders).not.toHaveBeenCalled();
    expect(ctx.create).toHaveBeenCalledWith({
      title: "Scratch",
      content: "# hi",
      folderId: undefined,
    });
    expect(payload(result)).toEqual({
      noteId: "note-new",
      title: "Scratch",
      folderId: null,
    });
  });

  it("resolves the folder by case-insensitive exact name", async () => {
    const ctx = makeCtx();
    const tool = createCreateNoteTool(ctx);

    await tool.execute({ title: "Scratch", folder: "incidents" });

    expect(ctx.create).toHaveBeenCalledWith({
      title: "Scratch",
      content: undefined,
      folderId: "folder-2",
    });
  });

  it("resolves the folder by unique case-insensitive substring", async () => {
    const ctx = makeCtx();
    const tool = createCreateNoteTool(ctx);

    await tool.execute({ title: "Scratch", folder: "oper" });

    expect(ctx.create).toHaveBeenCalledWith({
      title: "Scratch",
      content: undefined,
      folderId: "folder-1",
    });
  });

  it("resolves the folder by id", async () => {
    const ctx = makeCtx();
    const tool = createCreateNoteTool(ctx);

    await tool.execute({ title: "Scratch", folder: "folder-2" });

    expect(ctx.create).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: "folder-2" }),
    );
  });

  it("returns an error result naming the candidates when the folder is ambiguous", async () => {
    const ctx = makeCtx({
      listFolders: vi.fn().mockResolvedValue({
        folders: [
          makeFolder({ id: "folder-1", name: "Ops runbooks" }),
          makeFolder({ id: "folder-2", name: "Ops postmortems" }),
        ],
      }),
    });
    const tool = createCreateNoteTool(ctx);

    const result = await tool.execute({ title: "Scratch", folder: "ops" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Ops runbooks");
    expect(text(result)).toContain("Ops postmortems");
    expect(ctx.create).not.toHaveBeenCalled();
    expect(ctx.refresh).not.toHaveBeenCalled();
  });

  it("returns an error result when the folder is unknown", async () => {
    const ctx = makeCtx();
    const tool = createCreateNoteTool(ctx);

    const result = await tool.execute({ title: "Scratch", folder: "archive" });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('No match found for "archive".');
    expect(ctx.create).not.toHaveBeenCalled();
  });

  it("calls refresh() after the note is created", async () => {
    const ctx = makeCtx();
    const tool = createCreateNoteTool(ctx);

    await tool.execute({ title: "Scratch" });

    expect(ctx.refresh).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty title via schema validation, without calling create", async () => {
    const ctx = makeCtx();
    const tool = createCreateNoteTool(ctx);

    const result = await tool.execute({ title: "   " });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Invalid input");
    expect(ctx.create).not.toHaveBeenCalled();
  });

  it("surfaces a failing create as an error result", async () => {
    const ctx = makeCtx({
      create: vi.fn().mockRejectedValue(new Error("A note already exists.")),
    });
    const tool = createCreateNoteTool(ctx);

    const result = await tool.execute({ title: "Scratch" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("A note already exists.");
    expect(ctx.refresh).not.toHaveBeenCalled();
  });
});
