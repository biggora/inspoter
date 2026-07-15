import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { httpUrlSchema } from "@/lib/validation/bookmarks";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Favicon suggestion for the bookmark dialog (Phase 3). SSRF-safe by
// construction: we never fetch the bookmark's own URL/host. Only the
// hostname is extracted and passed as a query-string value to Google's
// public favicon-inference endpoint — the outbound TCP target is always
// www.google.com, never the bookmark's host.

export function buildFaviconSuggestUrl(hostname: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`;
}

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

  const hostname = new URL(parsed.data).hostname;
  const suggestUrl = buildFaviconSuggestUrl(hostname);

  try {
    const res = await fetch(suggestUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    const contentType = res.headers.get("content-type");
    if (res.ok && contentType?.startsWith("image/")) {
      return jsonResponse({ icon: suggestUrl });
    }
    return jsonResponse({ icon: null });
  } catch {
    return jsonResponse({ icon: null });
  }
}
