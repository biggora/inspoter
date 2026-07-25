import { requireAuth } from "@/lib/auth/dal";
import * as bookmarksService from "@/lib/services/bookmarks";
import * as domainsService from "@/lib/services/domains";
import * as servicesService from "@/lib/services/services";
import { DomainsView } from "@/components/domains/domains-view";

export const dynamic = "force-dynamic";

export default async function DomainsPage() {
  const { workspace } = await requireAuth();
  // Bookmarks/services are fetched alongside the provider listing so a domain
  // row can offer "add to bookmarks / monitoring" pre-filled and show whether
  // the target already exists (src/components/domains/link-targets.ts).
  const [providers, categories, services] = await Promise.all([
    domainsService.listDomains(workspace.id),
    bookmarksService.list(workspace.id),
    servicesService.list(workspace.id),
  ]);
  return (
    <DomainsView
      providers={providers}
      categories={categories}
      services={services}
    />
  );
}
