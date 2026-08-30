import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { AgentRunNotFoundError, getRunDetail } from "@/lib/services/agent-runs";
import { RunDetailView } from "@/components/agents/run-detail-view";
import { RUNS_LIST_PARAMS } from "@/components/agents/runs-params";
import { listHref, pickListSearch } from "@/lib/list-search-params";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgentRunPage({
  params,
  searchParams,
}: PageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  // The list's cursor stack rides along in the query string, so "back" lands
  // on the page of runs the operator left rather than on the first one.
  const backHref = listHref(
    "/agents/runs",
    pickListSearch(await searchParams, RUNS_LIST_PARAMS),
  );

  const run = await getRunDetail(workspace.id, id).catch((error) => {
    if (error instanceof AgentRunNotFoundError) return null;
    throw error;
  });
  if (!run) notFound();

  return <RunDetailView run={run} backHref={backHref} />;
}
