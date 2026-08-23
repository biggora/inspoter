import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import { apiJsonResponse, requireApiToken } from "@/lib/api/token-auth";

// Static segment, so it wins over /api/v1/contacts/[contactId].

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:read");
  if (auth instanceof NextResponse) return auth;

  return apiJsonResponse(
    await contactsService.findDuplicateGroups(auth.workspaceId),
  );
}
