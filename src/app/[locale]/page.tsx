import { redirect } from "next/navigation";

// Landing route decision (design.md §0): the PRD defines no dashboard
// "home/overview" screen, so after auth the operator lands directly on
// Bookmarks, the only implemented Slice 1 section (architecture §6).
export default function Home() {
  redirect("/bookmarks");
}
