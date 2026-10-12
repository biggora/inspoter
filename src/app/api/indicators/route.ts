import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { computeIndicatorState } from "@/lib/services/indicator-counts";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Every number the dashboard chrome shows, in one payload. The live transport
// is the SSE sibling at ./stream; this endpoint is what seeds a reconnect, what
// the safety poll hits, and what runs before the stream opens so a tab the
// server refuses (403: the operator is not a member of its workspace) learns it
// from a real status code (EventSource cannot read one).
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
