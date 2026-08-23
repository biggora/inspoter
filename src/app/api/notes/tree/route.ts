import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as notesService from "@/lib/services/notes";
import * as noteFoldersService from "@/lib/services/note-folders";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// One round-trip for the sidebar tree: folders (with noteCount) plus every
// note's summary. Notes come back without `content` — NoteSummary never
// carries it, only NoteDetail (from GET /api/notes/[id]) does — so this
// endpoint stays cheap regardless of note body size; the editor fetches the
// body separately when a note is opened.
//
// limit: notesService.NOTE_LIMIT (not the search page's default of 50) so
// every note in the workspace is included — the sidebar has no pagination UI
// of its own.
export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  try {
    const [folders, notes] = await Promise.all([
      noteFoldersService.listFolders(workspace.id),
      notesService.searchNotes(workspace.id, {
        sort: "updatedAt",
        limit: notesService.NOTE_LIMIT,
      }),
    ]);
    return jsonResponse({ folders, notes: notes.items });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
