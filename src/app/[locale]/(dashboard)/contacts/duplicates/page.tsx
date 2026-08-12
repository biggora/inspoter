import { requireAuth } from "@/lib/auth/dal";
import { findDuplicateGroups } from "@/lib/services/contacts";
import { DuplicatesView } from "@/components/contacts/duplicates-view";

export const dynamic = "force-dynamic";

export default async function ContactDuplicatesPage() {
  const { workspace } = await requireAuth();
  const groups = await findDuplicateGroups(workspace.id);
  return <DuplicatesView groups={groups} />;
}
