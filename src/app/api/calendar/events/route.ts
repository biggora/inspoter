import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { jsonResponse } from "@/lib/api/response";
import { toErrorResponse } from "@/lib/api/errors";
import { recordActivity } from "@/lib/services/activity";
import { createEvent } from "@/lib/services/calendar";
import { CalendarLinkTargetNotFoundError } from "@/lib/services/calendar-link-targets";
import { calendarEventSchema } from "@/lib/validation/calendar";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const parsed = calendarEventSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const event = await createEvent(workspace.id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "calendar_event",
      entityId: event.id,
      entityLabel: event.title,
    });
    return jsonResponse(event, { status: 201 });
  } catch (error) {
    if (error instanceof CalendarLinkTargetNotFoundError) {
      return jsonResponse({ error: error.code }, { status: 400 });
    }
    return toErrorResponse(error, workspace.id);
  }
}
