import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import {
  contactBulkSchema,
  contactCreateBatchSchema,
} from "@/lib/validation/contacts";
import { mapContactApiError } from "@/app/api/v1/contacts/errors";
import { idempotencyKeySchema } from "@/lib/validation/webhookTokens";

// Static segment, so it wins over /api/v1/contacts/[contactId].
//
// Ids outside the token's workspace are ignored rather than rejected — the
// service scopes the id set first — so `updated` is the authoritative count of
// what actually changed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;

  const key = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key"),
  );
  if (!key.success) return apiValidationError(key.error.issues);

  const parsed = contactCreateBatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const result = await contactsService.createContactsIdempotent(
      auth.workspaceId,
      null,
      auth.tokenId,
      key.data,
      parsed.data.contacts,
    );
    if (!result.replayed) {
      recordTokenActivity(auth, {
        action: "create",
        entityType: "contact",
        entityLabel: `${result.count} contacts`,
      });
    }
    return apiJsonResponse(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return mapContactApiError(error);
  }
}

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
