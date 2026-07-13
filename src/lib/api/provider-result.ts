import { NextResponse } from "next/server";
import type { ProviderResult } from "@/lib/providers/result";

// Maps a ProviderResult<T> to an HTTP response (AC-DOM-009, AC-PROV-003) —
// shared by the domains route handlers so provider failures/unsupported
// operations surface consistently instead of a generic 500.

export function providerResultResponse<T>(
  result: ProviderResult<T>,
  successStatus = 200,
): NextResponse {
  if (result.ok) {
    if (result.data === undefined) {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json(result.data, { status: successStatus });
  }
  if (result.kind === "unsupported") {
    return NextResponse.json(
      { error: `Operation not supported by provider: ${result.operation}` },
      { status: 501 },
    );
  }
  return NextResponse.json({ error: result.message }, { status: 502 });
}
