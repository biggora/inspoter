import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { contactMergeSchema } from "@/lib/validation/contacts";
import { mapContactApiError } from "@/app/api/v1/contacts/errors";

// Static segment, so it wins over /api/v1/contacts/[contactId].

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = contactMergeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const contact = await contactsService.mergeContacts(
      auth.workspaceId,
      null,
      parsed.data.primaryId,
      parsed.data.otherIds,
    );
    recordTokenActivity(auth, {
      action: "merge",
      entityType: "contact",
      entityId: contact.id,
      entityLabel: contact.displayName,
    });
    return apiJsonResponse(contact);
  } catch (error) {
    return mapContactApiError(error);
  }
}
