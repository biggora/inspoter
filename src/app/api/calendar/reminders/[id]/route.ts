import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { toErrorResponse } from "@/lib/api/errors";
import { recordActivity } from "@/lib/services/activity";
import {
  CalendarResourceNotFoundError,
  deleteReminder,
  updateReminder,
} from "@/lib/services/calendar";
import { CalendarLinkTargetNotFoundError } from "@/lib/services/calendar-link-targets";
import { reminderUpdateSchema } from "@/lib/validation/calendar";

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
  const parsed = reminderUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  try {
    const reminder = await updateReminder(workspace.id, id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "reminder",
      entityId: id,
      entityLabel: reminder.title,
    });
    return jsonResponse(reminder);
  } catch (error) {
    if (error instanceof CalendarLinkTargetNotFoundError)
      return jsonResponse({ error: error.code }, { status: 400 });
    if (error instanceof CalendarResourceNotFoundError)
      return jsonResponse({ error: error.code }, { status: 404 });
    return toErrorResponse(error, workspace.id);
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
    await deleteReminder(workspace.id, id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "reminder",
      entityId: id,
    });
    return emptyResponse();
  } catch (error) {
    if (error instanceof CalendarResourceNotFoundError)
      return jsonResponse({ error: error.code }, { status: 404 });
    return toErrorResponse(error, workspace.id);
  }
}
