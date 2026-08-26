import { NextResponse, type NextRequest } from "next/server";

import { mapWorkspaceServiceError } from "@/app/api/workspaces/errors";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";
import * as workspacesService from "@/lib/services/workspaces";
import { updateWorkspaceTimeZoneSchema } from "@/lib/validation/workspaces";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => mapWorkspaceServiceError(error),
  );
  if (authResult instanceof NextResponse) return authResult;

  const { operator } = authResult;
  const { id } = await params;
  const parsed = updateWorkspaceTimeZoneSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspace = await workspacesService.setTimeZone(
      id,
      operator.id,
      parsed.data.timeZone,
    );
    recordActivity(id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "workspace",
      entityId: id,
      entityLabel: parsed.data.timeZone,
    });
    return jsonResponse(workspace);
  } catch (error) {
    return mapWorkspaceServiceError(error, id);
  }
}
