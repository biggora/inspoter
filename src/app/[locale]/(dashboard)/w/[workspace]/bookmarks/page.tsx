import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { list } from "@/lib/services/bookmarks";
import { BookmarksBoard } from "@/components/bookmarks/bookmarks-board";

export const dynamic = "force-dynamic";

export default async function BookmarksPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);
  const categories = await list(workspace.id);
  return <BookmarksBoard categories={categories} />;
}
