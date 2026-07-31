import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as serversService from "@/lib/services/servers";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Keyed by LocalServer id, unlike the sibling /[providerId]/[id] routes: the
// detail page addresses one machine, and an agent-only server has no provider
// or remote id to address it by. The static `local` segment keeps this out of
// the way of the existing [providerId] segment (Next.js allows a static
// sibling, but not a second dynamic one under a different name).

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const server = await serversService.getComposedServerByLocalId(
    workspace.id,
    id,
  );
  if (!server) {
    return jsonResponse({ error: "Server not found" }, { status: 404 });
  }
  return jsonResponse(server);
}
