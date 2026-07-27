import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as hostingService from "@/lib/services/hosting";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Operator-initiated refresh of the cached account listing — see the sibling
// route under /api/domains/refresh for why the cached GET needs it. Ignores
// both automatic-refresh switches on purpose.
export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  await hostingService.refreshHostingSnapshots(workspace.id);
  const providers = await hostingService.listAccounts(workspace.id);
  return jsonResponse(providers);
}
