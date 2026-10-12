import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { LogsView } from "@/components/logs/logs-view";

export const dynamic = "force-dynamic";

export default async function LogsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  await requireWorkspaceBySlug((await params).workspace);
  return <LogsView />;
}
