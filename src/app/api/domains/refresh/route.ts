import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as domainsService from "@/lib/services/domains";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Operator-initiated refresh of the cached zone listing. GET /api/domains
// serves the cache, so without this the "Retry" button after a provider error
// would only re-render the same failed snapshot.
//
// Deliberately ignores both automatic-refresh switches: turning automatic
// refresh off freezes the data, it does not forbid asking for it.
export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  await domainsService.refreshDnsSnapshots(workspace.id);
  const providers = await domainsService.listDomains(workspace.id);
  return jsonResponse(providers);
}
