import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as serversService from "@/lib/services/servers";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Operator-initiated refresh of the cached server inventory — see the sibling
// route under /api/domains/refresh for why the cached GET needs it. This one
// also re-runs the LocalServer reconciliation, which now lives on the refresh
// path rather than the read path. Ignores both automatic-refresh switches.
export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  await serversService.refreshServerSnapshots(workspace.id);
  const response = await serversService.listServers(workspace.id);
  return jsonResponse(response);
}
