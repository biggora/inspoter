import { requireAuth } from "@/lib/auth/dal";
import * as domainsService from "@/lib/services/domains";
import { DomainsView } from "@/components/domains/domains-view";

export const dynamic = "force-dynamic";

export default async function DomainsPage() {
  const { workspace } = await requireAuth();
  const providers = await domainsService.listDomains(workspace.id);
  return <DomainsView providers={providers} />;
}
