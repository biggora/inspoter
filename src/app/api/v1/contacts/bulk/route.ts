import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { contactBulkSchema } from "@/lib/validation/contacts";
import { mapContactApiError } from "@/app/api/v1/contacts/errors";

// Static segment, so it wins over /api/v1/contacts/[contactId].
//
// Ids outside the token's workspace are ignored rather than rejected — the
// service scopes the id set first — so `updated` is the authoritative count of
// what actually changed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = contactBulkSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const updated = await contactsService.bulkUpdate(
      auth.workspaceId,
      null,
      parsed.data.contactIds,
      parsed.data.action,
    );
    recordTokenActivity(auth, {
      action: parsed.data.action.type === "delete" ? "delete" : "update",
      entityType: "contact",
      entityLabel: `${updated} contacts`,
    });
    return apiJsonResponse({ updated });
  } catch (error) {
    return mapContactApiError(error);
  }
}
