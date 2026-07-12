import { list } from "@/lib/services/bookmarks";
import { BookmarksBoard } from "@/components/bookmarks/bookmarks-board";

// AC-BM-001..014 (design.md §3.3). Server Component: reads the grouped list
// directly via the services layer (architecture §10 — mutations use the API
// routes, reads use the service directly). Dynamic: depends on the
// operator's session/data, never statically cached.
export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const categories = await list();
  return <BookmarksBoard categories={categories} />;
}
