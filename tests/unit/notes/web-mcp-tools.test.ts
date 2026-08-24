import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCreateNoteTool,
  createNotesTools,
  createSearchNotesTool,
  type CreateNoteToolContext,
  type NotesToolDeps,
  type SearchNotesToolContext,
} from "@/components/notes/web-mcp-tools";
import type { WebMcpTool, WebMcpToolResult } from "@/lib/web-mcp/define-tool";
import type { NoteFolderNode } from "@/lib/services/note-folders";
import type { NoteDetail, NoteSummary } from "@/lib/services/notes";

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

  // Paired with the test above: the default lives in the zod schema and is
  // applied by `safeParse`, so the advertised JSON Schema must present `limit`
  // as something the caller may omit rather than must send.
  it("advertises limit as optional, since the schema supplies the default", () => {
    const tool = createSearchNotesTool(makeCtx());
    const schema = tool.inputSchema as {
      required?: string[];
      properties?: Record<string, { default?: unknown }>;
    };

    expect(schema.required ?? []).not.toContain("limit");
    expect(schema.properties?.limit?.default).toBe(10);
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

  it("carries a non-empty title for agent clients that caption the tool", () => {
    expect(createSearchNotesTool(makeCtx()).title).toBe("Search notes");
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

  it("carries a non-empty title for agent clients that caption the tool", () => {
    expect(createCreateNoteTool(makeCtx()).title).toBe("Create note");
  });
});

// ---------------------------------------------------------------------------
// The full set
// ---------------------------------------------------------------------------

function makeDetail(overrides: Partial<NoteDetail> = {}): NoteDetail {
  return { ...makeNote(), content: "# Runbook\nRestart the edge nodes.", ...overrides };
}

/** The ApiError shape notes/api.ts throws on an optimistic-concurrency clash. */
function versionConflict(): Error {
  return Object.assign(new Error("NOTE_VERSION_CONFLICT"), {
    code: "NOTE_VERSION_CONFLICT",
    currentVersion: 9,
  });
}

describe("createNotesTools", () => {
  let deps: NotesToolDeps;

  /** Looks a tool up by its advertised name, failing loudly when it is absent. */
  function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`No tool named "${name}" was registered.`);
    return tool;
  }

  beforeEach(() => {
    deps = {
      search: vi
        .fn()
        .mockResolvedValue({ items: [makeNote()], total: 1 }),
      listFolders: vi.fn().mockResolvedValue({
        folders: [
          makeFolder(),
          makeFolder({
            id: "folder-2",
            name: "Incidents",
            parentFolderId: "folder-1",
            depth: 1,
            noteCount: 4,
          }),
        ],
      }),
      create: vi
        .fn()
        .mockImplementation(async (input: { title: string }) =>
          makeDetail({ id: "note-new", title: input.title }),
        ),
      get: vi.fn().mockResolvedValue(makeDetail({ version: 7 })),
      update: vi
        .fn()
        .mockImplementation(async (_id: string, input: { title?: string }) =>
          makeDetail({ title: input.title ?? "Runbook", version: 8 }),
        ),
      remove: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
    };
  });

  it("registers the tool names the notes surface advertises", () => {
    expect(createNotesTools(deps).map((tool) => tool.name)).toEqual([
      "note_search",
      "note_folders_list",
      "note_get",
      "note_create",
      "note_update",
      "note_delete",
    ]);
  });

  it("gives every tool a non-empty title for agent clients that caption them", () => {
    for (const tool of createNotesTools(deps)) {
      expect(tool.title.length).toBeGreaterThan(0);
    }
  });

  it("marks exactly the read tools readOnly", () => {
    const readOnly = createNotesTools(deps)
      .filter((tool) => tool.annotations.readOnlyHint)
      .map((tool) => tool.name);

    expect(readOnly).toEqual(["note_search", "note_folders_list", "note_get"]);
  });

  describe("note_update", () => {
    it("reads the note first and passes its current version through", async () => {
      const tool = toolNamed(createNotesTools(deps), "note_update");

      const result = await tool.execute({
        noteId: "note-1",
        title: "Runbook v2",
      });

      expect(deps.get).toHaveBeenCalledWith("note-1");
      expect(deps.update).toHaveBeenCalledWith("note-1", {
        title: "Runbook v2",
        content: undefined,
        version: 7,
      });
      expect(deps.refresh).toHaveBeenCalledTimes(1);
      expect(payload(result)).toEqual({
        noteId: "note-1",
        title: "Runbook v2",
        version: 8,
      });
    });

    it("never asks the agent for a version", () => {
      const schema = toolNamed(createNotesTools(deps), "note_update")
        .inputSchema as { properties?: Record<string, unknown> };

      expect(Object.keys(schema.properties ?? {})).toEqual([
        "noteId",
        "title",
        "content",
      ]);
    });

    it("explains a version conflict in terms the agent can act on", async () => {
      deps.update = vi.fn().mockRejectedValue(versionConflict());
      const tool = toolNamed(createNotesTools(deps), "note_update");

      const result = await tool.execute({ noteId: "note-1", content: "new" });
      const message = text(result);

      expect(result.isError).toBe(true);
      expect(message).toContain("changed");
      expect(message).toContain("note_get");
      expect(message).not.toBe("NOTE_VERSION_CONFLICT");
      expect(deps.refresh).not.toHaveBeenCalled();
    });

    it("passes other failures through unchanged", async () => {
      deps.update = vi.fn().mockRejectedValue(new Error("network down"));
      const tool = toolNamed(createNotesTools(deps), "note_update");

      const result = await tool.execute({ noteId: "note-1", content: "new" });

      expect(text(result)).toBe("network down");
    });

    it("insists on at least one of title or content, without reading the note", async () => {
      const tool = toolNamed(createNotesTools(deps), "note_update");

      const result = await tool.execute({ noteId: "note-1" });

      expect(text(result)).toContain("Invalid input");
      expect(deps.get).not.toHaveBeenCalled();
      expect(deps.update).not.toHaveBeenCalled();
    });
  });

  describe("note_get", () => {
    it("returns the note body alongside its id and folder", async () => {
      const tool = toolNamed(createNotesTools(deps), "note_get");

      const result = await tool.execute({ noteId: "note-1" });

      expect(deps.get).toHaveBeenCalledWith("note-1");
      expect(payload(result)).toMatchObject({
        id: "note-1",
        title: "Runbook",
        folderId: null,
        content: "# Runbook\nRestart the edge nodes.",
        truncated: false,
      });
    });

    it("truncates a long body and says so", async () => {
      deps.get = vi
        .fn()
        .mockResolvedValue(makeDetail({ content: "x".repeat(5000) }));
      const tool = toolNamed(createNotesTools(deps), "note_get");

      const result = await tool.execute({ noteId: "note-1" });
      const body = payload(result) as { content: string; truncated: boolean };

      expect(body.content).toHaveLength(1201);
      expect(body.truncated).toBe(true);
    });

    it("flags its output as untrusted, since note bodies are user-authored", () => {
      const tool = toolNamed(createNotesTools(deps), "note_get");

      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        untrustedContentHint: true,
      });
    });
  });

  it("note_folders_list reports the folder tree with note counts", async () => {
    const tool = toolNamed(createNotesTools(deps), "note_folders_list");

    const result = await tool.execute({});

    expect(payload(result)).toEqual({
      total: 2,
      folders: [
        {
          id: "folder-1",
          name: "Operations",
          parentFolderId: null,
          noteCount: 0,
        },
        {
          id: "folder-2",
          name: "Incidents",
          parentFolderId: "folder-1",
          noteCount: 4,
        },
      ],
    });
  });

  it("note_delete removes the note and refreshes", async () => {
    const tool = toolNamed(createNotesTools(deps), "note_delete");

    const result = await tool.execute({ noteId: "note-1" });

    expect(deps.remove).toHaveBeenCalledWith("note-1");
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(payload(result)).toEqual({ deleted: "note-1" });
  });

  it("composes the existing search and create factories rather than replacing them", async () => {
    const tools = createNotesTools(deps);

    expect(toolNamed(tools, "note_search").title).toBe("Search notes");
    expect(toolNamed(tools, "note_create").title).toBe("Create note");

    await toolNamed(tools, "note_search").execute({ query: "edge" });
    expect(deps.search).toHaveBeenCalledWith({
      query: "edge",
      limit: 10,
      sort: "updatedAt",
    });
  });
});
