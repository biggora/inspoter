import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { mapContactError } from "@/app/api/contacts/errors";
import * as contactsService from "@/lib/services/contacts";
import { recordActivity } from "@/lib/services/activity";
import {
  contactCreateSchema,
  contactListQuerySchema,
} from "@/lib/validation/contacts";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;

  const query = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = contactListQuerySchema.safeParse({
    ...query,
    // Search params are strings; only the explicit "true" turns the filter on.
    starred: query.starred === undefined ? undefined : query.starred === "true",
  });
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    return jsonResponse(
      await contactsService.list(authResult.workspace.id, parsed.data),
    );
  } catch (error) {
    return mapContactError(error, authResult.workspace.id);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = contactCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const contact = await contactsService.createContact(
      workspace.id,
      operator.id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "contact",
      entityId: contact.id,
      entityLabel: contact.displayName,
    });
    return jsonResponse(contact, { status: 201 });
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}
