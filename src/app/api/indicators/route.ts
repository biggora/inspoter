import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { computeIndicatorState } from "@/lib/services/indicator-counts";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Every number the dashboard chrome shows, in one payload. The live transport
// is the SSE sibling at ./stream; this endpoint is what seeds a reconnect, what
// the safety poll hits, and what runs before the stream opens so a stale tab
// learns it is stale from a real 409 (EventSource cannot read a status code).
//
// Uncached compute: a route handler is not a React render, so the cache()
// wrapper in indicator-counts.ts would memoize nothing here.
export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  return jsonResponse(await computeIndicatorState(workspace.id));
}
