import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth/dal";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

// The right-hand pane when no note is open — reached at /notes itself, and
// after deleting the currently-open note (notes-workspace-view.tsx routes
// back here).
export default async function NotesPage() {
  await requireAuth();
  const t = await getTranslations("notes");

  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        bordered={false}
        icon="ri-sticky-note-line"
        title={t("noNoteSelectedTitle")}
        description={t("noNoteSelectedDescription")}
      />
    </div>
  );
}
