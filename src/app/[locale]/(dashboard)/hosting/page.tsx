import { requireAuth } from "@/lib/auth/dal";
import { HostingView } from "@/components/hosting/hosting-view";

export const dynamic = "force-dynamic";

export default async function HostingPage() {
  await requireAuth();
  return <HostingView />;
}
