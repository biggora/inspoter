import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import * as contactsService from "@/lib/services/contacts";

// Feeds the recipient autocomplete in the mail compose dialog. Kept separate
// from GET /api/contacts because it answers a different question — "addresses
// matching what I am typing" — and returns one row per address, not per person.
export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;

  const query = request.nextUrl.searchParams.get("q") ?? "";
  return jsonResponse({
    suggestions: await contactsService.suggestRecipients(
      authResult.workspace.id,
      query,
    ),
  });
}
