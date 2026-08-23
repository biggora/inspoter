import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { httpUrlSchema } from "@/lib/validation/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { suggestFavicon } from "@/lib/bookmarks/favicon";

// Favicon suggestion for the bookmark dialog (Phase 3). The SSRF-safe probe
// itself lives in @/lib/bookmarks/favicon, shared with the agent surfaces.
export { buildFaviconSuggestUrl } from "@/lib/bookmarks/favicon";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;

  const url = request.nextUrl.searchParams.get("url");
  const parsed = httpUrlSchema.safeParse(url);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  return jsonResponse({ icon: await suggestFavicon(parsed.data) });
}
