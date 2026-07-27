import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { updateAutoRefreshSchema } from "@/lib/validation/workspaces";
import * as workspacesService from "@/lib/services/workspaces";
import { mapWorkspaceServiceError } from "@/app/api/workspaces/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Section-wide automatic-refresh switch for the provider listing cache.
// Its own route, mirroring the sections/rename split, so the three concerns
// stay isolated. Owner-only is enforced in the service layer.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => mapWorkspaceServiceError(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateAutoRefreshSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspace = await workspacesService.setAutoRefreshDisabledKinds(
      id,
      operator.id,
      parsed.data.disabledKinds,
    );
    recordActivity(id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "workspace",
      entityId: id,
      details: "provider auto refresh",
    });
    return jsonResponse(workspace);
  } catch (error) {
    return mapWorkspaceServiceError(error);
  }
}
