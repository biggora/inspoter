import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { ProviderCredentialsView } from "@/components/settings/provider-credentials-view";

export const dynamic = "force-dynamic";

export default async function ProvidersPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  await requireWorkspaceBySlug((await params).workspace);
  return <ProviderCredentialsView />;
}
