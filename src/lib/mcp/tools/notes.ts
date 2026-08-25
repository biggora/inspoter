import { z } from "zod";
import * as notesService from "@/lib/services/notes";
import * as noteFoldersService from "@/lib/services/note-folders";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";

// Notes are the highest-value write target for an agent: "write what you found
// into the vault" is what turns a run into something an operator reads later.
//
// Folders are read-only here for the same reason a kanban board is: deleting
// one takes every note inside it, and that is content the agent never saw.

export const noteTools: McpToolDefinition[] = [
  defineTool({
    name: "notes_search",
    scope: "notes:read",
    title: "Search notes",
    description:
      "Search the workspace's notes. `query` matches the title and the body. Results are most-recently-updated first unless sort is overridden.",
    inputSchema: z.object({
      query: z.string().optional(),
      folderId: z
        .string()
        .optional()
        .describe("From note_folders_list. Omit to search the whole vault."),
      includeSubfolders: z.boolean().optional(),
      // The service's own defaults are declared on its zod schema, which the
      // dashboard route applies before calling; this surface supplies them
      // here instead of advertising them as required.
      sort: z.enum(["updatedAt", "title"]).default("updatedAt"),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    readOnly: true,
    handler: (args, ctx) =>
      notesService.searchNotes(ctx.workspaceId, {
        ...args,
        includeSubfolders: args.includeSubfolders ?? false,
      }),
  }),

  defineTool({
    name: "notes_get",
    scope: "notes:read",
    title: "Read a note",
    description: "Read one note with its full markdown body.",
    inputSchema: z.object({
      id: z.string().describe("From notes_search."),
    }),
    readOnly: true,
    handler: async (args, ctx) => {
      const note = await notesService.getNote(ctx.workspaceId, args.id);
      if (!note) throw new McpResourceNotFoundError("Note", args.id);
      return note;
    },
  }),

  defineTool({
    name: "note_folders_list",
    scope: "notes:read",
    title: "List note folders",
    description:
      "List the vault's folder tree, for use as notes_search folderId or notes_create folderId.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => noteFoldersService.listFolders(ctx.workspaceId),
  }),

  defineTool({
    name: "notes_create",
    scope: "notes:write",
    title: "Create a note",
    description:
      "Create a note. The title must be unique in the workspace — it is how a [[wiki link]] resolves. Body is CommonMark, never HTML.",
    inputSchema: z.object({
      title: z.string(),
      content: z.string().optional(),
      folderId: z
        .string()
        .nullable()
        .optional()
        .describe("From note_folders_list; null or omitted is the vault root."),
    }),
    readOnly: false,
    handler: (args, ctx) => notesService.createNote(ctx.workspaceId, args),
  }),

  defineTool({
    name: "notes_update",
    scope: "notes:write",
    title: "Update a note",
    description:
      "Replace a note's title or body. `version` is the value notes_get returned; a mismatch means someone else edited it first and the write is refused.",
    inputSchema: z.object({
      id: z.string().describe("From notes_search."),
      title: z.string().optional(),
      content: z.string().optional(),
      version: z.number().int().min(1).describe("From notes_get."),
    }),
    readOnly: false,
    handler: (args, ctx) => {
      const { id, ...input } = args;
      return notesService.updateNote(ctx.workspaceId, id, input);
    },
  }),

  defineTool({
    name: "notes_delete",
    scope: "notes:write",
    title: "Delete a note",
    description:
      "Delete one note. Deleting a folder is deliberately not available: it would take content the caller never saw.",
    inputSchema: z.object({
      id: z.string().describe("From notes_search."),
    }),
    readOnly: false,
    handler: async (args, ctx) => {
      await notesService.deleteNote(ctx.workspaceId, args.id);
      return { deleted: true, id: args.id };
    },
  }),
];
