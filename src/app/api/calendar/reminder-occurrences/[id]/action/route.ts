import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { jsonResponse } from "@/lib/api/response";
import { toErrorResponse } from "@/lib/api/errors";
import { recordActivity } from "@/lib/services/activity";
import {
  actOnOccurrence,
  CalendarResourceNotFoundError,
} from "@/lib/services/calendar";
import { reminderActionSchema } from "@/lib/validation/calendar";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;
  const parsed = reminderActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  try {
    const occurrence = await actOnOccurrence(
      workspace.id,
      id,
      parsed.data.action,
      parsed.data.action === "snooze"
        ? new Date(parsed.data.snoozeUntil)
        : undefined,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: parsed.data.action,
      entityType: "reminder_occurrence",
      entityId: id,
    });
    return jsonResponse(occurrence);
  } catch (error) {
    if (error instanceof CalendarResourceNotFoundError)
      return jsonResponse({ error: error.code }, { status: 404 });
    return toErrorResponse(error, workspace.id);
  }
}
