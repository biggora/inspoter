import type { NextResponse } from "next/server";
import type { ProviderResult } from "@/lib/providers/result";
import { emptyResponse, jsonResponse } from "@/lib/api/response";

// Maps a ProviderResult<T> to an HTTP response (AC-DOM-009, AC-PROV-003) —
// shared by the domains route handlers so provider failures/unsupported
// operations surface consistently instead of a generic 500.

export function providerResultResponse<T>(
  result: ProviderResult<T>,
  successStatus = 200,
): NextResponse {
  if (result.ok) {
    if (result.data === undefined) {
      return emptyResponse(204);
    }
    return jsonResponse(result.data, { status: successStatus });
  }
  if (result.kind === "unsupported") {
    return jsonResponse(
      { error: `Operation not supported by provider: ${result.operation}` },
      { status: 501 },
    );
  }
  return jsonResponse({ error: result.message }, { status: 502 });
}
