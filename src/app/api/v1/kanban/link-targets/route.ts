import { NextResponse, type NextRequest } from "next/server";
import { apiJsonResponse, requireApiToken } from "@/lib/api/token-auth";
import { listLinkTargets } from "@/lib/services/kanban-link-targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The servers, domains, services, alerts and hosting accounts a card can be
// linked to, grouped by type: an entry's id is a card's linkedId and its name
// the linkedLabel snapshot.
export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "kanban:read");
  if (auth instanceof NextResponse) return auth;

  return apiJsonResponse(await listLinkTargets(auth.workspaceId));
}
