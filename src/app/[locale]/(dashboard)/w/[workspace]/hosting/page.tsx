import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { HostingView } from "@/components/hosting/hosting-view";

export const dynamic = "force-dynamic";

export default async function HostingPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  await requireWorkspaceBySlug((await params).workspace);
  return <HostingView />;
}
