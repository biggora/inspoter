import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { mapContactError } from "@/app/api/contacts/errors";
import * as contactsService from "@/lib/services/contacts";
import { recordActivity } from "@/lib/services/activity";
import { contactUpdateSchema } from "@/lib/validation/contacts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  const contact = await contactsService.getContact(authResult.workspace.id, id);
  if (contact === null) {
    return jsonResponse({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
  }
  return jsonResponse(contact);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = contactUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const contact = await contactsService.updateContact(
      workspace.id,
      operator.id,
      id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "contact",
      entityId: id,
      entityLabel: contact.displayName,
    });
    return jsonResponse(contact);
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    await contactsService.deleteContact(workspace.id, operator.id, id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "contact",
      entityId: id,
      entityLabel: null,
    });
    return emptyResponse();
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}
