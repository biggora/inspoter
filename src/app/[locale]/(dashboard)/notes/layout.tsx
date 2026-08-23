import { requireAuth } from "@/lib/auth/dal";
import * as noteFoldersService from "@/lib/services/note-folders";
import * as notesService from "@/lib/services/notes";
import { NotesWorkspaceView } from "@/components/notes/notes-workspace-view";

export const dynamic = "force-dynamic";

// The tree lives in the layout (not the page) so it doesn't remount while
// navigating between notes — only `children` (page.tsx or [id]/page.tsx)
// changes. Data is loaded directly through the service layer, the same way
// GET /api/notes/tree does it server-side (see that route's comment for why
// `limit: NOTE_LIMIT` — the sidebar has no pagination UI of its own).
export default async function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace } = await requireAuth();

  const [folders, notesResult] = await Promise.all([
    noteFoldersService.listFolders(workspace.id),
    notesService.searchNotes(workspace.id, {
      sort: "updatedAt",
      limit: notesService.NOTE_LIMIT,
    }),
  ]);

  return (
    <NotesWorkspaceView folders={folders} notes={notesResult.items}>
      {children}
    </NotesWorkspaceView>
  );
}
