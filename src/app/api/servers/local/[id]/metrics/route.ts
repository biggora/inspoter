import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as serversService from "@/lib/services/servers";
import {
  getServerMetricsHistory,
  isHistoryRange,
  HISTORY_RANGE_KEYS,
} from "@/lib/services/serverMetricsHistory";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const range = request.nextUrl.searchParams.get("range");
  if (!isHistoryRange(range)) {
    return jsonResponse(
      {
        error: `Unknown range. Expected one of: ${HISTORY_RANGE_KEYS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // A server the active workspace doesn't own must disclose nothing — not
  // even an empty series that would confirm the id exists elsewhere.
  const server = await serversService.getComposedServerByLocalId(
    workspace.id,
    id,
  );
  if (!server) {
    return jsonResponse({ error: "Server not found" }, { status: 404 });
  }

  const history = await getServerMetricsHistory(workspace.id, id, range);
  return jsonResponse(history);
}
