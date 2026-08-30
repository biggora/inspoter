import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { getContact } from "@/lib/services/contacts";
import { listLabels } from "@/lib/services/contact-labels";
import { ContactDetailView } from "@/components/contacts/contact-detail-view";
import { CONTACTS_LIST_PARAMS } from "@/components/contacts/list-params";
import { listHref, pickListSearch } from "@/lib/list-search-params";

export const dynamic = "force-dynamic";

interface ContactPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContactPage({
  params,
  searchParams,
}: ContactPageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  // The list's filters and page ride along in the query string, so "back"
  // lands on the view the operator left rather than on an unfiltered page 1.
  const backHref = listHref(
    "/contacts",
    pickListSearch(await searchParams, CONTACTS_LIST_PARAMS),
  );

  // getContact is workspace-scoped, so a contact from another workspace is
  // indistinguishable from one that does not exist.
  const [contact, labels] = await Promise.all([
    getContact(workspace.id, id),
    listLabels(workspace.id),
  ]);
  if (contact === null) notFound();

  return (
    <ContactDetailView contact={contact} labels={labels} backHref={backHref} />
  );
}
