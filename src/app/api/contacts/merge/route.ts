import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { mapContactError } from "@/app/api/contacts/errors";
import * as contactsService from "@/lib/services/contacts";
import { recordActivity } from "@/lib/services/activity";
import { contactMergeSchema } from "@/lib/validation/contacts";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = contactMergeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const contact = await contactsService.mergeContacts(
      workspace.id,
      operator.id,
      parsed.data.primaryId,
      parsed.data.otherIds,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "merge",
      entityType: "contact",
      entityId: contact.id,
      entityLabel: contact.displayName,
      details: JSON.stringify({ merged: parsed.data.otherIds.length }),
    });
    return jsonResponse(contact);
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}
