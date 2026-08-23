import { NextResponse, type NextRequest } from "next/server";
import {
  apiJsonResponse,
  apiValidationError,
  requireApiToken,
} from "@/lib/api/token-auth";
import { faviconSuggestQuerySchema } from "@/lib/validation/bookmarks";
import { suggestFavicon } from "@/lib/bookmarks/favicon";

// SSRF-safe by construction: the bookmark's own URL and host are never
// fetched, only its hostname is looked up (see @/lib/bookmarks/favicon).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "bookmarks:read");
  if (auth instanceof NextResponse) return auth;

  const parsed = faviconSuggestQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  return apiJsonResponse({ icon: await suggestFavicon(parsed.data.url) });
}
