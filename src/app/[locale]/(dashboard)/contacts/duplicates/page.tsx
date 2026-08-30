import { requireAuth } from "@/lib/auth/dal";
import { findDuplicateGroups } from "@/lib/services/contacts";
import { DuplicatesView } from "@/components/contacts/duplicates-view";
import { CONTACTS_LIST_PARAMS } from "@/components/contacts/list-params";
import { listHref, pickListSearch } from "@/lib/list-search-params";

export const dynamic = "force-dynamic";

interface ContactDuplicatesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContactDuplicatesPage({
  searchParams,
}: ContactDuplicatesPageProps) {
  const { workspace } = await requireAuth();
  const backHref = listHref(
    "/contacts",
    pickListSearch(await searchParams, CONTACTS_LIST_PARAMS),
  );
  const groups = await findDuplicateGroups(workspace.id);
  return <DuplicatesView groups={groups} backHref={backHref} />;
}
