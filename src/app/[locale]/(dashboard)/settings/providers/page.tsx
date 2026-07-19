import { requireAuth } from "@/lib/auth/dal";
import { ProviderCredentialsView } from "@/components/settings/provider-credentials-view";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  await requireAuth();
  return <ProviderCredentialsView />;
}
