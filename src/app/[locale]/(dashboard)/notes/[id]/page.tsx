import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import * as notesService from "@/lib/services/notes";
import { NoteEditorPanel } from "@/components/notes/note-editor-panel";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NotePage({ params }: PageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  const note = await notesService.getNote(workspace.id, id);
  if (!note) notFound();

  // Keyed by note id so switching notes remounts the editor instead of
  // needing a reset-on-prop-change effect (see the component's own
  // comment for why).
  return <NoteEditorPanel key={note.id} note={note} />;
}
