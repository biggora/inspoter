import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// Landing route decision (design.md §0): the PRD defines no dashboard
// "home/overview" screen, so after auth the operator lands directly on
// Bookmarks, the only implemented Slice 1 section (architecture §6).
export default async function Home() {
  redirect({ href: "/bookmarks", locale: await getLocale() });
}
