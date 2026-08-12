import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { getContact } from "@/lib/services/contacts";
import { listLabels } from "@/lib/services/contact-labels";
import { ContactDetailView } from "@/components/contacts/contact-detail-view";

export const dynamic = "force-dynamic";

interface ContactPageProps {
  params: Promise<{ id: string }>;
}

export default async function ContactPage({ params }: ContactPageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  // getContact is workspace-scoped, so a contact from another workspace is
  // indistinguishable from one that does not exist.
  const [contact, labels] = await Promise.all([
    getContact(workspace.id, id),
    listLabels(workspace.id),
  ]);
  if (contact === null) notFound();

  return <ContactDetailView contact={contact} labels={labels} />;
}
