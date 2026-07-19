import { requireAuth } from "@/lib/auth/dal";
import { list } from "@/lib/services/bookmarks";
import { BookmarksBoard } from "@/components/bookmarks/bookmarks-board";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const { workspace } = await requireAuth();
  const categories = await list(workspace.id);
  return <BookmarksBoard categories={categories} />;
}
