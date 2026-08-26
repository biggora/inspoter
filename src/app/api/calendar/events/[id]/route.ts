import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { toErrorResponse } from "@/lib/api/errors";
import { recordActivity } from "@/lib/services/activity";
import {
  CalendarResourceNotFoundError,
  deleteEvent,
  updateEvent,
} from "@/lib/services/calendar";
import { CalendarLinkTargetNotFoundError } from "@/lib/services/calendar-link-targets";
import {
  calendarEventDeleteSchema,
  calendarEventUpdateSchema,
} from "@/lib/validation/calendar";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function mapCalendarError(error: unknown, workspaceId: string) {
  if (error instanceof CalendarLinkTargetNotFoundError) {
    return jsonResponse({ error: error.code }, { status: 400 });
  }
  if (error instanceof CalendarResourceNotFoundError) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  return toErrorResponse(error, workspaceId);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;
  const parsed = calendarEventUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const event = await updateEvent(workspace.id, id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "calendar_event",
      entityId: id,
      entityLabel: "title" in event ? String(event.title) : null,
    });
    return jsonResponse(event);
  } catch (error) {
    return mapCalendarError(error, workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;
  const parsed = calendarEventDeleteSchema.safeParse({
    scope: request.nextUrl.searchParams.get("scope") ?? "series",
    originalStartAt:
      request.nextUrl.searchParams.get("originalStartAt") ?? undefined,
  });
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    await deleteEvent(
      workspace.id,
      id,
      parsed.data.scope,
      parsed.data.originalStartAt,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "calendar_event",
      entityId: id,
    });
    return emptyResponse();
  } catch (error) {
    return mapCalendarError(error, workspace.id);
  }
}
