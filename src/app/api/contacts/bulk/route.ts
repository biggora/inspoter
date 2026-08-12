import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { mapContactError } from "@/app/api/contacts/errors";
import * as contactsService from "@/lib/services/contacts";
import { recordActivity } from "@/lib/services/activity";
import { contactBulkSchema } from "@/lib/validation/contacts";

// One endpoint for every selection action in the list toolbar (delete, star,
// label). Separate routes would each repeat the same "which of these ids are
// really mine" scoping, which is the only interesting part.
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = contactBulkSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const affected = await contactsService.bulkUpdate(
      workspace.id,
      operator.id,
      parsed.data.contactIds,
      parsed.data.action,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: parsed.data.action.type === "delete" ? "delete" : "update",
      entityType: "contact",
      entityId: null,
      entityLabel: null,
      details: JSON.stringify({
        action: parsed.data.action.type,
        count: affected,
      }),
    });
    return jsonResponse({ affected });
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}
