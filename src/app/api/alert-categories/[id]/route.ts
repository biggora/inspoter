import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as alertsService from "@/lib/services/alerts";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = nameSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const category = await alertsService.renameCategory(
      id,
      workspace.id,
      parsed.data.name,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "alert_category",
      entityId: id,
    });
    return jsonResponse(category);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    await alertsService.deleteCategory(id, workspace.id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "alert_category",
      entityId: id,
    });
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error);
  }
}
