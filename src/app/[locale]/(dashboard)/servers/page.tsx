import { requireAuth } from "@/lib/auth/dal";
import { ServersView } from "@/components/servers/servers-view";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
  await requireAuth();
  return <ServersView />;
}
