import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type { NoteFolderNode } from "@/lib/services/note-folders";
import type { NoteDetail, NoteSummary } from "@/lib/services/notes";

// WebMCP tools for Notes. Unlike the kanban/alerts/servers tools these are
// registered from the dashboard layout (see
// src/components/shell/web-mcp-global-tools.tsx), so they stay available on
// every dashboard route — they need no live page state, only the notes API.

// Same three-step lookup the kanban tools use — id-exact -> name-exact(ci) ->
// unique name-substring(ci) — but throwing instead of returning an `{ error }`
// object, since `defineWebMcpTool` now turns a thrown Error into the
// `isError` tool result. Deliberately a local copy: kanban's helper still
// returns errors in-band, and lifting it would change kanban's behavior.
function resolveFolder(
  query: string,
  folders: NoteFolderNode[],
): NoteFolderNode {
  const byId = folders.find((folder) => folder.id === query);
  if (byId) return byId;

  const lowerQuery = query.toLowerCase();

  const exactName = folders.filter(
    (folder) => folder.name.toLowerCase() === lowerQuery,
  );
  if (exactName.length === 1) return exactName[0];
  if (exactName.length > 1) throw ambiguous(query, exactName);

  const substring = folders.filter((folder) =>
    folder.name.toLowerCase().includes(lowerQuery),
  );
  if (substring.length === 1) return substring[0];
  if (substring.length > 1) throw ambiguous(query, substring);

  throw new Error(`No match found for "${query}".`);
}

function ambiguous(query: string, candidates: NoteFolderNode[]): Error {
  return new Error(
    `"${query}" matches multiple items: ${candidates.map((folder) => folder.name).join(", ")}. Use a more specific title or the id.`,
  );
}

// --- note_search ---

const searchNotesInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Full-text search query; omit to list recent notes"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .default(10)
      .describe("Maximum number of notes to return"),
  })
  .strict();

export interface SearchNotesToolContext {
  /** Bound notesApi.search (or equivalent). */
  search: (params: {
    query?: string;
    limit?: number;
    sort?: "updatedAt" | "title";
  }) => Promise<{ items: NoteSummary[]; total: number }>;
}

// Keeps a single result well inside the ~1500-char per-tool output budget
// even at limit: 25.
const MAX_EXCERPT_LENGTH = 120;

function trimExcerpt(excerpt: string): string {
  return excerpt.length > MAX_EXCERPT_LENGTH
    ? `${excerpt.slice(0, MAX_EXCERPT_LENGTH)}…`
    : excerpt;
}

export function createSearchNotesTool(
  ctx: SearchNotesToolContext,
): WebMcpTool {
  return defineWebMcpTool({
    name: "note_search",
    title: "Search notes",
    description:
      "Searches the workspace notes by full-text query, or lists the most recently updated notes when no query is given. Returns id, title and a short excerpt for each match — not the full note body.",
    inputSchema: searchNotesInputSchema,
    readOnly: true,
    // Note titles and bodies are operator-authored free text.
    untrustedOutput: true,
    async handler({ query, limit }) {
      const result = await ctx.search({ query, limit, sort: "updatedAt" });
      return {
        total: result.total,
        notes: result.items.map((note) => ({
          id: note.id,
          title: note.title,
          excerpt: trimExcerpt(note.excerpt),
          folderId: note.folderId,
        })),
      };
    },
  });
}

// --- note_create ---

const createNoteInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).describe("Note title"),
    content: z
      .string()
      .max(20000)
      .optional()
      .describe("Markdown body of the note"),
    folder: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Name or id of the folder to file the note under; omit for the root",
      ),
  })
  .strict();

export interface CreateNoteToolContext {
  /** Bound notesApi.tree (or equivalent) — only `folders` is read. */
  listFolders: () => Promise<{ folders: NoteFolderNode[] }>;
  /** Bound notesApi.create (or equivalent). */
  create: (input: {
    title: string;
    content?: string;
    folderId?: string | null;
  }) => Promise<NoteDetail>;
  /** Re-runs the server fetch so any visible notes UI reflects the new note. */
  refresh: () => void;
}

export function createCreateNoteTool(ctx: CreateNoteToolContext): WebMcpTool {
  return defineWebMcpTool({
    name: "note_create",
    title: "Create note",
    description:
      "Creates a new note in the workspace. Identify the target folder by its visible name or id, or omit it to file the note at the root.",
    inputSchema: createNoteInputSchema,
    readOnly: false,
    async handler({ title, content, folder }) {
      let folderId: string | undefined;
      if (folder !== undefined) {
        const { folders } = await ctx.listFolders();
        folderId = resolveFolder(folder, folders).id;
      }

      const created = await ctx.create({ title, content, folderId });
      ctx.refresh();

      return {
        noteId: created.id,
        title: created.title,
        folderId: created.folderId,
      };
    },
  });
}
