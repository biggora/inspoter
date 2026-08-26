import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { jsonResponse } from "@/lib/api/response";
import { toErrorResponse } from "@/lib/api/errors";
import { recordActivity } from "@/lib/services/activity";
import { createReminder } from "@/lib/services/calendar";
import { CalendarLinkTargetNotFoundError } from "@/lib/services/calendar-link-targets";
import { reminderSchema } from "@/lib/validation/calendar";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const parsed = reminderSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const reminder = await createReminder(workspace.id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "reminder",
      entityId: reminder.id,
      entityLabel: reminder.title,
    });
    return jsonResponse(reminder, { status: 201 });
  } catch (error) {
    if (error instanceof CalendarLinkTargetNotFoundError) {
      return jsonResponse({ error: error.code }, { status: 400 });
    }
    return toErrorResponse(error, workspace.id);
  }
}
