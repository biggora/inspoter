import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { list } from "@/lib/services/contacts";
import { listLabels } from "@/lib/services/contact-labels";
import { ContactsView } from "@/components/contacts/contacts-view";
import { parseContactsFilters } from "@/components/contacts/list-params";

export const dynamic = "force-dynamic";

interface ContactsPageProps {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{
    query?: string;
    labelId?: string;
    starred?: string;
    page?: string;
  }>;
}

// Filters live in the URL, so the page re-runs on every navigation and the
// client view never has to hold a copy of the list.
export default async function ContactsPage({
  params,
  searchParams,
}: ContactsPageProps) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);
  const filters = parseContactsFilters(await searchParams);

  const [result, labels] = await Promise.all([
    list(workspace.id, {
      query: filters.query || undefined,
      labelId: filters.labelId ?? undefined,
      starred: filters.starred || undefined,
      page: filters.page,
    }),
    listLabels(workspace.id),
  ]);

  return <ContactsView result={result} labels={labels} filters={filters} />;
}
